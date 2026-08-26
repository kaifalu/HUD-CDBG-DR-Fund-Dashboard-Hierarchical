# Data and Methods

## Financial source and analytical unit

The dashboard uses HUD CDBG-DR Quarterly Performance Report financial data by grant, project, activity, and reporting quarter. The source contains 130,605 rows. The browser dataset contains 128,382 quarter-level financial rows after excluding 2,223 summary records without a valid QPR reporting quarter.

The five financial measures are:

1. QPR Funds Obligated
2. QPR Fund Expended
3. QPR Grant Disbursed
4. QPR Activity Program Income Disbursed
5. QPR Activity Program Income Received

Financial values are treated as source-quarter transactions. Cumulative values are chronological cumulative net sums and may decline after reversals, corrections, or deobligations.

## Narrative removal

This edition intentionally contains **no narrative records or narrative functionality**. Narrative-only filtering, linked-narrative tables, narrative identifiers, narrative excerpts, narrative metadata, and narrative assets were removed from the interface, row schema, build workflow, validation workflow, downloads, and self-contained HTML.

## Hierarchical dimensions

The seven analytical dimensions are:

- disaster/appropriation year;
- disaster type;
- grantee;
- project;
- activity responsible organization;
- activity type; and
- activity title.

Repeated labels are dictionary-encoded to reduce the size of the static website.

## Geographic methods

### State

State is assigned directly from the source grantee-state field. Coverage is 100% of the browser financial rows.

### County/county-equivalent

Enhanced county matching combines:

- direct county/county-equivalent evidence in grantee, project, organization, and activity text; and
- the primary county listed for a conservatively matched city/place.

County row coverage is 65.68%. A city-derived primary county is an approximation when a populated place spans more than one county.

### City/populated place

City/place matching uses the supplied U.S. cities gazetteer and state-constrained text evidence. The interface displays matched points using latitude and longitude; it does not represent municipal-limit polygons. Row coverage is 37.39%.

### 2010 Census urban area

Urban areas are a secondary Census statistical geography. Matching primarily associates a matched city point with an urban-area polygon, supplemented by conservative locality text. Row coverage is 29.69%.

## Quick Report calculations

For each scenario, the Quick Report:

1. applies the selected time range and optional program filters;
2. calculates mapping coverage before applying the selected geographic location;
3. limits records to mapped features at the selected geographic level;
4. calculates the chosen financial measure, unique grants, projects, and activities;
5. builds a quarterly or cumulative series;
6. aggregates the measure for the map;
7. identifies the top five geographic units, projects, or activity types, depending on the selected scope; and
8. generates concise takeaways using deterministic browser rules.

For a comparison report, the map displays Scenario B minus Scenario A, while the trend and ranking display both scenarios. No external AI service is called.

## Aggregate exports

Quick Report CSV exports contain report settings, aggregate indicators, the aggregate time series, the top-five ranking, takeaways, and methodology notes. Explore & Compare downloads contain quarter-by-geography aggregates. Neither export contains raw source rows.

## Static storage

The GitHub Pages application stores compact financial rows in `data/rows/*.js`. State, county, and urban-area boundary assets load only when required. All calculations and exports run in the visitor's browser.
