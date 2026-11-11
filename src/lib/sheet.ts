import { exportRows } from "./tables";
import type { TaxTable } from "./types";

export const CREDIT_TEXT = "Data by CalcBloc (calcbloc.com/data), licensed CC BY 4.0";
export const DATA_URL = "https://calcbloc.com/data";

export type Cell = string | number | boolean;

export interface SheetLink {
  row: number;
  col: number;
  url: string;
  text: string;
}

/** Everything the task pane writes for "Insert tax table", as plain arrays so it can be tested without Excel. */
export interface SheetPlan {
  sheetName: string;
  values: Cell[][];
  numberFormats: string[][];
  links: SheetLink[];
  /** Row index of the column headings. */
  headerRow: number;
  /** Row indexes of the title and credit lines (bold / italic). */
  titleRow: number;
  creditRows: number[];
  columnWidths: number[];
}

export const HEADERS = [
  "Section",
  "Label",
  "From",
  "To",
  "Rate",
  "Value",
  "Unit",
  "Basis",
  "Note",
  "Effective from",
  "Effective to",
  "Status",
  "Source",
  "Source URL",
  "Retrieved",
] as const;

const WIDTHS = [34, 46, 12, 12, 10, 14, 8, 40, 40, 13, 13, 12, 50, 50, 12];
const RATE_FORMAT = "0.00##%";
const MONEY_FORMAT = "#,##0.##";

/** A worksheet name Excel accepts (31 characters, no : \ / ? * [ ]) that is not already taken. */
export function uniqueSheetName(base: string, existing: readonly string[]): string {
  const clean = base.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "") || "Tax table";
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const fit = (s: string, suffix = "") => s.slice(0, 31 - suffix.length).trim() + suffix;
  if (!taken.has(fit(clean).toLowerCase())) return fit(clean);
  for (let i = 2; i < 1000; i++) {
    const name = fit(clean, ` (${i})`);
    if (!taken.has(name.toLowerCase())) return name;
  }
  return fit(clean, ` ${Date.now()}`);
}

/** Lays out a tax table as a worksheet: title, credit with links, one row per band or value with its official source. */
export function planTaxTableSheet(table: TaxTable, existingSheetNames: readonly string[] = []): SheetPlan {
  const place = table.region ? `${table.countryName}, ${table.region.name}` : table.countryName;
  const yearLabel = table.yearLabel ?? table.year;
  const width = HEADERS.length;
  const blankRow = (): Cell[] => Array(width).fill("");
  const generalRow = (): string[] => Array(width).fill("General");

  const values: Cell[][] = [];
  const formats: string[][] = [];
  const links: SheetLink[] = [];
  const push = (cells: Cell[], fmts?: string[]) => {
    const row = blankRow();
    cells.forEach((c, i) => (row[i] = c));
    values.push(row);
    formats.push(fmts ?? generalRow());
    return values.length - 1;
  };

  const titleRow = push([`${place}: tax tables ${yearLabel} (${table.currency})`]);
  const creditRow = push([CREDIT_TEXT]);
  links.push({ row: creditRow, col: 0, url: DATA_URL, text: CREDIT_TEXT });
  const pageText = `Full table, notes and sources: ${table.pageUrl.replace(/^https:\/\//, "")}`;
  const pageRow = push([pageText]);
  links.push({ row: pageRow, col: 0, url: table.pageUrl, text: pageText });
  const status = table.status ? `Status: ${table.status}` : "";
  const period = table.effectiveFrom ? `In force ${table.effectiveFrom} to ${table.effectiveTo ?? "until changed"}` : "";
  push([[period, status, "Rates are decimals shown as percentages; money in " + table.currency + "."].filter(Boolean).join(". ")]);
  push([]);
  const headerRow = push([...HEADERS]);

  for (const r of exportRows(table)) {
    const row = push(
      [
        r.section,
        r.label,
        r.from ?? "",
        r.to === null || r.to === undefined ? (r.from !== null && r.from !== undefined ? "and above" : "") : r.to,
        r.rate ?? "",
        r.value ?? "",
        r.unit,
        r.basis,
        r.note,
        r.effective_from,
        r.effective_to ?? "",
        r.status,
        r.source_title,
        r.source_url,
        r.retrieved_at,
      ],
      [
        "General",
        "General",
        MONEY_FORMAT,
        MONEY_FORMAT,
        RATE_FORMAT,
        r.unit === "money" ? MONEY_FORMAT : "General",
        "General",
        "General",
        "General",
        "@",
        "@",
        "General",
        "General",
        "General",
        "@",
      ],
    );
    if (r.source_url) links.push({ row, col: 13, url: r.source_url, text: r.source_url });
  }

  push([]);
  const endCredit = push([CREDIT_TEXT]);
  links.push({ row: endCredit, col: 0, url: table.pageUrl, text: CREDIT_TEXT });

  const sheetName = uniqueSheetName(`${table.countryName}${table.region ? ` ${table.region.code.toUpperCase()}` : ""} ${table.year}`, existingSheetNames);
  return { sheetName, values, numberFormats: formats, links, headerRow, titleRow, creditRows: [creditRow, endCredit], columnWidths: WIDTHS };
}
