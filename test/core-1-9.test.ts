import { describe, expect, it } from "vitest";
import * as core from "../src/lib/core";
import { fixtureFetch, jsonResponse, loadFixture, makeDeps } from "./helpers";

/** Recorded live API 1.8 / 1.9 responses (2026-11-27), keyed by path and sorted query. */
const RECORDED: Record<string, string> = {
  "/api/v1/supplemental-withholding?amount=20000&country=us&region=ca&salary=150000": "api19/supplemental-withholding_us_150000_20000_ca.json",
  "/api/v1/import-duty?code=0901210000&customs_value=1000&destination=gb&origin=in&proof_of_origin=true": "api19/import-duty_gb_in_0901210000_1000_poo.json",
  "/api/v1/import-duty?code=2203000100&customs_value=500&destination=gb&origin=de": "api19/import-duty_gb_de_2203000100_500.json",
};

const fetch19 = () =>
  fixtureFetch((u) => {
    if (!/\/(supplemental-withholding|import-duty)$/.test(u.pathname)) return undefined;
    const q = new URLSearchParams([...u.searchParams].sort(([a], [b]) => a.localeCompare(b))).toString();
    const file = RECORDED[`${u.pathname}?${q}`];
    return file ? jsonResponse(200, loadFixture(file)) : jsonResponse(503, { error: { code: "service_unavailable", message: `no fixture for ${u.pathname}?${q}` } });
  });

describe("CALCBLOC.BONUS_WITHHOLDING", () => {
  it("returns the tax withheld on a US bonus in California, and the other summary figures", async () => {
    const { deps } = makeDeps({ fetch: fetch19() });
    expect(await core.bonusWithholding(deps, "us", 150000, 20000, "", "ca")).toBe(8236);
    expect(await core.bonusWithholding(deps, "United States", "150000", "20,000", undefined, "California", "totalLiability")).toBe(8450);
    expect(await core.bonusWithholding(deps, "us", 150000, 20000, "", "ca", "netPayment")).toBe(11764);
  });

  it("checks the amount and the result name before any calculation request", async () => {
    const f = fetch19();
    const { deps } = makeDeps({ fetch: f });
    await expect(core.bonusWithholding(deps, "us", 150000, "lots", "", "ca")).rejects.toThrow(/Amount must be a number/);
    await expect(core.bonusWithholding(deps, "us", 150000, 20000, "", "ca", "nope")).rejects.toThrow(/No result "nope"/);
    expect(f.calls.some((c) => c.url.includes("supplemental-withholding"))).toBe(false);
  });
});

describe("CALCBLOC.IMPORT_DUTY", () => {
  it("UK coffee from India with proof of origin: no duty and no VAT; landed cost = customs value", async () => {
    const { deps } = makeDeps({ fetch: fetch19() });
    expect(await core.importDuty(deps, "gb", "in", "0901 21 00 00", 1000, "", true)).toBe(0);
    expect(await core.importDuty(deps, "gb", "in", "0901210000", 1000, "landed_cost", "TRUE")).toBe(1000);
  });

  it("an incomplete total (beer without an excise code) is an error; the customs duty part alone is returned", async () => {
    const { deps } = makeDeps({ fetch: fetch19() });
    await expect(core.importDuty(deps, "gb", "de", "2203000100", 500)).rejects.toThrow(/incomplete: excise applies to this code/);
    expect(await core.importDuty(deps, "gb", "de", "2203000100", 500, "customs_duty")).toBe(0);
  });

  it("checks its inputs before any request", async () => {
    const f = fetch19();
    const { deps } = makeDeps({ fetch: f });
    await expect(core.importDuty(deps, "", "in", "0901210000", 1000)).rejects.toThrow(/Destination is required/);
    await expect(core.importDuty(deps, "gb", "in", "coffee", 1000)).rejects.toThrow(/commodity code/);
    await expect(core.importDuty(deps, "gb", "in", "0901210000", 0)).rejects.toThrow(/Customs value/);
    expect(f.calls).toHaveLength(0);
  });
});
