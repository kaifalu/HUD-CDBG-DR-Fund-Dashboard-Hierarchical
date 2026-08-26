#!/usr/bin/env python3
"""Validate the narrative-free CDBG-DR Fund Dashboard GitHub Pages package."""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import math
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

REQUIRED = [
    "index.html",
    ".nojekyll",
    "assets/app.css",
    "assets/app.js",
    "assets/vendor/plotly-3.3.1.min.js",
    "data/bootstrap.js",
    "data/metadata.json",
    "README.md",
    "USER_GUIDE.md",
    "DATA_METHODS.md",
    "GITHUB_PAGES_SETUP.md",
    "REVISION_NOTES_V5.md",
]

RUNTIME_FILES_FOR_NARRATIVE_CHECK = [
    "index.html",
    "assets/app.js",
    "data/bootstrap.js",
]

FORBIDDEN_RUNTIME_PATTERNS = [
    "hasNarrative",
    "narrativeId",
    "narrativeChunks",
    "narrativeManifest",
    "Only show records with Narratives",
    "Linked Narratives",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-dir", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--write-json", type=Path, default=None)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_assignment(path: Path, prefix: str, suffix: str = ";") -> Any:
    text = path.read_text(encoding="utf-8").strip()
    if not text.startswith(prefix) or not text.endswith(suffix):
        raise ValueError(f"Unexpected JavaScript wrapper in {path}")
    return json.loads(text[len(prefix): -len(suffix)])


def parse_row_chunk(path: Path) -> list[list[Any]]:
    text = path.read_text(encoding="utf-8").strip()
    prefix = "window.DISASTER_DASHBOARD_DATA.rowChunks.push("
    suffix = ");"
    if not text.startswith(prefix) or not text.endswith(suffix):
        raise ValueError(f"Unexpected row-chunk wrapper in {path}")
    return json.loads(text[len(prefix): -len(suffix)])


