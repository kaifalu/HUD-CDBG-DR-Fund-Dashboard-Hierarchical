# CDBG-DR Fund Dashboard — GitHub Pages Edition

https://kaifalu.github.io/HUD-CDBG-DR-Fund-Dashboard-Hierarchical/

This package is the **browser-only GitHub Pages version** of the **CDBG-DR Fund Dashboard**. The dashboard explores HUD Community Development Block Grant–Disaster Recovery programs through financial, narrative, and geographic data. It does not run Python, Gradio, a database, or a web server after deployment. All filtering, aggregation, map preparation, narrative excerpt loading, and downloads run in the visitor's browser using static HTML, CSS, JavaScript, and prepared data assets.

## Public dashboard features

- Two independent comparison panels.
- Seven hierarchical filters: Year, Disaster Type, Grantee, Project, Activity
  Responsible Organization, Activity Type, and Activity Title.
- Exact Grant + Activity Number + QPR-quarter narrative filtering.
- State, enhanced county/county-equivalent, matched city/place point, and 2010
  Census urban-area views.
- Quarterly or cumulative plots for five QPR financial measures.
- Aggregate CSV download for the current selection.
- Browser-generated PNG downloads for the map and funding plot.
- On-demand narrative excerpts, partitioned by year to reduce initial loading.
- Responsive layout for desktop and smaller screens.

## Fastest GitHub Pages deployment

1. Extract the deployment ZIP on your computer.
2. Create a new **public** GitHub repository. Do not initialize it with a
   different README if you plan to push the included Git bundle.
3. Upload or push the **contents inside this folder** to the repository root.
   `index.html`, `.nojekyll`, `assets/`, and `data/` must all be at the root.
4. Open the repository's Pages settings:

   `https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY/settings/pages`

5. Under **Build and deployment**, choose:

   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/(root)`

6. Select **Save**. After GitHub finishes publishing, the project-site address
   normally follows this pattern:

   `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/`

If the repository itself is named `YOUR_GITHUB_USERNAME.github.io`, the address
is instead:

`https://YOUR_GITHUB_USERNAME.github.io/`

Detailed screenshots are not embedded because GitHub's interface changes over
time. The exact navigation and troubleshooting sequence is in
`GITHUB_PAGES_SETUP.md`.

## What to upload

Upload the extracted deployment folder contents, **not the ZIP file itself**.
The required root structure is:

```text
index.html
.nojekyll
README.md
assets/
data/
docs/
scripts/
```

Do not upload the complete reproduction ZIP as the Pages website. It contains
raw inputs and Python preprocessing materials that are not required by the live
static site.

## Local preview

A local HTTP server is recommended because the dashboard loads data chunks
dynamically.

### Windows

Double-click `run_local.bat`, then open:

`http://127.0.0.1:8000/`

### macOS or Linux

```bash
chmod +x run_local.sh
./run_local.sh
```

Then open `http://127.0.0.1:8000/`.

You can also run:

```bash
python -m http.server 8000
```

## Data coverage in this build

| Geography | Finance rows mapped | Row coverage | Activities mapped | Activity coverage |
|---|---:|---:|---:|---:|
| State, direct | 128,382 | 100.00% | 16,150 | 100.00% |
| County/county-equivalent, enhanced | 84,324 | 65.68% | 10,485 | 64.92% |
| City/populated place, matched point | 48,006 | 37.39% | 6,375 | 39.47% |
| 2010 Census urban area | 38,121 | 29.69% | 5,062 | 31.34% |

Enhanced county coverage combines direct county/county-equivalent evidence and
the primary county associated with a conservatively matched city/place. A
city-derived county remains an approximation when a place spans more than one
county. City/place symbols are coordinates, not municipal boundary polygons.

## Static-site design

The initial page loads compact dictionary-encoded finance rows. State, county,
and urban-area boundary files load only when needed. Narrative excerpts are
split into annual JavaScript files and load only when a narrative section is
opened. No source CSV, SQLite database, or Python runtime is included in the
Pages deployment package.

The map uses Plotly's WebGL-based map traces. A current browser with WebGL and
hardware acceleration is recommended. When WebGL is unavailable, the dashboard
shows a clear fallback message while the filters, KPIs, funding plots, aggregate
CSV download, and narrative tables continue to operate.

## Rebuilding the static assets

The deployment package includes `scripts/build_static_data.py`. Rebuilding
requires the processed files from the complete reproduction package and Python
packages `numpy` and `pandas`:

```bash
python scripts/build_static_data.py \
  --processed-dir PATH/TO/data/processed \
  --site-dir .
```

See `DATA_METHODS.md` and the complete reproduction package for the upstream
geographic matching workflow.

## Validation

Run:

```bash
python scripts/validate_static_package.py
```

The validator checks required files, JavaScript chunk manifests, file-size
constraints, row totals, narrative manifests, geographic assets, and SHA-256
checksums recorded in the package manifest.

## Documentation

- `GITHUB_PAGES_SETUP.md` — exact deployment and troubleshooting steps.
- `USER_GUIDE.md` — dashboard operation and download behavior.
- `DATA_METHODS.md` — financial, narrative, county, city, and urban-area methods.
- `VALIDATION_REPORT.md` — completed package and browser tests.
- `PACKAGE_MANIFEST.md` — package structure and intended use.
- `THIRD_PARTY_NOTICES.md` — Plotly, Census, and city-data notices.
- `PAGES_LINK_TEMPLATE.txt` — copyable repository settings and public URL forms.
- `REVISION_NOTES_V4.md` — changes made in this CDBG-DR Fund Dashboard revision.

## License and attribution

Dashboard source code is provided under the MIT License. Plotly.js is bundled
locally under its own MIT License. City/place coordinates and primary-county
attributes are derived from the user-supplied SimpleMaps U.S. Cities file; the
application retains visible SimpleMaps attribution. Review `NOTICE.md` and
`THIRD_PARTY_NOTICES.md` before redistributing raw city data.
