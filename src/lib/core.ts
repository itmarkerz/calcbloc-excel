import type { CalcBlocClient } from "./client";
import { invalid, unavailable } from "./errors";
import type { Settings } from "./settings";
import { annualTaxFromSection, findRow, findSection, primaryIncomeTaxBands } from "./tables";
import type { CalcResponse, CountryInfo } from "./types";

/** What the function logic needs: the API client and the saved settings. */
export interface Deps {
  client: CalcBlocClient;
  settings: () => Promise<Settings>;
}

type CalcEndpoint = "net-salary" | "employer-cost";
export type CellInput = string | number | boolean | null | undefined;

/** Common short forms (ISO codes, alternative names) mapped to CalcBloc country codes. Validated against /countries. */
const ALIASES: Record<string, string> = {
  gb: "uk",
  "great-britain": "uk",
  "united-kingdom": "uk",
  usa: "us",
  "united-states": "us",
  "united-states-of-america": "us",
  au: "australia",
  nz: "new-zealand",
  ca: "canada",
  ie: "ireland",
  in: "india",
  de: "germany",
  es: "spain",
  nl: "netherlands",
  fr: "france",
  sg: "singapore",
  ae: "uae",
  "united-arab-emirates": "uae",
  it: "italy",
  pt: "portugal",
  ch: "switzerland",
  dk: "denmark",
  se: "sweden",
  at: "austria",
  pl: "poland",
  lu: "luxembourg",
  cz: "czechia",
  "czech-republic": "czechia",
  no: "norway",
  fi: "finland",
  si: "slovenia",
  ro: "romania",
  hu: "hungary",
  sk: "slovakia",
  gr: "greece",
  be: "belgium",
};

/**
 * results keys that hold annual income tax in each calculator's output (see /countries for the calculators).
 * Germany: wage tax + solidarity surcharge + church tax. Canada: federal + provincial. Australia: income tax and
 * Medicare levy for the year. Spain: IRPF withheld. US has no single key: its breakdown rows are used instead.
 */
const INCOME_TAX_RESULTS: Record<string, string[]> = {
  uk: ["incomeTax"],
  ireland: ["incomeTax"],
  india: ["incomeTax"],
  france: ["incomeTax"],
  germany: ["wageTax", "soli", "churchTax"],
  netherlands: ["tax"],
  spain: ["withholding"],
  singapore: ["tax"],
  australia: ["taxAnnual"],
  "new-zealand": ["payeAnnual"],
  canada: ["federalTax", "provincialTax"],
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const isBlank = (v: CellInput) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const slug = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "-");

function listPreview(items: string[], max = 12): string {
  return items.length > max ? `${items.slice(0, max).join(", ")}... (${items.length} in all)` : items.join(", ");
}

/** Resolves a country argument (code, name or common alias; empty: the default country) to its /countries entry. */
export async function resolveCountry(deps: Deps, input: CellInput): Promise<CountryInfo> {
  let raw = isBlank(input) ? "" : String(input);
  if (!raw) raw = (await deps.settings()).defaultCountry ?? "";
  if (!raw) throw invalid('Country is required, e.g. "uk", "us" or "germany" (or set a default country in the CalcBloc task pane).', "missing_country");
  const { countries } = await deps.client.countries();
  const s = slug(raw);
  const code = ALIASES[s] ?? s;
  const found = countries.find((c) => c.code === code) ?? countries.find((c) => slug(c.name) === s);
  if (found) return found;
  throw unavailable(`CalcBloc has no data for "${raw}". Countries: ${countries.map((c) => c.code).join(", ")}.`, "unsupported_country");
}

function resolveYear(input: CellInput): string | undefined {
  if (isBlank(input) || input === 0 || input === false) return undefined;
  if (typeof input === "number") {
    if (!Number.isInteger(input)) throw invalid(`Year must be a tax year such as 2026 or "2026-27", not ${input}.`, "invalid_year");
    return String(input);
  }
  return String(input).trim().toLowerCase();
}

function resolveRegionCode(regions: { code: string; name: string }[], input: string, place: string): string {
  const s = slug(input);
  const found = regions.find((r) => r.code.toLowerCase() === s) ?? regions.find((r) => slug(r.name) === s);
  if (found) return found.code;
  throw invalid(`"${input}" is not a region of ${place}. Use one of: ${listPreview(regions.map((r) => r.code))}.`, "unsupported_region");
}

