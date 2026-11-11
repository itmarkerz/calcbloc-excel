/* Local review harness (development build only): evaluates CALCBLOC formulas with the add-in's own code. */
import * as core from "../lib/core";
import { CalcBlocError } from "../lib/errors";
import { planTaxTableSheet } from "../lib/sheet";
import { fixtureMode, getDeps } from "../runtime";

type Arg = string | number | boolean | undefined;

const FIXTURE_FORMULAS = [
  '=CALCBLOC.NET("us", 60000, "ca")',
  '=CALCBLOC.TAX("us", 60000, "ca")',
  '=CALCBLOC.TAX("poland", 120000)',
  '=CALCBLOC.TAX("denmark", 700000)',
  '=CALCBLOC.TAX("us", 100000, , , "federal-income-tax-mfj")',
  '=CALCBLOC.RATE("ireland", "usc", 4)',
  '=CALCBLOC.RATE("uk", "income-tax-england", "Higher rate")',
  '=CALCBLOC.RATE("uk", "income-tax-scotland", "Top", , "scotland")',
  '=CALCBLOC.RATE("australia", "super-guarantee", "Super guarantee rate")',
  '=CALCBLOC.NET("poland", 120000)',
  '=CALCBLOC.NET("us", 60000)',
  '=CALCBLOC.RATE("uk", "ni-employee", "Category")',
];
const LIVE_FORMULAS = ['=CALCBLOC.NET("uk", 50000)', '=CALCBLOC.TAX("uk", 50000)', '=CALCBLOC.RATE("ireland", "usc", 4)', '=CALCBLOC.TAX("poland", 120000)'];

const FNS: Record<string, (...a: Arg[]) => Promise<number | string>> = {
  NET: (c, g, r, y) => core.net(getDeps(), c, g, r, y),
  TAX: (c, g, r, y, s) => core.tax(getDeps(), c, g, r, y, s),
  RATE: (c, s, l, y, r) => core.rate(getDeps(), c, s, l, y, r),
  EMPLOYER_COST: (c, g, r, y) => core.employerCost(getDeps(), c, g, r, y),
};

/** Parses =CALCBLOC.NAME("text", 123, , TRUE). Empty arguments are omitted ones, as in Excel. */
export function parseFormula(f: string): { name: string; args: Arg[] } {
  const m = f.trim().match(/^=?\s*CALCBLOC\.([A-Z_]+)\s*\(([\s\S]*)\)\s*$/i);
  if (!m) throw new CalcBlocError("invalid", "parse", "Not a CALCBLOC formula");
  const args: Arg[] = [];
  let i = 0;
  const s = m[2];
  let cur = "";
  let inStr = false;
  let quoted = false;
  const flush = () => {
    const t = cur.trim();
    if (quoted) args.push(cur);
    else if (t === "") args.push(undefined);
    else if (/^(true|false)$/i.test(t)) args.push(t.toLowerCase() === "true");
    else if (!Number.isNaN(Number(t))) args.push(Number(t));
    else args.push(t);
    cur = "";
    quoted = false;
  };
  for (; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '"' && s[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inStr = false;
      else cur += ch;
    } else if (ch === '"') {
      inStr = true;
      quoted = true;
      cur = "";
    } else if (ch === ",") flush();
    else cur += ch;
  }
  if (s.trim() !== "" || args.length) flush();
  return { name: m[1].toUpperCase(), args };
}

function excelError(e: unknown): { code: string; message: string } {
  const message = e instanceof Error ? e.message.slice(0, 255) : String(e);
  return { code: e instanceof CalcBlocError && e.kind === "invalid" ? "#VALUE!" : "#N/A", message };
}

