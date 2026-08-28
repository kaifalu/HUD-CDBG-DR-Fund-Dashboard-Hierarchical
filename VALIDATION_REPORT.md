# Validation Report — Version 6

## Overall result

**PASS.** The GitHub Pages package, self-contained HTML, privacy-screened narrative assets, Quick Report, and Explore & Compare modes passed structural, data-integrity, privacy, JavaScript, and browser smoke tests.

## Static package checks

- 128,382 finance rows loaded from 7 compact row chunks.
- Every finance row has the expected 27-value narrative-enabled schema.
- 95,530 finance rows have exact-key linked narrative records.
- 174,200 unique sanitized narrative excerpts loaded from 29 annual chunks covering 24 reporting years.
- State, county, and urban-area geographic assets contain all expected IDs.
- Financial values are finite and all geography codes are in range.
- `assets/app.js` and `data/bootstrap.js` passed Node.js syntax checks.
- No raw narrative CSV or restricted QA file is present in the public site.
- No public-site file exceeds 90 MB.

## Privacy checks

The final address sweep detected 2,228 address-like mentions across 1,186 narratives. It retained/highlighted 1,140 mentions in approved infrastructure/public-facility or clearly multifamily/rental contexts and redacted 1,088 potential single-family or ambiguous mentions.

The internal validator cross-referenced all 2,228 restricted QA decisions by narrative ID. No address marked `redact_public` remained in the corresponding public narrative excerpt. The public excerpts contain balanced retained-address markers and visible redaction placeholders. The restricted QA file is excluded from the public package.

This automated check does not replace authorized human or legal privacy review.

## Interface checks

- Explore & Compare appears first and opens by default.
- Two comparison panels render successfully.
- Both panel narrative-only checkboxes work and change the analytical population.
- Linked narrative tables load 40 recent sanitized records on demand.
- Quick Report supports single-area and comparison reports.
- Quick Report narrative-only filtering works.
- Comparison reports render narrative-linked indicators and six recent sanitized excerpts across the two scenarios.
- Overview-card paragraph text contains no bold tags; headings remain emphasized.
- The requested CDBG-DR/CECREH footer and email link are present.
- Explore aggregate CSV and Quick Report CSV downloads completed successfully.
- Browser testing recorded no JavaScript console errors or uncaught page errors.

## Self-contained HTML checks

The standalone HTML embeds 42 compressed assets, including all 29 narrative chunks, 7 financial row chunks, Plotly, application code, metadata, and geographic assets. Every embedded asset matched its source file by SHA-256. The file has no external script or stylesheet dependency.

## Browser-test environment note

The headless validation browser had WebGL disabled, so the report map displayed the designed fallback notice. Funding plots, indicators, narratives, filters, CSV downloads, and report generation remained operational. In a current hardware-accelerated browser, the interactive map is available.
