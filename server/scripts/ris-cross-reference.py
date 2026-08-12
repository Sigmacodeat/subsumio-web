#!/usr/bin/env python3
"""
RIS Cross-Reference — Vergleicht lokale Judikatur-Dateien gegen RIS API Metadaten.

Lädt die von ris-metadata-fetcher.py heruntergeladenen Metadaten und vergleicht
jede lokale Datei dagegen. Prüft:
  1. ECLI Match: Hat die lokale Datei denselben ECLI wie die API?
  2. case_number Match: Stimmt die Geschäftszahl überein?
  3. decision_date Match: Stimmt das Entscheidungsdatum überein?
  4. court Match: Stimmt das Gericht überein?
  5. Fehlende Dateien: In API aber nicht lokal
  6. Zusätzliche Dateien: Lokal aber nicht in API

Output:
  /tmp/ris-crossref-report.txt  — Zusammenfassung
  /tmp/ris-mismatches.jsonl      — Detail pro Mismatch
  /tmp/ris-missing-local.jsonl   — In API, nicht lokal
  /tmp/ris-missing-api.jsonl     — Lokal, nicht in API
  stdout                         — Report
"""

import json
import re
import sys
import os
import argparse
from pathlib import Path
from collections import defaultdict
import time

CORPUS_ROOT = Path("/Users/msc/subsumio-web/law-corpus")
META_DIR = Path("/tmp/ris-metadata")

# Source directory → metadata file mapping
SOURCE_MAP = {
    "at-judikatur": "ogh",
    "at-judikatur-vwgh": "vwgh",
    "at-judikatur-vfgh": "vfgh",
    "at-judikatur-bvwg": "bvwg",
    "at-judikatur-lvwg": "lvwg",
    "at-judikatur-asylgh": "asylgh",
    "at-judikatur-uvs": "uvs",
    "at-judikatur-dsk": "dsk",
    "at-judikatur-gbk": "gbk",
    "at-judikatur-pvak": "pvak",
    "at-judikatur-dok": "dok",
    "at-judikatur-ubas": "ubas",
    "at-judikatur-umse": "umse",
}

