# Package manifest

## Purpose

This folder is the deployable GitHub Pages site. Upload its contents to a
repository root and publish `main` from `/(root)`.

## Required runtime files

- `index.html` — dashboard entry point.
- `.nojekyll` — direct static publishing marker.
- `assets/app.css` — responsive presentation.
- `assets/app.js` — filtering, aggregation, maps, plots, narratives, downloads.
- `assets/vendor/plotly-3.3.1.min.js` — local chart/map library.
- `data/bootstrap.js` — dictionaries, metadata, schema, and chunk manifests.
- `data/rows/*.js` — compact finance row chunks.
- `data/narratives/*.js` — on-demand narrative excerpt chunks.
- `data/geography/state.js` — minified state boundaries.
- `data/geography/county.js` — minified county/county-equivalent boundaries.
- `data/geography/urban.js` — minified 2010 Census urban-area boundaries.

## Reproduction and QA files

- `scripts/build_static_data.py` — converts the processed server edition into
  static assets.
- `scripts/validate_static_package.py` — validates the prepared Pages package.
- `data/metadata.json` — source counts, coverage, methods, and input hashes.
- `data/STATIC_DATA_SCHEMA.md` — compact schema explanation.
- Markdown guides and notices in the repository root.
- `docs/dashboard_interface_preview.png` — browser smoke-test preview.
- `docs/browser_smoke_test_v4.json` — machine-readable results from the revised desktop and mobile browser QA.
- `REVISION_NOTES_V4.md` — summary of the CDBG-DR branding and header revision.

## Files intentionally excluded from the deployment package

- raw source financial and narrative CSV files;
- raw Census shapefile ZIP archives;
- raw U.S. cities CSV;
- server-side SQLite narrative database;
- Gradio/Python runtime application;
- Render/Docker deployment configuration.

Those materials are included in the separate complete reproduction package.