function checkGross(gross: CellInput): number {
  const n = typeof gross === "string" && gross.trim() !== "" ? Number(gross) : gross;
  if (typeof n !== "number" || !Number.isFinite(n)) throw invalid("Gross must be a number (annual salary before tax).", "invalid_salary");
  if (n < 0) throw invalid("Gross can't be negative.", "invalid_salary");
  return n;
}

async function defaultRegionFor(deps: Deps, country: CountryInfo): Promise<string | undefined> {
  const s = await deps.settings();
  if (!s.defaultRegion || !s.defaultCountry) return undefined;
  const dc = ALIASES[slug(s.defaultCountry)] ?? slug(s.defaultCountry);
  return dc === country.code || slug(country.name) === slug(s.defaultCountry) ? s.defaultRegion : undefined;
}

function tablesUrl(c: CountryInfo): string {
  return c.endpoints["tax-tables"]?.pageUrl ?? `https://calcbloc.com/${c.code}/tax-tables`;
}

/** Runs a calculation endpoint with the add-in's arguments mapped to the API's parameters. */
export async function runCalc(deps: Deps, c: CountryInfo, endpoint: CalcEndpoint, grossIn: CellInput, regionIn: CellInput, yearIn: CellInput): Promise<CalcResponse> {
  const info = c.endpoints[endpoint];
  if (!info) {
    const what = endpoint === "net-salary" ? "take-home pay" : "employer cost";
    const hint = endpoint === "net-salary" ? " Use CALCBLOC.TAX for income tax from the official brackets, or CALCBLOC.RATE for single figures." : "";
    throw unavailable(`CalcBloc has no ${what} calculation for ${c.name} yet (tax tables only).${hint} Tables: ${tablesUrl(c)}`, "unsupported_country");
  }
  const gross = checkGross(grossIn);
  const params: Record<string, string | number | boolean> = { country: c.code };

  const salaryParam = info.parameters.find((p) => p.name === "salary");
  const monthly = !!salaryParam?.description && /^monthly/i.test(salaryParam.description.trim());
  params.salary = monthly ? round2(gross / 12) : gross;

  const regionParam = info.parameters.find((p) => p.name === "region");
  let region = isBlank(regionIn) ? undefined : String(regionIn);
  if (regionParam) {
    if (!region) region = await defaultRegionFor(deps, c);
    const values = regionParam.values ?? [];
    if (region) {
      const regions = values.map((v) => c.endpoints["tax-tables"].regions.find((r) => r.code === v) ?? { code: v, name: v });
      params.region = resolveRegionCode(regions, region, c.name);
    } else if (regionParam.required) {
      throw invalid(`${c.name} needs a region for this calculation: ${listPreview(values)}.`, "missing_region");
    }
  } else if (region) {
    throw invalid(`${c.name} has no regions for this calculation; leave region empty.`, "unsupported_region");
  }

  const year = resolveYear(yearIn);
  if (year && year !== "latest") {
    // The API runs calculations for the current tax year only; earlier years are served as tax tables.
    if (year !== c.current_year) {
      const tables = c.endpoints["tax-tables"].years.includes(year) ? ` ${year} is available as tax tables (CALCBLOC.RATE or the task pane).` : "";
      throw invalid(`${c.name} calculations use the current tax year, ${c.current_year}.${tables}`, "unsupported_year");
    }
    params.year = year;
  }
  return deps.client.calc(endpoint, params);
}

/** Annual income tax from a net-salary response. */
export function incomeTaxFrom(country: string, r: CalcResponse): number {
  const keys = INCOME_TAX_RESULTS[country];
  if (keys && keys.every((k) => typeof r.results[k] === "number")) return keys.reduce((s, k) => s + r.results[k], 0);
  if (typeof r.results.incomeTax === "number") return r.results.incomeTax;
  const b = r.breakdown;
  if (b && b.rows.length) {
    let col = b.columns.findIndex((c) => /year|annual/i.test(c));
    if (col < 0) col = b.columns.length - 1;
    const rows = b.rows.filter((x) => /income tax/i.test(x.label) && typeof x.values[col] === "number");
    if (rows.length) return Math.abs(rows.reduce((s, x) => s + x.values[col], 0));
  }
  throw unavailable(`The ${r.countryName} calculation doesn't report income tax separately. See ${r.calculatorUrl}.`, "no_income_tax");
}

