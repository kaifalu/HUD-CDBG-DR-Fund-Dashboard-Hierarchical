# Data preparation and geographic matching methods

## Source inputs

The upstream preparation workflow combines:

- one quarter-level QPR financial table;
- two QPR activity narrative files;
- 2018 Census state and county/county-equivalent cartographic boundaries;
- the 2010 Census urban-area cartographic boundary layer;
- the user-supplied U.S. cities/place file.

The complete reproduction package includes the raw inputs, processed data,
Python preprocessing application, matching QA outputs, and this static-site
builder. The Pages deployment package intentionally excludes raw source data.

## Financial records

The financial source contains 130,605 rows. The dashboard uses 128,382 rows with
a recognized QPR quarter. The 2,223 source summary records without a valid
quarter are excluded from maps and time-series calculations. Dollar columns are
quarter transactions. Cumulative values are chronological cumulative net sums.

## Narrative linking

The two narrative files contain 206,073 source rows and 174,200 nonempty
narrative records. Narratives are joined by the exact combination of:

1. Grant
2. Activity Number
3. QPR quarter

This links 95,530 finance records, or 74.41% of dashboard rows. The static
edition retains public excerpts of up to 1,400 characters in year-partitioned
JavaScript chunks. The complete reproduction files retain the upstream
processed narrative data.

## State assignment

State or territory is assigned from `Grantee State`; missing values are
recovered only from a recognized state/territory FIPS component in the Grant
identifier. Finance-row state coverage is 100.00%.

## Direct county/county-equivalent matching

Within the assigned state, the matcher examines Grantee, Activity Responsible
Organization, Activity Title, and Project Title. It searches for Census county
or county-equivalent names with appropriate legal types such as county, parish,
borough, census area, municipio, district, municipality, or independent city.
Longest exact token matches are ranked by source reliability and supporting
structure. Direct county evidence maps 31.12% of finance rows.

## City/place matching using the supplied U.S. cities file

The city matcher uses state-constrained aliases from 31,257 city/place rows. It
does not call an external geocoder. Accepted evidence includes:

- an exact local-government grantee;
- explicit `City of`, `Town of`, or `Village of` structures;
- an exact locality organization;
- a locality followed by a recognized authority or department;
- a clearly delimited activity-title or project-title location.

Generic or ambiguous terms are blocked unless stronger structure or population
evidence is present. Candidates are ranked using source, method, alias length,
population, incorporation status, duplicate-name ambiguity, and conflict checks.
Each accepted activity carries source, method, score, confidence, matched alias,
ambiguity flag, coordinates, and city-file primary county.

The final city/place match covers 37.39% of finance rows and 39.47% of
activities: 5,837 high-confidence and 538 medium-confidence activity matches.

## Enhanced county matching

When no direct county is detected but a city/place match is accepted, the
city-file primary county is used as a medium-confidence approximation. Direct
county evidence takes precedence. City-derived primary county adds 34.56
percentage points of finance-row coverage, producing 65.68% total enhanced
county coverage and 64.92% activity coverage.

A populated place can span multiple counties. The city-derived county therefore
remains explicitly labeled as inferred.

## Urban-area linkage

Matched city coordinates are spatially linked to the supplied 2010 Census
urban-area polygons. Conservative text evidence may be retained when point
linkage is unavailable. The result covers 29.69% of finance rows and 31.34% of
activities. The layer is correctly identified as an urban-area geography, not a
city-limit layer.

## Static browser encoding

`scripts/build_static_data.py` converts processed data into a static schema:

- repeated strings are dictionary-encoded;
- finance records are stored as compact arrays in seven row chunks;
- state, county, and urban polygons are minified and loaded lazily;
- city locations remain longitude/latitude points;
- narrative excerpts are partitioned by QPR year and loaded only when opened;
- all paths are relative so a GitHub project site works under a repository
  subdirectory.

The static deployment package contains no SQLite database, Python runtime, raw
CSV, or shapefile archive.

## Audit metadata

`data/metadata.json` records source totals, coverage, method counts, notes, and
SHA-256 digests for all seven upstream inputs. The complete reproduction package
also contains the activity geography crosswalk, matching review files,
unmatched records, coverage summaries, and the upstream preparation log.
