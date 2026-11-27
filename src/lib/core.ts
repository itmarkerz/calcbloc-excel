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
  lv: "latvia",
  latvija: "latvia",
  hr: "croatia",
  hrvatska: "croatia",
  ee: "estonia",
  eesti: "estonia",
  bg: "bulgaria",
  lt: "lithuania",
  lietuva: "lithuania",
  mt: "malta",
  cy: "cyprus",
  is: "iceland",
  ua: "ukraine",
  ukraina: "ukraine",
  "україна": "ukraine",
  li: "liechtenstein",
  rs: "serbia",
  srbija: "serbia",
  "србија": "serbia",
  tr: "turkey",
  turkiye: "turkey",
  "türkiye": "turkey",
  be: "belgium",
  // Generated from the API's country codes (API 1.9, 133 countries).
  jp: "japan",
  jpn: "japan",
  nippon: "japan",
  nihon: "japan",
  "日本": "japan",
  kr: "south-korea",
  kor: "south-korea",
  korea: "south-korea",
  "republic-of-korea": "south-korea",
  "대한민국": "south-korea",
  "한국": "south-korea",
  mx: "mexico",
  mex: "mexico",
  "méxico": "mexico",
  "estados-unidos-mexicanos": "mexico",
  br: "brazil",
  bra: "brazil",
  brasil: "brazil",
  "república-federativa-do-brasil": "brazil",
  cl: "chile",
  chl: "chile",
  "república-de-chile": "chile",
  co: "colombia",
  col: "colombia",
  "república-de-colombia": "colombia",
  ar: "argentina",
  arg: "argentina",
  "república-argentina": "argentina",
  cr: "costa-rica",
  cri: "costa-rica",
  "república-de-costa-rica": "costa-rica",
  sa: "saudi-arabia",
  sau: "saudi-arabia",
  ksa: "saudi-arabia",
  saudi: "saudi-arabia",
  "kingdom-of-saudi-arabia": "saudi-arabia",
  "المملكة-العربية-السعودية": "saudi-arabia",
  "السعودية": "saudi-arabia",
  qa: "qatar",
  qat: "qatar",
  "state-of-qatar": "qatar",
  "دولة-قطر": "qatar",
  "قطر": "qatar",
  kw: "kuwait",
  kwt: "kuwait",
  "state-of-kuwait": "kuwait",
  "دولة-الكويت": "kuwait",
  "الكويت": "kuwait",
  bh: "bahrain",
  bhr: "bahrain",
  "kingdom-of-bahrain": "bahrain",
  "مملكة-البحرين": "bahrain",
  "البحرين": "bahrain",
  om: "oman",
  omn: "oman",
  "sultanate-of-oman": "oman",
  "سلطنة-عمان": "oman",
  "عمان": "oman",
  il: "israel",
  isr: "israel",
  "state-of-israel": "israel",
  "ישראל": "israel",
  "מדינת-ישראל": "israel",
  za: "south-africa",
  zaf: "south-africa",
  rsa: "south-africa",
  "republic-of-south-africa": "south-africa",
  "suid-afrika": "south-africa",
  id: "indonesia",
  idn: "indonesia",
  "republik-indonesia": "indonesia",
  cn: "china",
  chn: "china",
  prc: "china",
  "people's-republic-of-china": "china",
  "中国": "china",
  "中华人民共和国": "china",
  my: "malaysia",
  mys: "malaysia",
  "persekutuan-malaysia": "malaysia",
  th: "thailand",
  tha: "thailand",
  "kingdom-of-thailand": "thailand",
  "ประเทศไทย": "thailand",
  "ไทย": "thailand",
  vn: "vietnam",
  vnm: "vietnam",
  "viet-nam": "vietnam",
  "việt-nam": "vietnam",
  "socialist-republic-of-vietnam": "vietnam",
  ph: "philippines",
  phl: "philippines",
  pilipinas: "philippines",
  "republic-of-the-philippines": "philippines",
  pk: "pakistan",
  pak: "pakistan",
  "islamic-republic-of-pakistan": "pakistan",
  "پاکستان": "pakistan",
  bd: "bangladesh",
  bgd: "bangladesh",
  "people's-republic-of-bangladesh": "bangladesh",
  "বাংলাদেশ": "bangladesh",
  lk: "sri-lanka",
  lka: "sri-lanka",
  "democratic-socialist-republic-of-sri-lanka": "sri-lanka",
  ceylon: "sri-lanka",
  "ශ්‍රී-ලංකාව": "sri-lanka",
  "இலங்கை": "sri-lanka",
  np: "nepal",
  npl: "nepal",
  "federal-democratic-republic-of-nepal": "nepal",
  "नेपाल": "nepal",
  jo: "jordan",
  jor: "jordan",
  "hashemite-kingdom-of-jordan": "jordan",
  "المملكة-الأردنية-الهاشمية": "jordan",
  "الأردن": "jordan",
  tn: "tunisia",
  tun: "tunisia",
  "republic-of-tunisia": "tunisia",
  tunisie: "tunisia",
  "الجمهورية-التونسية": "tunisia",
  "تونس": "tunisia",
  dz: "algeria",
  dza: "algeria",
  "people's-democratic-republic-of-algeria": "algeria",
  "algérie": "algeria",
  "الجزائر": "algeria",
  "الجمهورية-الجزائرية-الديمقراطية-الشعبية": "algeria",
  py: "paraguay",
  pry: "paraguay",
  "república-del-paraguay": "paraguay",
  "tetã-paraguái": "paraguay",
  bo: "bolivia",
  bol: "bolivia",
  "estado-plurinacional-de-bolivia": "bolivia",
  "plurinational-state-of-bolivia": "bolivia",
  sv: "el-salvador",
  slv: "el-salvador",
  "república-de-el-salvador": "el-salvador",
  "republic-of-el-salvador": "el-salvador",
  hn: "honduras",
  hnd: "honduras",
  "república-de-honduras": "honduras",
  "republic-of-honduras": "honduras",
  jm: "jamaica",
  jam: "jamaica",
  tt: "trinidad-and-tobago",
  tto: "trinidad-and-tobago",
  trinidad: "trinidad-and-tobago",
  tobago: "trinidad-and-tobago",
  "republic-of-trinidad-and-tobago": "trinidad-and-tobago",
  eg: "egypt",
  egy: "egypt",
  "arab-republic-of-egypt": "egypt",
  misr: "egypt",
  "مصر": "egypt",
  "جمهورية-مصر-العربية": "egypt",
  ng: "nigeria",
  nga: "nigeria",
  "federal-republic-of-nigeria": "nigeria",
  ke: "kenya",
  ken: "kenya",
  "republic-of-kenya": "kenya",
  "jamhuri-ya-kenya": "kenya",
  ma: "morocco",
  mar: "morocco",
  "kingdom-of-morocco": "morocco",
  maroc: "morocco",
  "royaume-du-maroc": "morocco",
  "المغرب": "morocco",
  "المملكة-المغربية": "morocco",
  gh: "ghana",
  gha: "ghana",
  "republic-of-ghana": "ghana",
  pe: "peru",
  per: "peru",
  "perú": "peru",
  "republica-del-peru": "peru",
  "república-del-perú": "peru",
  uy: "uruguay",
  ury: "uruguay",
  "república-oriental-del-uruguay": "uruguay",
  "republica-oriental-del-uruguay": "uruguay",
  ec: "ecuador",
  ecu: "ecuador",
  "república-del-ecuador": "ecuador",
  "republica-del-ecuador": "ecuador",
  pa: "panama",
  pan: "panama",
  "panamá": "panama",
  "república-de-panamá": "panama",
  "republica-de-panama": "panama",
  do: "dominican-republic",
  dom: "dominican-republic",
  "república-dominicana": "dominican-republic",
  "republica-dominicana": "dominican-republic",
  rd: "dominican-republic",
  gt: "guatemala",
  gtm: "guatemala",
  "república-de-guatemala": "guatemala",
  "republica-de-guatemala": "guatemala",
  kz: "kazakhstan",
  kaz: "kazakhstan",
  qazaqstan: "kazakhstan",
  "казахстан": "kazakhstan",
  "қазақстан": "kazakhstan",
  ge: "georgia",
  geo: "georgia",
  sakartvelo: "georgia",
  "საქართველო": "georgia",
  am: "armenia",
  arm: "armenia",
  hayastan: "armenia",
  "հայաստան": "armenia",
  az: "azerbaijan",
  aze: "azerbaijan",
  azerbaycan: "azerbaijan",
  "azərbaycan": "azerbaijan",
  uz: "uzbekistan",
  uzb: "uzbekistan",
  ozbekiston: "uzbekistan",
  "oʻzbekiston": "uzbekistan",
  "ўзбекистон": "uzbekistan",
  ru: "russia",
  rus: "russia",
  "russian-federation": "russia",
  "россия": "russia",
  "российская-федерация": "russia",
  tz: "tanzania",
  tza: "tanzania",
  "united-republic-of-tanzania": "tanzania",
  "jamhuri-ya-muungano-wa-tanzania": "tanzania",
  ug: "uganda",
  uga: "uganda",
  "republic-of-uganda": "uganda",
  "jamhuri-ya-uganda": "uganda",
  rw: "rwanda",
  rwa: "rwanda",
  "republic-of-rwanda": "rwanda",
  "repubulika-y'u-rwanda": "rwanda",
  "république-du-rwanda": "rwanda",
  et: "ethiopia",
  eth: "ethiopia",
  "federal-democratic-republic-of-ethiopia": "ethiopia",
  "ኢትዮጵያ": "ethiopia",
  mu: "mauritius",
  mus: "mauritius",
  "republic-of-mauritius": "mauritius",
  maurice: "mauritius",
  "république-de-maurice": "mauritius",
  bw: "botswana",
  bwa: "botswana",
  "republic-of-botswana": "botswana",
  "lefatshe-la-botswana": "botswana",
  me: "montenegro",
  mne: "montenegro",
  "crna-gora": "montenegro",
  "црна-гора": "montenegro",
  mk: "north-macedonia",
  mkd: "north-macedonia",
  macedonia: "north-macedonia",
  "republic-of-north-macedonia": "north-macedonia",
  "северна-македонија": "north-macedonia",
  "maqedonia-e-veriut": "north-macedonia",
  al: "albania",
  alb: "albania",
  shqiperia: "albania",
  "shqipëria": "albania",
  "republika-e-shqiperise": "albania",
  ba: "bosnia-and-herzegovina",
  bih: "bosnia-and-herzegovina",
  bosnia: "bosnia-and-herzegovina",
  "bosna-i-hercegovina": "bosnia-and-herzegovina",
  "босна-и-херцеговина": "bosnia-and-herzegovina",
  md: "moldova",
  mda: "moldova",
  "republic-of-moldova": "moldova",
  "republica-moldova": "moldova",
  xk: "kosovo",
  xkx: "kosovo",
  kosova: "kosovo",
  "kosovë": "kosovo",
  "republic-of-kosovo": "kosovo",
  "republika-e-kosovës": "kosovo",
  ad: "andorra",
  and: "andorra",
  "principat-d'andorra": "andorra",
  "principality-of-andorra": "andorra",
  mc: "monaco",
  mco: "monaco",
  "principality-of-monaco": "monaco",
  "principauté-de-monaco": "monaco",
  sm: "san-marino",
  smr: "san-marino",
  "repubblica-di-san-marino": "san-marino",
  "republic-of-san-marino": "san-marino",
  hk: "hong-kong",
  hkg: "hong-kong",
  "hong-kong-sar": "hong-kong",
  "hong-kong-sar-china": "hong-kong",
  hksar: "hong-kong",
  "香港": "hong-kong",
  tw: "taiwan",
  twn: "taiwan",
  "republic-of-china": "taiwan",
  roc: "taiwan",
  "臺灣": "taiwan",
  "台灣": "taiwan",
  "中華民國": "taiwan",
  mo: "macao",
  mac: "macao",
  macau: "macao",
  "macao-sar": "macao",
  "macao-sar-china": "macao",
  "澳門": "macao",
  "澳门": "macao",
  kh: "cambodia",
  khm: "cambodia",
  "kingdom-of-cambodia": "cambodia",
  "កម្ពុជា": "cambodia",
  bn: "brunei",
  brn: "brunei",
  "brunei-darussalam": "brunei",
  "negara-brunei-darussalam": "brunei",
  ci: "cote-divoire",
  "côte-d’ivoire": "cote-divoire",
  civ: "cote-divoire",
  "ivory-coast": "cote-divoire",
  "cote-d'ivoire": "cote-divoire",
  "côte-d'ivoire": "cote-divoire",
  "republic-of-côte-d'ivoire": "cote-divoire",
  "république-de-côte-d'ivoire": "cote-divoire",
  sn: "senegal",
  sen: "senegal",
  "sénégal": "senegal",
  "republic-of-senegal": "senegal",
  "république-du-sénégal": "senegal",
  cm: "cameroon",
  cmr: "cameroon",
  cameroun: "cameroon",
  "republic-of-cameroon": "cameroon",
  "république-du-cameroun": "cameroon",
  zm: "zambia",
  zmb: "zambia",
  "republic-of-zambia": "zambia",
  zw: "zimbabwe",
  zwe: "zimbabwe",
  "republic-of-zimbabwe": "zimbabwe",
  na: "namibia",
  nam: "namibia",
  "republic-of-namibia": "namibia",
  bs: "bahamas",
  bhs: "bahamas",
  "the-bahamas": "bahamas",
  "commonwealth-of-the-bahamas": "bahamas",
  bb: "barbados",
  brb: "barbados",
  bajan: "barbados",
  bz: "belize",
  blz: "belize",
  "british-honduras": "belize",
  gy: "guyana",
  guy: "guyana",
  "co-operative-republic-of-guyana": "guyana",
  sr: "suriname",
  sur: "suriname",
  "republiek-suriname": "suriname",
  "republic-of-suriname": "suriname",
  ht: "haiti",
  hti: "haiti",
  "haïti": "haiti",
  ayiti: "haiti",
  "republic-of-haiti": "haiti",
  "république-d'haïti": "haiti",
  kg: "kyrgyzstan",
  kgz: "kyrgyzstan",
  "kyrgyz-republic": "kyrgyzstan",
  kirghizia: "kyrgyzstan",
  "кыргызстан": "kyrgyzstan",
  "кыргыз-республикасы": "kyrgyzstan",
  "киргизия": "kyrgyzstan",
  tj: "tajikistan",
  tjk: "tajikistan",
  "republic-of-tajikistan": "tajikistan",
  "тоҷикистон": "tajikistan",
  "таджикистан": "tajikistan",
  "ҷумҳурии-тоҷикистон": "tajikistan",
  mv: "maldives",
  mdv: "maldives",
  "republic-of-maldives": "maldives",
  "ދިވެހިރާއްޖެ": "maldives",
  "dhivehi-raajje": "maldives",
  bt: "bhutan",
  btn: "bhutan",
  "kingdom-of-bhutan": "bhutan",
  "druk-yul": "bhutan",
  "འབྲུག་ཡུལ།": "bhutan",
  mm: "myanmar",
  mmr: "myanmar",
  burma: "myanmar",
  "republic-of-the-union-of-myanmar": "myanmar",
  "မြန်မာ": "myanmar",
  mg: "madagascar",
  mdg: "madagascar",
  "republic-of-madagascar": "madagascar",
  "repoblikan'i-madagasikara": "madagascar",
  madagasikara: "madagascar",
  "république-de-madagascar": "madagascar",
  cd: "dr-congo",
  cod: "dr-congo",
  "democratic-republic-of-the-congo": "dr-congo",
  drc: "dr-congo",
  "congo-kinshasa": "dr-congo",
  "république-démocratique-du-congo": "dr-congo",
  rdc: "dr-congo",
  cg: "congo",
  "republic-of-the-congo": "congo",
  cog: "congo",
  "congo-brazzaville": "congo",
  "république-du-congo": "congo",
  mw: "malawi",
  mwi: "malawi",
  "republic-of-malawi": "malawi",
  "malaŵi": "malawi",
  "dziko-la-malaŵi": "malawi",
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

