/* global Office, document */
import { NO_KEY_MESSAGE } from "../lib/client";
import { CalcBlocError } from "../lib/errors";
import type { CountryInfo } from "../lib/types";
import { getDeps } from "../runtime";
import { insertTaxTableSheet } from "./excel-writer";

const KEY_RE = /^cb_[A-Za-z0-9]{32}$/;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let countries: CountryInfo[] = [];
let inExcel = false;

function setStatus(id: string, text: string, kind: "ok" | "error" | "" = ""): void {
  const el = $(id);
  el.textContent = text;
  el.className = `status ${kind}`;
}

function fill(select: HTMLSelectElement, options: { value: string; label: string }[], selected = ""): void {
  select.replaceChildren(
    ...options.map((o) => {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === selected) opt.selected = true;
      return opt;
    }),
  );
}

const byCode = (code: string) => countries.find((c) => c.code === code);
const regionOptions = (c: CountryInfo | undefined, none: string) => [
  { value: "", label: none },
  ...(c?.endpoints["tax-tables"].regions ?? []).map((r) => ({ value: r.code, label: `${r.name} (${r.code})` })),
];

function refreshInsertSelectors(): void {
  const c = byCode($<HTMLSelectElement>("ins-country").value);
  const years = c?.endpoints["tax-tables"].years ?? [];
  fill(
    $<HTMLSelectElement>("ins-year"),
    years.map((y) => ({ value: y, label: y === c?.current_year ? `${y} (current)` : y })),
    c?.current_year,
  );
  const regions = regionOptions(c, c && c.endpoints["tax-tables"].regions.length ? "National table" : "No regions");
  fill($<HTMLSelectElement>("ins-region"), regions);
  $<HTMLSelectElement>("ins-region").disabled = regions.length <= 1;
  $<HTMLSelectElement>("ins-year").disabled = years.length === 0;
}

function refreshDefaultRegion(selected = ""): void {
  const c = byCode($<HTMLSelectElement>("set-country").value);
  fill($<HTMLSelectElement>("set-region"), regionOptions(c, "None"), selected);
}

async function showUsage(): Promise<void> {
  const q = await getDeps().client.quotaState();
  if (!q || q.remaining === null) return;
  const reset = q.resetAt ? new Date(q.resetAt).toISOString().slice(11, 16) : "";
  $("usage").textContent = `With your API key: ${q.remaining} of ${q.limit ?? "?"} requests left today${reset ? ` (resets ${reset} UTC)` : ""}.`;
}

/**
 * First run (or key removed): the add-in makes no request without a key, so show the set-up card, explain it in the
 * insert section and put the cursor in the key field instead of loading the country list.
 */
function showSetup(needsKey: boolean): void {
  $("setup").hidden = !needsKey;
  if (needsKey) {
    setStatus("ins-status", NO_KEY_MESSAGE, "error");
    $<HTMLButtonElement>("ins-go").disabled = true;
    if (countries.length === 0) fill($<HTMLSelectElement>("ins-country"), [{ value: "", label: "Save your API key first" }]);
    $<HTMLInputElement>("set-key").focus();
  } else if ($("ins-status").textContent === NO_KEY_MESSAGE) {
    setStatus("ins-status", "");
  }
}

async function loadCountries(): Promise<void> {
  const deps = getDeps();
  const settings = await deps.settings();
  try {
    countries = [...(await deps.client.countries()).countries].sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    setStatus("ins-status", `Couldn't load the country list: ${e instanceof Error ? e.message : String(e)}`, "error");
    return;
  }
  const options = countries.map((c) => ({ value: c.code, label: c.tables_only ? `${c.name} (tables only)` : c.name }));
  const insertDefault = settings.defaultCountry && byCode(settings.defaultCountry) ? settings.defaultCountry : "uk";
  fill($<HTMLSelectElement>("ins-country"), options, insertDefault);
  $<HTMLSelectElement>("ins-country").disabled = false;
  refreshInsertSelectors();
  fill($<HTMLSelectElement>("set-country"), [{ value: "", label: "None" }, ...options], settings.defaultCountry ?? "");
  refreshDefaultRegion(settings.defaultRegion ?? "");
  $<HTMLButtonElement>("ins-go").disabled = false;
  await showUsage();
}

async function onInsert(): Promise<void> {
  const country = $<HTMLSelectElement>("ins-country").value;
  const year = $<HTMLSelectElement>("ins-year").value || "latest";
  const region = $<HTMLSelectElement>("ins-region").value || undefined;
  const button = $<HTMLButtonElement>("ins-go");
  button.disabled = true;
  setStatus("ins-status", "Fetching the table…");
  try {
    const table = await getDeps().client.taxTable(country, year, region);
    if (!inExcel) {
      setStatus("ins-status", `Fetched ${table.countryName} ${table.year} (${table.rows?.length ?? 0} rows). Open this pane in Excel to insert it.`, "ok");
      return;
    }
    const name = await insertTaxTableSheet(table);
    setStatus("ins-status", `Inserted sheet "${name}".`, "ok");
  } catch (e) {
    const msg = e instanceof CalcBlocError || e instanceof Error ? e.message : String(e);
    setStatus("ins-status", msg, "error");
  } finally {
    button.disabled = false;
    await showUsage();
  }
}

async function onSave(): Promise<void> {
  const deps = getDeps();
  const key = $<HTMLInputElement>("set-key").value.trim();
  if (key && !KEY_RE.test(key)) {
    setStatus("set-status", 'That doesn\'t look like a CalcBloc key ("cb_" followed by 32 letters and digits).', "error");
    return;
  }
  const before = (await deps.settings()).apiKey ?? "";
  // Until a key is saved the country lists are empty: leave the saved default country and region untouched then.
  await deps.settingsStore.set(
    countries.length
      ? { apiKey: key, defaultCountry: $<HTMLSelectElement>("set-country").value, defaultRegion: $<HTMLSelectElement>("set-region").value }
      : { apiKey: key },
  );
  if (before !== key) await deps.client.resetQuota();
  setStatus(
    "set-status",
    key ? "Saved. Recalculate (Ctrl+Alt+F9) to refresh formulas that used the old settings." : "Saved without a key: CalcBloc functions and tables need a free API key.",
    key ? "ok" : "error",
  );
  showSetup(!key);
  if (key && countries.length === 0) await loadCountries();
}

async function onClearCache(): Promise<void> {
  const n = await getDeps().client.clearCache();
  setStatus("cache-status", `Cleared ${n} cached answer${n === 1 ? "" : "s"}.`, "ok");
}

async function init(): Promise<void> {
  const settings = await getDeps().settings();
  $<HTMLInputElement>("set-key").value = settings.apiKey ?? "";
  $("ins-country").addEventListener("change", refreshInsertSelectors);
  $("set-country").addEventListener("change", () => refreshDefaultRegion());
  $("ins-go").addEventListener("click", () => void onInsert());
  $("set-save").addEventListener("click", () => void onSave());
  $("cache-clear").addEventListener("click", () => void onClearCache());
  $("set-key-show").addEventListener("click", () => {
    const input = $<HTMLInputElement>("set-key");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    $("set-key-show").textContent = show ? "Hide" : "Show";
    $("set-key-show").setAttribute("aria-pressed", String(show));
  });
  if (!(await getDeps().client.hasApiKey())) {
    showSetup(true);
    return;
  }
  await loadCountries();
}

if (typeof Office !== "undefined" && Office.onReady) {
  Office.onReady((info) => {
    inExcel = info.host === Office.HostType.Excel;
    void init();
  });
} else {
  void init();
}
