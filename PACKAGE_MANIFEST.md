# Public Package Manifest

## Runtime files

- `index.html` — GitHub Pages entry point.
- `.nojekyll` — disables Jekyll processing.
- `assets/app.css` — responsive interface and print styles.
- `assets/app.js` — filters, maps, reports, narrative rendering, and downloads.
- `assets/vendor/plotly-3.3.1.min.js` — bundled Plotly runtime.
- `data/bootstrap.js` — dictionaries, metadata, manifests, and runtime schema.
- `data/rows/*.js` — compact 27-field financial/geographic rows including linked-narrative flags/IDs.
- `data/narratives/*.js` — year-partitioned privacy-screened public narrative excerpts.
- `data/geography/*.js` — state, county, and urban-area geographic assets.
- `privacy/` — public privacy method, summary, and activity-type decision crosswalk.
- `HUD-CDBG-DR-Fund-Dashboard-Hierarchical.html` — self-contained edition.

## Reproducibility scripts

- `scripts/sanitize_narratives.py`
- `scripts/build_static_data.py`
- `scripts/build_self_contained.py`
- `scripts/prepare_financial_geography.py`
- `scripts/validate_static_package.py`

## Files deliberately excluded from the public package

- original unsanitized narrative CSV files;
- restricted address QA table containing original detected strings;
- server-side databases and credentials;
- raw financial rows as a browser-download option.

The restricted QA deliverable must remain controlled and must not be copied into the GitHub Pages repository.
