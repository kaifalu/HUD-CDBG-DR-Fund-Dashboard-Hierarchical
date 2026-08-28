#!/usr/bin/env python3
"""Validate the privacy-screened CDBG-DR Fund Dashboard GitHub Pages package."""
from __future__ import annotations

import argparse
import base64
import csv
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
    "index.html", ".nojekyll", "assets/app.css", "assets/app.js",
    "assets/vendor/plotly-3.3.1.min.js", "data/bootstrap.js", "data/metadata.json",
    "README.md", "USER_GUIDE.md", "DATA_METHODS.md", "GITHUB_PAGES_SETUP.md",
    "REVISION_NOTES_V6.md", "PACKAGE_MANIFEST.md", "privacy/NARRATIVE_PRIVACY_METHOD.md",
    "privacy/narrative_activity_privacy_crosswalk.csv", "privacy/narrative_privacy_summary.json",
]
EXPECTED_COLUMNS = {
    "year": 0, "disasterType": 1, "grantee": 2, "project": 3,
    "organization": 4, "activityType": 5, "activityTitle": 6,
    "quarter": 7, "grantCode": 8, "activityCode": 9,
    "hasNarrative": 10, "narrativeId": 11,
    "state": 12, "county": 13, "city": 14, "urban": 15,
    "countyMethod": 16, "countyConfidence": 17,
    "cityMethod": 18, "cityConfidence": 19,
    "urbanMethod": 20, "urbanConfidence": 21, "metricStart": 22,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-dir", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--restricted-qa", type=Path, default=None,
                        help="Optional internal QA CSV; never package this file publicly.")
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
    return parse_assignment(path, "window.DISASTER_DASHBOARD_DATA.rowChunks.push(", ");")


def parse_narrative_chunk(path: Path, key: str) -> list[list[Any]]:
    prefix = f'window.DISASTER_DASHBOARD_DATA.narrativeChunks["{key}"]='
    return parse_assignment(path, prefix)


