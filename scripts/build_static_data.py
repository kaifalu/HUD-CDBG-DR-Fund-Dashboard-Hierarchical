#!/usr/bin/env python3
"""Build the narrative-free static data assets used by the GitHub Pages dashboard.

The input is a processed financial file that already contains state, county,
city/place, and urban-area matching fields. The output contains only financial
and geographic data; no narrative file is read or generated.

Example
-------
python scripts/build_static_data.py \
  --processed-dir ../reproduction/processed \
  --site-dir .
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

FILTER_COLUMNS = [
    ("Year", "years", "Year"),
    ("Disaster Type", "disasterTypes", "Disaster Type"),
    ("Grantee", "grantees", "Grantee"),
    ("Project Title", "projects", "Project"),
    ("Activity Responsible Org", "organizations", "Activity Responsible Org"),
    ("Activity Type", "activityTypes", "Activity Type"),
    ("Activity Title", "activityTitles", "Activity Title"),
]

METRICS = [
    ("QPR Funds Obligated $", "Funds Obligated"),
    ("QPR Fund Expended $", "Fund Expended"),
    ("QPR Grant Disbursed $", "Grant Disbursed"),
    ("QPR Activity Program Income Disbursed $", "Program Income Disbursed"),
    ("QPR Activity Program Income Received $", "Program Income Received"),
]

GEO_SPECS: dict[str, dict[str, str]] = {
    "state": {"id_col": "state_fips", "name_col": "state_name", "source_geojson": "state.geojson"},
    "county": {"id_col": "county_geoid", "name_col": "county_display_name", "source_geojson": "county.geojson"},
    "city": {"id_col": "city_id", "name_col": "city_display_name", "lat_col": "city_lat", "lon_col": "city_lng"},
    "urban": {"id_col": "ua_geoid", "name_col": "ua_name", "source_geojson": "urban_area.geojson"},
}

COLUMNS = {
    "year": 0,
    "disasterType": 1,
    "grantee": 2,
    "project": 3,
    "organization": 4,
    "activityType": 5,
    "activityTitle": 6,
    "quarter": 7,
    "grantCode": 8,
    "activityCode": 9,
    "state": 10,
    "county": 11,
    "city": 12,
    "urban": 13,
    "countyMethod": 14,
    "countyConfidence": 15,
    "cityMethod": 16,
    "cityConfidence": 17,
    "urbanMethod": 18,
    "urbanConfidence": 19,
    "metricStart": 20,
}

METHOD_SPECS = [
    ("county_match_method", "countyMethods"),
    ("county_match_confidence", "countyConfidence"),
    ("city_match_method", "cityMethods"),
    ("city_match_confidence", "cityConfidence"),
    ("ua_match_method", "urbanMethods"),
    ("ua_match_confidence", "urbanConfidence"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--processed-dir", type=Path, required=True)
    parser.add_argument("--site-dir", type=Path, required=True)
    parser.add_argument("--rows-per-chunk", type=int, default=20_000)
    return parser.parse_args()


def clean_string(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    if not text or text.casefold() in {"nan", "none", "<na>"}:
        return None
    # CSV readers sometimes turn integral identifiers into strings ending in .0.
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    return text


def sorted_unique(series: pd.Series, *, year: bool = False) -> list[str]:
    values = {clean_string(value) for value in series.tolist()}
    values.discard(None)
    if year:
        return sorted(values, key=lambda value: (int(value) if value.isdigit() else 999_999, value))
    return sorted(values, key=lambda value: value.casefold())


def encode(series: pd.Series, values: list[str]) -> np.ndarray:
    lookup = {value: index for index, value in enumerate(values)}
    return np.asarray([lookup.get(clean_string(value), -1) for value in series.tolist()], dtype=np.int32)


def factor_codes(series: pd.Series) -> np.ndarray:
    normalized = series.map(lambda value: clean_string(value) or "")
    codes, _ = pd.factorize(normalized, sort=True)
    return codes.astype(np.int32)


def aligned_geography(frame: pd.DataFrame, spec: dict[str, str]) -> tuple[dict[str, Any], np.ndarray]:
    id_col = spec["id_col"]
    name_col = spec["name_col"]
    extra = [column for column in (spec.get("lat_col"), spec.get("lon_col")) if column]
    rows = frame[[id_col, name_col, *extra]].copy()
    rows[id_col] = rows[id_col].map(clean_string)
    rows[name_col] = rows[name_col].map(clean_string)
    rows = rows[rows[id_col].notna()].drop_duplicates(id_col)
    rows = rows.sort_values(name_col, key=lambda values: values.fillna("").str.casefold())
    ids = rows[id_col].astype(str).tolist()
    names = rows[name_col].fillna(rows[id_col]).astype(str).tolist()
    lookup = {value: index for index, value in enumerate(ids)}
    codes = np.asarray([lookup.get(clean_string(value), -1) for value in frame[id_col].tolist()], dtype=np.int32)
    output: dict[str, Any] = {"ids": ids, "names": names}
    if spec.get("lat_col"):
        lat = pd.to_numeric(rows[spec["lat_col"]], errors="coerce").round(6)
        lon = pd.to_numeric(rows[spec["lon_col"]], errors="coerce").round(6)
        output["lat"] = [None if pd.isna(value) else float(value) for value in lat]
        output["lon"] = [None if pd.isna(value) else float(value) for value in lon]
    return output, codes


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        value = float(value)
        return value if math.isfinite(value) else None
    if value is pd.NA:
        return None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def write_assignment(path: Path, expression: str, payload: Any, *, close_push: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(json_safe(payload), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    suffix = ");\n" if close_push else ";\n"
    path.write_text(f"{expression}{serialized}{suffix}", encoding="utf-8")


def minify_geojson(source: Path, destination: Path, key: str, valid_ids: set[str]) -> None:
    payload = json.loads(source.read_text(encoding="utf-8"))
    features = []
    for feature in payload.get("features", []):
        properties = feature.get("properties") or {}
        feature_id = clean_string(properties.get("id") or feature.get("id"))
        if feature_id is None or feature_id not in valid_ids:
            continue
        name = clean_string(properties.get("name") or properties.get("display_name")) or feature_id
        features.append({
            "type": "Feature",
            "properties": {"id": feature_id, "name": name},
            "geometry": feature.get("geometry"),
        })
    compact = {"type": "FeatureCollection", "features": features}
    write_assignment(destination, f'window.DISASTER_DASHBOARD_DATA.geojson["{key}"]=', compact)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def strip_narrative_metadata(value: Any) -> Any:
    """Recursively remove metadata keys associated with narrative inputs or outputs."""
    if isinstance(value, dict):
        return {
            key: strip_narrative_metadata(item)
            for key, item in value.items()
            if "narrative" not in str(key).casefold()
        }
    if isinstance(value, list):
        return [strip_narrative_metadata(item) for item in value]
    return value


def compute_activity_coverage(activity_codes: np.ndarray, geography_codes: np.ndarray) -> float:
    total = len(set(int(value) for value in activity_codes if value >= 0))
    mapped = len({int(activity_codes[index]) for index in range(len(activity_codes)) if activity_codes[index] >= 0 and geography_codes[index] >= 0})
    return round(100 * mapped / total, 2) if total else 0.0


def build(args: argparse.Namespace) -> None:
    processed = args.processed_dir.resolve()
    site = args.site_dir.resolve()
    data_dir = site / "data"
    rows_dir = data_dir / "rows"
    geography_dir = data_dir / "geography"

    finance_path = processed / "finance_processed.csv.gz"
    metadata_path = processed / "metadata.json"
    required = [finance_path, *(processed / spec["source_geojson"] for spec in GEO_SPECS.values() if spec.get("source_geojson"))]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing required processed files:\n" + "\n".join(missing))

    for directory in (rows_dir, geography_dir):
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir(parents=True, exist_ok=True)
    narratives_dir = data_dir / "narratives"
    if narratives_dir.exists():
        shutil.rmtree(narratives_dir)

    string_columns = {
        "Grant": "string",
        "Year": "string",
        "Disaster Type": "string",
        "Grantee": "string",
        "Project Title": "string",
        "Activity Number": "string",
        "Activity Title": "string",
        "Activity Type": "string",
        "Activity Responsible Org": "string",
        "QPR Actual Quarter": "string",
        "state_fips": "string",
        "state_name": "string",
        "county_geoid": "string",
        "county_display_name": "string",
        "city_id": "string",
        "city_display_name": "string",
        "ua_geoid": "string",
        "ua_name": "string",
        "county_match_method": "string",
        "county_match_confidence": "string",
        "city_match_method": "string",
        "city_match_confidence": "string",
        "ua_match_method": "string",
        "ua_match_confidence": "string",
    }
    frame = pd.read_csv(finance_path, dtype=string_columns, low_memory=False)
    source_rows = len(frame)
    frame = frame[frame["QPR Actual Quarter"].map(clean_string).notna()].copy().reset_index(drop=True)
    if frame.empty:
        raise ValueError("No quarter-level financial rows remain after filtering invalid QPR quarters.")

    filter_dictionaries: dict[str, list[str]] = {}
    filter_codes: list[np.ndarray] = []
    for column, key, _label in FILTER_COLUMNS:
        values = sorted_unique(frame[column], year=(column == "Year"))
        filter_dictionaries[key] = values
        filter_codes.append(encode(frame[column], values))

    if "quarter_order" in frame.columns:
        quarter_table = frame[["quarter_order", "QPR Actual Quarter"]].drop_duplicates().sort_values("quarter_order")
    else:
        extracted = frame["QPR Actual Quarter"].str.extract(r"(?P<year>\d{4})\s*Q(?P<quarter>[1-4])").astype(int)
        frame["__quarter_order"] = extracted["year"] * 4 + extracted["quarter"]
        quarter_table = frame[["__quarter_order", "QPR Actual Quarter"]].drop_duplicates().sort_values("__quarter_order")
    quarters = quarter_table["QPR Actual Quarter"].astype(str).tolist()
    quarter_lookup = {label: index for index, label in enumerate(quarters)}
    quarter_codes = np.asarray([quarter_lookup[str(value)] for value in frame["QPR Actual Quarter"]], dtype=np.int32)

    grant_codes = factor_codes(frame["Grant"])
    activity_key = frame["Grant"].astype("string").fillna("") + "\x1f" + frame["Activity Number"].astype("string").fillna("")
    activity_codes = factor_codes(activity_key)

    geography: dict[str, Any] = {}
    geography_codes: dict[str, np.ndarray] = {}
    for key, spec in GEO_SPECS.items():
        geography[key], geography_codes[key] = aligned_geography(frame, spec)

    method_dictionaries: dict[str, list[str]] = {}
    method_codes: list[np.ndarray] = []
    for column, key in METHOD_SPECS:
        values = sorted_unique(frame[column])
        method_dictionaries[key] = values
        method_codes.append(encode(frame[column], values))

    metric_arrays = [
        pd.to_numeric(frame[column], errors="coerce").fillna(0).round(2).to_numpy(dtype=float)
        for column, _short in METRICS
    ]

    row_files: list[str] = []
    rows_per_chunk = max(1_000, int(args.rows_per_chunk))
    for chunk_number, start in enumerate(range(0, len(frame), rows_per_chunk)):
        stop = min(len(frame), start + rows_per_chunk)
        rows: list[list[Any]] = []
        for index in range(start, stop):
            rows.append([
                *[int(codes[index]) for codes in filter_codes],
                int(quarter_codes[index]),
                int(grant_codes[index]),
                int(activity_codes[index]),
                int(geography_codes["state"][index]),
                int(geography_codes["county"][index]),
                int(geography_codes["city"][index]),
                int(geography_codes["urban"][index]),
                *[int(codes[index]) for codes in method_codes],
                *[float(values[index]) for values in metric_arrays],
            ])
        filename = f"rows_{chunk_number:03d}.js"
        write_assignment(rows_dir / filename, "window.DISASTER_DASHBOARD_DATA.rowChunks.push(", rows, close_push=True)
        row_files.append(f"data/rows/{filename}")

    geo_files: dict[str, str] = {}
    for key, spec in GEO_SPECS.items():
        source_name = spec.get("source_geojson")
        if not source_name:
            continue
        destination = geography_dir / f"{key}.js"
        minify_geojson(processed / source_name, destination, key, set(geography[key]["ids"]))
        geo_files[key] = f"data/geography/{key}.js"

    source_metadata: dict[str, Any] = {}
    if metadata_path.exists():
        source_metadata = strip_narrative_metadata(json.loads(metadata_path.read_text(encoding="utf-8")))
    metadata = dict(source_metadata)
    metadata.update({
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_finance_rows": int(metadata.get("source_finance_rows", source_rows)),
        "dashboard_finance_rows": int(len(frame)),
        "excluded_summary_rows_without_quarter": int(metadata.get("excluded_summary_rows_without_quarter", source_rows - len(frame))),
        "state_mapping_coverage_pct": round(100 * float(np.mean(geography_codes["state"] >= 0)), 2),
        "county_enhanced_row_coverage_pct": round(100 * float(np.mean(geography_codes["county"] >= 0)), 2),
        "city_matched_row_coverage_pct": round(100 * float(np.mean(geography_codes["city"] >= 0)), 2),
        "urban_area_row_coverage_pct": round(100 * float(np.mean(geography_codes["urban"] >= 0)), 2),
        "county_enhanced_activity_coverage_pct": compute_activity_coverage(activity_codes, geography_codes["county"]),
        "city_matched_activity_coverage_pct": compute_activity_coverage(activity_codes, geography_codes["city"]),
        "urban_area_activity_coverage_pct": compute_activity_coverage(activity_codes, geography_codes["urban"]),
        "unique_grants": int(len(set(int(value) for value in grant_codes))),
        "unique_grantees": int(len(filter_dictionaries["grantees"])),
        "unique_projects": int(len(filter_dictionaries["projects"])),
        "unique_activities": int(len(set(int(value) for value in activity_codes))),
        "quarter_min": quarters[0],
        "quarter_max": quarters[-1],
        "metric_columns": [column for column, _short in METRICS],
        "deployment_runtime": "Static HTML/CSS/JavaScript on GitHub Pages; no server required",
        "static_finance_storage": "Dictionary-encoded quarter-level rows split into JavaScript chunks and loaded in the browser",
        "static_server_side_authentication": False,
        "quick_report_mode": "Single-area or two-scenario one-page decision report with map, trend, top-five ranking, key takeaways, and aggregate exports",
        "report_export_note": "Reports are generated entirely in the browser and can be downloaded as PNG, printed/saved as a one-page PDF, or exported as aggregate CSV.",
    })

    bootstrap = {
        "schemaVersion": 2,
        "generatedFor": "GitHub Pages static dashboard with Quick Report decision tool",
        "metadata": metadata,
        "columns": COLUMNS,
        "filters": [{"column": column, "key": key, "label": label} for column, key, label in FILTER_COLUMNS],
        "filterDictionaries": filter_dictionaries,
        "quarters": quarters,
        "metrics": [{"index": index, "label": column, "shortLabel": short} for index, (column, short) in enumerate(METRICS)],
        "geography": geography,
        "geographyLevels": [
            {"key": "state", "label": "State (direct assignment)", "displayLabel": "State", "column": COLUMNS["state"], "mapType": "polygon", "inferred": False, "methodColumn": None, "confidenceColumn": None},
            {"key": "county", "label": "County / county-equivalent (enhanced match)", "displayLabel": "County / county-equivalent", "column": COLUMNS["county"], "mapType": "polygon", "inferred": True, "methodColumn": COLUMNS["countyMethod"], "confidenceColumn": COLUMNS["countyConfidence"], "methodDictionary": "countyMethods", "confidenceDictionary": "countyConfidence"},
            {"key": "city", "label": "City / populated place (matched point)", "displayLabel": "City / populated place", "column": COLUMNS["city"], "mapType": "point", "inferred": True, "methodColumn": COLUMNS["cityMethod"], "confidenceColumn": COLUMNS["cityConfidence"], "methodDictionary": "cityMethods", "confidenceDictionary": "cityConfidence"},
            {"key": "urban", "label": "2010 Census urban area (secondary match)", "displayLabel": "2010 Census urban area", "column": COLUMNS["urban"], "mapType": "polygon", "inferred": True, "methodColumn": COLUMNS["urbanMethod"], "confidenceColumn": COLUMNS["urbanConfidence"], "methodDictionary": "urbanMethods", "confidenceDictionary": "urbanConfidence"},
        ],
        "methodDictionaries": method_dictionaries,
        "rowChunkFiles": row_files,
        "geoFiles": geo_files,
        "rowChunks": [],
        "geojson": {},
    }
    write_assignment(data_dir / "bootstrap.js", "window.DISASTER_DASHBOARD_DATA=", bootstrap)
    (data_dir / "metadata.json").write_text(json.dumps(json_safe(metadata), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "finance_rows": len(frame),
        "row_chunks": len(row_files),
        "row_width": 25,
        "geographic_assets": geo_files,
        "bootstrap_sha256": sha256(data_dir / "bootstrap.js"),
        "site_dir": str(site),
    }, indent=2))


if __name__ == "__main__":
    build(parse_args())
