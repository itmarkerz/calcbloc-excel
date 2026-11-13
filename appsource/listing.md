# Microsoft Marketplace (AppSource) listing draft: CalcBloc for Excel

Draft text for the Partner Center "Office add-in" offer. Character limits are Partner Center's at the time of writing; check them in the form when submitting. Nothing here has been submitted.

## Offer basics

| Field | Value |
| --- | --- |
| Offer type | Office add-in |
| Add-in name (manifest DisplayName, max 125) | CalcBloc Tax Tables and Take-Home Pay |
| Short name if needed (max 30) | CalcBloc |
| Publisher | itmarkerz technologies ([itmarkerz.co.in](https://itmarkerz.co.in/?utm_source=calcbloc-excel&utm_medium=listing&utm_campaign=itmarkerz-oss)); the Partner Center account must be in this name |
| Products | Excel |
| Platforms (from the manifest requirements) | Excel on the web, Excel on Windows (Microsoft 365, Excel 2021 or later), Excel on Mac |
| Pricing | Free |
| Categories | Finance; Productivity (secondary: Data + analytics) |
| Industries | Professional services; Financial services (optional) |
| Languages | English (United States) |
| Search keywords (max 3) | tax tables; take-home pay; payroll tax |

## Summary (max 100 characters)

Excel functions for take-home pay, income tax, employer cost and official 2026 tax tables.

## Description (max 4,000 characters)

CalcBloc brings sourced 2026 tax figures into Excel as worksheet functions and ready-made tax tables, so salary budgets, offer letters, payroll models and relocation comparisons use the same numbers as the official sources.

**Four functions**

- `=CALCBLOC.NET(country, gross, [region])`: estimated annual take-home pay after income tax and employee social security.
- `=CALCBLOC.TAX(country, gross, [region])`: annual income tax. For countries without a full calculator it applies the official income-tax brackets.
- `=CALCBLOC.RATE(country, section, label)`: any single rate, threshold or allowance from the official tax tables, for example the UK Personal Allowance or Ireland's USC bands.
- `=CALCBLOC.EMPLOYER_COST(country, gross, [region])`: the total annual cost of employing someone, with employer contributions and payroll taxes.

**Insert official tax tables**

The task pane adds a worksheet with every income tax band, threshold and employee and employer rate for a country and tax year, each with its official source, a link to it and the date it was checked, plus a link to the matching page on calcbloc.com.

**Coverage**

Take-home pay, income tax and employer cost for the United States (all states), United Kingdom (England, Scotland, Wales), Canada (all provinces), Australia, New Zealand, Ireland, India, Germany, Spain, the Netherlands and Singapore, plus take-home pay in France. Tax tables for 41 countries, including Austria, Denmark, Finland, Italy, Norway, Poland, Portugal, Sweden and Switzerland. New countries appear automatically as CalcBloc adds them.

**Light on requests**

Works without signing up: up to 50 requests a day per internet address. Answers are cached on your device for a week and shared between formulas, so a typical workbook uses only a few. If you need more, the add-in asks you to add a free API key from calcbloc.com (5,000 requests a day), pasted in the task pane's Settings.

**Private by design**

Only the formula's own inputs (country, region, year, amount) are sent to calcbloc.com. No sign-in, no tracking, no access to the rest of your workbook.

Figures are estimates for planning and comparison, not tax advice. Data by CalcBloc (calcbloc.com/data), licensed CC BY 4.0.

## Links

| Field | URL | Notes |
| --- | --- | --- |
| Support | https://calcbloc.com/contact?utm_source=calcbloc-excel&utm_medium=listing&utm_campaign=itmarkerz-oss | live |
| Privacy policy | https://github.com/itmarkerz/calcbloc-excel/blob/main/PRIVACY.md, or a new page on calcbloc.com (not created yet) | Owner decision; must be public before submission |
| Terms of use / EULA | https://github.com/itmarkerz/calcbloc-excel/blob/main/TERMS.md, or a new page on calcbloc.com (not created yet) | Owner decision; Partner Center also offers a standard contract |
| Learn more / documentation | https://github.com/itmarkerz/calcbloc-excel#readme | public once the repo is pushed |
| Website | https://calcbloc.com/?utm_source=calcbloc-excel&utm_medium=listing&utm_campaign=itmarkerz-oss | live |
| API documentation | https://calcbloc.com/developers?utm_source=calcbloc-excel&utm_medium=listing&utm_campaign=itmarkerz-oss | live |
| Data source | https://calcbloc.com/data?utm_source=calcbloc-excel&utm_medium=listing&utm_campaign=itmarkerz-oss | live |

## Images

| Asset | Spec | File |
| --- | --- | --- |
| Store logo | 300 × 300 PNG | `assets/icon-300.png` (generated from the calcbloc.com icon) |
| Manifest icon | 32 × 32 and 64 × 64 PNG | `assets/icon-32.png`, `assets/icon-64.png` |
| Ribbon icons | 16, 32, 80 PNG | `assets/icon-16.png`, `icon-32.png`, `icon-80.png` |

## Screenshots to capture (1280 × 720 PNG, up to 5)

Capture in Excel on the web once the add-in is hosted on its production URL, with a clean workbook and no personal data:

1. **Take-home pay grid**: a salary column (40,000 to 120,000) with `CALCBLOC.NET` and `CALCBLOC.TAX` for "uk", "us" with "ca", and "canada" with "on", the formula bar showing one formula.
2. **Inserted tax table**: the "United Kingdom 2026-27" sheet with the title, the "Data by CalcBloc" credit, bands with percentages and the Source URL column visible.
3. **Task pane**: Insert tax table and Settings, next to a worksheet.
4. **RATE lookups**: a small table of rates (UK Personal Allowance, Ireland USC bands, Australian super guarantee) with formulas visible.
5. **Employer cost comparison**: `CALCBLOC.EMPLOYER_COST` for the same salary in several countries, with a chart.

Review captures from the local harness (not for the store): see the paths in the build report.

## Test notes for Microsoft's validation team

- No sign-in, account or API key is needed: the add-in works without a key (50 requests a day per IP address). If the testing network shares one address and uses that up, the cell message and the task pane show an "Add your free API key" prompt. For heavy testing use a free key (we can provide a reviewer key in these notes), created at https://calcbloc.com/developers/keys?utm_source=calcbloc-excel&utm_medium=listing&utm_campaign=itmarkerz-oss and pasted into Home > CalcBloc > Tax tables > Settings.
- Try: `=CALCBLOC.NET("uk", 50000)`, `=CALCBLOC.TAX("poland", 120000)`, `=CALCBLOC.RATE("ireland", "usc", 4)`, `=CALCBLOC.EMPLOYER_COST("us", 90000, "ny")`, then Home > CalcBloc > Tax tables > Insert tax table.
- Expected errors are explained in the cell tooltip, e.g. `=CALCBLOC.NET("poland", 50000)` returns #N/A because Poland has tax tables only.