/** CALCBLOC.NET */
export async function net(deps: Deps, country: CellInput, gross: CellInput, region?: CellInput, year?: CellInput): Promise<number> {
  const c = await resolveCountry(deps, country);
  const r = await runCalc(deps, c, "net-salary", gross, region, year);
  const v = r.summary.netAnnual ?? r.results.netAnnual;
  if (typeof v !== "number") throw unavailable(`No take-home figure in the ${c.name} result.`, "no_result");
  return round2(v);
}

/** CALCBLOC.EMPLOYER_COST */
export async function employerCost(deps: Deps, country: CellInput, gross: CellInput, region?: CellInput, year?: CellInput): Promise<number> {
  const c = await resolveCountry(deps, country);
  const r = await runCalc(deps, c, "employer-cost", gross, region, year);
  const v = r.summary.totalCost;
  if (typeof v !== "number") throw unavailable(`No total cost in the ${c.name} result.`, "no_result");
  return round2(v);
}

/**
 * CALCBLOC.TAX: income tax from the country's calculator where there is one; otherwise (tables-only countries, or
 * when a bands section is named) the official brackets applied to the amount as taxable income.
 */
export async function tax(deps: Deps, country: CellInput, gross: CellInput, region?: CellInput, year?: CellInput, section?: CellInput): Promise<number> {
  const c = await resolveCountry(deps, country);
  if (isBlank(section) && c.endpoints["net-salary"]) {
    const r = await runCalc(deps, c, "net-salary", gross, region, year);
    return round2(incomeTaxFrom(c.code, r));
  }
  return bracketTax(deps, c, gross, region, year, section);
}

/** Bracket estimate from the tax tables: no allowances, credits, surcharges or contributions. */
export async function bracketTax(deps: Deps, c: CountryInfo, grossIn: CellInput, regionIn: CellInput, yearIn: CellInput, sectionIn: CellInput): Promise<number> {
  const income = checkGross(grossIn);
  if (!isBlank(regionIn)) {
    throw invalid(
      `The bracket estimate uses ${c.name}'s national brackets only; leave region empty. Regional rates are in the tax tables (CALCBLOC.RATE or the task pane).`,
      "unsupported_region",
    );
  }
  const year = resolveYear(yearIn) ?? "latest";
  const years = c.endpoints["tax-tables"].years;
  if (year !== "latest" && !years.includes(year)) throw invalid(`${c.name} tax tables are available for ${years.join(", ")}.`, "unsupported_year");
  const table = await deps.client.taxTable(c.code, year);
  let s;
  if (isBlank(sectionIn)) s = primaryIncomeTaxBands(table);
  else {
    const found = findSection(table, String(sectionIn));
    if (found.kind !== "bands") throw invalid(`"${found.id}" holds single values, not brackets. Use CALCBLOC.RATE for it.`, "not_bands");
    s = found;
  }
  return round2(annualTaxFromSection(s, income));
}

/** CALCBLOC.RATE: one rate, threshold or amount from the tax tables (rates as decimals). */
export async function rate(deps: Deps, country: CellInput, section: CellInput, label: CellInput, year?: CellInput, region?: CellInput): Promise<number | string> {
  const c = await resolveCountry(deps, country);
  if (isBlank(section)) throw invalid('Section is required: a section id from the tax tables, e.g. "income-tax-rates".', "missing_section");
  if (isBlank(label) && label !== 0) throw invalid("Label is required: the row's label, or its number in the section (1, 2, 3...).", "missing_label");
  const y = resolveYear(year) ?? "latest";
  const tt = c.endpoints["tax-tables"];
  if (y !== "latest" && !tt.years.includes(y)) throw invalid(`${c.name} tax tables are available for ${tt.years.join(", ")}.`, "unsupported_year");
  let regionCode: string | undefined;
  if (!isBlank(region)) {
    if (!tt.regions.length) throw invalid(`${c.name} tax tables have no regional variants; leave region empty.`, "unsupported_region");
    regionCode = resolveRegionCode(tt.regions, String(region), c.name);
  }
  const table = await deps.client.taxTable(c.code, y, regionCode);
  const s = findSection(table, String(section));
  const row = findRow(s, typeof label === "number" ? label : String(label));
  if (s.kind === "bands") return (row as { rate: number }).rate;
  const v = (row as { value: number | string | null }).value;
  if (v === null || v === undefined) throw unavailable(`"${(row as { label: string }).label}" has no value in the ${c.name} ${table.year} tables (not applicable).`, "no_value");
  return v;
}
