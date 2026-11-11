import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CREDIT_TEXT, DATA_URL, HEADERS, planTaxTableSheet, uniqueSheetName } from "../src/lib/sheet";
import { exportRows, findRow, primaryIncomeTaxBands, taxFromBands } from "../src/lib/tables";
import type { TaxTable } from "../src/lib/types";
import { tableFixture } from "./helpers";

describe("tax bands", () => {
  it("taxFromBands is marginal (Singapore-style check on UK bands above the allowance)", () => {
    const uk = tableFixture("uk/2026-27");
    const bands = primaryIncomeTaxBands(uk);
    expect(bands.id).toBe("income-tax-england");
    // £50,000 salary → £37,430 above the £12,570 Personal Allowance → £7,486 (GOV.UK basic + higher rate)
    expect(taxFromBands(bands.rows, 50000 - 12570)).toBeCloseTo(7486, 6);
    expect(taxFromBands(bands.rows, -100)).toBe(0);
  });

  it("primaryIncomeTaxBands picks the first annual income-tax scale", () => {
    expect(primaryIncomeTaxBands(tableFixture("us/2026")).id).toBe("federal-income-tax-single");
    expect(primaryIncomeTaxBands(tableFixture("australia/2026-27")).id).toBe("resident-rates");
    expect(() => primaryIncomeTaxBands(tableFixture("germany/2026"))).toThrow(/no income-tax brackets/);
  });

  it("findRow by unique label part or position", () => {
    const uk = tableFixture("uk/2026-27");
    const s = uk.sections.find((x) => x.id === "income-tax-england")!;
    expect(findRow(s, "additional")).toMatchObject({ rate: 0.45 });
    expect(findRow(s, 2)).toMatchObject({ rate: 0.4 });
  });

  it("exportRows rebuilds the flat rows when a response lacks them", () => {
    const ie = tableFixture("ireland/2026");
    const rebuilt = exportRows({ ...ie, rows: undefined });
    expect(rebuilt.length).toBe(ie.rows!.length);
    expect(rebuilt.map((r) => [r.section_id, r.label, r.rate, r.value, r.source_url])).toEqual(ie.rows!.map((r) => [r.section_id, r.label, r.rate, r.value, r.source_url]));
  });
});

describe("Insert tax table layout", () => {
  const ie = tableFixture("ireland/2026");
  const plan = planTaxTableSheet(ie, ["Sheet1"]);

  it("starts with a title, the CalcBloc credit linked to calcbloc.com/data and the calcbloc.com page", () => {
    expect(plan.values[0][0]).toBe("Ireland: tax tables 2026 (EUR)");
    expect(plan.values[1][0]).toBe(CREDIT_TEXT);
    expect(plan.links).toContainEqual({ row: 1, col: 0, url: DATA_URL, text: CREDIT_TEXT });
    expect(plan.links.find((l) => l.row === 2)!.url).toBe("https://calcbloc.com/ireland/tax-tables/2026");
  });

  it("has one row per band or value with its official source URL as a hyperlink", () => {
    expect(plan.values[plan.headerRow]).toEqual([...HEADERS]);
    const body = plan.values.slice(plan.headerRow + 1, plan.headerRow + 1 + ie.rows!.length);
    expect(body).toHaveLength(ie.rows!.length);
    const urlCol = HEADERS.indexOf("Source URL");
    expect(body.every((r) => typeof r[urlCol] === "string" && String(r[urlCol]).startsWith("https://"))).toBe(true);
    expect(plan.links.filter((l) => l.col === urlCol)).toHaveLength(ie.rows!.length);
    const usc4 = body.find((r) => r[0] === "Universal Social Charge (USC)" && r[2] === 70044)!;
    expect(usc4[HEADERS.indexOf("Rate")]).toBe(0.08);
    expect(usc4[HEADERS.indexOf("To")]).toBe("and above");
  });

  it("ends with the credit linked to the calcbloc.com table page", () => {
    const last = plan.values.length - 1;
    expect(plan.values[last][0]).toBe(CREDIT_TEXT);
    expect(plan.links.find((l) => l.row === last)!.url).toBe(ie.pageUrl);
    expect(plan.creditRows).toEqual([1, last]);
  });

  it("formats rates as percentages and keeps the grid rectangular", () => {
    const rateCol = HEADERS.indexOf("Rate");
    expect(plan.numberFormats[plan.headerRow + 1][rateCol]).toContain("%");
    const width = HEADERS.length;
    expect(plan.values.every((r) => r.length === width)).toBe(true);
    expect(plan.numberFormats.every((r) => r.length === width)).toBe(true);
    expect(plan.numberFormats).toHaveLength(plan.values.length);
  });

  it("names regional sheets and avoids name clashes", () => {
    const scot = tableFixture("uk/2026-27/scotland") as TaxTable;
    expect(planTaxTableSheet(scot, []).sheetName).toBe("United Kingdom SCOTLAND 2026-27");
    expect(planTaxTableSheet(scot, []).values[0][0]).toBe("United Kingdom, Scotland: tax tables 2026/27 (GBP)");
    expect(uniqueSheetName("Ireland 2026", ["ireland 2026"])).toBe("Ireland 2026 (2)");
    expect(uniqueSheetName("A very long country name with region 2026-27", []).length).toBeLessThanOrEqual(31);
    expect(uniqueSheetName("Bad:/\\?*[]name", [])).toBe("Bad name");
  });
});

describe("manifest", () => {
  const xml = readFileSync(join(__dirname, "..", "manifest.xml"), "utf8");

  it("uses the shared runtime with the CALCBLOC namespace", () => {
    expect(xml).toMatch(/<Set Name="SharedRuntime" MinVersion="1.1"\/>/);
    expect(xml).toMatch(/<Runtime resid="Taskpane.Url" lifetime="long"\/>/);
    expect(xml).toMatch(/<bt:String id="Functions.Namespace" DefaultValue="CALCBLOC"\/>/);
    expect(xml).toMatch(/<Page>\s*<SourceLocation resid="Taskpane.Url"\/>/);
    expect(xml).toContain("<Permissions>ReadWriteDocument</Permissions>");
  });

  it("points every local URL at https://localhost:3104", () => {
    const urls = [...xml.matchAll(/https:\/\/localhost:(\d+)\//g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(5);
    expect(new Set(urls)).toEqual(new Set(["3104"]));
  });
});
