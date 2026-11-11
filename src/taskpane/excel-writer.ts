/* global Excel */
import { planTaxTableSheet } from "../lib/sheet";
import type { TaxTable } from "../lib/types";

/** Writes a tax table to a new worksheet and activates it. Returns the sheet name. Needs ExcelApi 1.7 (hyperlinks). */
export async function insertTaxTableSheet(table: TaxTable): Promise<string> {
  return Excel.run(async (ctx) => {
    const sheets = ctx.workbook.worksheets;
    sheets.load("items/name");
    await ctx.sync();
    const plan = planTaxTableSheet(
      table,
      sheets.items.map((s) => s.name),
    );
    const ws = sheets.add(plan.sheetName);
    const rows = plan.values.length;
    const cols = plan.values[0].length;
    const all = ws.getRangeByIndexes(0, 0, rows, cols);
    all.numberFormat = plan.numberFormats;
    all.values = plan.values;

    const title = ws.getRangeByIndexes(plan.titleRow, 0, 1, 1);
    title.format.font.bold = true;
    title.format.font.size = 14;
    for (const r of plan.creditRows) ws.getRangeByIndexes(r, 0, 1, 1).format.font.italic = true;

    const header = ws.getRangeByIndexes(plan.headerRow, 0, 1, cols);
    header.format.font.bold = true;
    header.format.fill.color = "#E6ECFC";
    header.format.borders.getItem("EdgeBottom").style = "Continuous";

    for (const link of plan.links) {
      ws.getRangeByIndexes(link.row, link.col, 1, 1).hyperlink = { address: link.url, textToDisplay: link.text, screenTip: link.url };
    }
    plan.columnWidths.forEach((w, i) => {
      // Column width is in points; about 6 points per character in the default font.
      ws.getRangeByIndexes(0, i, 1, 1).getEntireColumn().format.columnWidth = w * 6;
    });
    ws.freezePanes.freezeRows(plan.headerRow + 1);
    ws.activate();
    ws.getRangeByIndexes(0, 0, 1, 1).select();
    await ctx.sync();
    return plan.sheetName;
  });
}