function fmt(v: number | string): string {
  if (typeof v === "string") return v;
  if (Math.abs(v) < 1 && v !== 0) return `${v} (${(v * 100).toFixed(2).replace(/\.?0+$/, "")}%)`;
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

let rowCount = 0;
async function addRow(formula: string): Promise<void> {
  const tbody = document.querySelector("#grid tbody") as HTMLTableSectionElement;
  const tr = document.createElement("tr");
  rowCount++;
  tr.innerHTML = `<td class="rowhead">${rowCount}</td><td class="formula"></td><td class="num">#BUSY!</td>`;
  (tr.children[1] as HTMLElement).textContent = formula;
  tbody.append(tr);
  const out = tr.children[2] as HTMLElement;
  try {
    const { name, args } = parseFormula(formula);
    const fn = FNS[name];
    if (!fn) throw new CalcBlocError("invalid", "name", `#NAME? CALCBLOC.${name} does not exist`);
    const v = await fn(...args);
    out.textContent = fmt(v);
  } catch (e) {
    const { code, message } = excelError(e);
    out.className = "err";
    out.textContent = code;
    const span = document.createElement("span");
    span.className = "errmsg";
    span.textContent = message;
    out.append(span);
  }
  const s = getDeps().client.stats;
  document.getElementById("stats")!.textContent = `Network requests: ${s.network} · answered from memory: ${s.memoryHits} · shared with an identical request in flight: ${s.shared} · from device cache: ${s.storeHits}`;
}

async function buildSheet(country: string): Promise<void> {
  const host = document.getElementById("sheet")!;
  host.textContent = "Loading…";
  try {
    const table = await getDeps().client.taxTable(country, "latest");
    const plan = planTaxTableSheet(table, []);
    const links = new Map(plan.links.map((l) => [`${l.row}:${l.col}`, l]));
    const shown = plan.values.length > 40 ? [...plan.values.slice(0, 30).map((r, i) => [i, r] as const), ...plan.values.slice(-3).map((r, i) => [plan.values.length - 3 + i, r] as const)] : plan.values.map((r, i) => [i, r] as const);
    const cols = plan.values[0].length;
    const tbl = document.createElement("table");
    tbl.className = "xl sheet";
    const head = document.createElement("tr");
    head.innerHTML = "<th></th>" + Array.from({ length: cols }, (_, i) => `<th>${String.fromCharCode(65 + i)}</th>`).join("");
    tbl.append(head);
    let prev = -1;
    for (const [ri, row] of shown) {
      if (prev >= 0 && ri !== prev + 1) {
        const gap = document.createElement("tr");
        gap.innerHTML = `<td class="rowhead">…</td><td colspan="${cols}" class="muted">${ri - prev - 1} more rows</td>`;
        tbl.append(gap);
      }
      prev = ri;
      const tr = document.createElement("tr");
      if (ri === plan.headerRow) tr.className = "hdr";
      if (ri === plan.titleRow) tr.className = "title";
      if (plan.creditRows.includes(ri)) tr.className = "credit";
      const rh = document.createElement("td");
      rh.className = "rowhead";
      rh.textContent = String(ri + 1);
      tr.append(rh);
      row.forEach((cell, ci) => {
        const td = document.createElement("td");
        const link = links.get(`${ri}:${ci}`);
        const f = plan.numberFormats[ri][ci];
        const text = typeof cell === "number" && f.includes("%") ? `${(cell * 100).toFixed(2).replace(/\.?0+$/, "")}%` : typeof cell === "number" ? cell.toLocaleString("en-US") : String(cell);
        if (typeof cell === "number") td.className = "num";
        if (link) {
          const a = document.createElement("a");
          a.href = link.url;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = link.text;
          td.append(a);
        } else td.textContent = text;
        tr.append(td);
      });
      tbl.append(tr);
    }
    host.replaceChildren(tbl);
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = `Sheet name "${plan.sheetName}", ${plan.values.length} rows × ${cols} columns, ${plan.links.length} hyperlinks.`;
    host.append(note);
  } catch (e) {
    host.textContent = excelError(e).message;
  }
}

async function main(): Promise<void> {
  const fixtures = fixtureMode();
  document.getElementById("mode")!.textContent = fixtures ? "offline: recorded API responses" : "live: calcbloc.com API";
  (document.getElementById("pane") as HTMLAnchorElement).href = `taskpane.html${fixtures ? "?fixtures=1" : ""}`;
  document.getElementById("add")!.addEventListener("click", () => void addRow((document.getElementById("formula") as HTMLInputElement).value));
  const select = document.getElementById("sheet-country") as HTMLSelectElement;
  document.getElementById("sheet-go")!.addEventListener("click", () => void buildSheet(select.value));
  for (const f of fixtures ? FIXTURE_FORMULAS : LIVE_FORMULAS) await addRow(f);
  try {
    const { countries } = await getDeps().client.countries();
    const available = fixtures ? ["uk", "ireland", "poland", "denmark", "us", "australia", "germany", "new-zealand"] : countries.map((c) => c.code);
    select.replaceChildren(
      ...countries
        .filter((c) => available.includes(c.code))
        .map((c) => {
          const o = document.createElement("option");
          o.value = c.code;
          o.textContent = c.name;
          return o;
        }),
    );
    select.value = "ireland";
    await buildSheet("ireland");
  } catch (e) {
    document.getElementById("sheet")!.textContent = excelError(e).message;
  }
}

void main();
