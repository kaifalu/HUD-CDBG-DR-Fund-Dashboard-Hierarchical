# GitHub Pages Setup

## Recommended repository

A suggested public repository name is:

```text
HUD-CDBG-DR-Fund-Dashboard-Hierarchical
```

The resulting project-site pattern is:

```text
https://YOUR_GITHUB_USERNAME.github.io/HUD-CDBG-DR-Fund-Dashboard-Hierarchical/
```

## Upload the correct files

Extract the deployment ZIP. Open the extracted dashboard folder and upload **its contents**, not the ZIP itself and not the enclosing folder.

The repository root must directly contain:

```text
index.html
.nojekyll
assets/
data/
docs/
scripts/
README.md
```

An incorrect nested structure such as the following will cause a Pages 404 when `/(root)` is selected:

```text
repository/
  cdbg_dr_fund_dashboard_github_pages_v5/
    index.html
```

The correct structure is:

```text
repository/
  index.html
  assets/
  data/
```

## Enable Pages

1. Open the GitHub repository.
2. Select **Settings**.
3. Select **Pages** in the left navigation.
4. Under **Build and deployment**, choose:
   - **Source:** Deploy from a branch
   - **Branch:** main
   - **Folder:** /(root)
5. Select **Save**.

The direct settings pattern is:

```text
https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY/settings/pages
```

## Update an existing repository

Delete or overwrite obsolete dashboard files, especially old `index.html`, `assets/app.js`, `assets/app.css`, `data/bootstrap.js`, old `data/rows/`, and any prior `data/narratives/` directory. Upload the entire revised deployment package so the code and data schemas remain synchronized.

After committing the update, check the repository's **Actions** tab for the Pages deployment. A green deployment indicates that GitHub completed the publication process.

## One-file alternative

The deployment package also contains:

```text
HUD-CDBG-DR-Fund-Dashboard-Hierarchical.html
```

This is a self-contained edition. It can be opened locally after download. For a one-file Pages deployment, copy it to the repository root and rename it `index.html`. The multi-file edition is recommended for faster repository updates and more efficient browser caching.

## Troubleshooting

### 404 page

Confirm that `index.html` is at the selected publishing root and that the repository/branch names match the Pages configuration.

### Blank page or loading error

Upload the complete `assets/` and `data/` directories. Do not mix files from different package versions. Open the browser developer console and look for a missing JavaScript file.

### Dashboard opens but report/map is unavailable

Use a current browser with JavaScript and hardware acceleration enabled. State, county, and urban-area polygons load on demand. City/place maps use matched points.

### Changes are not visible

Wait for the Pages deployment to complete, then hard-refresh the page (`Ctrl+F5` or `Cmd+Shift+R`).

### Large browser upload fails

Use Git from the command line instead of GitHub's browser uploader:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
# Copy the extracted deployment contents here.
git add .
git commit -m "Deploy revised CDBG-DR Fund Dashboard"
git push origin main
```
