import { describe, expect, it } from "vitest";
import { CalcBlocClient, NO_KEY_MESSAGE } from "../src/lib/client";
import { CalcBlocError } from "../src/lib/errors";
import { memoryStore } from "../src/lib/storage";
import { fixtureFetch, jsonResponse, TEST_KEY, type MockFetch } from "./helpers";

/** The add-in needs an API key, so every client here gets one unless a test is about the missing key. */
const withKey = { getApiKey: async () => TEST_KEY };

const ok = (body: unknown, remaining = 4000, reset = 3600) =>
  jsonResponse(200, body, { "X-RateLimit-Limit": "5000", "X-RateLimit-Remaining": String(remaining), "X-RateLimit-Reset": String(reset) });

function scripted(responses: (() => Response)[]): MockFetch {
  let i = 0;
  const fn = (async (url: string, init?: { headers?: Record<string, string> }) => {
    fn.calls.push({ url, headers: init?.headers ?? {} });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return r();
  }) as MockFetch;
  fn.calls = [];
  return fn;
}

describe("CalcBlocClient caching", () => {
  it("answers a repeated request from memory without a second network call", async () => {
    const fetch = fixtureFetch();
    const c = new CalcBlocClient({ ...withKey, store: memoryStore(), fetch });
    const a = await c.taxTable("ireland", "2026");
    const b = await c.taxTable("ireland", "2026");
    expect(a.countryName).toBe("Ireland");
    expect(b).toBe(a);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe("https://calcbloc.com/api/v1/tax-tables/ireland/2026");
  });

  it("shares one network call between identical requests made at the same time (a column of formulas)", async () => {
    const fetch = fixtureFetch();
    const c = new CalcBlocClient({ ...withKey, store: memoryStore(), fetch });
    const results = await Promise.all(Array.from({ length: 25 }, () => c.taxTable("poland", "latest")));
    expect(new Set(results.map((r) => r.year))).toEqual(new Set(["2026"]));
    expect(fetch.calls).toHaveLength(1);
    expect(c.stats.shared).toBe(24);
  });

  it("keeps answers on the device: a new session with the same store makes no request", async () => {
    const store = memoryStore();
    const f1 = fixtureFetch();
    await new CalcBlocClient({ ...withKey, store, fetch: f1 }).countries();
    const f2 = fixtureFetch();
    const c2 = new CalcBlocClient({ ...withKey, store, fetch: f2 });
    const res = await c2.countries();
    expect(res.countries.length).toBeGreaterThan(10);
    expect(f2.calls).toHaveLength(0);
    expect(c2.stats.storeHits).toBe(1);
  });

  it("refetches after the cache lifetime", async () => {
    let now = 1_000_000;
    const fetch = fixtureFetch();
    const c = new CalcBlocClient({ ...withKey, store: memoryStore(), fetch, now: () => now, ttl: { tables: 1000 } });
    await c.taxTable("uk", "2026-27");
    now += 999;
    await c.taxTable("uk", "2026-27");
    now += 2;
    await c.taxTable("uk", "2026-27");
    expect(fetch.calls).toHaveLength(2);
  });

  it("sorts calculation parameters so the same inputs always hit the same cache entry", async () => {
    const fetch = fixtureFetch();
    const c = new CalcBlocClient({ ...withKey, store: memoryStore(), fetch });
    await c.calc("net-salary", { salary: 60000, region: "ca", country: "us" });
    await c.calc("net-salary", { country: "us", region: "ca", salary: 60000 });
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe("https://calcbloc.com/api/v1/net-salary?country=us&region=ca&salary=60000");
  });

  it("caches 400 answers (unsupported country) so bad inputs cost one request", async () => {
    const body = { error: { code: "unsupported_country", message: "Poland has tax tables only." } };
    const fetch = scripted([() => jsonResponse(400, body)]);
    const c = new CalcBlocClient({ ...withKey, store: memoryStore(), fetch });
    for (let i = 0; i < 3; i++) {
      await expect(c.calc("net-salary", { country: "poland", salary: 1 })).rejects.toMatchObject({ code: "unsupported_country", kind: "unavailable" });
    }
    expect(fetch.calls).toHaveLength(1);
  });

  it("does not cache network failures or 5xx answers", async () => {
    let n = 0;
    const fetch = (async () => {
      n++;
      if (n === 1) throw new TypeError("Failed to fetch");
      if (n === 2) return jsonResponse(503, { error: { code: "unavailable", message: "maintenance" } });
      return ok({ countries: [] });
    }) as unknown as MockFetch;
    const c = new CalcBlocClient({ ...withKey, store: memoryStore(), fetch });
    await expect(c.countries()).rejects.toMatchObject({ kind: "network", code: "network_error" });
    await expect(c.countries()).rejects.toMatchObject({ kind: "network" });
    await expect(c.countries()).resolves.toEqual({ countries: [] });
    expect(n).toBe(3);
  });

  it("clearCache empties memory and the device store", async () => {
    const store = memoryStore();
    const fetch = fixtureFetch();
    const c = new CalcBlocClient({ ...withKey, store, fetch });
    await c.taxTable("ireland", "2026");
    await c.countries();
    expect(await c.clearCache()).toBe(2);
    await c.taxTable("ireland", "2026");
    expect(fetch.calls).toHaveLength(3);
  });

  it("drops the oldest entries beyond maxEntries", async () => {
    let now = 0;
    const store = memoryStore();
    const c = new CalcBlocClient({ ...withKey, store, fetch: fixtureFetch(), maxEntries: 2, now: () => ++now });
    await c.taxTable("ireland", "2026");
    await c.taxTable("poland", "2026");
    await c.taxTable("denmark", "2026");
    const keys = [...store.data.keys()].filter((k) => k.startsWith("calcbloc.cache.v1:"));
    expect(keys.sort()).toEqual(["calcbloc.cache.v1:/tax-tables/denmark/2026", "calcbloc.cache.v1:/tax-tables/poland/2026"]);
  });
});

