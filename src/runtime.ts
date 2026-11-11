/*
 * One client and one settings store for the whole add-in. With the shared runtime the custom functions and the task
 * pane run in the same page, so they share this cache, the request pacing and the limit state.
 */
import { CalcBlocClient } from "./lib/client";
import type { Deps } from "./lib/core";
import { SETTINGS_KEY, SettingsStore } from "./lib/settings";
import { defaultStore, memoryStore } from "./lib/storage";

declare const __DEV__: boolean;

let deps: (Deps & { settingsStore: SettingsStore }) | null = null;

/** Dev builds only: ?fixtures=1 answers from recorded responses under /fixtures instead of calcbloc.com. */
export function fixtureMode(): boolean {
  if (!__DEV__) return false;
  try {
    return typeof location !== "undefined" && new URLSearchParams(location.search).get("fixtures") === "1";
  } catch {
    return false;
  }
}

function demoKeyAllowed(): boolean {
  try {
    return new URLSearchParams(location.search).get("nokey") !== "1";
  } catch {
    return true;
  }
}

export function getDeps(): Deps & { settingsStore: SettingsStore } {
  if (deps) return deps;
  const fixtures = fixtureMode();
  // The add-in needs an API key; the offline demo starts with a placeholder one (add &nokey=1 to see the set-up prompt).
  const store = fixtures ? memoryStore(demoKeyAllowed() ? { [SETTINGS_KEY]: JSON.stringify({ apiKey: `cb_${"0".repeat(32)}` }) } : {}) : defaultStore();
  const settingsStore = new SettingsStore(store);
  const client = new CalcBlocClient({
    store,
    getApiKey: async () => (await settingsStore.get()).apiKey,
    // The offline demo answers locally, so pacing to the API's per-minute limit is not needed there.
    ...(fixtures ? { perMinute: 1000 } : {}),
    fetch:
      __DEV__ && fixtures
        ? (url) => import("./harness/fixture-fetch").then((m) => m.fixtureFetch(url))
        : (url, init) => fetch(url, init),
  });
  deps = { client, settings: () => settingsStore.get(), settingsStore };
  return deps;
}
