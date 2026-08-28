# CDBG-DR Fund Dashboard — Privacy-Screened Narratives Edition

The **CDBG-DR Fund Dashboard** is a browser-only GitHub Pages application for exploring U.S. Department of Housing and Urban Development Community Development Block Grant–Disaster Recovery financial activity. It combines quarter-level financial records, geographic matching, and privacy-screened Quarterly Performance Report (QPR) narrative excerpts in a static HTML/CSS/JavaScript site that requires no Python server after publication.

## Interaction modes

The dashboard opens in **Explore & Compare**, which retains two independent analytical panels, seven linked filters, maps, financial timelines, aggregate downloads, a narrative-only checkbox, and linked privacy-screened narrative records.

**Quick Report** provides a simpler path for time-constrained or less data-literate users. A user chooses report type, geography, time horizon, one financial measure, and optional filters; the dashboard produces a printable one-page decision brief with indicators, map, funding trend, top-five ranking, rule-based takeaways, and recent privacy-screened narrative highlights. Reports can be printed/saved as PDF and downloaded as PNG or CSV.

## Narrative privacy workflow

Narratives are linked to financial records by exact **Grant + Activity Number + QPR quarter**. Before publication, an automated address sweep applies activity-aware rules only to the narrative text:

- addresses in infrastructure/public-facility and clearly multifamily or affordable-rental contexts are retained and highlighted;
- potential addresses in buyout, homeowner assistance, single-family rehabilitation or reconstruction, replacement/relocation housing, and ambiguous contexts are replaced with `[REDACTED — POTENTIAL SINGLE-FAMILY ADDRESS]`;
- the financial and geographic datasets are not reclassified or filtered by these privacy labels.

The public package contains only sanitized narrative excerpts and aggregate privacy-audit statistics. Original detected strings are stored only in a separate restricted QA file that must not be uploaded to a public repository. Automated screening is conservative and does not replace human or legal privacy review.

### Privacy-screening results in this build

- 174,200 nonempty linked narrative records screened
- 1,186 narratives with detected address-like mentions
- 2,228 address-like mentions detected
- 1,140 mentions retained and highlighted in approved infrastructure/multifamily contexts
- 1,088 potential single-family or ambiguous mentions redacted

See `privacy/NARRATIVE_PRIVACY_METHOD.md` and `privacy/narrative_activity_privacy_crosswalk.csv`.

## Core functions

- Two-panel Explore & Compare workspace, shown first by default.
- Seven hierarchical filters: year, disaster type, grantee, project, responsible organization, activity type, and activity title.
- Narrative-only filtering and linked privacy-screened QPR excerpts.
- State, enhanced county/county-equivalent, matched city/place point, and 2010 Census urban-area views.
- Five quarterly financial measures with quarterly or cumulative-net plots.
- Single-area and comparison Quick Reports.
- Aggregate CSV, map PNG, plot PNG, report PNG, and report-data CSV downloads.
- Responsive layout and lab footer/contact information.

## Data coverage

| Geography | Finance rows mapped | Row coverage | Activities mapped | Activity coverage |
|---|---:|---:|---:|---:|
| State, direct | 128,382 | 100.00% | 16,150 | 100.00% |
| County/county-equivalent, enhanced | 84,324 | 65.68% | 10,485 | 64.92% |
| City/populated place, matched point | 48,006 | 37.39% | 6,375 | 39.47% |
| 2010 Census urban area | 38,121 | 29.69% | 5,062 | 31.34% |

County and city/place assignments include inferred matches. The dashboard reports mapping coverage and interpretation notes for every selection.

## GitHub Pages deployment

Upload the **contents of this folder** to the repository root so that `index.html`, `.nojekyll`, `assets/`, and `data/` are directly visible. Then configure:

```text
Repository → Settings → Pages
Source: Deploy from a branch
Branch: main
Folder: /(root)
```

For the repository `kaifalu/HUD-CDBG-DR-Fund-Dashboard-Hierarchical`, the expected project URL is:

```text
https://kaifalu.github.io/HUD-CDBG-DR-Fund-Dashboard-Hierarchical/
```

## Local preview

A local HTTP server is recommended for the multi-file edition:

```bash
python -m http.server 8000
```

Then open `http://127.0.0.1:8000/`. The included self-contained HTML can also be opened directly.

## Rebuilding

1. Run `scripts/sanitize_narratives.py` in a restricted environment against the internally held processed narrative input. Never place unsanitized narrative files or restricted QA output in a public repository.
2. Place the sanitized `narratives_processed.csv.gz` beside `finance_processed.csv.gz`, `metadata.json`, and geographic files in a processed-data directory.
3. Run:

```bash
python scripts/build_static_data.py --processed-dir PATH/TO/PROCESSED --site-dir .
python scripts/build_self_contained.py --site-dir . --output HUD-CDBG-DR-Fund-Dashboard-Hierarchical.html
python scripts/validate_static_package.py --site-dir .
```

## Documentation

- `USER_GUIDE.md` — dashboard operation and report downloads.
- `DATA_METHODS.md` — data, linkage, geography, and privacy methods.
- `GITHUB_PAGES_SETUP.md` — deployment and troubleshooting.
- `REVISION_NOTES_V6.md` — changes in this release.
- `VALIDATION_REPORT.md` — completed package and browser checks.
- `privacy/` — public privacy methodology, summary, and activity crosswalk.
