import { CalcBlocError } from "./errors";
import type { KeyValueStore } from "./storage";
import type { ApiErrorBody, CalcResponse, CountriesResponse, TaxTable } from "./types";

export const DEFAULT_BASE_URL = "https://calcbloc.com/api/v1";
export const KEYS_URL = "https://calcbloc.com/developers/keys";
/** The keys page as linked from inside the add-in (referral tag, as on the task pane's other calcbloc.com links). */
export const KEYS_URL_APP = `${KEYS_URL}?utm_source=calcbloc-excel&utm_medium=app&utm_campaign=itmarkerz-oss`;
/** Where the key goes. */
export const KEY_SETTINGS_PATH = "Home > CalcBloc > Tax tables > Settings";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export interface CacheTtl {
  countries: number;
  tables: number;
  calc: number;
  /** 400/404 answers (unsupported country, bad parameter): cached so a column of bad inputs costs one request. */
  errors: number;
}

export interface ClientOptions {
  fetch?: (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;
  store: KeyValueStore;
  baseUrl?: string;
  getApiKey?: () => Promise<string | undefined>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  ttl?: Partial<CacheTtl>;
  /** Most cached responses kept on the device; the oldest are dropped first. */
  maxEntries?: number;
  /** Requests allowed per rolling minute; defaults to the API limits (5 anonymous, 60 with a key). */
  perMinute?: { anonymous: number; keyed: number };
}

/** What the API told us about the daily limit in its last response (X-RateLimit-* headers). */
export interface QuotaState {
  keyed: boolean;
  limit: number | null;
  remaining: number | null;
  /** Epoch ms when the daily window resets (UTC midnight). */
  resetAt: number | null;
  /** Epoch ms until which the API asked us to stop (429 Retry-After). */
  blockedUntil: number | null;
  updatedAt: number;
}

type Cached = { ok: true; data: unknown } | { ok: false; status: number; code: string; message: string };
interface CacheEntry {
  t: number;
  ttl: number;
  v: Cached;
}

const CACHE_PREFIX = "calcbloc.cache.v1:";
const INDEX_KEY = "calcbloc.cache.v1.index";
const QUOTA_KEY = "calcbloc.quota.v1";

/** Requests per rolling minute the API allows (anonymous / with a key). */
const PER_MINUTE = { anonymous: 5, keyed: 60 };

function hoursUntil(ms: number): string {
  const h = Math.max(0, ms) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.ceil(h * 60))} min`;
  return `${Math.ceil(h)} h`;
}

/**
 * A small client for the CalcBloc API, built to spend as few requests as possible:
 * - every answer is cached in memory and on the device (OfficeRuntime.storage) for days;
 * - identical requests made at the same time (a column of formulas) share one network call;
 * - requests are paced to the per-minute limit instead of failing with 429;
 * - once the API reports the daily limit is used up, no further calls are made until it resets.
 */
export class CalcBlocClient {
  readonly baseUrl: string;
  readonly stats = { network: 0, memoryHits: 0, storeHits: 0, shared: 0 };
  private readonly fetchImpl: NonNullable<ClientOptions["fetch"]>;
  private readonly store: KeyValueStore;
  private readonly getApiKey: () => Promise<string | undefined>;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly ttl: CacheTtl;
  private readonly maxEntries: number;
  private readonly perMinute: { anonymous: number; keyed: number };
  private readonly mem = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<Cached>>();
  private recent: number[] = [];
  private quota: QuotaState | null = null;
  private index: Record<string, number> | null = null;

  constructor(opts: ClientOptions) {
    this.fetchImpl = opts.fetch ?? ((url, init) => fetch(url, init));
    this.store = opts.store;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.getApiKey = opts.getApiKey ?? (async () => undefined);
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.ttl = { countries: 7 * DAY, tables: 7 * DAY, calc: 7 * DAY, errors: DAY, ...opts.ttl };
    this.maxEntries = opts.maxEntries ?? 400;
    this.perMinute = opts.perMinute ?? PER_MINUTE;
  }

  /** GET /countries: every country with its years, regions and the endpoints and parameters it supports. */
  countries(): Promise<CountriesResponse> {
    return this.get<CountriesResponse>("/countries", this.ttl.countries);
  }

  /** GET /tax-tables/{country}/{year}[?region=]: the full table with sources. */
  taxTable(country: string, year = "latest", region?: string): Promise<TaxTable> {
    const q = region ? `?region=${encodeURIComponent(region)}` : "";
    return this.get<TaxTable>(`/tax-tables/${encodeURIComponent(country)}/${encodeURIComponent(year)}${q}`, this.ttl.tables);
  }

  /** GET /net-salary or /employer-cost with the given parameters. */
  calc(endpoint: "net-salary" | "employer-cost", params: Record<string, string | number | boolean>): Promise<CalcResponse> {
    const qs = Object.keys(params)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
      .join("&");
    return this.get<CalcResponse>(`/${endpoint}?${qs}`, this.ttl.calc);
  }

  /**
   * True when requests without a key have hit the API's limit (daily allowance used up, or a 429): the task pane then
   * asks for a free API key. False once a key is in use.
   */
  async needsKeyPrompt(): Promise<boolean> {
    if ((await this.getApiKey())?.trim()) return false;
    const q = await this.quotaState();
    if (!q || q.keyed) return false;
    const now = this.now();
    return (q.blockedUntil !== null && now < q.blockedUntil) || (q.remaining !== null && q.remaining <= 0 && (q.resetAt === null || now < q.resetAt));
  }

  async quotaState(): Promise<QuotaState | null> {
    if (this.quota) return this.quota;
    try {
      const raw = await this.store.getItem(QUOTA_KEY);
      this.quota = raw ? (JSON.parse(raw) as QuotaState) : null;
    } catch {
      this.quota = null;
    }
    return this.quota;
  }

  /** Forget the stored limit state (after the API key changes). */
  async resetQuota(): Promise<void> {
    this.quota = null;
    this.recent = [];
    await this.store.removeItem(QUOTA_KEY);
  }

  /** Remove every cached response from memory and the device. */
  async clearCache(): Promise<number> {
    const index = await this.loadIndex();
    const keys = Object.keys(index);
    await Promise.all(keys.map((k) => this.store.removeItem(k)));
    this.index = {};
    await this.store.setItem(INDEX_KEY, "{}");
    this.mem.clear();
    return keys.length;
  }

  private async get<T>(path: string, ttl: number): Promise<T> {
    const v = await this.lookup(path, ttl);
    if (v.ok) return v.data as T;
    throw new CalcBlocError(v.status === 404 || v.code.startsWith("unsupported") ? "unavailable" : "invalid", v.code, v.message);
  }

  private async lookup(path: string, ttl: number): Promise<Cached> {
    const key = CACHE_PREFIX + path;
    const now = this.now();
    const m = this.mem.get(key);
    if (m && now - m.t < m.ttl) {
      this.stats.memoryHits++;
      return m.v;
    }
    const pending = this.inflight.get(key);
    if (pending) {
      this.stats.shared++;
      return pending;
    }
    const p = (async () => {
      const stored = await this.readStored(key);
      if (stored && this.now() - stored.t < stored.ttl) {
        this.stats.storeHits++;
        this.mem.set(key, stored);
        return stored.v;
      }
      const v = await this.network(path);
      const entry: CacheEntry = { t: this.now(), ttl: v.ok ? ttl : this.ttl.errors, v };
      this.mem.set(key, entry);
      await this.writeStored(key, entry);
      return v;
    })();
    this.inflight.set(key, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async network(path: string): Promise<Cached> {
    const apiKey = (await this.getApiKey())?.trim() || undefined;
    const keyed = !!apiKey;
    await this.checkQuota(keyed);
    await this.pace(keyed);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;
    let res: Response;
    this.stats.network++;
    try {
      res = await this.fetchImpl(this.baseUrl + path, { headers });
    } catch (e) {
      throw new CalcBlocError("network", "network_error", `Couldn't reach calcbloc.com (${e instanceof Error ? e.message : String(e)}). Check the connection and recalculate.`);
    }
    await this.recordQuota(res, keyed);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (res.ok) return { ok: true, data: body };
    const err = (body as ApiErrorBody | null)?.error;
    const code = err?.code ?? `http_${res.status}`;
    const message = err?.message ?? `calcbloc.com answered HTTP ${res.status}.`;
    if (res.status === 429) {
      const retry = Number(res.headers.get("Retry-After"));
      const q = (await this.quotaState()) ?? this.blankQuota(keyed);
      const until = this.now() + (Number.isFinite(retry) && retry > 0 ? retry * 1000 : MINUTE);
      this.quota = { ...q, blockedUntil: until, updatedAt: this.now() };
      await this.saveQuota();
      throw this.limitError(keyed, until);
    }
    if (res.status === 401 || res.status === 403) {
      throw new CalcBlocError("invalid", code, `The API key was not accepted (${message}). Check it in the CalcBloc task pane (${KEY_SETTINGS_PATH}), get a new free key at ${KEYS_URL_APP}, or remove it to use the free limit without a key.`);
    }
    if (res.status === 400 || res.status === 404) return { ok: false, status: res.status, code, message };
    throw new CalcBlocError("network", code, `calcbloc.com could not answer right now (${message}). Try again later.`);
  }

  private blankQuota(keyed: boolean): QuotaState {
    return { keyed, limit: null, remaining: null, resetAt: null, blockedUntil: null, updatedAt: this.now() };
  }

  private limitError(keyed: boolean, until: number): CalcBlocError {
    const wait = hoursUntil(until - this.now());
    const msg = keyed
      ? `The request limit for this API key (5,000 a day, 60 a minute) is used up; it resets in ${wait}. Results already fetched keep working.`
      : `Add your free API key: the free requests without a key (50 a day, 5 a minute, per internet address) are used up; they reset in ${wait}. Get a free key (5,000 a day) at ${KEYS_URL_APP} and paste it in the CalcBloc task pane (${KEY_SETTINGS_PATH}). Results already fetched keep working.`;
    return new CalcBlocError("limited", "rate_limited", msg);
  }

  private async checkQuota(keyed: boolean): Promise<void> {
    const q = await this.quotaState();
    if (!q) return;
    const now = this.now();
    if (q.blockedUntil && now < q.blockedUntil && q.keyed === keyed) throw this.limitError(keyed, q.blockedUntil);
    if (q.keyed === keyed && q.remaining !== null && q.remaining <= 0 && q.resetAt && now < q.resetAt) throw this.limitError(keyed, q.resetAt);
  }

  /** Waits so that no more requests leave per rolling minute than the API accepts. */
  private async pace(keyed: boolean): Promise<void> {
    const limit = keyed ? this.perMinute.keyed : this.perMinute.anonymous;
    for (;;) {
      const now = this.now();
      this.recent = this.recent.filter((t) => now - t < MINUTE);
      if (this.recent.length < limit) {
        this.recent.push(now);
        return;
      }
      await this.sleep(this.recent[0] + MINUTE - now + 250);
    }
  }

  private async recordQuota(res: Response, keyed: boolean): Promise<void> {
    const num = (h: string) => {
      const v = res.headers.get(h);
      if (v === null || v.trim() === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const limit = num("X-RateLimit-Limit");
    const remaining = num("X-RateLimit-Remaining");
    const reset = num("X-RateLimit-Reset");
    if (limit === null && remaining === null) return;
    const prev = await this.quotaState();
    this.quota = {
      keyed,
      limit,
      remaining,
      resetAt: reset !== null ? this.now() + reset * 1000 : null,
      blockedUntil: prev && prev.keyed === keyed ? prev.blockedUntil : null,
      updatedAt: this.now(),
    };
    await this.saveQuota();
  }

  private async saveQuota(): Promise<void> {
    try {
      await this.store.setItem(QUOTA_KEY, JSON.stringify(this.quota));
    } catch {
      // Not fatal: the limit state is a courtesy.
    }
  }

  private async readStored(key: string): Promise<CacheEntry | null> {
    try {
      const raw = await this.store.getItem(key);
      return raw ? (JSON.parse(raw) as CacheEntry) : null;
    } catch {
      return null;
    }
  }

  private async loadIndex(): Promise<Record<string, number>> {
    if (this.index) return this.index;
    try {
      const raw = await this.store.getItem(INDEX_KEY);
      this.index = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      this.index = {};
    }
    return this.index;
  }

  private async writeStored(key: string, entry: CacheEntry): Promise<void> {
    try {
      const index = await this.loadIndex();
      index[key] = entry.t;
      const keys = Object.keys(index);
      if (keys.length > this.maxEntries) {
        const oldest = keys.sort((a, b) => index[a] - index[b]).slice(0, keys.length - this.maxEntries);
        for (const k of oldest) {
          delete index[k];
          this.mem.delete(k);
          await this.store.removeItem(k);
        }
      }
      await this.store.setItem(key, JSON.stringify(entry));
      await this.store.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
      // Storage full or unavailable: the memory cache still works for this session.
    }
  }
}