// ---------------------------------------------------------------------------------------------------------------
// API 1.8 and 1.9: bonus withholding and import duty.

function checkAmount(v: CellInput, what: string, positive = false): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v.replace(/,/g, "")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || (positive && n === 0)) throw invalid(`${what} must be a number${positive ? " above 0" : " of 0 or more"}.`, "invalid_amount");
  return n;
}

const SUPPLEMENTAL_RESULTS = ["totalWithheld", "totalLiability", "difference", "netPayment"] as const;

/** CALCBLOC.BONUS_WITHHOLDING: tax withheld on a bonus or other supplemental payment (GET /supplemental-withholding). */
export async function bonusWithholding(deps: Deps, country: CellInput, salary: CellInput, amount: CellInput, type?: CellInput, region?: CellInput, result?: CellInput): Promise<number> {
  const c = await resolveCountry(deps, country);
  const params: Record<string, string | number | boolean> = { country: c.code, salary: checkAmount(salary, "Salary"), amount: checkAmount(amount, "Amount") };
  if (!isBlank(type)) params.type = String(type).trim().toLowerCase();
  let r = isBlank(region) ? await defaultRegionFor(deps, c) : String(region);
  if (r) params.region = resolveRegionCode(c.endpoints["tax-tables"]?.regions ?? [], r, c.name);
  const want = isBlank(result) ? "totalWithheld" : String(result).trim();
  const key = SUPPLEMENTAL_RESULTS.find((k) => k.toLowerCase() === want.toLowerCase());
  if (!key) throw invalid(`No result "${want}". Available: ${SUPPLEMENTAL_RESULTS.join(", ")}.`, "unknown_result");
  const d = await deps.client.endpoint<{ summary: Record<string, number> }>("supplemental-withholding", params);
  const v = d.summary?.[key];
  if (typeof v !== "number") throw unavailable(`No ${key} in the ${c.name} result.`, "no_result");
  return round2(v);
}

