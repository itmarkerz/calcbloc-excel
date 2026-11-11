# Privacy policy: CalcBloc for Microsoft Excel

*Draft for review. Last updated: 11 November 2026.*

This policy covers the CalcBloc add-in for Microsoft Excel (the "add-in"), published by [itmarkerz technologies](https://itmarkerz.co.in) ("we"). CalcBloc is a product of itmarkerz technologies. The CalcBloc website has its own policy at [calcbloc.com/privacy](https://calcbloc.com/privacy), and the CalcBloc API is covered by the [API terms](https://calcbloc.com/developers/terms).

## What the add-in sends

The add-in calls the CalcBloc API at `https://calcbloc.com/api/v1` only when a CALCBLOC formula or the task pane needs data that is not already cached on your device. Each request contains only:

- the arguments of that formula or table request: country, region, tax year, salary or income amount, and the tax-table section;
- your CalcBloc API key, if you entered one, in the `X-API-Key` header.

Requests go over HTTPS. Like any web request, they also carry your IP address and standard browser headers. The add-in does not send your name, email address, Microsoft account details, workbook name, file contents, or any cell other than the formula's own arguments.

## What CalcBloc does with requests

The API counts requests against the daily and per-minute limits using your API key, or without a key a one-way hash of your IP address (raw addresses are not stored for this). Its request log records the endpoint, the country, the response status and time, and the key's public id or "anonymous"; it does not record the query string (so no salary amounts), your IP address or the key itself. As with any website, the web server and the network in front of it (Cloudflare) may keep standard access logs, which include the requested address and your IP address, for security and troubleshooting. See also the [API terms](https://calcbloc.com/developers/terms) and the [website privacy policy](https://calcbloc.com/privacy). Nothing from API requests is sold or shared for advertising.

## What is stored on your device

The add-in stores the following in the add-in's private storage on your device (`OfficeRuntime.storage`, separate from the workbook):

- your settings: API key (optional), default country and default region;
- cached API answers (tax tables and calculation results) for up to 7 days, so recalculating does not repeat requests;
- the request-limit counters the API last reported.

This storage is not encrypted by the add-in and is not shared with other add-ins. "Clear cached data" in the task pane removes the cached answers; removing the API key in Settings deletes it; uninstalling the add-in removes its storage. Results that formulas return, and tax tables you insert, are saved in your workbook like any other cell values.

## What the add-in does not do

- No analytics, tracking, advertising or cookies of its own.
- No access to other cells, sheets, files or your Microsoft account. The add-in writes to the workbook only when you choose "Insert tax table", which adds a new sheet.
- No third-party services other than Microsoft's Office.js library, which Microsoft requires add-ins to load from its CDN (`appsforoffice.microsoft.com`).

## Children

The add-in is a business and personal-finance tool and is not directed at children.

## Changes and contact

We will update this page when the add-in's data handling changes and change the date above. Questions: [calcbloc.com/contact](https://calcbloc.com/contact).
