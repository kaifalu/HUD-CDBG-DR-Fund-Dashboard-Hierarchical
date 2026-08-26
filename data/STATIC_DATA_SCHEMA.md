# Static Data Schema

The dashboard stores quarter-level financial records as compact arrays in `data/rows/*.js`. Column positions are declared in `data/bootstrap.js` under `columns`. Repeated text is dictionary-encoded. Geographic polygon assets load only when needed.

## Row positions

| Position | Key | Description |
|---:|---|---|
| 0 | `year` | Disaster/appropriation year dictionary code |
| 1 | `disasterType` | Disaster type dictionary code |
| 2 | `grantee` | Grantee dictionary code |
| 3 | `project` | Project dictionary code |
| 4 | `organization` | Activity responsible organization dictionary code |
| 5 | `activityType` | Activity type dictionary code |
| 6 | `activityTitle` | Activity title dictionary code |
| 7 | `quarter` | QPR-quarter dictionary code |
| 8 | `grantCode` | Grant identifier dictionary code |
| 9 | `activityCode` | Grant + activity identifier dictionary code |
| 10 | `state` | State geography dictionary code |
| 11 | `county` | County/county-equivalent dictionary code or `-1` |
| 12 | `city` | City/place dictionary code or `-1` |
| 13 | `urban` | Urban-area dictionary code or `-1` |
| 14 | `countyMethod` | County matching-method code or `-1` |
| 15 | `countyConfidence` | County confidence code or `-1` |
| 16 | `cityMethod` | City matching-method code or `-1` |
| 17 | `cityConfidence` | City confidence code or `-1` |
| 18 | `urbanMethod` | Urban-area matching-method code or `-1` |
| 19 | `urbanConfidence` | Urban-area confidence code or `-1` |
| 20–24 | financial measures | Five QPR financial values in the order declared by `metrics` |

Every row must therefore contain exactly **25 values**.

## Removed fields

This version contains no `hasNarrative`, `narrativeId`, narrative text, narrative dictionary, or narrative chunk manifest.

## Browser globals

- `window.DISASTER_DASHBOARD_DATA` contains metadata and dictionaries.
- Each row file appends one array to `window.DISASTER_DASHBOARD_DATA.rowChunks`.
- Geography files populate `window.DISASTER_DASHBOARD_DATA.geojson` or the corresponding compressed geography structure.

## Self-contained edition

The one-file HTML stores required JavaScript assets as gzip-compressed Base64 blocks. Its bootloader inflates and executes assets in the same logical order as the multi-file site. It contains the same financial rows and geographic assets and no narrative data.
