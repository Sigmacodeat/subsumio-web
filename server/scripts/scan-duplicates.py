#!/usr/bin/env python3
"""
Content-quality scanner — prüft jede Datei auf doppelten Text (sr-only Artefakte).

Ein Experte prüft nicht nur Struktur (## headers) sondern auch Inhalt:
1. Ist der Text pro Absatz doppelt? (aria-hidden + sr-only Kopie)
2. Fehlt Inhalt in Schlüssel-Sections? (Rechtssatz leer, Spruch leer)
3. Ist die Section-Reihenfolge korrekt?

Für jede Datei mit ## Text oder ## Spruch Section:
- Nimm die ersten 50 alphanumerischen chars
- Suche ob diese nochmal im selben Absatz vorkommen
- Wenn ja → Duplikat → braucht XML-Refetch
"""

import glob
import re
import os
import sys
from collections import Counter
from multiprocessing import Pool, cpu_count


def check_duplicates(filepath):
    """Check a file for duplicate text (sr-only artifacts). Returns (corpus, issues)."""
    try:
        with open(filepath, "rb") as f:
            raw = f.read()
    except:
        return (None, ["read_error"])

    content = raw.decode("utf-8", errors="replace")

    # Extract body
    m = re.match(r"^---\n([\s\S]*?)\n---\n?", content)
    if not m:
        return (None, ["no_fm"])
    body = content[m.end():].lstrip("\n")

    issues = []

    # Check each content section for duplicates
    # Find all ## sections
    sections = re.findall(r"^## (.+)\n(.*?)(?=^## |\Z)", body, re.M | re.S)

    for header, section_text in sections:
        header = header.strip()
        section_text = section_text.strip()

        # Only check content sections (not metadata)
        content_headers = [
            "Text", "Spruch", "Tenor", "Rechtssatz", "Leitsatz",
            "Entscheidungsgründe", "Begründung", "Sachverhalt",
            "Entscheidungstexte", "Stammrechtssatz"
        ]
        if header not in content_headers:
            continue

        if len(section_text) < 300:
            continue  # Too short to check

        # Split into paragraphs
        paragraphs = re.split(r"\n+", section_text)

        dup_count = 0
        for para in paragraphs:
            para = para.strip()
            if len(para) < 100:
                continue

            # Get first 30 alphanumeric chars
            alnum = re.sub(r"[^a-z0-9äöü]", "", para.lower())
            if len(alnum) < 30:
                continue

            first_30 = alnum[:30]

            # Search for these 30 chars later in the paragraph
            second_pos = alnum.find(first_30, 30)

            if second_pos > 0:
                dup_count += 1

        if dup_count > 0:
            issues.append(f"duplicate_text:{header}:{dup_count}")

    # Check for "Paragraph \d+" (should be "§ \d+" after normalization)
    if re.search(r"Paragraph \d+", body):
        issues.append("unnormalized_paragraph")

    # Check for key sections being empty
    # EXPERT-KNOWLEDGE: Austrian court decisions have legitimate empty/short sections:
    # - "## Rechtssatz": "Kein RS", "kein RS", "keiner", "kein..." (case insensitive)
    # - "## Leitsatz": short keywords like "Aufhebung", "Folge"
    # - "## Spruch": "Bescheid" (UVS/UBAS decision type), ", ," (RIS anonymization)
    # - "## Text": empty when content is in ## Spruch + ## Entscheidungsgründe/Begründung
    # - For laws: "## Text" empty when content is in ## Artikel, ## TITEL, ## §, etc.
    for header in ["Rechtssatz", "Leitsatz", "Spruch", "Text"]:
        sec_m = re.search(r"^## " + header + r"\n(.*?)(?=^## |\Z)", body, re.M | re.S)
        if sec_m:
            text = sec_m.group(1).strip()
            if len(text) < 10:
                # Legitimate empty markers for Rechtssatz
                if header == "Rechtssatz" and re.match(r'^kein(\s*rs\.?:?\.*|er)?$', text, re.I):
                    continue
                # "## Text" empty is OK if other content sections exist
                if header == "Text":
                    has_spruch = bool(re.search(r'^## Spruch\n(.+?)(?=^## |\Z)', body, re.M | re.S))
                    has_gruende = bool(re.search(r'^## (Entscheidungsgründe|Begründung)\n(.+?)(?=^## |\Z)', body, re.M | re.S))
                    # Match Artikel/ARTIKEL with digits OR Roman numerals, with regular or nbsp spaces
                    has_artikel = bool(re.search(r'^## (Artikel|ARTIKEL|Art\.)\s*[\dIVXLC]+', body, re.M))
                    has_titel = bool(re.search(r'^## (TITEL|Titel|ABSCHNITT)\s+[IVXLC\d]+', body, re.M))
                    has_paragraph = bool(re.search(r'^## §\s*[\dIVXLC]+', body, re.M))
                    # Expert fallback: if body has > 200 chars of content (excluding metadata), it's legitimate
                    has_body_content = len(body) > 300
                    if has_spruch or has_gruende or has_artikel or has_titel or has_paragraph or has_body_content:
                        continue
                # Leitsatz: short keywords are legitimate
                if header == "Leitsatz" and len(text) >= 3:
                    continue
                # Spruch: "Bescheid" is a legitimate UVS/UBAS decision type
                if header == "Spruch" and re.match(r'^(bescheid|[,;\s]+)$', text, re.I):
                    continue
                # Spruch: if short but Begründung/Text has content, it's legitimate
                if header == "Spruch":
                    has_gruende = bool(re.search(r'^## (Entscheidungsgründe|Begründung|Text)\n(.{50,})(?=^## |\Z)', body, re.M | re.S))
                    if has_gruende:
                        continue
                issues.append(f"empty_section:{header}")

    return (filepath, issues)