describe("CalcBlocClient API key", () => {
  it("without a key: makes no request, not even from the device cache, and explains how to get a key", async () => {
    const store = memoryStore();
    await new CalcBlocClient({ ...withKey, store, fetch: fixtureFetch() }).countries(); // cached on the device
    const fetch = fixtureFetch();
    const c = new CalcBlocClient({ store, fetch });
    for (const call of [() => c.countries(), () => c.taxTable("uk"), () => c.calc("net-salary", { country: "uk", salary: 50000 })]) {
      const err = await call().catch((e) => e);
      expect(err).toBeInstanceOf(CalcBlocError);
      expect(err).toMatchObject({ kind: "setup", code: "api_key_missing" });
      expect(err.message).toBe(NO_KEY_MESSAGE);
    }
    expect(NO_KEY_MESSAGE).toContain("https://calcbloc.com/developers/keys?utm_source=calcbloc-excel&utm_medium=app&utm_campaign=itmarkerz-oss");
    expect(NO_KEY_MESSAGE).toMatch(/CalcBloc task pane/);
    expect(fetch.calls).toHaveLength(0);
    expect(c.stats).toEqual({ network: 0, memoryHits: 0, storeHits: 0, shared: 0 });
  });

  it("treats a blank key as no key", async () => {
    const fetch = fixtureFetch();
    const c = new CalcBlocClient({ store: memoryStore(), fetch, getApiKey: async () => "   " });
    expect(await c.hasApiKey()).toBe(false);
    await expect(c.countries()).rejects.toMatchObject({ kind: "setup" });
    expect(fetch.calls).toHaveLength(0);
  });

  it("sends the key as X-API-Key on every request", async () => {
    const fetch = fixtureFetch();
    const c = new CalcBlocClient({ ...withKey, store: memoryStore(), fetch });
    await c.countries();
    await c.taxTable("uk", "latest");
    expect(fetch.calls.map((x) => x.headers["X-API-Key"])).toEqual([TEST_KEY, TEST_KEY]);
  });

  it("explains a rejected API key, links to a new one, and does not cache it", async () => {
    const fetch = scripted([() => jsonResponse(401, { error: { code: "invalid_key", message: "Unknown API key." } }), () => ok({ countries: [] })]);
    const c = new CalcBlocClient({ store: memoryStore(), fetch, getApiKey: async () => "cb_x" });
    const err = await c.countries().catch((e) => e);
    expect(err).toMatchObject({ kind: "invalid", code: "invalid_key" });
    expect(err.message).toMatch(/Check it in the CalcBloc task pane, or get a new free key at https:\/\/calcbloc\.com\/developers\/keys\?utm_source=calcbloc-excel/);
    await expect(c.countries()).resolves.toEqual({ countries: [] });
  });
});

