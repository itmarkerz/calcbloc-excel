import { describe, expect, it } from "vitest";
import * as core from "../src/lib/core";
import { CalcBlocError } from "../src/lib/errors";
import { annualTaxFromSection } from "../src/lib/tables";
import type { CalcResponse } from "../src/lib/types";
import { NO_KEY_MESSAGE } from "../src/lib/client";
import { fixtureFetch, jsonResponse, loadFixture, makeDeps, TEST_KEY } from "./helpers";

const usNet = () => loadFixture<CalcResponse>("calc/net-salary_country-us_region-ca_salary-60000.json")!;

function calcResponse(country: string, partial: Partial<CalcResponse>): CalcResponse {
  return {
    endpoint: "net-salary",
    country,
    countryName: country,
    year: "2026",
    currency: "EUR",
    inputs: {},
    summary: {},
    results: {},
    breakdown: null,
    notes: [],
    calculatorUrl: `https://calcbloc.com/${country}`,
    warnings: [],
    ...partial,
  };
}

describe("CALCBLOC.NET", () => {
  it("returns the API's annual take-home pay (US, California, $60,000: recorded response)", async () => {
    const { deps, fetch } = makeDeps();
    expect(await core.net(deps, "us", 60000, "ca")).toBe(47806.56);
    expect(fetch.calls.map((c) => c.url)).toEqual([
      "https://calcbloc.com/api/v1/countries",
      "https://calcbloc.com/api/v1/net-salary?country=us&region=ca&salary=60000",
    ]);
  });

  it("accepts country names and ISO codes, and region names", async () => {
    const { deps } = makeDeps();
    expect(await core.net(deps, "United States", 60000, "California")).toBe(47806.56);
    expect(await core.net(deps, "USA", 60000, "CA")).toBe(47806.56);
  });

  it("uses the default country and region from settings when the arguments are empty", async () => {
    const { deps } = makeDeps({ settings: { apiKey: TEST_KEY, defaultCountry: "us", defaultRegion: "ca" } });
    expect(await core.net(deps, "", 60000)).toBe(47806.56);
    expect(await core.net(deps, null, 60000, undefined)).toBe(47806.56);
  });

  it("does not apply the default region to another country", async () => {
    const { deps } = makeDeps({ settings: { apiKey: TEST_KEY, defaultCountry: "canada", defaultRegion: "on" } });
    await expect(core.net(deps, "us", 60000)).rejects.toMatchObject({ kind: "invalid", code: "missing_region" });
  });

  it("explains that a tables-only country has no take-home calculation, without calling the API", async () => {
    const { deps, fetch } = makeDeps();
    const err: CalcBlocError = await core.net(deps, "poland", 120000).catch((e) => e);
    expect(err.kind).toBe("unavailable");
    expect(err.message).toMatch(/tax tables only/);
    expect(err.message).toMatch(/CALCBLOC\.TAX/);
    expect(err.message).toContain("https://calcbloc.com/poland/tax-tables/2026");
    expect(fetch.calls.filter((c) => c.url.includes("net-salary"))).toHaveLength(0);
  });

  it("validates inputs before spending a request", async () => {
    const { deps, fetch } = makeDeps();
    await expect(core.net(deps, "us", -5, "ca")).rejects.toMatchObject({ kind: "invalid" });
    await expect(core.net(deps, "us", "abc", "ca")).rejects.toMatchObject({ kind: "invalid" });
    await expect(core.net(deps, "us", 60000, "zz")).rejects.toMatchObject({ code: "unsupported_region" });
    await expect(core.net(deps, "ireland", 60000, "dublin")).rejects.toMatchObject({ code: "unsupported_region" });
    await expect(core.net(deps, "us", 60000, "ca", 2025)).rejects.toMatchObject({ code: "unsupported_year" });
    await expect(core.net(deps, "atlantis", 60000)).rejects.toMatchObject({ code: "unsupported_country" });
    await expect(core.net(deps, "", 60000)).rejects.toMatchObject({ code: "missing_country" });
    expect(fetch.calls.filter((c) => !c.url.endsWith("/countries"))).toHaveLength(0);
  });

  it("passes the current year through and accepts it as a number or text", async () => {
    const urls: string[] = [];
    const fetch = fixtureFetch((u) => {
      if (u.pathname.endsWith("/net-salary")) {
        urls.push(u.search);
        return jsonResponse(200, calcResponse("uk", { summary: { netAnnual: 39000 } }));
      }
    });
    const { deps } = makeDeps({ fetch });
    expect(await core.net(deps, "uk", 50000, "", "2026-27")).toBe(39000);
    expect(urls[0]).toBe("?country=uk&salary=50000&year=2026-27");
    await expect(core.net(deps, "uk", 50000, "", "2025-26")).rejects.toThrow(/2025-26 is available as tax tables/);
  });

  it("sends a monthly salary where the API expects one (Singapore), from the annual gross", async () => {
    const urls: string[] = [];
    const fetch = fixtureFetch((u) => {
      if (u.pathname.endsWith("/net-salary")) {
        urls.push(u.search);
        return jsonResponse(200, calcResponse("singapore", { summary: { netAnnual: 70000 } }));
      }
    });
    const { deps } = makeDeps({ fetch });
    expect(await core.net(deps, "sg", 90000)).toBe(70000);
    expect(urls[0]).toBe("?country=singapore&salary=7500");
  });
});

