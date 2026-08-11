# CDBG-DR Fund Dashboard — Static GitHub Pages validation report

Validation date: 10 August 2026

## Revision checks completed

- The browser title, loading screen, main heading, footer, documentation, and local launch scripts use the name **CDBG-DR Fund Dashboard**.
- The top of the dashboard contains four visible sections: **Dashboard Overview**, **Data and Functions**, **Financial and Geographic Analysis**, and **Audiences and Applications**.
- The requested HUD CDBG-DR description, 2001–2023 period, 18 disaster/appropriation categories, 40 states and U.S. territories, functions, audiences, and applications are included in the header.
- The revised introduction uses a two-column layout on larger screens and a one-column layout on smaller screens.
- Aggregate CSV and downloadable figure filenames use the `cdbg_dr` prefix.

## Package checks completed

- Required root files and folders are present.
- `node --check assets/app.js` passed.
- `python -m py_compile scripts/build_static_data.py scripts/validate_static_package.py` passed.
- The package contains 128,382 finance rows in seven JavaScript chunks.
- Twenty-four year-partitioned narrative chunks are present.
- State, county, and urban-area JavaScript geography assets are present and valid.
- All deployable files remain below GitHub's 25 MiB browser-upload threshold per file.
- Relative paths are retained for both account-level and project-level GitHub Pages URLs.

## Browser smoke test completed

The bundled static assets were opened in Chromium using a 1920 × 1080 desktop viewport and a 390 × 844 mobile viewport.

Observed results:

- Page title: `CDBG-DR Fund Dashboard`.
- Four revised introduction cards rendered with the correct subheadings.
- Two independent comparison panels rendered.
- Seven dataset-summary badges rendered.
- Initial record KPI: 128,382.
- Selecting the first Year option changed the record KPI to 2,045.
- Selecting a Grantee enabled the Project filter and populated downstream choices.
- Aggregate CSV generation succeeded; the test file was 365,591 bytes and used the revised `cdbg_dr_panel_1_aggregate_...csv` filename.
- No JavaScript page errors or console errors were recorded.
- The mobile view changed the introduction to one column and produced no horizontal page overflow.
- The refreshed interface preview is stored at `docs/dashboard_interface_preview.png`.
- Machine-readable QA results are stored at `docs/browser_smoke_test_v4.json`.

## WebGL qualification

The headless validation environment did not expose a WebGL context, so the application displayed its intentional explanatory map fallback rather than a blank map. In a current hardware-accelerated browser, the interactive Plotly map uses the packaged state, county, city/place, and urban-area data.

## GitHub Pages qualification

The dashboard remains a fully static HTML/CSS/JavaScript application. It requires no Python server, database, API endpoint, Hugging Face Space, or Render service after publication. Upload the extracted package contents to the repository root and configure **Settings → Pages → Deploy from a branch → main → /(root)**.