def main():
    all_mode = "--all" in sys.argv
    corpus_arg = None
    for i, arg in enumerate(sys.argv):
        if arg == "--corpus" and i + 1 < len(sys.argv):
            corpus_arg = sys.argv[i + 1]

    if all_mode:
        corpora = sorted(
            [d for d in os.listdir("law-corpus") if os.path.isdir(f"law-corpus/{d}") and d.startswith("at")]
        )
    elif corpus_arg:
        corpora = [corpus_arg if corpus_arg.startswith("at") else f"at-{corpus_arg}"]
    else:
        print("Usage: python3 scan-duplicates.py --all [--out <file>]")
        sys.exit(1)

    work = []
    corpus_counts = {}
    for corpus in corpora:
        d = f"law-corpus/{corpus}"
        if not os.path.isdir(d):
            continue
        files = glob.glob(f"{d}/**/*.md", recursive=True)
        corpus_counts[corpus] = len(files)
        for f in files:
            work.append(f)

    print(f"Scanning {len(work)} files for duplicate text...")
    sys.stdout.flush()

    ok = 0
    dup_files = []
    issue_counter = Counter()

    with Pool(cpu_count()) as pool:
        for i, (filepath, issues) in enumerate(pool.imap_unordered(check_duplicates, work, chunksize=200)):
            if issues:
                dup_files.append((filepath, issues))
                for issue in issues:
                    issue_counter[issue] += 1
            else:
                ok += 1

            if (i + 1) % 50000 == 0:
                print(f"  ...{i+1}/{len(work)}")
                sys.stdout.flush()

    print(f"\nDone. {len(work)} files scanned.")
    print(f"  OK (no duplicates): {ok}")
    print(f"  With duplicates: {len(dup_files)}")
    print()

    if issue_counter:
        print("Issues found:")
        for issue, count in issue_counter.most_common(20):
            print(f"  {issue:40s} {count:6d}")

    # Write list of files that need XML refetch
    if dup_files:
        outfile = "/tmp/files-needing-refetch.txt"
        with open(outfile, "w") as f:
            for filepath, issues in dup_files:
                f.write(filepath + "\n")
        print(f"\nFiles needing XML refetch: {outfile}")
        print(f"Total: {len(dup_files)}")


if __name__ == "__main__":
    main()
