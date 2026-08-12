#!/usr/bin/env python3
"""
Blob-Detektor — Findet alle Judikatur-Dateien ohne Markdown-Struktur.

Ein "Blob" ist eine Datei, deren Body (nach Frontmatter) keine ##-Überschriften
hat. Der Legal-Decision-Chunker braucht ## Rechtssatz, ## Norm etc. — Blobs
fallen auf den generischen Markdown-Chunker zurück → schlechte KI-Retrieval.

Output:
  - /tmp/blob-files.txt        — Liste aller Blob-Dateien (eine pro Zeile)
  - /tmp/blob-report.txt       — Zusammenfassung pro Source
  - stdout                     — Report
"""

import os
import sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
import time

CORPUS_ROOT = Path("/Users/msc/subsumio-web/law-corpus")
JUDIKATUR_DIRS = sorted([d for d in CORPUS_ROOT.iterdir() if d.name.startswith("at-judikatur") and d.is_dir()])

# A file is a "blob" if its body has NO markdown heading (## or # at start of line)
# AND body is > 200 bytes (small files may be legit short)
BLOB_MIN_SIZE = 200

def parse_body(filepath):
    """Extract body (after frontmatter) from markdown file."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        if not content.startswith("---"):
            return content
        # Find second ---
        parts = content.split("---", 2)
        if len(parts) < 3:
            return ""
        return parts[2].strip()
    except Exception:
        return ""

def is_blob(filepath):
    """Check if a file is a blob (no ## structure in body)."""
    body = parse_body(filepath)
    if len(body) < BLOB_MIN_SIZE:
        return False  # small files are not blobs, just short
    # Check for markdown structure: ## at start of line
    has_heading = False
    for line in body.split("\n"):
        if line.startswith("## ") or line.startswith("# "):
            has_heading = True
            break
    return not has_heading

def scan_file(filepath_str):
    """Scan a single file, return (is_blob, filepath)."""
    fp = Path(filepath_str)
    if fp.suffix != ".md":
        return (False, filepath_str)
    return (is_blob(filepath_str), filepath_str)

def scan_source(source_dir):
    """Scan all .md files in a source directory."""
    files = sorted(source_dir.rglob("*.md"))
    total = len(files)
    blobs = []
    for f in files:
        if is_blob(f):
            blobs.append(str(f))
    return (source_dir.name, total, len(blobs), blobs)

def main():
    start = time.time()
    print("═" * 70)
    print("  AT-JUDIKATUR BLOB-DETEKTOR")
    print("═" * 70)
    print(f"  Corpus root: {CORPUS_ROOT}")
    print(f"  Sources: {len(JUDIKATUR_DIRS)}")
    print(f"  Blob-Kriterium: Body > {BLOB_MIN_SIZE} bytes UND keine ##/# Überschrift")
    print("─" * 70)
    print()

    all_blobs = []
    report_lines = []
    report_lines.append(f"{'Source':<30} {'Total':>8} {'Blobs':>8} {'Blob-%':>8} {'Status':>10}")
    report_lines.append("─" * 70)

    for source_dir in JUDIKATUR_DIRS:
        name, total, blob_count, blobs = scan_source(source_dir)
        blob_pct = (blob_count / total * 100) if total > 0 else 0
        if blob_pct > 60:
            status = "🔴 KRITISCH"
        elif blob_pct > 30:
            status = "🟡 SCHLECHT"
        elif blob_pct > 10:
            status = "🟡 MÄSSIG"
        else:
            status = "✅ GUT"
        report_lines.append(f"{name:<30} {total:>8} {blob_count:>8} {blob_pct:>7.1f}% {status:>10}")
        all_blobs.extend(blobs)
        print(f"  {name:<30} {total:>8} {blob_count:>8} {blob_pct:>7.1f}% {status}")

    print()
    print("─" * 70)
    total_files = sum(1 for d in JUDIKATUR_DIRS for _ in d.rglob("*.md"))
    total_blobs = len(all_blobs)
    overall_pct = (total_blobs / total_files * 100) if total_files > 0 else 0
    print(f"  GESAMT: {total_files} files, {total_blobs} blobs ({overall_pct:.1f}%)")
    print()

    # Write blob list
    with open("/tmp/blob-files.txt", "w") as f:
        for b in all_blobs:
            f.write(b + "\n")
    print(f"  Blob-Liste: /tmp/blob-files.txt ({total_blobs} Einträge)")

    # Write report
    with open("/tmp/blob-report.txt", "w") as f:
        f.write("AT-JUDIKATUR BLOB-REPORT\n")
        f.write("=" * 70 + "\n")
        f.write("\n".join(report_lines))
        f.write("\n\nGESAMT: " + str(total_files) + " files, " + str(total_blobs) + " blobs (" + str(round(overall_pct, 1)) + "%)\n")
    print(f"  Report: /tmp/blob-report.txt")

    elapsed = time.time() - start
    print(f"\n  Dauer: {elapsed:.1f}s")
    print("═" * 70)

if __name__ == "__main__":
    main()
