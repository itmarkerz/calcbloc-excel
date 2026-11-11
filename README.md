# CalcBloc for Microsoft Excel: tax tables and take-home pay functions

A Microsoft Office add-in for Excel with custom functions for take-home pay, income tax and social security, plus a task pane to insert official 2026 tax tables. Built on CalcBloc's sourced data and public API.

> **Status:** in development. This repository will hold the source code; nothing has been released yet.

## Planned functions

- `=CALCBLOC.NET(country, gross, [region], [year])`: estimated take-home pay
- `=CALCBLOC.TAX(country, gross, [region], [year])`: income tax
- `=CALCBLOC.RATE(country, "section", "label")`: a single rate or threshold from the tax tables
- A task pane to insert a full tax table with its official sources

Works in Excel for Windows, Mac and the web (Office Add-ins platform).

## Data and licence

Tax data comes from [CalcBloc](https://calcbloc.com/data): every figure is taken from the official government source named next to it, with the date it was last checked. Data licence: CC BY 4.0, credit "Data by CalcBloc (calcbloc.com/data)". Code licence: MIT.

## Links

- Website: [calcbloc.com](https://calcbloc.com)
- Tax tables and downloads: [calcbloc.com/data](https://calcbloc.com/data)
- API documentation: [calcbloc.com/developers](https://calcbloc.com/developers)
