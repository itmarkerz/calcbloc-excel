# Publishing checklist: CalcBloc for Excel in Microsoft Marketplace (AppSource)

Nothing has been submitted. Items marked **Owner** need a decision or an account action by the owner; the rest are ready or mechanical.

## 1. Decisions (Owner)

- [x] **Publisher**: itmarkerz technologies (decided 11 November 2026; CalcBloc is the product name). The Partner Center account and publisher display name must be in that name; the verified domain appears on the listing.
- [x] **Production host**: **https://addins.calcbloc.com/excel/** (decided 11 November 2026, served from the itmarkerz-first server). It is the default production URL of the build (`webpack.config.js`). The host must serve the files over HTTPS with correct MIME types (`.json` as `application/json`, `.js` as JavaScript) and must not block framing by Office: no `X-Frame-Options: DENY`/`SAMEORIGIN` and no restrictive `frame-ancestors` on this path. Needs a stable URL and high availability, because every user loads the add-in from it.
- [ ] **Privacy policy and terms URLs**: the GitHub copies of [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md) for now (decided 11 November 2026). Both must be public before submission.
- [ ] **Listing text and categories**: review [appsource/listing.md](appsource/listing.md).
- [x] **API key policy** (decided 11 November 2026): works without a key (50 requests a day per internet address); when that runs out (429 or `X-RateLimit-Remaining: 0` on a keyless call) the cell message and an in-pane card ask for a free key, with the link and where to paste it; with a key every request carries it (60 a minute, 5,000 a day). This relies on anonymous access staying on for the calculation endpoints. Shared corporate networks can exhaust the keyless allowance quickly; the prompt covers that case.

## 2. Partner Center account (Owner)

- [ ] Enrol in the Microsoft AI Cloud Partner Program and open a Partner Center account with the **Microsoft 365 and Copilot** program (the program used for Office add-ins), as a company account.
- [ ] Complete business verification (legal entity, address, domain email). Verification can take several days.
- [ ] Set the publisher display name and contact details.
- [ ] Optional later: Publisher Attestation in the Microsoft 365 App Compliance program (shows a badge; asks about data handling, matching PRIVACY.md).

## 3. Build and host

- [ ] `npm ci && npm test && npm run typecheck` (Node 22.12+ or 24).
- [ ] `npm run build` (equivalent to `CALCBLOC_ADDIN_URL=https://addins.calcbloc.com/excel/ npm run build`: the build rewrites every `https://localhost:3104/` in the manifest to that URL; the harness and test fixtures are not included in production builds).
- [ ] Upload the contents of `dist/` to `https://addins.calcbloc.com/excel/`; check `taskpane.html`, `functions.json` and `assets/icon-64.png` there load over HTTPS.
- [ ] Bump `<Version>` in `manifest.xml` for every resubmission (and keep `package.json` in step).
- [ ] `npm run validate:prod` (runs `office-addin-manifest validate dist/manifest.xml` against Microsoft's validation service; the dev manifest already passes: "The manifest is valid").

## 4. Test before submitting

Microsoft tests on every platform the manifest allows (validation output lists Excel on the web, Excel on Windows with Microsoft 365, Excel on Mac, Excel 2019 or later on Mac).

- [ ] Sideload the production manifest in **Excel on the web** (Home > Add-ins > More Add-ins > Upload My Add-in).
- [ ] Sideload in **Excel for Windows** (Microsoft 365) and **Excel for Mac**.
- [ ] Each function returns a value for a calculator country and the documented #N/A explanation for a tables-only one; `#BUSY!` resolves; results survive closing and reopening the workbook.
- [ ] Insert tax table creates a sheet with working hyperlinks (ExcelApi 1.7) in all three clients; a second insert of the same table gets a "(2)" sheet name.
- [ ] Settings: save a real key, check `X-API-Key` is used (requests-left counter shows 5,000), remove it again.
- [ ] Task pane is usable at 320 px wide, with keyboard only, and in dark mode / high contrast.
- [ ] No console errors other than Office.js notices.
- [ ] Capture the five store screenshots listed in the listing draft (1280 × 720).

## 5. Marketplace validation policies to re-read before submitting

Microsoft's [commercial marketplace certification policies](https://learn.microsoft.com/legal/marketplace/certification-policies), sections 100 (general policies) and 1120 (Office add-ins), and [Make your solutions available in Microsoft Marketplace](https://learn.microsoft.com/office/dev/add-ins/publish/publish-office-add-ins-to-appsource). Points that matter for this add-in:

- [ ] **Value and accuracy**: the listing must describe what the add-in does; claims such as country coverage must match the live API on the day of submission.
- [ ] **Works as described on all declared platforms** (1120.3): Office on the web and Mac included, in current Edge, Chrome, Firefox and Safari, and usable on a touch-only device; no broken features, no "beta" or "test" labels, no placeholder text.
- [ ] **Custom functions** (1120.5): every function has `helpUrl` in its metadata (done, from `@helpurl`); the functions HTML, JavaScript and JSON are hosted on the same domain (true for any single host); the add-in also has add-in commands (the Home > CalcBloc > Tax tables button); certification test notes cover at least one custom function (in the listing draft).
- [ ] **External services** (1100.5): the add-in depends on calcbloc.com; sign-up must be clear and simple. The task pane links to the free key page and the key is optional; the listing and privacy policy say what is sent. The service must stay available during and after review.
- [ ] **Testability** (100.14): no sign-in or key is needed to try it (50 requests a day per internet address without a key); mention a reviewer key for heavy testing. Provide the test notes and, if useful, a reviewer API key in the Partner Center "Notes for certification" field.
- [ ] **Privacy policy** (100.5, 100.6) linked from the listing and specific to the add-in; support URL reachable.
- [ ] **Graphics** (100.3, 1120.1): screenshots 1280 × 720 PNG; logo PNG between 216 and 350 px square (`assets/icon-300.png`); high-resolution manifest icon present (64 px); branding is CalcBloc's own, no Microsoft marks.
- [ ] **Accessibility and UI**: readable task pane, labels on inputs, works in narrow panes.
- [ ] **Data attribution**: inserted tables carry "Data by CalcBloc (calcbloc.com/data)" (CC BY 4.0 credit).

## 6. Submit (Owner)

- [ ] Partner Center > Marketplace offers > New offer > **Office add-in**.
- [ ] Upload `dist/manifest.xml` (production URLs).
- [ ] Fill in the listing from `appsource/listing.md`, upload the logo and screenshots.
- [ ] Availability: markets (worldwide or a list), free.
- [ ] Notes for certification: copy the "Test notes" section of the listing draft.
- [ ] Submit and track the certification report; fix and resubmit with a new `<Version>` if it fails.

## 7. After approval

- [ ] Add the Marketplace link to the README, calcbloc.com/developers and calcbloc.com/data.
- [ ] Watch API logs for `country` / endpoint patterns from the add-in and for 429s from shared addresses.
- [ ] Any change to the manifest (URLs, permissions, requirement sets, ribbon) needs a resubmission; changes to the hosted web files go live immediately for all users.
- [ ] Optional: a unified JSON manifest version (`npx office-addin-project convert`) once custom functions with the unified manifest are documented as supported for production, keeping the XML version for perpetual Office.