describe("CalcBlocClient limits", () => {
  it("stops calling once the API reports the key's daily limit is used up, until it resets", async () => {
    let now = 0;
    const fetch = scripted([() => ok({ countries: [] }, 0, 7200), () => ok({ a: 1 }, 4999, 86400)]);
    const c = new CalcBlocClient({ ...withKey, store: memoryStore(), fetch, now: () => now });
    await c.countries();
    const err = await c.taxTable("uk").catch((e) => e);
    expect(err).toBeInstanceOf(CalcBlocError);
    expect(err.kind).toBe("limited");
    expect(err.message).toMatch(/limit for this API key \(5,000 a day, 60 a minute\)/);
    expect(err.message).toMatch(/2 h/);
    expect(fetch.calls).toHaveLength(1);
    now += 7200 * 1000 + 1;
    await expect(c.taxTable("uk")).resolves.toEqual({ a: 1 });
    expect(fetch.calls).toHaveLength(2);
  });

  it("honours 429 Retry-After and does not retry before it", async () => {
    let now = 0;
    const fetch = scripted([() => jsonResponse(429, { error: { code: "rate_limited", message: "Too many" } }, { "Retry-After": "30" }), () => ok({ ok: true })]);
    const c = new CalcBlocClient({ ...withKey, store: memoryStore(), fetch, now: () => now });
    await expect(c.countries()).rejects.toMatchObject({ kind: "limited" });
    await expect(c.taxTable("uk")).rejects.toMatchObject({ kind: "limited" });
    expect(fetch.calls).toHaveLength(1);
    now += 31_000;
    await expect(c.taxTable("uk")).resolves.toEqual({ ok: true });
  });

  it("remembers the limit state across sessions (same device store)", async () => {
    const store = memoryStore();
    const now = () => 1000;
    await new CalcBlocClient({ ...withKey, store, fetch: scripted([() => ok({}, 0, 600)]), now }).countries();
    const f2 = scripted([() => ok({})]);
    await expect(new CalcBlocClient({ ...withKey, store, fetch: f2, now }).taxTable("uk")).rejects.toMatchObject({ kind: "limited" });
    expect(f2.calls).toHaveLength(0);
  });

  it("ignores a limit state an earlier version saved for requests without a key", async () => {
    const store = memoryStore({ "calcbloc.quota.v1": JSON.stringify({ keyed: false, limit: 50, remaining: 0, resetAt: 10_000_000, blockedUntil: null, updatedAt: 0 }) });
    const fetch = scripted([() => ok({ fine: true })]);
    const c = new CalcBlocClient({ ...withKey, store, fetch, now: () => 1000 });
    await expect(c.taxTable("uk")).resolves.toEqual({ fine: true });
    expect(fetch.calls).toHaveLength(1);
  });

  it("paces requests to the per-minute limit instead of triggering 429", async () => {
    let now = 0;
    const waits: number[] = [];
    const fetch = fixtureFetch();
    const c = new CalcBlocClient({
      ...withKey,
      store: memoryStore(),
      fetch,
      perMinute: 5,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    const countries = ["uk", "ireland", "poland", "denmark", "germany", "australia", "new-zealand"];
    for (const k of countries) await c.taxTable(k, "latest");
    expect(fetch.calls.length).toBe(countries.length);
    expect(waits.length).toBeGreaterThanOrEqual(1);
    expect(waits[0]).toBeGreaterThanOrEqual(60_000);
  });

  it("does not pace below the key's 60 a minute by default", async () => {
    const waits: number[] = [];
    const c = new CalcBlocClient({ ...withKey, store: memoryStore(), fetch: fixtureFetch(), sleep: async (ms) => void waits.push(ms) });
    for (const k of ["uk", "ireland", "poland", "denmark", "germany", "australia", "new-zealand"]) await c.taxTable(k, "latest");
    expect(waits).toHaveLength(0);
  });
});
