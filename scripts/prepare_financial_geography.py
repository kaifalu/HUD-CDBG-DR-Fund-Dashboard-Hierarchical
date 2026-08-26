#!/usr/bin/env python3
"""Create the narrative-free processed financial file used by the static dashboard.

This script joins the raw HUD QPR financial CSV to the supplied activity-level
geography crosswalk. The crosswalk embodies the previously completed state,
county, city/place, and urban-area matching work. No narrative input is read.

Example
-------
python scripts/prepare_financial_geography.py \
  --financial-csv "F31 - QPR - Fin Data by Project, Activity and Quarter_20250214.csv" \
  --geography-crosswalk activity_geography_crosswalk.csv.gz \
  --output-dir data/processed
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

JOIN_COLUMNS = [
    "Grant",
    "Grantee State",
    "Grantee",
    "Project Title",
    "Activity Number",
    "Activity Title",
    "Activity Type",
    "Activity Responsible Org",
]

METRIC_COLUMNS = [
    "QPR Funds Obligated $",
    "QPR Fund Expended $",
    "QPR Grant Disbursed $",
    "QPR Activity Program Income Disbursed $",
    "QPR Activity Program Income Received $",
]

GEOGRAPHY_COLUMNS = [
    "state_fips", "state_abbr", "state_name",
    "county_geoid", "county_name", "county_display_name",
    "county_match_source", "county_match_method", "county_match_confidence",
    "county_match_score", "county_match_basis",
    "city_id", "city_name", "city_display_name", "city_lat", "city_lng",
    "city_population", "city_incorporated", "city_county_geoid", "city_county_name",
    "city_match_source", "city_match_method", "city_match_confidence",
    "city_match_score", "city_match_alias", "city_match_evidence_sources",
    "city_match_ambiguous",
    "ua_geoid", "ua_name", "ua_match_source", "ua_match_method", "ua_match_confidence",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--financial-csv", type=Path, required=True)
    parser.add_argument("--geography-crosswalk", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def clean_text(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def appropriation_parts(value: Any) -> tuple[str | None, str | None]:
    text = clean_text(value)
    if text is None:
        return None, None
    if text == "MIT":
        return "2015-2018", "MIT"
    match = re.match(r"^(\d{4}(?:/\d{2})?)\s+(.+)$", text)
    if match:
        return match.group(1), match.group(2).strip()
    return text, text


def quarter_order(value: Any) -> int | None:
    text = clean_text(value)
    if text is None:
        return None
    match = re.match(r"^(\d{4})\s+Q([1-4])$", text)
    if not match:
        return None
    return int(match.group(1)) * 4 + int(match.group(2))


def normalized_key(frame: pd.DataFrame, column: str) -> pd.Series:
    return frame[column].astype("string").fillna("<MISSING>").str.strip()


def activity_coverage(frame: pd.DataFrame, column: str) -> float:
    total = frame[["Grant", "Activity Number"]].drop_duplicates().shape[0]
    mapped = frame.loc[frame[column].notna(), ["Grant", "Activity Number"]].drop_duplicates().shape[0]
    return round(100 * mapped / total, 2) if total else 0.0


def build(args: argparse.Namespace) -> None:
    financial_path = args.financial_csv.resolve()
    crosswalk_path = args.geography_crosswalk.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    string_columns = {column: "string" for column in JOIN_COLUMNS + [
        "Appropriation", "Disaster Type", "Project Number", "QPR Actual Quarter"
    ]}
    finance = pd.read_csv(financial_path, dtype=string_columns, low_memory=False)
    source_rows = len(finance)
    finance = finance[finance["QPR Actual Quarter"].notna()].copy().reset_index(drop=True)

    parts = finance["Appropriation"].map(appropriation_parts)
    finance.insert(2, "Year", [part[0] for part in parts])
    finance.insert(3, "Disaster Abbr", [part[1] for part in parts])
    finance["quarter_order"] = finance["QPR Actual Quarter"].map(quarter_order).astype("Int64")
    if finance["quarter_order"].isna().any():
        bad = sorted(finance.loc[finance["quarter_order"].isna(), "QPR Actual Quarter"].dropna().unique().tolist())
        raise ValueError(f"Unrecognized QPR quarter labels: {bad}")

    crosswalk_dtype = {column: "string" for column in JOIN_COLUMNS + [
        "state_fips", "state_abbr", "state_name", "county_geoid", "county_name",
        "county_display_name", "city_id", "city_name", "city_display_name",
        "city_county_geoid", "city_county_name", "ua_geoid", "ua_name",
        "county_match_source", "county_match_method", "county_match_confidence",
        "county_match_basis", "city_match_source", "city_match_method",
        "city_match_confidence", "city_match_alias", "city_match_evidence_sources",
        "ua_match_source", "ua_match_method", "ua_match_confidence",
    ]}
    crosswalk = pd.read_csv(crosswalk_path, dtype=crosswalk_dtype, low_memory=False)

    # A small number of source-quarter rows omit the grantee state even though
    # the grant itself has one unambiguous state/territory. Restore those values
    # from the activity geography crosswalk before constructing the join keys.
    grant_state_candidates = (
        crosswalk[["Grant", "Grantee State"]]
        .dropna()
        .drop_duplicates()
        .groupby("Grant")["Grantee State"]
        .agg(lambda values: values.iloc[0] if values.nunique() == 1 else pd.NA)
    )
    finance["Grantee State"] = finance["Grantee State"].fillna(finance["Grant"].map(grant_state_candidates))

    duplicate_keys = crosswalk.duplicated(JOIN_COLUMNS, keep=False)
    if duplicate_keys.any():
        raise ValueError(f"Geography crosswalk contains {int(duplicate_keys.sum())} duplicate activity-key rows")

    # Merge through normalized temporary keys so blank strings and missing values
    # have deterministic behavior across pandas versions.
    temp_keys = []
    for index, column in enumerate(JOIN_COLUMNS):
        key = f"__join_{index}"
        temp_keys.append(key)
        finance[key] = normalized_key(finance, column)
        crosswalk[key] = normalized_key(crosswalk, column)

    geo_columns = [column for column in GEOGRAPHY_COLUMNS if column in crosswalk.columns]
    merged = finance.merge(
        crosswalk[temp_keys + geo_columns],
        on=temp_keys,
        how="left",
        validate="many_to_one",
        sort=False,
    ).drop(columns=temp_keys)

    # State assignment is direct from the grantee state and should not depend
    # on an exact activity-key match. Fill any unmatched state attributes from
    # the crosswalk's one-to-one state lookup.
    state_lookup = (
        crosswalk[["Grantee State", "state_fips", "state_abbr", "state_name"]]
        .dropna(subset=["Grantee State"])
        .drop_duplicates()
        .groupby("Grantee State", as_index=True)
        .first()
    )
    for column in ["state_fips", "state_abbr", "state_name"]:
        fallback = merged["Grantee State"].map(state_lookup[column])
        merged[column] = merged[column].fillna(fallback)

    output_columns = [
        "Grant", "Appropriation", "Year", "Disaster Abbr", "Disaster Type",
        "Grantee", "Grantee State",
        "Project Number", "Project Title", "Activity Number", "Activity Title",
        "Activity Type", "Activity Responsible Org", "QPR Actual Begin Date",
        "QPR Actual Quarter", "quarter_order", *METRIC_COLUMNS,
        *[column for column in GEOGRAPHY_COLUMNS if column in merged.columns],
    ]
    # Preserve order while preventing duplicate geography columns. Duplicate
    # column labels make pandas return DataFrames instead of Series and can
    # break coverage calculations and JSON metadata generation.
    output_columns = list(dict.fromkeys(output_columns))
    merged = merged[output_columns]

    output_file = output_dir / "finance_processed.csv.gz"
    merged.to_csv(output_file, index=False, compression="gzip")

    activity_count = merged[["Grant", "Activity Number"]].drop_duplicates().shape[0]
    metadata = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_finance_rows": source_rows,
        "dashboard_finance_rows": len(merged),
        "excluded_summary_rows_without_quarter": source_rows - len(merged),
        "unique_grants": int(merged["Grant"].nunique(dropna=True)),
        "unique_grantees": int(merged["Grantee"].nunique(dropna=True)),
        "unique_projects": int(merged["Project Title"].nunique(dropna=True)),
        "unique_activities": int(activity_count),
        "quarter_min": merged.sort_values("quarter_order")["QPR Actual Quarter"].iloc[0],
        "quarter_max": merged.sort_values("quarter_order")["QPR Actual Quarter"].iloc[-1],
        "metric_columns": METRIC_COLUMNS,
        "state_mapping_coverage_pct": round(100 * merged["state_fips"].notna().mean(), 2),
        "county_enhanced_row_coverage_pct": round(100 * merged["county_geoid"].notna().mean(), 2),
        "city_matched_row_coverage_pct": round(100 * merged["city_id"].notna().mean(), 2),
        "urban_area_row_coverage_pct": round(100 * merged["ua_geoid"].notna().mean(), 2),
        "county_enhanced_activity_coverage_pct": activity_coverage(merged, "county_geoid"),
        "city_matched_activity_coverage_pct": activity_coverage(merged, "city_id"),
        "urban_area_activity_coverage_pct": activity_coverage(merged, "ua_geoid"),
        "input_sha256": {
            "financial": sha256(financial_path),
            "activity_geography_crosswalk": sha256(crosswalk_path),
        },
    }
    (output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    (output_dir / "preparation_log.txt").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "output": str(output_file),
        "rows": len(merged),
        "activities": activity_count,
        "county_row_coverage_pct": metadata["county_enhanced_row_coverage_pct"],
        "city_row_coverage_pct": metadata["city_matched_row_coverage_pct"],
        "urban_row_coverage_pct": metadata["urban_area_row_coverage_pct"],
    }, indent=2))


if __name__ == "__main__":
    build(parse_args())
