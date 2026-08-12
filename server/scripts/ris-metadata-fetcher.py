#!/usr/bin/env python3
"""
RIS Metadaten-Downloader — Lädt alle Judikatur-Metadaten paginiert herunter.

RIS API liefert 100 Dokumente pro Seite. Für 500K Dokumente brauchen wir
~10.000 API-Calls (nicht 500K einzelne). Bei 1s Delay = ~2.7 Stunden.

Output: /tmp/ris-metadata/<court>.jsonl — eine Zeile pro Dokument mit:
  ecli, case_number, decision_date, dokumenttyp, gericht, rechtssatznummer,
  entscheidungsart, normen, dokument_id, dokument_url

Usage:
  python3 ris-metadata-fetcher.py                    # alle Gerichte
  python3 ris-metadata-fetcher.py --court vwgh        # nur VwGH
  python3 ris-metadata-fetcher.py --resume             # nach Abbruch fortsetzen
"""

import json
import urllib.request
import urllib.error
import time
import sys
import os
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

OUTPUT_DIR = Path("/tmp/ris-metadata")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Court configurations: (applikation, label, outdir_name)
# Ordered by size (smallest first) for faster feedback during cross-reference
COURTS = [
    ("Umse", "UMSE", "umse"),      # 742 docs, 8 pages
    ("Ubas", "UBAS", "ubas"),      # 4.052 docs, 41 pages
    ("Gbk", "GBK", "gbk"),         # 1.042 docs, 11 pages
    ("Dok", "DOK", "dok"),         # 4.822 docs, 49 pages
    ("Pvak", "PVAK", "pvak"),      # 2.550 docs, 26 pages
    ("Dsk", "DSK", "dsk"),         # 1.878 docs, 19 pages
    ("Vfgh", "VfGH", "vfgh"),      # 24.082 docs, 241 pages
    ("Uvs", "UVS", "uvs"),         # 25.939 docs, 260 pages
    ("AsylGH", "AsylGH", "asylgh"),# 53.113 docs, 532 pages
    ("Lvwg", "LVwG", "lvwg"),      # 76.632 docs, 767 pages
    ("Justiz", "OGH", "ogh"),      # 138.445 docs, 1.385 pages
    ("Bvwg", "BVwG", "bvwg"),      # 287.927 docs, 2.880 pages
    ("Vwgh", "VwGH", "vwgh"),      # 356.635 docs, 3.567 pages
]

# Rate limiting: 1s between requests (RIS off-hours guideline)
DELAY_MS = 1000

# Progress file for resume
PROGRESS_FILE = OUTPUT_DIR / "progress.json"

lock = threading.Lock()
last_request_time = [0.0]

