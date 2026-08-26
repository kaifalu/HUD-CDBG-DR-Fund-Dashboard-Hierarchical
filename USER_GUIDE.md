# CDBG-DR Fund Dashboard User Guide

## 1. Choose an interaction mode

The dashboard opens in **Quick Report** mode. Select **Explore & Compare** when you need the full two-panel analytical interface.

## 2. Quick Report

### Step 1 — Select report type

- **Single-area report** summarizes one geographic and program selection.
- **Comparison report** compares Scenario A with Scenario B using the same geographic level and financial measure. The scenarios may differ by location, reporting period, disaster, grantee, project, or activity type.

### Step 2 — Select shared settings

Choose a geographic level, one financial measure, and a trend basis:

- **Quarterly net** displays source-quarter transactions.
- **Cumulative net** displays their chronological running total.

Available measures are funds obligated, funds expended, grant disbursed, activity program income disbursed, and activity program income received.

### Step 3 — Define Scenario A

Choose a location and time horizon. Presets include all reporting periods and the latest one, three, or five years. Select **Custom QPR-quarter range** to set exact start and end quarters.

Open **More filters** to narrow the report by disaster/appropriation year, disaster type, grantee, project, or activity type. Project choices become available after a grantee is selected.

### Step 4 — Define Scenario B when comparing

Scenario B appears when **Comparison report** is selected. It uses Scenario A's time horizon by default. Clear **Use Scenario A time horizon** to define a different reporting period.

### Step 5 — Generate and export

Select **Generate one-page report**. The generated decision brief includes:

- four summary indicators;
- a map of the selected measure or the Scenario B minus Scenario A difference;
- a quarterly or cumulative funding trend;
- a top-five ranking;
- up to four automatically generated, rule-based takeaways; and
- financial and geographic interpretation notes.

Exports:

- **Download report PNG** creates a high-resolution image.
- **Print / Save as PDF** opens a print-ready landscape page. Choose the browser's PDF destination.
- **Download report data CSV** saves the aggregate report inputs, time series, ranking, takeaways, and methodology notes.

## 3. Explore & Compare

Each panel has independent controls. Select values in the following order:

1. Year
2. Disaster Type
3. Grantee
4. Project
5. Activity Responsible Organization
6. Activity Type
7. Activity Title

Downstream choices update after an upstream filter changes. Each panel also provides:

- geographic level and geographic scope;
- a map measure;
- five selectable timeline measures;
- quarterly or cumulative timeline basis;
- dynamic indicators; and
- aggregate CSV, map PNG, and timeline PNG downloads.

The two panels do not force identical selections, allowing comparison across locations, disasters, grantees, projects, activities, and reporting periods.

## 4. Geographic interpretation

- **State** is assigned directly from the grantee state.
- **County/county-equivalent** combines direct county evidence with city-derived primary-county assignments.
- **City/place** is a matched point from the supplied cities database, not a municipal boundary.
- **Urban area** uses the 2010 Census urban-area layer as a secondary analytical geography.

Quick Reports display mapping coverage for the active nongeographic filters. Unmapped records are excluded from county, city/place, and urban-area maps and geographic totals.

## 5. Empty or unexpected results

A zero value may mean that no records match the combined filters or that source-quarter transactions net to zero. Broaden the location, time horizon, or optional filters. For county, city/place, and urban-area analysis, also review the displayed mapping coverage.

## 6. Browser recommendations

Use a current Chrome, Edge, Firefox, or Safari browser with JavaScript and hardware acceleration enabled. The first visit loads the prepared financial data into browser memory and may take several seconds.
