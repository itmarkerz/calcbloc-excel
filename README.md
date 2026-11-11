# CalcBloc for Microsoft Excel: tax tables and take-home pay functions

An Office add-in for Excel that adds four worksheet functions for take-home pay, income tax, employer cost and official tax rates, plus a task pane that inserts a full 2026 tax table with the official source of every figure. It uses the [CalcBloc API](https://calcbloc.com/developers?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss) and the same sourced data as [calcbloc.com](https://calcbloc.com/?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss).

CalcBloc is a product of [itmarkerz technologies](https://itmarkerz.co.in/?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss).

```
=CALCBLOC.NET("uk", 50000)                    annual take-home pay
=CALCBLOC.TAX("poland", 120000)               income tax (official brackets)
=CALCBLOC.RATE("ireland", "usc", 4)           one rate from the tax tables → 0.08
=CALCBLOC.EMPLOYER_COST("germany", 60000)     salary plus employer on-costs
```

> **Status:** ready for review, not published. It is not in Microsoft Marketplace (AppSource) yet; see [PUBLISHING_CHECKLIST.md](PUBLISHING_CHECKLIST.md). Works in Excel on the web, Excel for Windows (Microsoft 365, Excel 2021 or later) and Excel for Mac.

## Contents

- [Functions](#functions)
- [Countries](#countries)
- [Task pane](#task-pane)
- [Requests, limits and caching](#requests-limits-and-caching)
- [Install for review](#install-for-review)
- [How it is built](#how-it-is-built)
- [Privacy](#privacy)
- [Data and licence](#data-and-licence)
- [About](#about)

## Functions

All functions are in the `CALCBLOC` namespace. Type `=CALCBLOC.` in a cell to see them with their argument help. Results are annual amounts in the country's currency, rounded to the cent; rates are decimals (format the cell as a percentage to show `0.08` as `8%`).

Arguments in common:

- **country**: a CalcBloc country code (`uk`, `us`, `new-zealand`), the country's name (`"United Kingdom"`) or its two-letter ISO code (`gb`, `nz`, `de`). Leave it empty (`""`) to use the default country set in the task pane.
- **region**: where the country needs one, e.g. a US state (`"ca"`, `"ny"`), a Canadian province (`"on"`), `"scotland"`, an Australian state for employer cost (`"nsw"`). Codes or names both work. Empty uses the default region when the country is the default country.
- **year**: a tax year as CalcBloc lists it, `2026` or `"2026-27"`. Calculations (NET, TAX, EMPLOYER_COST) use the current tax year; earlier years are available to RATE and the task pane.

Errors appear as Excel errors with an explanation in the cell's error tooltip: `#VALUE!` for an argument that can't be used (unknown region, negative salary), `#N/A` when CalcBloc has no answer (no calculator for that country yet, daily limit reached, no connection).

### CALCBLOC.NET

`=CALCBLOC.NET(country, gross, [region], [year])`

Estimated annual take-home pay after income tax and employee social security contributions, from CalcBloc's calculator for the country (the same engine as the calculator pages on calcbloc.com, with their default assumptions: single, no dependants, standard pension settings).

| Example | Meaning |
| --- | --- |
| `=CALCBLOC.NET("uk", 50000)` | England, £50,000 |
| `=CALCBLOC.NET("uk", 50000, "scotland")` | Scotland, £50,000 |
| `=CALCBLOC.NET("us", A2, "ca")` | California, salary in A2 |
| `=CALCBLOC.NET("canada", 85000, "on")` | Ontario |
| `=CALCBLOC.NET("india", 1800000)` | India, annual CTC ₹18 lakh (new regime) |

`gross` is always annual. Singapore's API takes a monthly salary, so the add-in sends `gross / 12`. For India `gross` is the annual cost to company (CTC).

### CALCBLOC.TAX

`=CALCBLOC.TAX(country, gross, [region], [year], [section])`

Annual income tax.

- **Countries with a calculator**: the income tax from the same calculation as NET (both share one request when the inputs match). What counts as income tax follows each calculator: US federal plus state and local income tax; Canada federal plus provincial; Germany wage tax plus solidarity surcharge and church tax; Australia income tax plus Medicare levy; Spain the IRPF withheld; Ireland income tax without USC and PRSI (use RATE or a `section` for USC).
- **Countries with tax tables only** (no calculator yet): the official income-tax brackets applied to `gross` treated as taxable income. This is a bracket estimate: allowances, tax credits, surcharges and local taxes are not applied, and the section's basis (for example "taxable income above the personal allowance") is up to you. Region must be left empty: the estimate uses the national brackets only.
- **section**: name a bands section from the tax tables to apply it directly instead, in any country. The amount must be on that section's basis (shown in the inserted tax table).

| Example | Result |
| --- | --- |
| `=CALCBLOC.TAX("us", 60000, "ca")` | federal + California income tax |
| `=CALCBLOC.TAX("poland", 120000)` | 12% up to PLN 120,000 → 14,400 (before the PLN 3,600 tax-reducing amount) |
| `=CALCBLOC.TAX("ireland", 50000, , , "usc")` | USC on €50,000 → 1,032.82 (Revenue's worked example) |
| `=CALCBLOC.TAX("us", 100000, , , "federal-income-tax-mfj")` | 2026 federal brackets, married filing jointly, on $100,000 of taxable income |

### CALCBLOC.RATE

`=CALCBLOC.RATE(country, section, label, [year], [region])`

One rate, threshold or amount from the official tax tables. `section` is a section id or title, `label` is the row's label (or a unique part of it), or the row number within the section (1, 2, 3...) for unlabelled tax bands. Bands return their rate; other rows return their value (a number, or text where the table holds text). Insert the tax table from the task pane to see every section id and label.

| Example | Result |
| --- | --- |
| `=CALCBLOC.RATE("ireland", "usc", 4)` | 0.08 (USC top band) |
| `=CALCBLOC.RATE("uk", "personal-allowance", "Personal Allowance")` | 12570 |
| `=CALCBLOC.RATE("uk", "income-tax-england", "higher rate")` | 0.4 |
| `=CALCBLOC.RATE("uk", "income-tax-scotland", "Top rate", , "scotland")` | 0.48 |
| `=CALCBLOC.RATE("uk", "personal-allowance", "Personal Allowance", "2025-26")` | the 2025/26 figure |
| `=CALCBLOC.RATE("australia", "super-guarantee", "Super guarantee rate")` | 0.12 |

### CALCBLOC.EMPLOYER_COST

`=CALCBLOC.EMPLOYER_COST(country, gross, [region], [year])`

Estimated total annual cost of employing someone: salary plus employer social security, payroll taxes, pension and other on-costs, from CalcBloc's employer cost calculator with its default assumptions.

| Example | Meaning |
| --- | --- |
| `=CALCBLOC.EMPLOYER_COST("uk", 50000)` | UK employer, £50,000 salary |
| `=CALCBLOC.EMPLOYER_COST("us", 90000, "ny")` | New York (state unemployment tax) |
| `=CALCBLOC.EMPLOYER_COST("australia", 95000, "nsw")` | NSW payroll tax rules |

## Countries

The add-in reads the list of countries, regions, years and parameters from the API (`GET /api/v1/countries`) at run time, so new countries appear without an update. At the time of writing (November 2026):

- **NET, TAX and EMPLOYER_COST**: United States (by state), United Kingdom (England, Scotland, Wales), Canada (by province), Australia, New Zealand, Ireland, India, Germany, Spain, Netherlands, Singapore; France for NET and TAX.
- **Tax tables only** (RATE, TAX bracket estimate, Insert tax table): Austria, Czechia, Denmark, Finland, Italy, Luxembourg, Norway, Poland, Portugal, Sweden, Switzerland, United Arab Emirates.

The current list with every parameter is on [calcbloc.com/developers](https://calcbloc.com/developers?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss#parameters); tax tables for each country are linked from [calcbloc.com/data](https://calcbloc.com/data?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss).

## Task pane

Open it from **Home > CalcBloc > Tax tables**.

- **Insert tax table**: pick a country, tax year and (optionally) a region. The add-in adds a new worksheet with every income tax band, threshold, employee and employer rate: section, label, from/to, rate, value, basis, notes, effective dates, status, the official source title and a hyperlink to the source, and the date it was retrieved. The sheet starts and ends with the credit "Data by CalcBloc (calcbloc.com/data)" and links to the matching calcbloc.com page, for example [calcbloc.com/uk/tax-tables/2026-27](https://calcbloc.com/uk/tax-tables/2026-27?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss).
- **Settings**: an optional free API key, and a default country and region for formulas that leave them empty. When the free requests without a key run out, an **Add your free API key** card appears at the top of the pane with the keys link and these steps.
- **Requests and cache**: how many requests are left today (from the API's own counters) and a button to clear cached answers.

## Requests, limits and caching

Without an API key the CalcBloc API allows **50 requests a day and 5 a minute per internet address**. A free key from [calcbloc.com/developers/keys](https://calcbloc.com/developers/keys?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss) raises that to 5,000 a day and 60 a minute. The add-in is built to stay well inside the anonymous limit:

- every answer is kept in memory and on the device (`OfficeRuntime.storage`) for 7 days, so reopening or recalculating a workbook doesn't repeat requests;
- identical requests made at the same time (a column of formulas) share one network call, and NET and TAX on the same inputs share one calculation;
- RATE, the TAX bracket estimate and Insert tax table fetch a whole table once and answer every formula on it from that copy;
- answers such as "unsupported country" are cached for a day, so a column of bad inputs costs one request;
- requests are paced to the per-minute limit instead of failing (cells show `#BUSY!` while they wait);
- once the API reports that the daily limit is used up (`X-RateLimit-Remaining: 0` or a 429), no more calls are made until it resets. Without a key the cell's message starts with "Add your free API key" and gives the keys link and where to paste the key (Home > CalcBloc > Tax tables > Settings), and the task pane shows the same prompt; with a key it says the key's limit is used up.

The key is sent in the `X-API-Key` header over HTTPS. **Clear cached data** in the task pane forces fresh answers.

## Install for review

Requirements: Node.js 22.12 or later (24 recommended), and Excel on the web (any Microsoft account), Excel for Windows (Microsoft 365 or Excel 2021+) or Excel for Mac.

```bash
git clone https://github.com/itmarkerz/calcbloc-excel.git
cd calcbloc-excel
npm install
npm run certs        # installs a trusted localhost certificate (office-addin-dev-certs), once
npm run dev-server   # serves the add-in on https://localhost:3104
```

**Local harness, no Excel needed**: run `npm run dev-server`, then open [https://localhost:3104/harness.html?fixtures=1](https://localhost:3104/harness.html?fixtures=1). It runs the real function code outside Excel: formulas evaluate as they would in cells (errors shown with their tooltip text), and the "Insert tax table" output is previewed as a worksheet. The task pane itself opens at [https://localhost:3104/taskpane.html?fixtures=1](https://localhost:3104/taskpane.html?fixtures=1) (Office.js does not run inside a frame outside Office). `?fixtures=1` answers from recorded API responses and the dataset files in `test/fixtures`, with no requests to calcbloc.com; drop it to use the live API. The harness and fixtures exist only in development builds. For a quick look without installing the certificate, `CALCBLOC_SELF_SIGNED=1 npm run dev-server` uses a throwaway self-signed certificate (accept the browser warning); Excel itself needs `npm run certs`.

**Excel on the web** (sideload):

1. Keep `npm run dev-server` running and open a workbook in Excel on the web ([office.com](https://www.office.com) > Excel).
2. Go to **Home > Add-ins > More Add-ins** (in some versions **Insert > Add-ins > My Add-ins**), then **Upload My Add-in**.
3. Choose `manifest.xml` from this folder and select **Upload**. The **CalcBloc** group appears on the Home tab; type `=CALCBLOC.` in a cell.

If the task pane stays blank, open https://localhost:3104/taskpane.html once in the same browser to confirm the certificate is trusted.

**Excel for Windows or Mac**: `npm start` builds, starts the dev server and sideloads `manifest.xml` into desktop Excel (office-addin-debugging); `npm run stop` removes it. Manual alternative on Windows: share a folder containing `manifest.xml`, add it under **File > Options > Trust Center > Trust Center Settings > Trusted Add-in Catalogs**, restart Excel, then **Home > Add-ins > Advanced > Shared Folder**. On Mac, copy `manifest.xml` to `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef` and restart Excel.

Other commands:

```bash
npm test              # unit tests (vitest, mocked fetch, no network)
npm run typecheck     # TypeScript
npm run validate      # office-addin-manifest validate manifest.xml (Microsoft's validation service)
npm run build         # production build in dist/ for https://addins.calcbloc.com/excel/ (CALCBLOC_ADDIN_URL overrides)
npm run validate:prod # validates dist/manifest.xml
```

## How it is built

- **Manifest**: the add-in only (XML) manifest, `manifest.xml`. Microsoft's unified JSON manifest is generally available for Excel since July 2026, but it installs only on Microsoft 365 builds (Windows 2501 or later, Mac 16.103 or later) and the web, not on perpetual Excel 2021/2024, and Microsoft's custom-functions docs still describe the XML manifest as the generator default for Excel custom functions. Marketplace accepts XML manifests, so XML gives the widest reach today. It can be converted later with `npx office-addin-project convert`.
- **Shared runtime** (`SharedRuntime 1.1`, `<Runtime lifetime="long">`): the custom functions and the task pane run in one page, so they share the cache, request pacing, limit state and settings, and functions get full CORS support. This is what Microsoft recommends for custom functions with a task pane.
- **Custom functions** are written in TypeScript with JSDoc `@customfunction` tags; `custom-functions-metadata-plugin` generates `functions.json` and registers the functions at build time. Logic lives in `src/lib` and is tested without Excel.
- **Tooling**: webpack 5, ts-loader, office-addin-dev-certs (localhost HTTPS), office-addin-debugging (sideload), office-addin-manifest (validation), vitest.

```
manifest.xml               add-in manifest (dev URLs: https://localhost:3104)
src/functions/functions.ts CALCBLOC.* definitions (JSDoc → functions.json)
src/lib/client.ts          API client: cache, request sharing, pacing, daily-limit guard
src/lib/core.ts            NET, TAX, RATE, EMPLOYER_COST logic
src/lib/tables.ts          section/row lookup, bracket tax
src/lib/sheet.ts           layout of the inserted tax table
src/taskpane/              task pane (settings, Insert tax table)
src/harness/               local review harness and offline API stand-in (dev builds only)
test/                      unit tests and fixtures
appsource/listing.md       draft Marketplace listing
```

**Production hosting**: the add-in's web files are served from **https://addins.calcbloc.com/excel/** (decided 11 November 2026; hosted on the itmarkerz-first server). `npm run build` writes `dist/` with every manifest URL pointing there (the same as `CALCBLOC_ADDIN_URL=https://addins.calcbloc.com/excel/ npm run build`); upload the contents of `dist/` to that path and check it with `npm run validate:prod`. Set `CALCBLOC_ADDIN_URL` only to build for another host.

## Privacy

The add-in sends only the inputs of each formula or table request (country, region, year, salary amount, section) to the CalcBloc API at calcbloc.com, plus your API key if you set one. It has no analytics or tracking, reads no other cells, and stores its settings and cached answers only on your device. Details: [PRIVACY.md](PRIVACY.md). Terms: [TERMS.md](TERMS.md).

Figures are estimates for planning and comparison, not tax, legal or financial advice. Check important figures against the official source linked next to each one.

## Data and licence

Tax data comes from [CalcBloc](https://calcbloc.com/data?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss): every figure is taken from the official government source named next to it, with the date it was last checked. Data licence: CC BY 4.0, credit "Data by CalcBloc (calcbloc.com/data)". Wherever you show results from this add-in, keep that credit. The tables and recorded responses in `test/fixtures` are CalcBloc data under the same licence.

Code licence: MIT, copyright itmarkerz technologies, see [LICENSE](LICENSE).

## Links

- Website: [calcbloc.com](https://calcbloc.com/?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss)
- Tax tables and downloads: [calcbloc.com/data](https://calcbloc.com/data?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss)
- API documentation and free keys: [calcbloc.com/developers](https://calcbloc.com/developers?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss)
- Support: [calcbloc.com/contact](https://calcbloc.com/contact?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss)

## About

CalcBloc is built and published by [itmarkerz technologies](https://itmarkerz.co.in/?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss), a web and mobile app development company in Kerala, India.

- itmarkerz technologies: [itmarkerz.co.in](https://itmarkerz.co.in/?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss)
- CalcBloc: [calcbloc.com](https://calcbloc.com/?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss), [calcbloc.com/data](https://calcbloc.com/data?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss), [calcbloc.com/developers](https://calcbloc.com/developers?utm_source=calcbloc-excel&utm_medium=readme&utm_campaign=itmarkerz-oss)
