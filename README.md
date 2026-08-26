# CDBG-DR Fund Dashboard — Quick Report and Explore Edition

The **CDBG-DR Fund Dashboard** is a browser-only GitHub Pages application for exploring HUD Community Development Block Grant–Disaster Recovery financial activity. The revised edition removes all narrative data and adds a decision-oriented **Quick Report** mode that converts a few selections into a printable one-page funding brief.

The site runs entirely from static HTML, CSS, JavaScript, Plotly, and prepared financial/geographic assets. It does not require Python, Gradio, a database, Render, Hugging Face, or another application server after deployment.

## Main interaction modes

### Quick Report

Quick Report is the default landing mode. A user selects:

- report type: single area or two-scenario comparison;
- geography: state, county/county-equivalent, city/place, or 2010 Census urban area;
- one financial measure;
- quarterly or cumulative trend basis;
- time horizon; and
- optional disaster year, disaster type, grantee, project, and activity-type filters.

The browser generates a one-page decision brief containing four key indicators, a geographic map, a funding trend, a top-five ranking, rule-based takeaways, mapping-coverage information, and interpretation notes. The report can be downloaded as PNG, printed/saved as PDF, or exported as aggregate CSV.

### Explore & Compare

The original analytical dashboard remains available as a second mode. It contains two independently controlled panels, seven hierarchical filters, four geographic levels, five financial measures, quarterly/cumulative timelines, interactive maps, and aggregate downloads.

## GitHub Pages deployment

1. Extract the deployment ZIP.
2. Upload the **contents inside the extracted folder** to the root of a public GitHub repository.
3. Confirm that `index.html`, `.nojekyll`, `assets/`, and `data/` are directly visible at the repository root.
4. Open the repository's **Settings → Pages** page.
5. Under **Build and deployment**, select:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/(root)`
6. Select **Save**.

For a repository named `HUD-CDBG-DR-Fund-Dashboard-Hierarchical`, the project-site pattern is:

```text
https://YOUR_GITHUB_USERNAME.github.io/HUD-CDBG-DR-Fund-Dashboard-Hierarchical/
```

## Required root structure

```text
index.html
.nojekyll
assets/
data/
docs/
scripts/
README.md
GITHUB_PAGES_SETUP.md
USER_GUIDE.md
DATA_METHODS.md
VALIDATION_REPORT.md
```

Do not upload only the ZIP file or an enclosing folder. GitHub Pages must be able to find `index.html` at the selected publishing root.

## Local preview

A local HTTP server is recommended because the multi-file edition loads data assets dynamically.

### Windows

Double-click `run_local.bat`, then open:

```text
http://127.0.0.1:8000/
```

### macOS or Linux

```bash
chmod +x run_local.sh
./run_local.sh
```

Alternatively:

```bash
python -m http.server 8000
```

## Data coverage

| Geography | Finance rows mapped | Row coverage | Activities mapped | Activity coverage |
|---|---:|---:|---:|---:|
| State, direct | 128,382 | 100.00% | 16,150 | 100.00% |
| County/county-equivalent, enhanced | 84,324 | 65.68% | 10,485 | 64.92% |
| City/populated place, matched point | 48,006 | 37.39% | 6,375 | 39.47% |
| 2010 Census urban area | 38,121 | 29.69% | 5,062 | 31.34% |

County coverage combines direct county evidence with the primary county associated with a conservatively matched city/place. City-derived county assignments are approximations when a place spans more than one county. City/place locations are points, not municipal boundary polygons.

## Financial interpretation

The dashboard uses source-quarter financial transactions. Quarterly views display each quarter's net amount. Cumulative views calculate chronological cumulative net sums; a cumulative line may decline when a source record contains a reversal, correction, or deobligation.

## Rebuilding the static data

The complete source package includes a two-step workflow. First, `scripts/prepare_financial_geography.py` joins the raw HUD financial CSV to the prepared activity geography crosswalk. Then `scripts/build_static_data.py` creates the compact browser assets. No narrative file is required.

```bash
python scripts/prepare_financial_geography.py \
  --financial-csv PATH/TO/F31_FINANCIAL.csv \
  --geography-crosswalk PATH/TO/activity_geography_crosswalk.csv.gz \
  --output-dir PATH/TO/PROCESSED_DATA

python scripts/build_static_data.py \
  --processed-dir PATH/TO/PROCESSED_DATA \
  --site-dir .

python scripts/build_self_contained.py --site-dir .
```

See `DATA_METHODS.md` and `data/STATIC_DATA_SCHEMA.md` for required fields and storage details.

## Validation

Run:

```bash
python scripts/validate_static_package.py
```

The validator checks required files, dashboard controls, row schemas, row totals, geographic assets, absence of narrative assets, JavaScript syntax when Node.js is available, file-size limits, and package checksums.

## Documentation

- `GITHUB_PAGES_SETUP.md` — publishing and troubleshooting instructions.
- `USER_GUIDE.md` — Quick Report and Explore & Compare instructions.
- `DATA_METHODS.md` — financial and geographic methodology.
- `VALIDATION_REPORT.md` — completed validation results and limitations.
- `PACKAGE_MANIFEST.md` — intended use of each package component.
- `REVISION_NOTES_V5.md` — changes in this edition.
- `THIRD_PARTY_NOTICES.md` — Plotly, Census, and city-data notices.

## License and attribution

Dashboard source code is provided under the MIT License. Plotly.js is bundled under its own MIT License. City/place coordinates and primary-county attributes are derived from the user-supplied SimpleMaps U.S. Cities database; visible attribution is retained. Review `NOTICE.md` and `THIRD_PARTY_NOTICES.md` before redistributing source geographic data.