def parse_frontmatter(filepath):
    """Extrahiere Frontmatter aus Markdown-Datei."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(8192)  # only read first 8KB for frontmatter
        if not content.startswith("---"):
            return {}
        parts = content.split("---", 2)
        if len(parts) < 2:
            return {}
        fm_text = parts[1]
        fm = {}
        for line in fm_text.split("\n"):
            m = re.match(r'^(\w+):\s*["\']?(.*?)["\']?\s*$', line)
            if m:
                fm[m.group(1)] = m.group(2)
        return fm
    except Exception:
        return {}

def normalize(s):
    """Normalisiere String für Vergleich (whitespace, case)."""
    if not s:
        return ""
    return re.sub(r'\s+', ' ', s).strip().lower()

def normalize_date(s):
    """Normalisiere Datum für Vergleich. Akzeptiert YYYY-MM-DD und DD.MM.YYYY."""
    if not s:
        return ""
    s = s.strip()
    # ISO format: 2026-07-06
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    # German format: 06.07.2026
    m = re.match(r'(\d{2})\.(\d{2})\.(\d{4})', s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return s

def load_metadata(court_name):
    """Lade RIS Metadaten für einen Gericht. Returns dict keyed by ECLI."""
    meta_file = META_DIR / f"{court_name}.jsonl"
    if not meta_file.exists():
        return {}, []

    by_ecli = {}
    all_docs = []
    with open(meta_file) as f:
        for line in f:
            try:
                d = json.loads(line)
                all_docs.append(d)
                if d.get("ecli"):
                    by_ecli[d["ecli"]] = d
            except:
                pass
    return by_ecli, all_docs

def cross_reference_source(source_dir_name, meta_court_name):
    """Vergleiche lokale Dateien gegen API Metadaten."""
    source_dir = CORPUS_ROOT / source_dir_name
    if not source_dir.exists():
        return None

    by_ecli, all_api_docs = load_metadata(meta_court_name)

    # Build case_number+date index for files without ECLI
    by_case_date = {}
    for api_doc in all_api_docs:
        key = (normalize(api_doc.get("case_number", "")), normalize_date(api_doc.get("decision_date", "")))
        if key not in by_case_date:
            by_case_date[key] = api_doc

    local_files = sorted(source_dir.rglob("*.md"))
    total_local = len(local_files)
    total_api = len(all_api_docs)

    matched = 0
    mismatches = []
    not_in_api = []  # local files without matching API entry
    ecli_missing_local = 0  # local files without ECLI in frontmatter

    for filepath in local_files:
        fm = parse_frontmatter(filepath)
        local_ecli = fm.get("ecli", "")
        local_case = fm.get("case_number", "")
        local_date = fm.get("decision_date", "")
        local_court = fm.get("court", "")

        if not local_ecli:
            ecli_missing_local += 1
            # Try matching by case_number + date (using index)
            key = (normalize(local_case), normalize_date(local_date))
            found = by_case_date.get(key)
            if found:
                matched += 1
                # Check other fields
                if normalize(found.get("gericht", "")) != normalize(local_court):
                    mismatches.append({
                        "file": str(filepath),
                        "field": "court",
                        "api": found.get("gericht", ""),
                        "local": local_court,
                        "ecli": local_ecli,
                    })
            else:
                not_in_api.append({
                    "file": str(filepath),
                    "ecli": local_ecli,
                    "case_number": local_case,
                    "decision_date": local_date,
                    "reason": "no ECLI and no case_number+date match in API",
                })
            continue

        # Match by ECLI
        if local_ecli in by_ecli:
            api_doc = by_ecli[local_ecli]
            matched += 1

            # Check case_number
            if normalize(api_doc.get("case_number", "")) != normalize(local_case):
                mismatches.append({
                    "file": str(filepath),
                    "field": "case_number",
                    "api": api_doc.get("case_number", ""),
                    "local": local_case,
                    "ecli": local_ecli,
                })

            # Check decision_date
            if normalize_date(api_doc.get("decision_date", "")) != normalize_date(local_date):
                mismatches.append({
                    "file": str(filepath),
                    "field": "decision_date",
                    "api": api_doc.get("decision_date", ""),
                    "local": local_date,
                    "ecli": local_ecli,
                })

            # Check court
            if normalize(api_doc.get("gericht", "")) != normalize(local_court):
                mismatches.append({
                    "file": str(filepath),
                    "field": "court",
                    "api": api_doc.get("gericht", ""),
                    "local": local_court,
                    "ecli": local_ecli,
                })
        else:
            # Fallback: try matching by case_number + date
            # (handles courts where API doesn't provide ECLIs)
            key = (normalize(local_case), normalize_date(local_date))
            found = by_case_date.get(key)
            if found:
                matched += 1
                # Check court
                if normalize(found.get("gericht", "")) != normalize(local_court):
                    mismatches.append({
                        "file": str(filepath),
                        "field": "court",
                        "api": found.get("gericht", ""),
                        "local": local_court,
                        "ecli": local_ecli,
                    })
            else:
                not_in_api.append({
                    "file": str(filepath),
                    "ecli": local_ecli,
                    "case_number": local_case,
                    "decision_date": local_date,
                    "reason": "ECLI not found in API metadata",
                })

    # Find API docs not in local
    local_eclis = set()
    for filepath in local_files:
        fm = parse_frontmatter(filepath)
        if fm.get("ecli"):
            local_eclis.add(fm["ecli"])

    missing_local = []
    for api_doc in all_api_docs:
        api_ecli = api_doc.get("ecli", "")
        if api_ecli and api_ecli not in local_eclis:
            missing_local.append(api_doc)

    return {
        "source": source_dir_name,
        "total_local": total_local,
        "total_api": total_api,
        "matched": matched,
        "mismatches": mismatches,
        "not_in_api": not_in_api,
        "missing_local": missing_local,
        "ecli_missing_local": ecli_missing_local,
    }

def main():
    parser = argparse.ArgumentParser(description="Cross-reference local files with RIS API metadata")
    parser.add_argument("--source", default="", help="Only this source (e.g. at-judikatur-vwgh)")
    args = parser.parse_args()

    print("═" * 70)
    print("  RIS CROSS-REFERENCE — Lokale Dateien vs. API Metadaten")
    print("═" * 70)
    print(f"  Corpus: {CORPUS_ROOT}")
    print(f"  Metadata: {META_DIR}")
    print("─" * 70)
    print()

    all_mismatches = []
    all_missing_local = []
    all_not_in_api = []
    report_lines = []
    results = []

    report_lines.append(f"{'Source':<30} {'Local':>7} {'API':>7} {'Match':>6} {'Miss':>5} {'NoECLI':>7} {'Mism':>5} {'MissLoc':>8}")
    report_lines.append("─" * 90)

    for source_name, meta_court in SOURCE_MAP.items():
        if args.source and args.source != source_name:
            continue

        # Check if metadata is available
        meta_file = META_DIR / f"{meta_court}.jsonl"
        if not meta_file.exists():
            print(f"  {source_name}: SKIP (no metadata file {meta_file})")
            report_lines.append(f"{source_name:<30} {'SKIP':>7} {'':>7} {'':>6} {'':>5} {'':>7} {'':>5} {'':>8} — no metadata")
            results.append(None)
            continue

        result = cross_reference_source(source_name, meta_court)
        results.append(result)
        if result is None:
            print(f"  {source_name}: SKIP (no local directory)")
            continue

        all_mismatches.extend(result["mismatches"])
        all_missing_local.extend(result["missing_local"])
        all_not_in_api.extend(result["not_in_api"])

        match_pct = (result["matched"] / result["total_local"] * 100) if result["total_local"] > 0 else 0
        print(f"  {source_name:<30} local={result['total_local']:>6} api={result['total_api']:>6} "
              f"match={result['matched']:>5} ({match_pct:.1f}%) "
              f"noECLI={result['ecli_missing_local']:>5} "
              f"mismatch={len(result['mismatches']):>4} "
              f"missingLocal={len(result['missing_local']):>6}")

        report_lines.append(
            f"{source_name:<30} {result['total_local']:>7} {result['total_api']:>7} "
            f"{result['matched']:>6} {len(result['not_in_api']):>5} "
            f"{result['ecli_missing_local']:>7} {len(result['mismatches']):>5} "
            f"{len(result['missing_local']):>8}"
        )

    print()
    print("─" * 70)
    total_local = sum(r["total_local"] for r in results if r)
    total_api = sum(r["total_api"] for r in results if r)
    total_mismatches = len(all_mismatches)
    total_missing_local = len(all_missing_local)
    total_not_in_api = len(all_not_in_api)

    print(f"  GESAMT:")
    print(f"    Mismatches (falsche Felder):     {total_mismatches}")
    print(f"    In API, nicht lokal (fehlend):  {total_missing_local}")
    print(f"    Lokal, nicht in API (veraltet):  {total_not_in_api}")
    print()

    # Write detailed reports
    with open("/tmp/ris-mismatches.jsonl", "w") as f:
        for m in all_mismatches:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")

    with open("/tmp/ris-missing-local.jsonl", "w") as f:
        for m in all_missing_local:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")

    with open("/tmp/ris-missing-api.jsonl", "w") as f:
        for m in all_not_in_api:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")

    with open("/tmp/ris-crossref-report.txt", "w") as f:
        f.write("RIS CROSS-REFERENCE REPORT\n")
        f.write("=" * 90 + "\n")
        f.write("\n".join(report_lines))
        f.write(f"\n\nGESAMT:\n")
        f.write(f"  Mismatches: {total_mismatches}\n")
        f.write(f"  In API, nicht lokal: {total_missing_local}\n")
        f.write(f"  Lokal, nicht in API: {total_not_in_api}\n")

    print(f"  Reports geschrieben:")
    print(f"    /tmp/ris-mismatches.jsonl   ({total_mismatches} Einträge)")
    print(f"    /tmp/ris-missing-local.jsonl ({total_missing_local} Einträge)")
    print(f"    /tmp/ris-missing-api.jsonl   ({total_not_in_api} Einträge)")
    print(f"    /tmp/ris-crossref-report.txt")
    print("═" * 70)

if __name__ == "__main__":
    main()
