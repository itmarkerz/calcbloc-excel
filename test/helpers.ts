import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CalcBlocClient, type ClientOptions } from "../src/lib/client";
import type { Deps } from "../src/lib/core";
import type { Settings } from "../src/lib/settings";
import { memoryStore } from "../src/lib/storage";
import { makeFixtureFetch } from "../src/harness/fixture-fetch";
import type { CountriesResponse, TaxTable } from "../src/lib/types";

export const FIXTURES = join(__dirname, "fixtures");

export function loadFixture<T = unknown>(p: string): T | null {
  const file = join(FIXTURES, p);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
}

export const countriesFixture = () => loadFixture<CountriesResponse>("countries.json")!;
export const tableFixture = (p: string) => loadFixture<TaxTable>(`tables/${p}.json`)!;

export interface MockFetch {
  (url: string, init?: { headers?: Record<string, string> }): Promise<Response>;
  calls: { url: string; headers: Record<string, string> }[];
}

/** fetch backed by the recorded fixtures, recording every call. `override` can answer specific URLs first. */
export function fixtureFetch(override?: (url: URL) => Response | undefined): MockFetch {
  const base = makeFixtureFetch(async (p) => loadFixture(p));
  const fn = (async (url: string, init?: { headers?: Record<string, string> }) => {
    fn.calls.push({ url, headers: init?.headers ?? {} });
    const o = override?.(new URL(url));
    return o ?? base(url);
  }) as MockFetch;
  fn.calls = [];
  return fn;
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

export function makeDeps(opts: { fetch?: MockFetch; settings?: Settings; client?: Partial<ClientOptions> } = {}) {
  const fetch = opts.fetch ?? fixtureFetch();
  const store = memoryStore();
  let settings: Settings = opts.settings ?? {};
  const client = new CalcBlocClient({ store, fetch, sleep: async () => {}, ...opts.client });
  const deps: Deps = { client, settings: async () => settings };
  return { deps, fetch, store, client, setSettings: (s: Settings) => (settings = s) };
}
