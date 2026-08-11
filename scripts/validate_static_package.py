#!/usr/bin/env python3
"""Validate the deployable static GitHub Pages dashboard package.

The validator uses only the Python standard library. Run it from any directory:

    python scripts/validate_static_package.py
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HASH_FILE = ROOT / "PACKAGE_CONTENTS_SHA256.txt"
MAX_DEPLOY_FILE_BYTES = 25 * 1024 * 1024
REQUIRED = [
    ROOT / "index.html",
    ROOT / ".nojekyll",
    ROOT / "assets" / "app.css",
    ROOT / "assets" / "app.js",
    ROOT / "assets" / "vendor" / "plotly-3.3.1.min.js",
    ROOT / "data" / "bootstrap.js",
    ROOT / "data" / "metadata.json",
    ROOT / "README.md",
    ROOT / "GITHUB_PAGES_SETUP.md",
]


def fail(message: str) -> None:
    raise AssertionError(message)


def parse_assignment(path: Path, prefix: str, suffix: str = ";"):
    text = path.read_text(encoding="utf-8").strip()
    if not text.startswith(prefix) or not text.endswith(suffix):
        fail(f"Unexpected JavaScript assignment wrapper: {path.relative_to(ROOT)}")
    return json.loads(text[len(prefix) : -len(suffix)])


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_hashes() -> int:
    if not HASH_FILE.exists():
        fail("PACKAGE_CONTENTS_SHA256.txt is missing")
    count = 0
    for raw in HASH_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        expected, relative = line.split("  ", 1)
        path = ROOT / relative
        if not path.is_file():
            fail(f"Hash manifest file is missing: {relative}")
        actual = sha256(path)
        if actual != expected:
            fail(f"SHA-256 mismatch for {relative}")
        count += 1
    return count


def main() -> int:
    missing = [str(path.relative_to(ROOT)) for path in REQUIRED if not path.exists()]
    if missing:
        fail("Missing required files: " + ", ".join(missing))

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    required_header_text = [
        "CDBG-DR Fund Dashboard",
        "Dashboard Overview",
        "Data and Functions",
        "Financial and Geographic Analysis",
        "Audiences and Applications",
    ]
    missing_header_text = [item for item in required_header_text if item not in html]
    if missing_header_text:
        fail("Revised dashboard header text is missing: " + ", ".join(missing_header_text))

    bootstrap = parse_assignment(
        ROOT / "data" / "bootstrap.js",
        "window.DISASTER_DASHBOARD_DATA=",
    )
    if bootstrap.get("generatedFor") != "GitHub Pages static dashboard":
        fail("bootstrap.js is not marked as the GitHub Pages static build")

    row_files = bootstrap.get("rowChunkFiles") or []
    if not row_files:
        fail("No finance row chunks are listed")
    expected_row_length = int(bootstrap["columns"]["metricStart"]) + len(bootstrap["metrics"])
    total_rows = 0
    for relative in row_files:
        path = ROOT / relative
        rows = parse_assignment(
            path,
            "window.DISASTER_DASHBOARD_DATA.rowChunks.push(",
            ");",
        )
        total_rows += len(rows)
        invalid = next((index for index, row in enumerate(rows) if len(row) != expected_row_length), None)
        if invalid is not None:
            fail(f"Incorrect row width in {relative} at row {invalid}")

    metadata = bootstrap["metadata"]
    expected_rows = int(metadata["dashboard_finance_rows"])
    if total_rows != expected_rows:
        fail(f"Finance row total {total_rows:,} does not match metadata {expected_rows:,}")

    narrative_files = 0
    narrative_records = 0
    for entries in (bootstrap.get("narrativeManifest") or {}).values():
        for entry in entries:
            path = ROOT / entry["file"]
            pairs = parse_assignment(
                path,
                f'window.DISASTER_DASHBOARD_DATA.narrativeChunks["{entry["key"]}"]=',
            )
            narrative_files += 1
            narrative_records += len(pairs)

    for level, relative in (bootstrap.get("geoFiles") or {}).items():
        path = ROOT / relative
        if not path.is_file():
            fail(f"Missing geography asset for {level}: {relative}")
        payload = parse_assignment(
            path,
            f'window.DISASTER_DASHBOARD_DATA.geojson["{level}"]=',
        )
        if payload.get("type") != "FeatureCollection" or not payload.get("features"):
            fail(f"Invalid GeoJSON asset: {relative}")

    forbidden = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        lowered = path.name.lower()
        if lowered.endswith((".sqlite", ".shp", ".dbf", ".shx")) or (
            lowered.endswith(".csv") and path.name != "PACKAGE_CONTENTS_SHA256.txt"
        ):
            forbidden.append(str(path.relative_to(ROOT)))
    if forbidden:
        fail("Raw/server-side files found in deployment package: " + ", ".join(forbidden))

    files = [path for path in ROOT.rglob("*") if path.is_file() and ".git" not in path.parts]
    oversized = [path for path in files if path.stat().st_size > MAX_DEPLOY_FILE_BYTES]
    if oversized:
        fail("Deployable files exceed 25 MiB: " + ", ".join(str(p.relative_to(ROOT)) for p in oversized))

    node = shutil.which("node")
    if node:
        subprocess.run([node, "--check", str(ROOT / "assets" / "app.js")], check=True)

    hash_count = validate_hashes()
    total_size = sum(path.stat().st_size for path in files)
    largest = max(files, key=lambda path: path.stat().st_size)

    summary = {
        "status": "PASS",
        "finance_rows": total_rows,
        "finance_chunks": len(row_files),
        "narrative_records_in_static_excerpts": narrative_records,
        "narrative_chunks": narrative_files,
        "geography_assets": sorted((bootstrap.get("geoFiles") or {}).keys()),
        "package_files": len(files),
        "hashed_files_verified": hash_count,
        "package_bytes": total_size,
        "largest_file": str(largest.relative_to(ROOT)),
        "largest_file_bytes": largest.stat().st_size,
        "node_syntax_check": bool(node),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"VALIDATION FAILED: {error}", file=sys.stderr)
        raise
