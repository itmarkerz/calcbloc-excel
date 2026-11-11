/** Shapes of the CalcBloc API responses this add-in reads (https://calcbloc.com/api/openapi.json). */

export interface Attribution {
  source: string;
  url: string;
  text?: string;
  credit?: string;
  licence?: string;
  required?: boolean;
}

export interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  values?: string[];
  min?: number;
  max?: number;
  default?: string | number | boolean;
  unit?: string;
  description?: string;
}

export interface CalcEndpointInfo {
  path: string;
  calculatorUrl: string;
  parameters: ApiParam[];
}

export interface CountryInfo {
  code: string;
  name: string;
  currency: string;
  years: string[];
  current_year: string;
  years_available?: string[];
  available_endpoints: string[];
  tables_only: boolean;
  endpoints: {
    "net-salary"?: CalcEndpointInfo;
    "employer-cost"?: CalcEndpointInfo;
    "tax-tables": {
      path: string;
      pageUrl: string;
      years: string[];
      current_year: string;
      regions: { code: string; name: string }[];
    };
  };
}

export interface CountriesResponse {
  countries: CountryInfo[];
  attribution?: Attribution;
}

export interface Source {
  title: string;
  url: string;
  retrievedAt?: string;
}

export interface BandRow {
  label?: string;
  from: number;
  to: number | null;
  rate: number;
}

export interface ValueRow {
  label: string;
  value: number | string | null;
  unit: "rate" | "money" | "number" | "text" | string;
  note?: string;
}

interface SectionBase {
  id: string;
  title: string;
  group: string;
  source: Source;
  verified?: boolean;
  basis?: string;
  note?: string;
}

export interface BandsSection extends SectionBase {
  kind: "bands";
  rows: BandRow[];
}

export interface ValuesSection extends SectionBase {
  kind: "values";
  rows: ValueRow[];
}

export type Section = BandsSection | ValuesSection;

/** One flat row per band or value, as in the API's `rows` array and CSV. */
export interface ExportRow {
  section_id: string;
  section: string;
  group: string;
  basis: string;
  note: string;
  tax_year: string;
  effective_from: string;
  effective_to: string | null;
  source_title: string;
  source_url: string;
  retrieved_at: string;
  status: string;
  label: string;
  from: number | null;
  to: number | null;
  rate: number | null;
  value: number | string | null;
  unit: string;
}

export interface TaxTable {
  country: string;
  countryName: string;
  year: string;
  yearLabel?: string;
  isCurrent?: boolean;
  region: { code: string; name: string; slug?: string } | null;
  currency: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  status?: string;
  current_year?: string;
  years_available?: string[];
  sections: Section[];
  sources?: Source[];
  rows?: ExportRow[];
  pageUrl: string;
  attribution?: Attribution;
}

export interface CalcResponse {
  endpoint: "net-salary" | "employer-cost";
  country: string;
  countryName: string;
  year: string;
  currency: string;
  inputs: Record<string, string | number | boolean>;
  summary: Record<string, number | null>;
  results: Record<string, number>;
  breakdown: { title: string; columns: string[]; rows: { label: string; values: number[] }[] } | null;
  notes: string[];
  calculatorUrl: string;
  warnings: string[];
  attribution?: Attribution;
}

export interface ApiErrorBody {
  error: { code: string; message: string; docs?: string };
}
