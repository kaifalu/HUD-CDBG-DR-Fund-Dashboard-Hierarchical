# GitHub Pages Setup

## Recommended repository layout

Upload the extracted deployment-package **contents**, not the ZIP file or its enclosing folder. The repository root must directly contain:

```text
index.html
.nojekyll
assets/
data/
privacy/
scripts/
README.md
```

## Publish

1. Open the repository's **Settings**.
2. Select **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main** and folder **/(root)**.
5. Select **Save**.

For `kaifalu/HUD-CDBG-DR-Fund-Dashboard-Hierarchical`, the expected URL is:

```text
https://kaifalu.github.io/HUD-CDBG-DR-Fund-Dashboard-Hierarchical/
```

## Updating an earlier version

Delete or overwrite old `index.html`, `assets/`, `data/`, `privacy/`, and documentation files before uploading the complete Version 6 package. Do not mix data chunks from different versions because the row schema and narrative manifest must match `assets/app.js` and `data/bootstrap.js`.

## Privacy warning

Never upload:

- original narrative CSV files;
- `RESTRICTED_NARRATIVE_ADDRESS_QA.csv`;
- the restricted QA ZIP; or
- any file containing unsanitized detected address strings.

Only the public deployment ZIP is intended for the GitHub Pages repository.

## Troubleshooting

- A 404 usually means `index.html` is not at the selected publishing root or Pages has not finished deploying.
- A blank dashboard commonly indicates a partial upload or mixed-version `assets/` and `data/` folders.
- Wait several minutes after a commit, then inspect **Actions** and **Settings → Pages**.
- Use a current hardware-accelerated browser. If WebGL is unavailable, maps show a fallback message while filters, plots, narratives, reports, and downloads remain available.
