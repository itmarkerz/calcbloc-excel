import { invalid, unavailable } from "./errors";
import type { BandRow, BandsSection, ExportRow, Section, TaxTable } from "./types";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** The section whose id or title matches (case-insensitive). */
export function findSection(table: TaxTable, idOrTitle: string): Section {
  const q = norm(idOrTitle);
  const s = table.sections.find((x) => x.id.toLowerCase() === q) ?? table.sections.find((x) => norm(x.title) === q);
  if (s) return s;
  const ids = table.sections.map((x) => x.id);
  throw invalid(`No section "${idOrTitle}" in the ${table.countryName} ${table.year} tables. Sections: ${ids.join(", ")}.`, "unknown_section");
}

/**
 * The row whose label matches: exact (case-insensitive), then the only label that contains the text.
 * A whole number n picks the n-th row (useful for unlabelled tax bands).
 */
export function findRow(section: Section, label: string | number): Section["rows"][number] {
  const rows = section.rows as Section["rows"];
  const asNumber = typeof label === "number" ? label : /^\d+$/.test(String(label).trim()) ? Number(String(label).trim()) : NaN;
  const labelled = rows.filter((r) => typeof r.label === "string" && r.label.length > 0);
  if (typeof label === "string" && label.trim() !== "" && Number.isNaN(asNumber)) {
    const q = norm(label);
    const exact = labelled.filter((r) => norm(r.label as string) === q);
    if (exact.length === 1) return exact[0];
    const partial = labelled.filter((r) => norm(r.label as string).includes(q));
    if (partial.length === 1) return partial[0];
    const options = (partial.length > 1 ? partial : labelled).slice(0, 6).map((r) => `"${r.label}"`);
    throw invalid(
      partial.length > 1
        ? `"${label}" matches ${partial.length} rows in "${section.title}"; be more specific: ${options.join(", ")}.`
        : `No row "${label}" in "${section.title}". Rows include: ${options.join(", ") || "(unlabelled bands: use 1, 2, 3...)"}.`,
      "unknown_label",
    );
  }
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= rows.length) return rows[asNumber - 1];
  throw invalid(`Row ${String(label)} is out of range: "${section.title}" has ${rows.length} rows.`, "unknown_label");
}

const isMonthlyBasis = (basis?: string) => !!basis && /(per month|monthly|mensuel)/i.test(basis);

/**
 * The country's main income-tax brackets: the first income-tax bands section stated per year
 * (falls back to a monthly one, which callers scale).
 */
export function primaryIncomeTaxBands(table: TaxTable): BandsSection {
  const bands = table.sections.filter((s): s is BandsSection => s.kind === "bands" && s.group === "income-tax");
  const annual = bands.find((s) => !isMonthlyBasis(s.basis));
  const pick = annual ?? bands[0];
  if (!pick) {
    throw unavailable(
      `The ${table.countryName} ${table.year} tables have no income-tax brackets to estimate from (income tax there is not a bracket scale on its own). See ${table.pageUrl}.`,
      "no_brackets",
    );
  }
  return pick;
}

/** Tax on `income` from progressive (marginal) bands: each rate applies only to the part of income inside its band. Unrounded. */
export function taxFromBands(rows: readonly BandRow[], income: number): number {
  const base = Math.max(0, income);
  return rows.reduce((sum, r) => {
    const top = r.to === null ? base : Math.min(base, r.to);
    return sum + Math.max(0, top - r.from) * r.rate;
  }, 0);
}

/** Bracket tax on an annual amount, scaling a monthly scale to the year (amount / 12, tax × 12). */
export function annualTaxFromSection(section: BandsSection, annualIncome: number): number {
  if (isMonthlyBasis(section.basis)) return taxFromBands(section.rows, annualIncome / 12) * 12;
  return taxFromBands(section.rows, annualIncome);
}

/** Flat rows (the API's `rows`); rebuilt from the sections when a response lacks them. */
export function exportRows(table: TaxTable): ExportRow[] {
  if (table.rows && table.rows.length) return table.rows;
  const out: ExportRow[] = [];
  for (const s of table.sections) {
    const base = {
      section_id: s.id,
      section: s.title,
      group: s.group,
      basis: s.basis ?? "",
      note: s.note ?? "",
      tax_year: table.year,
      effective_from: table.effectiveFrom ?? "",
      effective_to: table.effectiveTo ?? null,
      source_title: s.source?.title ?? "",
      source_url: s.source?.url ?? "",
      retrieved_at: s.source?.retrievedAt ?? "",
      status: s.verified === false ? "under_review" : "verified",
    };
    if (s.kind === "bands") {
      for (const r of s.rows) out.push({ ...base, label: r.label ?? "", from: r.from, to: r.to, rate: r.rate, value: null, unit: "rate" });
    } else {
      for (const r of s.rows) {
        const isRate = r.unit === "rate" && typeof r.value === "number";
        out.push({ ...base, label: r.label, from: null, to: null, rate: isRate ? (r.value as number) : null, value: isRate ? null : r.value, unit: r.unit, note: r.note ?? base.note });
      }
    }
  }
  return out;
}