describe("CALCBLOC.TAX", () => {
  it("uses the calculator's income tax where there is one (US: federal + state income tax rows)", async () => {
    const { deps } = makeDeps();
    expect(await core.tax(deps, "us", 60000, "ca")).toBe(6823.44); // 5,020.08 federal + 1,803.36 California
  });

  it("NET and TAX on the same inputs share one request", async () => {
    const { deps, fetch } = makeDeps();
    await Promise.all([core.net(deps, "us", 60000, "ca"), core.tax(deps, "us", 60000, "ca")]);
    expect(fetch.calls.filter((c) => c.url.includes("net-salary"))).toHaveLength(1);
  });

  it("falls back to the official brackets for tables-only countries (Poland: 12% to PLN 120,000)", async () => {
    const { deps } = makeDeps();
    expect(await core.tax(deps, "poland", 120000)).toBe(14400);
    expect(await core.tax(deps, "poland", 150000)).toBe(14400 + 30000 * 0.32);
  });

  it("Denmark state tax brackets (bundskat, mellemskat)", async () => {
    const { deps } = makeDeps();
    expect(await core.tax(deps, "denmark", 700000)).toBe(88480); // 641,200 × 12.01% + 58,800 × 19.51%
  });

  it("scales a monthly scale to the year (amount / 12, tax × 12)", () => {
    const monthly = { id: "m", title: "Monthly", group: "income-tax", kind: "bands" as const, basis: "Taxable pay per month", source: { title: "", url: "" }, rows: [{ from: 0, to: 1000, rate: 0.1 }, { from: 1000, to: null, rate: 0.2 }] };
    expect(annualTaxFromSection(monthly, 24000)).toBeCloseTo(12 * (100 + 1000 * 0.2), 6);
    expect(annualTaxFromSection({ ...monthly, basis: "Taxable income, per year" }, 24000)).toBeCloseTo(100 + 23000 * 0.2, 6);
  });

  it("applies a named bands section: Ireland USC reproduces Revenue's worked example (€50,000 → €1,032.82)", async () => {
    // https://www.revenue.ie/en/jobs-and-pensions/usc/calculating-usc.aspx (Example 2)
    const { deps, fetch } = makeDeps();
    expect(await core.tax(deps, "ireland", 50000, "", "", "usc")).toBe(1032.82);
    expect(fetch.calls.some((c) => c.url.includes("net-salary"))).toBe(false);
  });

  it("refuses a values section or a region in bracket mode, with a reason", async () => {
    const { deps } = makeDeps();
    await expect(core.tax(deps, "ireland", 50000, "", "", "tax-credits")).rejects.toMatchObject({ code: "not_bands" });
    await expect(core.tax(deps, "poland", 50000, "mazowieckie")).rejects.toMatchObject({ code: "unsupported_region" });
    await expect(core.tax(deps, "poland", 50000, "", 2019)).rejects.toMatchObject({ code: "unsupported_year" });
  });

  it("reads the income tax keys of each calculator", () => {
    expect(core.incomeTaxFrom("germany", calcResponse("germany", { results: { wageTax: 8000, soli: 0, churchTax: 720 } }))).toBe(8720);
    expect(core.incomeTaxFrom("canada", calcResponse("canada", { results: { federalTax: 7000, provincialTax: 3000 } }))).toBe(10000);
    expect(core.incomeTaxFrom("uk", calcResponse("uk", { results: { incomeTax: 7486 } }))).toBe(7486);
    expect(core.incomeTaxFrom("us", usNet())).toBeCloseTo(6823.44, 2);
    expect(() => core.incomeTaxFrom("xx", calcResponse("xx", {}))).toThrow(CalcBlocError);
  });
});

