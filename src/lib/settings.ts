import type { KeyValueStore } from "./storage";

/** What the task pane saves. Kept on this device only (OfficeRuntime.storage), never in the workbook. */
export interface Settings {
  /** Free CalcBloc API key (https://calcbloc.com/developers/keys). Required: without one the add-in makes no requests. */
  apiKey?: string;
  /** Country used when a function's country argument is empty. */
  defaultCountry?: string;
  /** Region used when the region argument is empty and the country is the default country. */
  defaultRegion?: string;
}

export const SETTINGS_KEY = "calcbloc.settings.v1";

export class SettingsStore {
  private cached: Settings | null = null;

  constructor(private readonly store: KeyValueStore) {}

  async get(): Promise<Settings> {
    if (this.cached) return this.cached;
    let parsed: Settings = {};
    try {
      const raw = await this.store.getItem(SETTINGS_KEY);
      if (raw) parsed = JSON.parse(raw) as Settings;
    } catch {
      parsed = {};
    }
    this.cached = parsed;
    return parsed;
  }

  async set(patch: Settings): Promise<Settings> {
    const next: Settings = { ...(await this.get()), ...patch };
    for (const k of Object.keys(next) as (keyof Settings)[]) {
      const v = next[k];
      if (v === undefined || (typeof v === "string" && v.trim() === "")) delete next[k];
      else next[k] = v.trim();
    }
    await this.store.setItem(SETTINGS_KEY, JSON.stringify(next));
    this.cached = next;
    return next;
  }

  /** Forget the in-memory copy (another part of the add-in may have saved new settings). */
  invalidate(): void {
    this.cached = null;
  }
}