def rate_limited_fetch(url, timeout=60):
    """Fetch with rate limiting (thread-safe)."""
    with lock:
        elapsed = time.time() - last_request_time[0]
        if elapsed < DELAY_MS / 1000:
            time.sleep(DELAY_MS / 1000 - elapsed)
        last_request_time[0] = time.time()

    req = urllib.request.Request(url, headers={"User-Agent": "subsumio-verify/1.0"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"    Rate limited (429), waiting 30s...", file=sys.stderr)
                time.sleep(30)
                continue
            if e.code == 500 or e.code == 502 or e.code == 503:
                wait = 5 * (attempt + 1)
                print(f"    Server error ({e.code}), retry {attempt+1}/5 in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
        except Exception as e:
            if attempt < 4:
                wait = 5 * (attempt + 1)
                print(f"    Error: {e}, retry {attempt+1}/5 in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    return None

def extract_metadata(doc):
    """Extrahiere relevante Metadaten aus API-Dokument."""
    meta = doc.get("Data", {}).get("Metadaten", {})
    judikatur = meta.get("Judikatur", {})
    technisch = meta.get("Technisch", {})
    allgemein = meta.get("Allgemein", {})

    # Geschaeftszahl kann string oder {item: ...} oder {item: [...]} sein
    gz = judikatur.get("Geschaeftszahl", {})
    if isinstance(gz, dict):
        gz = gz.get("item", "")
    if isinstance(gz, list):
        gz = "; ".join(str(g) for g in gz)

    # Normen
    normen = judikatur.get("Normen", {})
    if isinstance(normen, dict):
        normen = normen.get("item", [])
    if isinstance(normen, str):
        normen = [normen]
    normen_str = "; ".join(normen) if normen else ""

    # Court-specific sub-object (Vwgh, Vfgh, Justiz, Bvwg, etc.)
    court_sub = None
    for key in ["Vwgh", "Vfgh", "Justiz", "Bvwg", "Lvwg", "AsylGH", "Uvs", "Dsk",
                "Gbk", "Pvak", "Dok", "Ubas", "Umse"]:
        if key in judikatur:
            court_sub = judikatur[key]
            break

    rechtssatznummer = ""
    entscheidungsart = ""
    gericht = ""
    if isinstance(court_sub, dict):
        rechtssatznummer = str(court_sub.get("Rechtssatznummer", ""))
        entscheidungsart = str(court_sub.get("Entscheidungsart", ""))
        gericht = str(court_sub.get("Gericht", ""))

    # Fallback: Organ from Technisch
    if not gericht:
        gericht = str(technisch.get("Organ", ""))

    return {
        "ecli": judikatur.get("EuropeanCaseLawIdentifier", ""),
        "case_number": str(gz),
        "decision_date": judikatur.get("Entscheidungsdatum", ""),
        "dokumenttyp": judikatur.get("Dokumenttyp", ""),
        "gericht": gericht,
        "rechtssatznummer": rechtssatznummer,
        "entscheidungsart": entscheidungsart,
        "normen": normen_str,
        "dokument_id": technisch.get("ID", ""),
        "dokument_url": allgemein.get("DokumentUrl", ""),
        "gesamte_entscheidung_url": judikatur.get("GesamteEntscheidungUrl", ""),
        "entscheidungstext_url": judikatur.get("EntscheidungstextUrl", ""),
    }

def fetch_court(applikation, label, outdir_name, resume_pages_done=0):
    """Lade alle Metadaten für einen Gericht herunter."""
    out_file = OUTPUT_DIR / f"{outdir_name}.jsonl"
    temp_file = OUTPUT_DIR / f"{outdir_name}.jsonl.tmp"

    # First page to get total count
    url = f"https://data.bka.gv.at/ris/api/v2.6/Judikatur?Applikation={applikation}&DokumenteProSeite=OneHundred&Seitennummer=1"
    data = rate_limited_fetch(url)
    if not data:
        print(f"  {label}: FAILED to fetch first page", file=sys.stderr)
        return 0

    hits = data["OgdSearchResult"]["OgdDocumentResults"]["Hits"]
    total = int(hits["#text"])
    total_pages = (total + 99) // 100

    print(f"  {label}: {total} docs, {total_pages} pages | resume from page {resume_pages_done+1}")

    # Open file for appending (resume)
    mode = "a" if resume_pages_done > 0 else "w"
    with open(out_file, mode) as f:
        # If resuming, skip pages already done
        start_page = resume_pages_done + 1
        for page in range(start_page, total_pages + 1):
            if page > 1:
                url = f"https://data.bka.gv.at/ris/api/v2.6/Judikatur?Applikation={applikation}&DokumenteProSeite=OneHundred&Seitennummer={page}"
                data = rate_limited_fetch(url)
                if not data:
                    print(f"    {label} page {page}: FAILED, skipping", file=sys.stderr)
                    continue

            docs = data["OgdSearchResult"]["OgdDocumentResults"]["OgdDocumentReference"]
            if not isinstance(docs, list):
                docs = [docs]

            for doc in docs:
                try:
                    m = extract_metadata(doc)
                    f.write(json.dumps(m, ensure_ascii=False) + "\n")
                except Exception as e:
                    print(f"    {label} page {page}: extract error: {e}", file=sys.stderr)

            if page % 100 == 0 or page == total_pages:
                print(f"    {label}: page {page}/{total_pages} ({page*100} docs)")

            # Save progress
            with lock:
                progress = {}
                if PROGRESS_FILE.exists():
                    try:
                        progress = json.loads(PROGRESS_FILE.read_text())
                    except:
                        pass
                progress[outdir_name] = {"pages_done": page, "total_pages": total_pages}
                PROGRESS_FILE.write_text(json.dumps(progress, indent=2))

    return total

def main():
    parser = argparse.ArgumentParser(description="Download RIS judikatur metadata")
    parser.add_argument("--court", default="", help="Only this court (vwgh, ogh, etc.)")
    parser.add_argument("--resume", action="store_true", help="Resume from last progress")
    args = parser.parse_args()

    print("═" * 70)
    print("  RIS METADATEN-DOWNLOAD")
    print("═" * 70)
    print(f"  Output: {OUTPUT_DIR}")
    print(f"  Delay: {DELAY_MS}ms between requests")
    print(f"  Resume: {args.resume}")
    print("─" * 70)

    # Load progress
    progress = {}
    if args.resume and PROGRESS_FILE.exists():
        try:
            progress = json.loads(PROGRESS_FILE.read_text())
            print(f"  Resume state: {progress}")
        except:
            pass

    total_docs = 0
    for applikation, label, outdir_name in COURTS:
        if args.court and args.court.lower() != outdir_name.lower():
            continue
        resume_pages = 0
        if args.resume and outdir_name in progress:
            resume_pages = progress[outdir_name].get("pages_done", 0)
        count = fetch_court(applikation, label, outdir_name, resume_pages)
        total_docs += count

    print()
    print("─" * 70)
    print(f"  GESAMT: {total_docs} Dokumente")
    print("═" * 70)

if __name__ == "__main__":
    main()