def validate(site: Path, restricted_qa: Path | None = None) -> dict[str, Any]:
    site = site.resolve()
    errors: list[str] = []
    warnings: list[str] = []
    checks: dict[str, Any] = {}

    for relative in REQUIRED:
        if not (site / relative).is_file():
            errors.append(f"Missing required file: {relative}")

    # Public package must never contain unsanitized/restricted narrative files.
    forbidden_names = []
    for path in site.rglob("*"):
        if not path.is_file():
            continue
        lower = path.name.casefold()
        if "restricted_narrative_address_qa" in lower or lower.startswith("a32 -") or "activity progress narratives2025" in lower:
            forbidden_names.append(str(path.relative_to(site)))
    checks["forbidden_public_files"] = forbidden_names
    if forbidden_names:
        errors.append("Restricted or raw narrative files are present in the public package: " + ", ".join(forbidden_names))

    index_path = site / "index.html"
    index_text = index_path.read_text(encoding="utf-8") if index_path.exists() else ""
    required_ids = [
        "mode-tab-explore", "mode-tab-quick", "explore-view", "quick-report-view",
        "qr-report-type", "qr-geo-level", "qr-metric", "qr-plot-basis", "qr-narrative-only",
        "qr-generate", "qr-download-png", "qr-print-pdf", "qr-download-csv", "panel-grid",
    ]
    missing_ids = [item for item in required_ids if f'id="{item}"' not in index_text]
    if missing_ids:
        errors.append("Missing required interface IDs: " + ", ".join(missing_ids))
    checks["required_interface_ids"] = len(required_ids) - len(missing_ids)
    explore_pos = index_text.find('id="mode-tab-explore"')
    quick_pos = index_text.find('id="mode-tab-quick"')
    checks["explore_first_and_default"] = (
        0 <= explore_pos < quick_pos
        and 'id="mode-tab-explore" class="mode-tab active"' in index_text
        and re.search(r'<section id="explore-view"[^>]*>', index_text) is not None
        and re.search(r'<section id="quick-report-view"[^>]*hidden', index_text) is not None
    )
    if not checks["explore_first_and_default"]:
        errors.append("Explore & Compare is not first and active by default")
    intro_sections = re.findall(r'<section class="intro-card[^>]*>(.*?)</section>', index_text, re.S)
    intro_paragraphs = [paragraph for section in intro_sections for paragraph in re.findall(r'<p[^>]*>(.*?)</p>', section, re.S)]
    checks["intro_paragraph_bold_tags"] = sum(1 for paragraph in intro_paragraphs if re.search(r'<(?:strong|b)\b', paragraph, re.I))
    checks["intro_card_count"] = len(intro_sections)
    if len(intro_sections) != 4:
        errors.append(f"Expected 4 overview cards; found {len(intro_sections)}")
    if checks["intro_paragraph_bold_tags"]:
        errors.append("Overview-card paragraph text still contains bold tags")
    footer_needles = ["CDBG-DR Fund Hierarchy Dashboard", "Supported by U.S. HUD", "Research · Education · Planning", "Kaifa.Lu@ttu.edu", "Kaifa Lu · CECREH"]
    missing_footer = [value for value in footer_needles if value not in index_text]
    checks["footer_missing_items"] = missing_footer
    if missing_footer:
        errors.append("Footer is missing: " + ", ".join(missing_footer))

    bootstrap: dict[str, Any] = {}
    bootstrap_path = site / "data/bootstrap.js"
    if bootstrap_path.exists():
        try:
            bootstrap = parse_assignment(bootstrap_path, "window.DISASTER_DASHBOARD_DATA=")
        except Exception as exc:
            errors.append(f"Cannot parse data/bootstrap.js: {exc}")

    narrative_by_id: dict[int, str] = {}
    if bootstrap:
        checks["schema_version"] = bootstrap.get("schemaVersion")
        if bootstrap.get("columns") != EXPECTED_COLUMNS:
            errors.append("bootstrap columns do not match the expected 27-value narrative-enabled row schema")
        metadata = bootstrap.get("metadata") or {}
        required_meta = [
            "dashboard_finance_rows", "finance_rows_with_narrative", "detected_address_mentions",
            "retained_public_address_mentions", "redacted_potential_single_family_address_mentions",
            "narrative_join_note", "narrative_privacy_screening",
        ]
        missing_meta = [key for key in required_meta if key not in metadata]
        if missing_meta:
            errors.append("Missing narrative/privacy metadata: " + ", ".join(missing_meta))

        row_count = 0
        row_widths: set[int] = set()
        nonfinite = 0
        geo_bounds = 0
        narrative_flag_rows = 0
        narrative_id_rows = 0
        for relative in bootstrap.get("rowChunkFiles") or []:
            path = site / relative
            if not path.is_file():
                errors.append(f"Missing row chunk: {relative}")
                continue
            try:
                rows = parse_row_chunk(path)
            except Exception as exc:
                errors.append(str(exc)); continue
            row_count += len(rows)
            for row in rows:
                row_widths.add(len(row))
                if len(row) != 27:
                    continue
                narrative_flag_rows += int(row[10] == 1)
                narrative_id_rows += int(row[11] >= 0)
                for value in row[22:27]:
                    if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                        nonfinite += 1
                for key, pos in (("state",12),("county",13),("city",14),("urban",15)):
                    size = len((bootstrap.get("geography") or {}).get(key, {}).get("ids", []))
                    if row[pos] < -1 or row[pos] >= size:
                        geo_bounds += 1
        checks.update({
            "finance_rows": row_count, "row_widths": sorted(row_widths),
            "narrative_flag_rows": narrative_flag_rows, "narrative_id_rows": narrative_id_rows,
            "nonfinite_financial_values": nonfinite, "geography_code_errors": geo_bounds,
            "row_chunks": len(bootstrap.get("rowChunkFiles") or []),
        })
        expected_rows = int(metadata.get("dashboard_finance_rows", -1))
        expected_narrative = int(metadata.get("finance_rows_with_narrative", -1))
        if row_count != expected_rows: errors.append(f"Row total {row_count:,} does not match metadata {expected_rows:,}")
        if row_widths != {27}: errors.append(f"Unexpected row widths: {sorted(row_widths)}")
        if narrative_flag_rows != expected_narrative or narrative_id_rows != expected_narrative:
            errors.append(f"Narrative-linked row counts do not match metadata ({narrative_flag_rows:,}/{narrative_id_rows:,} vs {expected_narrative:,})")
        if nonfinite: errors.append(f"Found {nonfinite} nonfinite financial values")
        if geo_bounds: errors.append(f"Found {geo_bounds} out-of-range geography codes")

        narrative_manifest = bootstrap.get("narrativeManifest") or {}
        narrative_chunks = 0
        narrative_pairs = 0
        open_markers = close_markers = redaction_markers = 0
        duplicate_ids = 0
        for year, entries in narrative_manifest.items():
            for entry in entries:
                narrative_chunks += 1
                relative, key = entry.get("file"), entry.get("key")
                path = site / str(relative)
                if not path.is_file():
                    errors.append(f"Missing narrative chunk: {relative}"); continue
                try:
                    pairs = parse_narrative_chunk(path, str(key))
                except Exception as exc:
                    errors.append(f"Cannot parse narrative chunk {relative}: {exc}"); continue
                for pair in pairs:
                    if not isinstance(pair, list) or len(pair) != 2:
                        errors.append(f"Malformed narrative entry in {relative}"); continue
                    narrative_id, text = int(pair[0]), str(pair[1])
                    if narrative_id in narrative_by_id: duplicate_ids += 1
                    narrative_by_id[narrative_id] = text
                    narrative_pairs += 1
                    open_markers += text.count("[[PUBLIC_ADDRESS]]")
                    close_markers += text.count("[[/PUBLIC_ADDRESS]]")
                    redaction_markers += text.count("[REDACTED — POTENTIAL SINGLE-FAMILY ADDRESS]")
                    if text.count("[[PUBLIC_ADDRESS]]") != text.count("[[/PUBLIC_ADDRESS]]"):
                        errors.append(f"Unbalanced public-address markers in narrative ID {narrative_id}")
        checks.update({
            "narrative_years": len(narrative_manifest), "narrative_chunks": narrative_chunks,
            "narrative_entries": narrative_pairs, "narrative_duplicate_ids": duplicate_ids,
            "public_address_markers_in_excerpts": open_markers,
            "redaction_markers_in_excerpts": redaction_markers,
        })
        if not narrative_manifest or not narrative_pairs:
            errors.append("No public sanitized narrative chunks were found")
        if duplicate_ids: errors.append(f"Found {duplicate_ids} duplicate narrative IDs")
        if open_markers != close_markers: errors.append("Public-address marker totals are unbalanced")
        if open_markers == 0 or redaction_markers == 0:
            errors.append("Public narrative excerpts do not contain both retained-address highlights and redaction placeholders")

        geography_checks: dict[str, Any] = {}
        for key, relative in (bootstrap.get("geoFiles") or {}).items():
            path = site / relative
            if not path.is_file():
                errors.append(f"Missing geography asset: {relative}"); continue
            try:
                payload = parse_assignment(path, f'window.DISASTER_DASHBOARD_DATA.geojson["{key}"]=')
                features = payload.get("features", [])
                ids = {str(feature.get("properties", {}).get("id", "")) for feature in features}
                expected_ids = set(str(value) for value in bootstrap["geography"][key]["ids"])
                missing = expected_ids - ids
                geography_checks[key] = {"features": len(features), "missing_expected_ids": len(missing)}
                if missing: errors.append(f"Geography asset {key} is missing {len(missing)} expected IDs")
            except Exception as exc:
                errors.append(f"Cannot parse geography asset {relative}: {exc}")
        checks["geography_assets"] = geography_checks

    # Internal restricted-QA cross-check by narrative ID. This proves redacted
    # strings do not survive in the public excerpt for the same narrative.
    if restricted_qa:
        restricted_qa = restricted_qa.resolve()
        if not restricted_qa.is_file():
            errors.append(f"Restricted QA file not found: {restricted_qa}")
        else:
            leaks: list[dict[str, Any]] = []
            rows = 0
            with restricted_qa.open(encoding="utf-8-sig", newline="") as stream:
                for item in csv.DictReader(stream):
                    rows += 1
                    if item.get("public_decision") != "redact_public": continue
                    narrative_id = int(item["narrative_id"])
                    original = (item.get("detected_address_original") or "").strip()
                    excerpt = narrative_by_id.get(narrative_id, "")
                    if original and original.casefold() in excerpt.casefold():
                        leaks.append({"narrative_id": narrative_id, "address": original})
                        if len(leaks) >= 20: break
            checks["restricted_qa_rows_checked"] = rows
            checks["same_narrative_redaction_leaks"] = leaks
            if leaks: errors.append(f"Found {len(leaks)} redacted address strings in corresponding public narrative excerpts")

    privacy_path = site / "privacy/narrative_privacy_summary.json"
    if privacy_path.exists():
        try:
            privacy = json.loads(privacy_path.read_text(encoding="utf-8"))
            checks["privacy_summary"] = {key: privacy.get(key) for key in (
                "input_narratives", "detected_address_mentions", "retained_public_address_mentions",
                "redacted_potential_single_family_address_mentions")}
            if privacy.get("detected_address_mentions") != (
                privacy.get("retained_public_address_mentions", 0) + privacy.get("redacted_potential_single_family_address_mentions", 0)
            ):
                errors.append("Privacy summary retained + redacted counts do not equal detected mentions")
        except Exception as exc:
            errors.append(f"Cannot parse privacy summary: {exc}")

    node = shutil.which("node")
    if node:
        js_results = {}
        for relative in ("assets/app.js", "data/bootstrap.js"):
            result = subprocess.run([node, "--check", str(site / relative)], capture_output=True, text=True)
            js_results[relative] = result.returncode == 0
            if result.returncode != 0: errors.append(f"Node syntax check failed for {relative}: {result.stderr.strip()}")
        checks["node_syntax"] = js_results
    else:
        warnings.append("Node.js not available; JavaScript syntax check skipped")

    standalone = site / "HUD-CDBG-DR-Fund-Dashboard-Hierarchical.html"
    if standalone.exists():
        text = standalone.read_text(encoding="utf-8", errors="replace")
        pattern = re.compile(r'<script type="application/x-cdbg-gzip" data-cdbg-path="([^"]+)">\s*(.*?)\s*</script>', re.S)
        packed_assets = pattern.findall(text)
        mismatches = []
        packed_narratives = 0
        for relative, encoded in packed_assets:
            try:
                unpacked = gzip.decompress(base64.b64decode(re.sub(r"\s+", "", encoded)))
                source = site / relative
                if not source.is_file() or hashlib.sha256(unpacked).digest() != hashlib.sha256(source.read_bytes()).digest():
                    mismatches.append(relative)
                if relative.startswith("data/narratives/"): packed_narratives += 1
            except Exception:
                mismatches.append(relative)
        checks.update({
            "self_contained_html_bytes": standalone.stat().st_size,
            "self_contained_packed_assets": len(packed_assets),
            "self_contained_packed_narrative_assets": packed_narratives,
            "self_contained_asset_mismatches": mismatches,
        })
        if mismatches: errors.append("Self-contained assets do not match source: " + ", ".join(mismatches))
        if packed_narratives == 0: errors.append("Self-contained HTML does not embed narrative chunks")
        if re.search(r'<(?:script|link)[^>]+(?:src|href)="\./', text):
            errors.append("Self-contained HTML still contains relative script/stylesheet dependencies")
    else:
        warnings.append("Self-contained HTML has not been generated")

    oversized = [str(path.relative_to(site)) for path in site.rglob("*") if path.is_file() and path.stat().st_size > 90_000_000]
    checks["files_over_90mb"] = oversized
    if oversized: errors.append("Files exceed 90 MB: " + ", ".join(oversized))
    checks["package_file_count"] = sum(1 for path in site.rglob("*") if path.is_file())
    checks["package_bytes"] = sum(path.stat().st_size for path in site.rglob("*") if path.is_file())
    checks["index_sha256"] = sha256(index_path) if index_path.exists() else None
    checks["app_js_sha256"] = sha256(site / "assets/app.js") if (site / "assets/app.js").exists() else None
    return {"ok": not errors, "errors": errors, "warnings": warnings, "checks": checks}


def main() -> None:
    args = parse_args()
    result = validate(args.site_dir, args.restricted_qa)
    output = json.dumps(result, indent=2)
    print(output)
    if args.write_json:
        args.write_json.parent.mkdir(parents=True, exist_ok=True)
        args.write_json.write_text(output + "\n", encoding="utf-8")
    raise SystemExit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
