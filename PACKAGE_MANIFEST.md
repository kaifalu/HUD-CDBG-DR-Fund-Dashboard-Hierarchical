# Package Manifest

## GitHub Pages deployment package

This is the package intended for a public GitHub repository.

- `index.html` — application structure, dashboard description, Quick Report controls, and Explore & Compare container.
- `.nojekyll` — prevents Jekyll processing.
- `assets/app.css` — responsive interface and print styling.
- `assets/app.js` — financial filtering, aggregation, Quick Report generation, maps, plots, and downloads.
- `assets/vendor/plotly-3.3.1.min.js` — bundled visualization library.
- `data/bootstrap.js` — dictionaries, metadata, column positions, chunk manifests, and geography metadata.
- `data/rows/*.js` — compact quarter-level financial rows with no narrative fields.
- `data/geography/*.js` — state, county, and urban-area map assets.
- `HUD-CDBG-DR-Fund-Dashboard-Hierarchical.html` — optional fully self-contained one-file edition.
- `scripts/prepare_financial_geography.py` — joins the raw financial CSV to the prepared activity geography crosswalk and creates the processed financial file.
- `scripts/build_static_data.py` — rebuilds static assets from processed financial/geographic data.
- `scripts/build_self_contained.py` — rebuilds the one-file HTML edition.
- `scripts/validate_static_package.py` — validates package structure and data integrity.
- `docs/` — previews and machine-readable validation outputs.
- Markdown files — setup, operation, methods, notices, and revision documentation.

## Complete reproduction package

The complete package contains:

- the full GitHub Pages deployment website;
- non-narrative source inputs used for financial and geographic processing;
- processed non-narrative financial and geographic reference files;
- geographic matching quality-assurance outputs when available; and
- build, validation, documentation, and checksum files.

The complete package is for controlled reproduction and should not automatically be uploaded to a public repository. Review source-data licenses and redistribution requirements first.

## Files intentionally excluded

This edition excludes all QPR narrative CSV files, processed narrative tables, narrative databases, narrative JavaScript chunks, narrative identifiers, and narrative excerpts.