const DUTY_RESULTS = ["duties_and_taxes", "customs_duty", "extra_duties", "excise", "import_vat", "landed_cost"] as const;

/**
 * CALCBLOC.IMPORT_DUTY: duties and taxes on one import (GET /import-duty). An incomplete total (excise code or
 * exporter-specific duty missing) is an error rather than a number that would understate the cost.
 */
export async function importDuty(deps: Deps, destination: CellInput, origin: CellInput, code: CellInput, customsValue: CellInput, result?: CellInput, proofOfOrigin?: CellInput): Promise<number> {
  const dest = isBlank(destination) ? "" : String(destination).trim().toLowerCase();
  const orig = isBlank(origin) ? "" : String(origin).trim().toLowerCase();
  const hs = isBlank(code) ? "" : String(code).replace(/[\s.]/g, "");
  if (!dest) throw invalid('Destination is required, e.g. "gb", "de" or "us".', "missing_destination");
  if (!orig) throw invalid('Origin is required, e.g. "cn" or "in".', "missing_origin");
  if (!/^\d{4,10}$/.test(hs)) throw invalid("Code must be a commodity code of 4 to 10 digits.", "invalid_code");
  const params: Record<string, string | number | boolean> = { destination: dest, origin: orig, code: hs, customs_value: checkAmount(customsValue, "Customs value", true) };
  if (proofOfOrigin === true || String(proofOfOrigin ?? "").trim().toLowerCase() === "true") params.proof_of_origin = true;
  const want = isBlank(result) ? "duties_and_taxes" : String(result).trim().toLowerCase();
  const key = DUTY_RESULTS.find((k) => k === want);
  if (!key) throw invalid(`No result "${want}". Available: ${DUTY_RESULTS.join(", ")}.`, "unknown_result");
  const d = await deps.client.endpoint<{ totals: Record<string, unknown> & { complete: boolean; incomplete_reasons: string[] } }>("import-duty", params);
  if (!d.totals.complete && key !== "customs_duty") throw unavailable(`The total is incomplete: ${d.totals.incomplete_reasons.join("; ")}.`, "incomplete");
  return round2(d.totals[key] as number);
}
