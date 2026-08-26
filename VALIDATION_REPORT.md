# Validation Report — Version 5

## Result

**PASS.** The revised GitHub Pages package contains the narrative-free financial/geographic dashboard, the Quick Report decision tool, the retained Explore & Compare mode, and a synchronized self-contained HTML edition.

## Full-data static validation

The package validator completed successfully with no errors or warnings:

- 128,382 quarter-level financial rows were parsed from seven JavaScript chunks.
- Every compact row contains exactly 25 values under schema version 2.
- No nonfinite financial values were found.
- No out-of-range state, county, city/place, or urban-area codes were found.
- State, county, and urban-area assets contain all geographic IDs expected by the dashboard dictionaries.
- `assets/app.js` and `data/bootstrap.js` passed Node.js syntax checks.
- No narrative directory, runtime narrative fields, narrative manifest, narrative identifiers, or narrative metadata are present.
- No individual deployment file exceeds 90 MB.

Machine-readable result: `docs/static_validation_v5.json`.

## Browser logic test using the complete financial dataset

A headless Chromium test loaded all 128,382 rows while using a lightweight Plotly test double to isolate interface and calculation logic. It confirmed:

- Quick Report is the default visible mode.
- Eight dataset-summary badges render.
- State selection contains the national/all option plus the 40 mapped jurisdictions.
- Single-area and comparison reports are generated.
- The comparison test successfully evaluated Alabama versus Alaska.
- Explore & Compare creates two panels, 14 hierarchical filter controls, 10 financial-measure checkboxes, and 12 KPI cards.
- No narrative text or narrative controls appear in either mode.
- No JavaScript console or page errors were recorded.
- The 390-pixel mobile viewport had no horizontal page overflow.

Machine-readable result: `docs/browser_logic_smoke_test_v5.json`.

## Real Plotly rendering test

A second Chromium test used the bundled Plotly library and a 1,000-row representative financial subset. It successfully rendered the one-page Quick Report with multiple SVG layers, the expected report title, and no JavaScript errors. The test environment did not expose hardware-accelerated WebGL, so the dashboard's documented map fallback was used while the KPI, trend, ranking, takeaways, and report layout rendered normally.

Machine-readable result: `docs/browser_real_plotly_smoke_test_v5.json`.

Plotly schema validation also recognized the `scattermap` and `choroplethmap` trace types and the shared `map` subplot configuration. The empty choropleth validation produced only the expected warning that a trace without locations is invisible. See `docs/plotly_map_schema_validation_v5.json`.

## Self-contained HTML validation

The standalone HTML contains 13 gzip-compressed embedded assets:

- Plotly.js;
- dashboard bootstrap metadata;
- dashboard application code;
- seven financial row chunks; and
- three polygon geography assets.

Every embedded asset was decompressed and compared with its source using SHA-256. All 13 matched. The standalone file contains no external script or stylesheet dependency and no narrative data asset.

## Reproduction workflow validation

`scripts/prepare_financial_geography.py` was executed against the supplied raw HUD financial CSV and the completed activity geography crosswalk. It produced 128,382 quarter-level rows, 53 uniquely named financial/geographic columns, 100.00% state coverage, 65.68% enhanced county coverage, 37.39% city/place coverage, and 29.69% urban-area coverage. No narrative-like columns were produced.

The resulting processed file was then passed to `scripts/build_static_data.py`, which rebuilt seven browser row chunks under the 25-value schema. `scripts/build_self_contained.py` generated a 13-asset one-file edition, and the rebuilt site passed the static validator. Machine-readable result: `docs/preparation_rebuild_test_v5.json`.

## Limitation of automated browser testing

The validation environment cannot reproduce every end-user graphics driver or browser print dialog. The package therefore combines full-data structural checks, full-data browser logic checks, a real-Plotly rendering test, map-schema validation, and deterministic asset-integrity checks. Users should still verify the published URL in their target browser after GitHub Pages completes deployment.