describe("CALCBLOC.RATE", () => {
  it("returns a band rate by row number (Ireland USC band 4 = 8%)", async () => {
    const { deps } = makeDeps();
    expect(await core.rate(deps, "ireland", "usc", 4)).toBe(0.08);
    expect(await core.rate(deps, "ireland", "usc", "4")).toBe(0.08);
  });

  it("matches labels exactly or by a unique part, case-insensitively", async () => {
    const { deps } = makeDeps();
    expect(await core.rate(deps, "uk", "income-tax-england", "higher rate")).toBe(0.4);
    expect(await core.rate(deps, "uk", "Personal allowance", "Personal Allowance")).toBe(12570);
    expect(await core.rate(deps, "australia", "super-guarantee", "super guarantee rate")).toBe(0.12);
  });

  it("reads regional tables (Scotland top rate) and earlier years (UK 2025-26)", async () => {
    const { deps, fetch } = makeDeps();
    expect(await core.rate(deps, "uk", "income-tax-scotland", "Top rate", "", "scotland")).toBe(0.48);
    expect(fetch.calls.at(-1)!.url).toBe("https://calcbloc.com/api/v1/tax-tables/uk/latest?region=scotland");
    expect(typeof (await core.rate(deps, "gb", "personal-allowance", "Personal Allowance", "2025-26"))).toBe("number");
  });

  it("explains ambiguous or unknown labels and sections", async () => {
    const { deps } = makeDeps();
    await expect(core.rate(deps, "uk", "ni-employee", "Category")).rejects.toThrow(/matches \d+ rows/);
    await expect(core.rate(deps, "uk", "ni-employee", "Category Z")).rejects.toMatchObject({ code: "unknown_label" });
    await expect(core.rate(deps, "uk", "nope", "x")).rejects.toThrow(/Sections: income-tax-england/);
    await expect(core.rate(deps, "ireland", "usc", 9)).rejects.toThrow(/out of range/);
    await expect(core.rate(deps, "poland", "income-tax", 1, "", "waw")).rejects.toMatchObject({ code: "unsupported_region" });
  });

  it("several RATE formulas on one table cost one request", async () => {
    const { deps, fetch } = makeDeps();
    await Promise.all([1, 2, 3, 4].map((n) => core.rate(deps, "ireland", "usc", n)));
    expect(fetch.calls.filter((c) => c.url.includes("tax-tables"))).toHaveLength(1);
  });
});

describe("CALCBLOC.EMPLOYER_COST", () => {
  it("returns summary.totalCost", async () => {
    const fetch = fixtureFetch((u) => {
      if (u.pathname.endsWith("/employer-cost")) return jsonResponse(200, calcResponse("uk", { endpoint: "employer-cost", summary: { totalCost: 57312.5 } }));
    });
    const { deps } = makeDeps({ fetch });
    expect(await core.employerCost(deps, "uk", 50000)).toBe(57312.5);
  });

  it("France has take-home pay but no employer-cost calculation yet", async () => {
    const { deps } = makeDeps();
    await expect(core.employerCost(deps, "france", 50000)).rejects.toThrow(/no employer cost calculation for France/);
  });
});

describe("without an API key", () => {
  it("every function explains how to add a free key and no request is made", async () => {
    const { deps, fetch } = makeDeps({ settings: { defaultCountry: "uk" } });
    const calls = [
      () => core.net(deps, "uk", 50000),
      () => core.tax(deps, "uk", 50000),
      () => core.tax(deps, "poland", 120000),
      () => core.rate(deps, "ireland", "usc", 4),
      () => core.employerCost(deps, "germany", 60000),
    ];
    for (const call of calls) {
      const err = await call().catch((e) => e);
      expect(err).toBeInstanceOf(CalcBlocError);
      expect(err).toMatchObject({ kind: "setup", code: "api_key_missing", message: NO_KEY_MESSAGE });
    }
    expect(fetch.calls).toHaveLength(0);
  });

  it("works as soon as a key is saved", async () => {
    const { deps, fetch, setSettings } = makeDeps({ settings: {} });
    await expect(core.net(deps, "us", 60000, "ca")).rejects.toMatchObject({ kind: "setup" });
    setSettings({ apiKey: TEST_KEY });
    expect(await core.net(deps, "us", 60000, "ca")).toBe(47806.56);
    expect(fetch.calls.every((c) => c.headers["X-API-Key"] === TEST_KEY)).toBe(true);
  });
});
