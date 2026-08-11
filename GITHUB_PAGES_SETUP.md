# GitHub Pages setup guide

This guide publishes the dashboard through the same GitHub workflow used for a
normal branch-based static site: **Settings → Pages → Deploy from a branch →
main → /(root)**.

## 1. Download and extract the correct package

Use `cdbg_dr_fund_dashboard_github_pages_deployment_v4.zip`. Extract it before
uploading. The ZIP is only a transport container; GitHub Pages cannot serve the
dashboard when the whole website remains inside one ZIP file.

After extraction, verify that you can see:

```text
index.html
.nojekyll
assets/
data/
README.md
```

## 2. Create a public repository

Open:

`https://github.com/new`

A suggested repository name is:

`cdbg-dr-fund-dashboard`

Set the repository visibility to **Public**. A project Pages site normally uses
the repository name in its URL.

## 3A. Upload through the GitHub website

1. Open the empty repository.
2. Choose **Add file → Upload files**.
3. Drag the extracted files and folders into the upload area. Upload the
   contents of the extracted folder, not the outer folder and not the ZIP.
4. Confirm that `index.html` appears at the repository root.
5. Enter a commit message such as `Add GitHub Pages dashboard` and commit to
   `main`.

Every deployable file in this package is under 5 MB, making the package suitable
for ordinary Git-based or browser-based repository upload. If the browser upload
is interrupted, use the Git method below.

## 3B. Push the supplied Git bundle instead

The separate file `cdbg_dr_fund_dashboard_github_pages_v4.git.bundle` is a portable
committed repository.

```bash
git clone cdbg_dr_fund_dashboard_github_pages_v4.git.bundle cdbg-dr-fund-dashboard
cd cdbg-dr-fund-dashboard
git remote remove origin
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace both placeholders with your actual account and repository names.

## 4. Open the repository's Pages settings

Use this direct template after replacing the placeholders:

`https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY/settings/pages`

Or navigate manually:

1. Open the repository.
2. Select **Settings**.
3. In the left navigation, select **Pages** under **Code and automation**.

If the Settings tab is hidden, confirm that you are signed in to an account with
administrator permission for the repository. On a narrow window, repository
tabs may be inside an overflow menu.

## 5. Select branch-based publishing

Under **Build and deployment** configure:

```text
Source: Deploy from a branch
Branch: main
Folder: /(root)
```

Select **Save**.

The package includes `.nojekyll`, so GitHub publishes the static folders and
files directly without Jekyll processing.

## 6. Open the public site

For a normal project repository, use:

`https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/`

Example only:

```text
Repository: https://github.com/example-user/cdbg-dr-fund-dashboard
Dashboard:  https://example-user.github.io/cdbg-dr-fund-dashboard/
```

For the special account-site repository named exactly
`YOUR_GITHUB_USERNAME.github.io`, use:

`https://YOUR_GITHUB_USERNAME.github.io/`

The exact address also appears at the top of the repository's Pages settings
after deployment completes.

## 7. Verify the published file structure

A correct repository root should look like:

```text
index.html
.nojekyll
assets/app.css
assets/app.js
assets/vendor/plotly-3.3.1.min.js
data/bootstrap.js
data/rows/...
data/narratives/...
data/geography/...
```

The dashboard uses relative paths, so it works both at an account root and in a
project subpath.

## Updating the dashboard later

Replace modified files, commit to `main`, and push. GitHub Pages republishes the
branch. Keep the same relative folder structure. Do not rename `data`, `assets`,
or the JavaScript chunks unless you also rebuild `data/bootstrap.js`.

## Troubleshooting

### Pages displays the README instead of the dashboard

`index.html` is not at the selected publishing root. Move it to the repository
root or change the Pages folder to the location that contains it.

### The site returns 404

Confirm that:

- the repository is public or your plan supports private Pages;
- Pages source is `Deploy from a branch`;
- branch is `main`;
- folder is `/(root)`;
- the public URL includes the repository name for a project site;
- the latest Pages deployment has completed.

### The dashboard says a data file failed to load

The folder structure changed or not all files were uploaded. Compare the
repository against `PACKAGE_MANIFEST.md`, especially `data/rows`,
`data/narratives`, and `data/geography`.

### The map reports that WebGL is unavailable

Open the dashboard in a current Chrome, Edge, Firefox, or Safari browser and
enable browser hardware acceleration. Other dashboard functions continue to
work without the map.

### The initial load is slow

The static edition loads roughly 13 MB of compact finance chunks plus the local
Plotly library on first use. Narrative and polygon assets load later, on demand.
Browser and GitHub/CDN caching make repeat visits faster.

### A custom domain is required

First confirm the default `github.io` site works. Then add the domain in the
Pages settings and configure the domain's DNS exactly as GitHub instructs.
Custom-domain ownership and DNS cannot be completed by this package alone.
