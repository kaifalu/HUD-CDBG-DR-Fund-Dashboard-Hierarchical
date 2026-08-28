# Data and Methods

## Financial records

The dashboard uses 128,382 valid quarter-level HUD CDBG-DR financial records after excluding 2,223 summary rows without a usable QPR quarter. It contains 206 grants, 1,433 projects, and 16,150 Grant + Activity Number combinations. Five QPR measures are available: funds obligated, funds expended, grant disbursed, activity program income disbursed, and activity program income received.

## Narrative linkage

The source narrative files were collapsed to 174,200 nonempty quarter-level narrative records. Narratives are linked to finance records by exact **Grant + Activity Number + QPR report quarter**. This produces 95,530 financial records with a linked narrative, or 74.41% of dashboard financial rows.

The static public site stores only excerpts, limited to 1,800 characters and partitioned by year for on-demand loading.

## Narrative PII address screening

The address screening is performed before static assets are created. It detects common street, highway, P.O. box, rural-route, directional suffixless, parcel, and lot patterns. Each narrative is classified using its activity type, activity title, and narrative context. The classification applies only to narrative-address handling.

### Retain and highlight

Detected addresses are retained when the narrative is classified as:

- infrastructure or public facility; or
- clearly multifamily, public-housing, affordable-rental, or multi-unit development.

The public text encloses these strings in `[[PUBLIC_ADDRESS]]…[[/PUBLIC_ADDRESS]]`, which the dashboard renders as highlighted text.

### Redact

Detected addresses are replaced with `[REDACTED — POTENTIAL SINGLE-FAMILY ADDRESS]` when the narrative indicates:

- buyout or property acquisition;
- homeowner or owner-occupied assistance;
- single-family/residential rehabilitation or reconstruction;
- replacement housing or relocation; or
- an ambiguous context without strong infrastructure or multifamily evidence.

Sensitive residential signals override otherwise safe cues. The original detected strings are written only to the restricted QA table and never to the public package.

### Public-screening results

| Measure | Count |
|---|---:|
| Nonempty narratives screened | 174,200 |
| Narratives with detected address-like mentions | 1,186 |
| Detected address-like mentions | 2,228 |
| Retained/highlighted mentions | 1,140 |
| Redacted mentions | 1,088 |

This automated procedure is conservative and is not a legal determination or guarantee that all PII has been identified. Public release should remain subject to institutional privacy review.

## Geography

- **State:** direct assignment from grantee state.
- **County/county-equivalent:** direct high-confidence county text plus city-derived primary-county approximation.
- **City/place:** conservatively matched point from the supplied U.S. cities database; not a municipal polygon.
- **Urban area:** 2010 Census urban-area geography linked through city point-in-polygon or supporting locality evidence.

Mapping coverage is reported in the interface and downloads.

## Static deployment

The browser loads dictionary-encoded financial row chunks. Geographic boundaries load when requested. Sanitized narrative excerpts are split into annual JavaScript chunks and load on demand. All filtering, aggregation, mapping, reporting, narrative rendering, and downloads occur locally in the visitor's browser.
