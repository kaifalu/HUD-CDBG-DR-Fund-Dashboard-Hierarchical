#!/usr/bin/env python3
"""Sanitize CDBG-DR QPR narratives for public dashboard use.

The workflow detects street-address-like spans and applies a conservative,
activity-aware rule:
  * retain and mark addresses in infrastructure/public-facility or clearly
    multifamily/rental-housing narratives;
  * redact address spans in buyout, homeowner/single-family rehabilitation,
    reconstruction, replacement-housing, relocation, or ambiguous narratives.

The public output never contains the restricted QA table. The QA table retains
original detected spans for internal review and must not be published.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Iterable

import pandas as pd
import regex as rx

PUBLIC_OPEN = "[[PUBLIC_ADDRESS]]"
PUBLIC_CLOSE = "[[/PUBLIC_ADDRESS]]"
REDACTION = "[REDACTED — POTENTIAL SINGLE-FAMILY ADDRESS]"

# Long-form and abbreviated U.S. street suffixes. A word boundary is enforced
# so terms such as "program" are not accidentally captured.
SUFFIX = r"(?i:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Circle|Cir\.?|Highway|Hwy\.?|Route|Rte\.?|Parkway|Pkwy\.?|Terrace|Ter\.?|Trail|Trl\.?|Way|Place|Pl\.?|Plaza|Square|Sq\.?|Loop|Crossing|Crescent|Expressway|Expy\.?|Freeway|Fwy\.?|Turnpike|Causeway|Alley|Pike|Ridge|Junction|Bypass|Extension|Ext\.?)"
DIRECTION = r"(?i:N(?:orth)?\.?|S(?:outh)?\.?|E(?:ast)?\.?|W(?:est)?\.?|NE\.?|NW\.?|SE\.?|SW\.?)"
SHORT_DIRECTION = r"(?i:N\.?|S\.?|E\.?|W\.?|NE\.?|NW\.?|SE\.?|SW\.?)"
NAME_WORD = r"(?:[A-Z0-9][A-Za-z0-9'’&.-]*|[A-Z][a-z]+)"
HOUSE = r"(?:\d{1,6}(?:-\d{1,6})?[A-Za-z]?|\d{1,5}\s*½)"
UNIT = r"(?:\s*(?:,|#)?\s*(?:Apt\.?|Apartment|Unit|Suite|Ste\.?|Building|Bldg\.?)\s*[A-Za-z0-9-]+)?"

PATTERNS: list[tuple[str, rx.Pattern]] = [
    ("po_box", rx.compile(r"(?<![\w/])\bP(?:ost)?\.?\s*O(?:ffice)?\.?\s*Box\s+\d+[A-Za-z-]*\b", rx.I)),
    ("rural_route", rx.compile(r"(?<![\w/])\b(?:Rural\s+Route|RR)\s*\d+\s*(?:Box\s*)?\d+[A-Za-z-]*\b", rx.I)),
    ("highway", rx.compile(rf"(?<![\w$/])\b{HOUSE}\s+(?:(?i:U\.?S\.?|US|State|County)\s+)?(?i:Highway|Hwy\.?|Route|Rte\.?)\s*[A-Za-z0-9-]+{UNIT}(?![A-Za-z])")),
    ("street", rx.compile(rf"(?<![\w$/])\b{HOUSE}\s+(?:{DIRECTION}\s+)?{NAME_WORD}(?:\s+{NAME_WORD}){{0,6}}\s+{SUFFIX}{UNIT}(?![A-Za-z])")),
    # Directional suffixless forms such as "831 S. Washington". These are
    # marked low confidence and retained publicly only when the activity itself
    # is clearly safe; they are still redacted in residential/ambiguous cases.
    ("directional_suffixless", rx.compile(rf"(?<![\w$/])\b{HOUSE}\s+{SHORT_DIRECTION}\s+{NAME_WORD}{UNIT}(?![A-Za-z])")),
    ("parcel", rx.compile(r"\b(?i:Parcel|Lot)\s+(?:(?i:No)\.?\s*)?(?=[A-Za-z0-9.-]*\d)[A-Za-z0-9][A-Za-z0-9.-]*(?:\s*(?:and|&|,)\s*(?=[A-Za-z0-9.-]*\d)[A-Za-z0-9][A-Za-z0-9.-]*)*\b")),
]

BANNED_NAME_TOKENS = {
    "qpr", "cdbg", "drgr", "hud", "fema", "program", "project", "grant",
    "fund", "funds", "quarter", "quarters", "wildfire", "wildfires",
    "fiscal", "year", "years", "report", "reports", "million", "billion",
    "percent", "percentage", "phase", "phases", "activity", "activities",
}

SENSITIVE_RE = rx.compile(
    r"\b(?:buyout|buy-out|homeowner|homeownership|single[-\s]?family|owner[-\s]?occupied|"
    r"housing\s+rehab(?:ilitation)?|home\s+rehab(?:ilitation)?|residential\s+rehab(?:ilitation)?|"
    r"housing\s+reconstruction|home\s+reconstruction|residential\s+reconstruction|"
    r"replacement\s+housing|relocation|residential\s+location\s+incentive|"
    r"housing\s+incentive|rental\s+assistance|individual\s+home|damaged\s+home|"
    r"windpool|residential\s+structures?|new\s+housing|new\s+home|housing\s+repair|"
    r"demolition\s+of\s+(?:a\s+)?home|property\s+acquisition)\b",
    rx.I,
)

MULTIFAMILY_RE = rx.compile(
    r"\b(?:multi[-\s]?family|apartment|apartments|condominium|condominiums|condo|condos|"
    r"affordable\s+rental|rental\s+housing|rental\s+development|rental\s+complex|"
    r"rental\s+property|public\s+housing|senior\s+housing|elderly\s+housing|LIHTC|"
    r"duplex|triplex|fourplex|townhome\s+development|housing\s+authority|"
    r"\d+[-\s]?unit|\d+\s+units)\b",
    rx.I,
)

INFRA_RE = rx.compile(
    r"\b(?:infrastructure|public\s+facilit(?:y|ies)|public\s+improvement|water\s+system|"
    r"water\s+line|waterline|sewer|wastewater|stormwater|drainage|street\s+improvement|"
    r"roadway|road\s+improvement|bridge|pump\s+station|lift\s+station|utility|utilities|"
    r"electrical\s+power|power\s+system|levee|dike|dam|culvert|ditch|sidewalk|"
    r"community\s+center|fire\s+station|police\s+station|school|hospital|airport|port|"
    r"transit|rail|government\s+building|public\s+building|museum|visitor\s+center|"
    r"park\s+improvement|non[-\s]?residential\s+structure|economic\s+development\s+center)\b",
    rx.I,
)

SAFE_TYPE_RE = rx.compile(
    r"(?:public facilities|public improvement|water/sewer|water|sewer|street|infrastructure|"
    r"dike|dam|stream|river bank|non-residential|nonresidential|lift station|"
    r"general conduct of government|privately owned utilities|electrical power|"
    r"economic development center|MIT Economic Development|affordable rental housing)",
    rx.I,
)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_candidate(text: str) -> str:
    return text.strip(" \t\r\n,;:")


def candidate_is_plausible(text: str, start: int, end: int, kind: str, full: str) -> bool:
    candidate = clean_candidate(text)
    if not candidate:
        return False
    # Reject spans that begin immediately after a slash, currency symbol,
    # percentage, or a decimal/currency fragment.
    before = full[max(0, start - 18):start]
    if re.search(r"(?:\$|\d|,|/|%)$", before):
        return False
    if re.search(r"\$?\d[\d,]*\.$", before):
        return False
    # Sentence punctuation embedded before the suffix is a strong false-positive
    # signal (directional abbreviations are allowed).
    interior = re.sub(r"\b(?:N|S|E|W|NE|NW|SE|SW)\.", "", candidate, flags=re.I)
    if re.search(r"[;!?]", interior) or re.search(r"\.(?:\s+[A-Z][a-z])", interior):
        return False
    words = [re.sub(r"[^A-Za-z0-9]", "", word).casefold() for word in candidate.split()]
    if any(word in BANNED_NAME_TOKENS for word in words):
        return False
    if kind == "highway":
        first = re.match(r"\d{4}", candidate)
        if first and 1900 <= int(first.group(0)) <= 2099:
            nearby = full[max(0, start - 80):min(len(full), end + 80)]
            if not re.search(r"\b(?:located|address|property|site)\s+(?:at|is|:)\b", nearby, re.I):
                return False
    if kind == "directional_suffixless":
        # Require a short, name-like span; reject timeline/report language,
        # activity codes, and year-plus-section labels such as “2010 E. Complete.”
        first_number = re.match(r"\d{1,6}", candidate)
        if first_number and 1900 <= int(first_number.group(0)) <= 2099:
            return False
        if before.endswith("-") and first_number and first_number.group(0).startswith("0"):
            return False
        if len(words) > 4 or any(word in {"fm", "qpr", "furthermore", "complete", "completed", "engineering", "and", "is"} for word in words):
            return False
        if re.search(rf"\b{SUFFIX}\b", candidate):
            return False
    # Telephone numbers and ZIP-like number runs are not street addresses.
    if re.fullmatch(r"\d{1,3}[ -]\d{3}[ -]\d{4}", candidate):
        return False
    return True


def find_addresses(text: str) -> list[dict]:
    matches: list[dict] = []
    for kind, pattern in PATTERNS:
        # Overlapping iteration prevents a rejected, overlong candidate from
        # hiding a valid address that begins inside the rejected span.
        for match in pattern.finditer(text, overlapped=True):
            start, end = match.span()
            raw = clean_candidate(match.group(0))
            # Adjust if stripping changed offsets.
            left_trim = len(match.group(0)) - len(match.group(0).lstrip(" \t\r\n,;:"))
            right_trim = len(match.group(0)) - len(match.group(0).rstrip(" \t\r\n,;:"))
            start += left_trim
            end -= right_trim
            if not candidate_is_plausible(raw, start, end, kind, text):
                continue
            matches.append({"start": start, "end": end, "text": text[start:end], "kind": kind})

    # A common sensitive-data format abbreviates repeated addresses after one
    # full street anchor, e.g., “12 Juanita, 20 Juanita” or
    # “31, 36, 46, and 115 Juanita Drive.” Expand detection only when the same
    # narrative already contains a conventional full street address, which
    # keeps this rule far more precise than a generic number-plus-word pattern.
    street_parse = rx.compile(
        rf"^(?P<house>{HOUSE})\s+(?P<tail>(?:{DIRECTION}\s+)?{NAME_WORD}(?:\s+{NAME_WORD}){{0,6}}\s+{SUFFIX})(?:{UNIT})?$"
    )
    anchored_tails: dict[str, tuple[str, str]] = {}
    for item in list(matches):
        if item["kind"] != "street":
            continue
        parsed = street_parse.match(clean_candidate(item["text"]))
        if not parsed:
            continue
        tail = parsed.group("tail").strip()
        base = rx.sub(rf"\s+{SUFFIX}$", "", tail, flags=rx.I).strip()
        if base:
            anchored_tails[tail.casefold()] = (tail, base)

    for tail, base in anchored_tails.values():
        # Full shared-street number lists. Redacting/highlighting the complete
        # span avoids leaving the leading house numbers exposed.
        list_pattern = rx.compile(
            rf"(?<![\w$/])\b(?:{HOUSE}\s*,\s*){{1,8}}(?:and|&)\s*{HOUSE}\s+{rx.escape(tail)}(?![A-Za-z])",
            rx.I,
        )
        for match in list_pattern.finditer(text, overlapped=True):
            matches.append({"start": match.start(), "end": match.end(), "text": match.group(0), "kind": "shared_street_list"})

        # Repeated abbreviated forms that omit the suffix but use an anchored
        # street name elsewhere in the same narrative.
        abbreviated_pattern = rx.compile(
            rf"(?<![\w$/])\b{HOUSE}\s+{rx.escape(base)}\b(?!\s+{SUFFIX})",
            rx.I,
        )
        for match in abbreviated_pattern.finditer(text, overlapped=True):
            if candidate_is_plausible(match.group(0), match.start(), match.end(), "anchored_suffixless", text):
                matches.append({"start": match.start(), "end": match.end(), "text": match.group(0), "kind": "anchored_suffixless"})

    # Prefer longer/high-confidence spans when patterns overlap.
    priority = {"shared_street_list": 7, "street": 5, "highway": 5, "po_box": 5, "rural_route": 5, "parcel": 4, "anchored_suffixless": 3, "directional_suffixless": 2}
    matches.sort(key=lambda item: (item["start"], -(item["end"] - item["start"]), -priority[item["kind"]]))
    selected: list[dict] = []
    for item in matches:
        if any(not (item["end"] <= kept["start"] or item["start"] >= kept["end"]) for kept in selected):
            continue
        selected.append(item)
    return sorted(selected, key=lambda item: item["start"])


def classify_activity(activity_type: str, title: str, narrative: str) -> tuple[str, str]:
    activity_type = activity_type or ""
    title = title or ""
    combined_short = f"{activity_type} {title}"
    combined = f"{combined_short} {narrative[:5000]}"

    # Sensitive/homeowner/single-family signals override all other cues. This
    # avoids retaining addresses in mixed narratives that mention multifamily
    # work alongside individual homes or buyouts.
    if SENSITIVE_RE.search(combined):
        return "redact", "residential_or_household_sensitive"
    if MULTIFAMILY_RE.search(combined_short) or (
        MULTIFAMILY_RE.search(combined) and not rx.search(r"\b(?:single[-\s]?family|homeowner|owner[-\s]?occupied|buyout)\b", combined, rx.I)
    ):
        return "retain", "multifamily_or_affordable_rental"
    if SAFE_TYPE_RE.search(activity_type) or INFRA_RE.search(combined_short):
        return "retain", "infrastructure_or_public_facility"
    # For generic/ambiguous activity types, strong infrastructure evidence in
    # the title or narrative may support retention, but residential evidence
    # has already been screened above.
    if INFRA_RE.search(combined):
        return "retain", "explicit_infrastructure_context"
    return "redact", "ambiguous_default_privacy_protection"


def apply_markers(text: str, matches: list[dict], decision: str) -> str:
    if not matches:
        return text
    output = text
    for item in reversed(matches):
        original = output[item["start"]:item["end"]]
        if decision == "retain" and item["kind"] != "directional_suffixless":
            replacement = f"{PUBLIC_OPEN}{original}{PUBLIC_CLOSE}"
        elif decision == "retain" and item["kind"] == "directional_suffixless":
            # Directional suffixless forms are plausible but less certain. They
            # are retained only in clearly safe activity contexts.
            replacement = f"{PUBLIC_OPEN}{original}{PUBLIC_CLOSE}"
        else:
            replacement = REDACTION
        output = output[:item["start"]] + replacement + output[item["end"]:]
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--public-summary-dir", type=Path, required=True)
    parser.add_argument("--restricted-qa", type=Path, required=True)
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.public_summary_dir.mkdir(parents=True, exist_ok=True)
    args.restricted_qa.parent.mkdir(parents=True, exist_ok=True)

    frame = pd.read_csv(args.input, low_memory=False)
    qa_rows: list[dict] = []
    sanitized: list[str] = []
    classifications: Counter = Counter()
    mention_kinds: Counter = Counter()
    decision_counts: Counter = Counter()
    narratives_with_mentions = 0
    retained_mentions = 0
    redacted_mentions = 0

    for row in frame.itertuples(index=False):
        narrative = "" if pd.isna(row.narrative_text) else str(row.narrative_text)
        activity_type = "" if pd.isna(row._8) else str(row._8)  # Activity Type
        title = "" if pd.isna(row._7) else str(row._7)  # Activity Title
        decision, reason = classify_activity(activity_type, title, narrative)
        classifications[reason] += 1
        matches = find_addresses(narrative)
        if matches:
            narratives_with_mentions += 1
        for item in matches:
            mention_kinds[item["kind"]] += 1
            final_decision = "retain_public" if decision == "retain" else "redact_public"
            decision_counts[final_decision] += 1
            retained_mentions += decision == "retain"
            redacted_mentions += decision != "retain"
            context_start = max(0, item["start"] - 100)
            context_end = min(len(narrative), item["end"] + 100)
            qa_rows.append({
                "narrative_id": int(row.narrative_id),
                "Grant": "" if pd.isna(row.Grant) else row.Grant,
                "Activity Number": "" if pd.isna(row._2) else row._2,
                "QPR Report Quarter": "" if pd.isna(row._3) else row._3,
                "Grantee": "" if pd.isna(row.Grantee) else row.Grantee,
                "Grantee State": "" if pd.isna(row._6) else row._6,
                "Activity Title": title,
                "Activity Type": activity_type,
                "detected_address_original": item["text"],
                "address_pattern": item["kind"],
                "public_decision": final_decision,
                "classification_reason": reason,
                "context_original": narrative[context_start:context_end].replace("\r", " ").replace("\n", " "),
            })
        sanitized.append(apply_markers(narrative, matches, decision))

    frame["narrative_text"] = sanitized
    frame.to_csv(args.output, index=False, compression="gzip")

    qa = pd.DataFrame(qa_rows)
    qa.to_csv(args.restricted_qa, index=False)

    crosswalk = (
        frame[["Activity Type"]]
        .fillna("")
        .drop_duplicates()
        .sort_values("Activity Type", key=lambda s: s.str.casefold())
    )
    decisions = []
    for activity_type in crosswalk["Activity Type"].tolist():
        decision, reason = classify_activity(activity_type, "", "")
        decisions.append((decision, reason))
    crosswalk["default_address_decision"] = [item[0] for item in decisions]
    crosswalk["default_classification_reason"] = [item[1] for item in decisions]
    crosswalk.to_csv(args.public_summary_dir / "narrative_activity_privacy_crosswalk.csv", index=False)

    summary = {
        "workflow": "Automated activity-aware PII address screening for public narrative excerpts",
        "input_narratives": int(len(frame)),
        "narratives_with_detected_address_mentions": int(narratives_with_mentions),
        "detected_address_mentions": int(len(qa_rows)),
        "retained_public_address_mentions": int(retained_mentions),
        "redacted_potential_single_family_address_mentions": int(redacted_mentions),
        "address_pattern_counts": dict(sorted(mention_kinds.items())),
        "public_decision_counts": dict(sorted(decision_counts.items())),
        "classification_counts_all_narratives": dict(sorted(classifications.items())),
        "public_retained_marker": PUBLIC_OPEN + "…" + PUBLIC_CLOSE,
        "public_redaction_marker": REDACTION,
        "privacy_note": (
            "This is a conservative automated screening workflow, not a legal privacy determination. "
            "Retained addresses are limited to narratives classified as infrastructure/public-facility or clearly multifamily/rental contexts. "
            "Potential addresses in homeowner, single-family, buyout, rehabilitation, reconstruction, relocation, or ambiguous contexts are redacted."
        ),
        "input_sha256": sha256(args.input),
        "output_sha256": sha256(args.output),
    }
    (args.public_summary_dir / "narrative_privacy_summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (args.public_summary_dir / "NARRATIVE_PRIVACY_METHOD.md").write_text(
        "# Narrative privacy screening\n\n"
        "Public narrative excerpts are screened for street-address-like text before deployment. "
        "Addresses associated with infrastructure/public-facility or clearly multifamily/rental activities are retained and visually highlighted. "
        "Potential addresses associated with buyouts, homeowner assistance, single-family rehabilitation or reconstruction, replacement housing, relocation, or ambiguous residential contexts are replaced with `" + REDACTION + "`.\n\n"
        "Activity classification is used only to determine how detected address text is handled within narrative excerpts. It does not remove, reclassify, or otherwise alter the financial/activity dataset. Narratives without detected address text remain available.\n\n"
        "The automated method is deliberately conservative and should be supplemented with internal review before public release. The restricted QA file contains original detected spans and must not be uploaded to a public GitHub repository.\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