def validate(site: Path) -> dict[str, Any]:
    site = site.resolve()
    errors: list[str] = []
    warnings: list[str] = []
    checks: dict[str, Any] = {}

    for relative in REQUIRED:
        if not (site / relative).is_file():
            errors.append(f"Missing required file: {relative}")

    if (site / "data/narratives").exists():
        errors.append("Narrative data directory is present: data/narratives")

    for relative in RUNTIME_FILES_FOR_NARRATIVE_CHECK:
        path = site / relative
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for pattern in FORBIDDEN_RUNTIME_PATTERNS:
            if pattern in text:
                errors.append(f"Forbidden narrative runtime pattern {pattern!r} found in {relative}")

    index_text = (site / "index.html").read_text(encoding="utf-8") if (site / "index.html").exists() else ""
    required_ids = [
        "mode-tab-quick", "mode-tab-explore", "quick-report-view", "explore-view",
        "qr-report-type", "qr-geo-level", "qr-metric", "qr-plot-basis",
        "qr-generate", "qr-download-png", "qr-print-pdf", "qr-download-csv",
        "panel-grid",
    ]
    missing_ids = [item for item in required_ids if f'id="{item}"' not in index_text]
    if missing_ids:
        errors.append("Missing Quick Report/Explore interface IDs: " + ", ".join(missing_ids))
    checks["required_interface_ids"] = len(required_ids) - len(missing_ids)
    checks["quick_report_is_default"] = 'id="mode-tab-quick" class="mode-tab active"' in index_text and 'id="quick-report-view"' in index_text

    bootstrap_path = site / "data/bootstrap.js"
    bootstrap: dict[str, Any] = {}
    if bootstrap_path.exists():
        try:
            bootstrap = parse_assignment(bootstrap_path, "window.DISASTER_DASHBOARD_DATA=")
        except Exception as exc:
            errors.append(f"Cannot parse data/bootstrap.js: {exc}")

    if bootstrap:
        checks["schema_version"] = bootstrap.get("schemaVersion")
        if bootstrap.get("schemaVersion") != 2:
            errors.append("bootstrap schemaVersion must be 2")
        columns = bootstrap.get("columns") or {}
        expected_columns = {
            "year": 0, "disasterType": 1, "grantee": 2, "project": 3,
            "organization": 4, "activityType": 5, "activityTitle": 6,
            "quarter": 7, "grantCode": 8, "activityCode": 9,
            "state": 10, "county": 11, "city": 12, "urban": 13,
            "countyMethod": 14, "countyConfidence": 15,
            "cityMethod": 16, "cityConfidence": 17,
            "urbanMethod": 18, "urbanConfidence": 19, "metricStart": 20,
        }
        if columns != expected_columns:
            errors.append("bootstrap columns do not match the narrative-free 25-value row schema")
        if any("narrative" in str(key).casefold() for key in bootstrap.keys()):
            errors.append("Narrative key remains at the bootstrap top level")
        if any("narrative" in str(key).casefold() for key in (bootstrap.get("metadata") or {})):
            errors.append("Narrative metadata remains in bootstrap.metadata")

        row_count = 0
        row_widths: set[int] = set()
        nonfinite_values = 0
        geography_bounds_errors = 0
        row_files = bootstrap.get("rowChunkFiles") or []
        for relative in row_files:
            path = site / relative
            if not path.is_file():
                errors.append(f"Missing row chunk: {relative}")
                continue
            try:
                rows = parse_row_chunk(path)
            except Exception as exc:
                errors.append(str(exc))
                continue
            row_count += len(rows)
            for row in rows:
                row_widths.add(len(row))
                if len(row) != 25:
                    continue
                for value in row[20:25]:
                    if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                        nonfinite_values += 1
                for key, position in (("state", 10), ("county", 11), ("city", 12), ("urban", 13)):
                    code = row[position]
                    size = len((bootstrap.get("geography") or {}).get(key, {}).get("ids", []))
                    if code < -1 or code >= size:
                        geography_bounds_errors += 1
        checks["row_chunks"] = len(row_files)
        checks["finance_rows"] = row_count
        checks["row_widths"] = sorted(row_widths)
        checks["nonfinite_financial_values"] = nonfinite_values
        checks["geography_code_errors"] = geography_bounds_errors
        expected_rows = int((bootstrap.get("metadata") or {}).get("dashboard_finance_rows", -1))
        if row_count != expected_rows:
            errors.append(f"Row total {row_count:,} does not match metadata total {expected_rows:,}")
        if row_widths != {25}:
            errors.append(f"Unexpected row widths: {sorted(row_widths)}")
        if nonfinite_values:
            errors.append(f"Found {nonfinite_values} nonfinite financial values")
        if geography_bounds_errors:
            errors.append(f"Found {geography_bounds_errors} out-of-range geography codes")

        geography_checks: dict[str, Any] = {}
        for key, relative in (bootstrap.get("geoFiles") or {}).items():
            path = site / relative
            if not path.is_file():
                errors.append(f"Missing geography asset: {relative}")
                continue
            try:
                payload = parse_assignment(path, f'window.DISASTER_DASHBOARD_DATA.geojson["{key}"]=')
                features = payload.get("features", [])
                ids = {str(feature.get("properties", {}).get("id", "")) for feature in features}
                expected_ids = set(str(value) for value in bootstrap["geography"][key]["ids"])
                missing = expected_ids - ids
                geography_checks[key] = {"features": len(features), "missing_expected_ids": len(missing)}
                if missing:
                    errors.append(f"Geography asset {key} is missing {len(missing)} expected IDs")
            except Exception as exc:
                errors.append(f"Cannot parse geography asset {relative}: {exc}")
        checks["geography_assets"] = geography_checks

    node = shutil.which("node")
    if node:
        js_results = {}
        for relative in ("assets/app.js", "data/bootstrap.js"):
            result = subprocess.run([node, "--check", str(site / relative)], capture_output=True, text=True)
            js_results[relative] = result.returncode == 0
            if result.returncode != 0:
                errors.append(f"Node syntax check failed for {relative}: {result.stderr.strip()}")
        checks["node_syntax"] = js_results
    else:
        warnings.append("Node.js not available; JavaScript syntax check skipped")

    standalone = site / "HUD-CDBG-DR-Fund-Dashboard-Hierarchical.html"
    if standalone.exists():
        standalone_text = standalone.read_text(encoding="utf-8", errors="replace")
        checks["self_contained_html_bytes"] = standalone.stat().st_size
        packed_pattern = re.compile(r'<script type="application/x-cdbg-gzip" data-cdbg-path="([^"]+)">\s*(.*?)\s*</script>', re.S)
        packed_assets = packed_pattern.findall(standalone_text)
        checks["self_contained_packed_assets"] = len(packed_assets)
        packed_mismatches = []
        packed_narrative_assets = []
        for relative, encoded in packed_assets:
            try:
                unpacked = gzip.decompress(base64.b64decode(re.sub(r"\s+", "", encoded)))
                source = site / relative
                if not source.is_file() or hashlib.sha256(unpacked).digest() != hashlib.sha256(source.read_bytes()).digest():
                    packed_mismatches.append(relative)
                if "narrative" in relative.casefold() or b"narrativeChunks" in unpacked or b"hasNarrative" in unpacked:
                    packed_narrative_assets.append(relative)
            except Exception:
                packed_mismatches.append(relative)
        checks["self_contained_asset_mismatches"] = packed_mismatches
        checks["self_contained_narrative_assets"] = packed_narrative_assets
        if packed_mismatches:
            errors.append("Self-contained packed assets do not match source files: " + ", ".join(packed_mismatches))
        if packed_narrative_assets:
            errors.append("Narrative data remains in self-contained packed assets: " + ", ".join(packed_narrative_assets))
        if "narrativeChunks" in standalone_text or "hasNarrative" in standalone_text:
            errors.append("Narrative runtime fields remain in self-contained HTML")
        if 'data-cdbg-path="data/bootstrap.js"' not in standalone_text:
            errors.append("Self-contained HTML does not contain packed bootstrap.js")
    else:
        warnings.append("Self-contained HTML has not been generated")

    # GitHub Pages has a 100 MB per-file repository limit. Warn well below it.
    oversized = []
    for path in site.rglob("*"):
        if path.is_file() and path.stat().st_size > 90_000_000:
            oversized.append(str(path.relative_to(site)))
    checks["files_over_90mb"] = oversized
    if oversized:
        errors.append("Files exceed 90 MB: " + ", ".join(oversized))

    checks["package_file_count"] = sum(1 for path in site.rglob("*") if path.is_file())
    checks["package_bytes"] = sum(path.stat().st_size for path in site.rglob("*") if path.is_file())
    checks["index_sha256"] = sha256(site / "index.html") if (site / "index.html").exists() else None
    checks["app_js_sha256"] = sha256(site / "assets/app.js") if (site / "assets/app.js").exists() else None

    return {"ok": not errors, "errors": errors, "warnings": warnings, "checks": checks}


def main() -> None:
    args = parse_args()
    result = validate(args.site_dir)
    output = json.dumps(result, indent=2)
    print(output)
    if args.write_json:
        args.write_json.parent.mkdir(parents=True, exist_ok=True)
        args.write_json.write_text(output + "\n", encoding="utf-8")
    raise SystemExit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
