import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateCustomFunctionsMetadata } = require("custom-functions-metadata");

interface Meta {
  functions: { id: string; name: string; description: string; helpUrl?: string; parameters: { name: string; optional?: boolean; type: string }[]; result: { type: string } }[];
}

describe("custom function metadata (functions.json)", async () => {
  const res = await generateCustomFunctionsMetadata([join(__dirname, "..", "src", "functions", "functions.ts")], true);
  const meta = JSON.parse(res.metadataJson) as Meta;

  it("generates without errors", () => {
    expect(res.errors).toEqual([]);
  });

  it("defines NET, TAX, RATE and EMPLOYER_COST with the documented signatures", () => {
    const sig = Object.fromEntries(meta.functions.map((f) => [f.id, f.parameters.map((p) => (p.optional ? `[${p.name}]` : p.name)).join(", ")]));
    expect(sig).toEqual({
      NET: "country, gross, [region], [year]",
      TAX: "country, gross, [region], [year], [section]",
      RATE: "country, section, label, [year], [region]",
      EMPLOYER_COST: "country, gross, [region], [year]",
    });
  });

  it("every function has a description and a help link to its README section", () => {
    const readme = readFileSync(join(__dirname, "..", "README.md"), "utf8");
    for (const f of meta.functions) {
      expect(f.description.length).toBeGreaterThan(30);
      expect(f.helpUrl).toMatch(/^https:\/\/github\.com\/itmarkerz\/calcbloc-excel#calcbloc/);
      expect(readme).toContain(`### CALCBLOC.${f.id}`);
    }
  });
});
