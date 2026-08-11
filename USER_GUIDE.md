# CDBG-DR Fund Dashboard user guide

## Two-panel comparison

Panel 1 and Panel 2 are independent. Use them to compare different disaster
types, time periods, grantees, programs, activity categories, geographic
levels, geographic scopes, financial measures, and cumulative versus quarterly
patterns.

## Seven hierarchical filters

The filters are:

1. Year
2. Disaster Type
3. Grantee
4. Project
5. Activity Responsible Organization
6. Activity Type
7. Activity Title

Downstream choices update after every selection. To prevent extremely long
menus, Project, Responsible Organization, and Activity Type activate after a
Grantee is selected. Activity Title activates after at least one Project,
Organization, or Activity Type is selected.

## Narrative filtering and narrative excerpts

Selecting **Only show records with nonempty narratives** retains only finance
rows with an exact narrative link for the same Grant, Activity Number, and QPR
quarter. It is not approximate text matching.

Open **Linked narrative records** to load up to 40 recent narrative excerpts for
the active selection. The static public package stores excerpts up to 1,400
characters and loads them by year on demand. The aggregate CSV excludes raw
narrative text.

## Geographic views

- **State:** direct state/territory assignment; 100% coverage.
- **County/county-equivalent:** direct county evidence plus city-primary-county
  inference; 65.68% finance-row coverage.
- **City/populated place:** matched point locations from the supplied U.S.
  cities data; 37.39% finance-row coverage. Points are not municipal polygons.
- **2010 Census urban area:** secondary urban-area polygons; 29.69% finance-row
  coverage.

Selecting a specific geography filters the KPIs, map, funding plot, narratives,
and aggregate download consistently. Unmapped records are excluded when a
county, city/place, or urban-area view is selected, and mapping coverage is
shown in the KPI cards.

## Financial measures

The funding plot can display any combination of:

- QPR Funds Obligated
- QPR Fund Expended
- QPR Grant Disbursed
- QPR Activity Program Income Disbursed
- QPR Activity Program Income Received

The map uses one selected measure. **Quarterly** plots source-quarter
transactions. **Cumulative** plots chronological cumulative net sums; a line
may fall after a correction, reversal, or deobligation.

## Downloads

### Aggregate CSV

The browser creates one CSV containing summarized quarter-by-geography values
for the active mapped selection. It includes:

- active filter and geography labels;
- quarter;
- geography name;
- record, grant, project, and activity counts;
- narrative-linked record count and share;
- match-method and confidence information where applicable;
- quarterly and cumulative values for selected financial metrics.

It does not contain raw source rows or raw full narrative text.

### Map PNG and funding-plot PNG

Plotly generates PNG files in the browser from the current view. The map export
requires WebGL. Browser download or pop-up restrictions may require permission
the first time.

## Performance

Initial loading processes 128,382 finance rows in the browser. Keep the tab open
while the progress screen is visible. State/county/urban boundaries and annual
narrative excerpts load only when requested.
