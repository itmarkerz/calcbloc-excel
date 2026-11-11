/*
 * Offline stand-in for the CalcBloc API, used by the local demo (?fixtures=1) and the tests. It answers from recorded
 * API responses and the CalcBloc dataset files under test/fixtures, with X-RateLimit-* headers like the real API.
 */
import type { CountriesResponse } from "../lib/types";

export type FixtureLoader = (path: string) => Promise<unknown | null>;

/** File name for a recorded calculation: net-salary_country-us_region-ca_salary-60000.json (parameters sorted). */
export function calcFixtureName(endpoint: string, query: URLSearchParams): string {
  const parts = [...query.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}-${v}`);
  return `calc/${endpoint}_${parts.join("_")}.json`;
}

function json(status: number, body: unknown, remaining: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-RateLimit-Limit": "5000",
      "X-RateLimit-Remaining": String(Math.max(0, remaining)),
      "X-RateLimit-Reset": "3600",
    },
  });
}

export function makeFixtureFetch(load: FixtureLoader) {
  let remaining = 5000;
  return async function fixtureFetch(url: string): Promise<Response> {
    remaining--;
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v1/, "");
    if (path === "/countries") {
      const body = await load("countries.json");
      return body ? json(200, body, remaining) : json(500, { error: { code: "fixture_missing", message: "countries.json missing" } }, remaining);
    }
    const tt = path.match(/^\/tax-tables\/([^/]+)\/([^/]+)$/);
    if (tt) {
      const country = decodeURIComponent(tt[1]);
      let year = decodeURIComponent(tt[2]);
      if (year === "latest") {
        const countries = (await load("countries.json")) as CountriesResponse | null;
        year = countries?.countries.find((c) => c.code === country)?.current_year ?? year;
      }
      const region = u.searchParams.get("region");
      const body = await load(`tables/${country}/${year}${region ? `/${region}` : ""}.json`);
      if (body) return json(200, body, remaining);
      return json(404, { error: { code: "not_found", message: `No offline table for ${country} ${year}${region ? ` ${region}` : ""}.` } }, remaining);
    }
    const calc = path.match(/^\/(net-salary|employer-cost)$/);
    if (calc) {
      const body = await load(calcFixtureName(calc[1], u.searchParams));
      if (body) return json(200, body, remaining);
      const unsupported = await load(`calc/unsupported_${u.searchParams.get("country")}.json`);
      if (unsupported) return json(400, unsupported, remaining);
      return json(503, { error: { code: "not_recorded", message: "This request has no recorded response in the offline demo; switch to live mode." } }, remaining);
    }
    return json(404, { error: { code: "not_found", message: `Unknown path ${path}` } }, remaining);
  };
}

/** Browser loader: files served by the dev server under /fixtures/. */
export const fixtureFetch = makeFixtureFetch(async (p) => {
  const res = await fetch(`/fixtures/${p}`);
  return res.ok ? res.json() : null;
});
