import { describe, expect, it } from "vitest";
import * as core from "../src/lib/core";
import { fixtureFetch, jsonResponse, loadFixture, makeDeps } from "./helpers";

/**
 * API 1.10 responses for Denmark, Estonia and Poland (the shared take-home engine), produced by the site's own request
 * handler before the release, keyed by path and sorted query. /countries answers with a 1.10 sample (Denmark,
 * Estonia, Poland, the UK and Fiji, with the full coverage block).
 */
const RECORDED: Record<string, string> = {
  "/api/v1/net-salary?country=denmark&salary=600000": "api110/net-salary-dk.json",
  "/api/v1/net-salary?country=estonia&salary=30000": "api110/net-salary-ee.json",
  "/api/v1/net-salary?country=poland&salary=120000": "api110/net-salary-pl.json",
  "/api/v1/employer-cost?country=denmark&salary=600000": "api110/employer-cost-dk.json",
  "/api/v1/employer-cost?country=estonia&salary=30000": "api110/employer-cost-ee.json",
  "/api/v1/employer-cost?country=poland&salary=120000": "api110/employer-cost-pl.json",
};

/** More calculation requests per test than the keyless pacing (5 a minute) lets through without waiting. */
const PACE = { perMinute: { anonymous: 60, keyed: 60 } };

const fetch110 = () =>
  fixtureFetch((u) => {
    if (u.pathname === "/api/v1/countries") return jsonResponse(200, loadFixture("api110/countries-1.10-sample.json"));
    if (!/\/(net-salary|employer-cost)$/.test(u.pathname)) return undefined;
    const q = new URLSearchParams([...u.searchParams].sort(([a], [b]) => a.localeCompare(b))).toString();
    const file = RECORDED[`${u.pathname}?${q}`];
    return file ? jsonResponse(200, loadFixture(file)) : jsonResponse(503, { error: { code: "service_unavailable", message: `no fixture for ${u.pathname}?${q}` } });
  });

describe("API 1.10: NET, TAX and EMPLOYER_COST for Denmark, Estonia and Poland", () => {
  it("NET takes the short code, ISO code or name and returns the annual take-home pay", async () => {
    const { deps } = makeDeps({ fetch: fetch110(), client: PACE });
    expect(await core.net(deps, "dk", 600000)).toBe(383427.85);
    expect(await core.net(deps, "EE", 30000)).toBe(24405.6);
    expect(await core.net(deps, "Poland", 120000)).toBe(85762.92);
  });

  it("EMPLOYER_COST and TAX (income tax from the calculator)", async () => {
    const { deps } = makeDeps({ fetch: fetch110(), client: PACE });
    expect(await core.employerCost(deps, "pl", 120000)).toBe(144576);
    expect(await core.employerCost(deps, "dk", 600000)).toBe(602376);
    expect(await core.employerCost(deps, "estonia", 30000)).toBeGreaterThan(30000);
    expect(await core.tax(deps, "pl", 120000)).toBe(8465.76);
    expect(await core.tax(deps, "dk", 600000)).toBe(167479.19);
    expect(await core.tax(deps, "ee", 30000)).toBe(4514.4);
  });

  it("the responses carry verification (official-example or law-text)", async () => {
    const { deps } = makeDeps({ fetch: fetch110(), client: PACE });
    const pl = await core.runCalc(deps, await core.resolveCountry(deps, "pl"), "net-salary", 120000, undefined, undefined);
    const dk = await core.runCalc(deps, await core.resolveCountry(deps, "dk"), "employer-cost", 600000, undefined, undefined);
    expect(pl.verification).toBe("official-example");
    expect(dk.verification).toBe("law-text");
  });

  it("Denmark, Estonia and Poland have no region: a region argument is refused before any calculation request", async () => {
    const f = fetch110();
    const { deps } = makeDeps({ fetch: f, client: PACE });
    await expect(core.net(deps, "dk", 600000, "hovedstaden")).rejects.toThrow(/has no regions/);
    expect(f.calls.some((c) => c.url.includes("net-salary"))).toBe(false);
  });

  it("a new 1.10 tables-only country resolves by short code and name", async () => {
    const { deps } = makeDeps({ fetch: fetch110(), client: PACE });
    expect((await core.resolveCountry(deps, "fj")).code).toBe("fiji");
    expect((await core.resolveCountry(deps, "FJI")).code).toBe("fiji");
    await expect(core.net(deps, "fj", 50000)).rejects.toThrow(/no take-home pay calculation for Fiji/);
  });
});
