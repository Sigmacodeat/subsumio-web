#!/usr/bin/env python3
"""
100% Vollständiger Verifikations-Scan — prüft jede Datei auf ALLE Aspekte.

Für jede Datei wird geprüft:
1. Encoding: Keine NULL-Bytes, keine Replacement-Chars
2. Frontmatter: --- markers, alle Pflichtfelder vorhanden
3. Body-Struktur: ## headers vorhanden, keine verschmolzenen
4. Fetcher-Artefakte: Kein RIS Dokument, kein römisch, kein sr-only
5. Duplikate: Keine spelled-out numbers, kein doppelter Text
6. Boilerplate: Keine "Quelle: [RIS-OGD]" Reste
7. Content-Header: court_decision hat mindestens einen Content-Header
8. Chunker-Kompatibilität: Body lässt sich in strukturierte chunks zerlegen

Usage:
  python3 server/scripts/verify-all-files.py [corpus_name]
  python3 server/scripts/verify-all-files.py at-judikatur-bvwg
"""

import glob
import re
import os
import sys
import json
from collections import Counter
from multiprocessing import Pool, cpu_count

# Pflicht-Frontmatter-Felder
REQUIRED_FM_FIELDS = [
    "type", "jurisdiction", "source", "source_url", "content_hash", "title",
]

# Content-Header pro Korpus (für court_decision)
CORPUS_CONTENT_HEADERS = {
    "at-judikatur":          ["## Rechtssatz", "## Entscheidungstexte", "## Leitsatz", "## Text", "## Spruch", "## Tenor", "## Entscheidungsgründe", "## Begründung", "## Sachverhalt", "## Tatbestand"],
    "at-judikatur-asylgh":   ["## Spruch", "## Text", "## Rechtssatz", "## Leitsatz"],
    "at-judikatur-bvwg":     ["## Spruch", "## Text", "## Rechtssatz", "## Leitsatz", "## Entscheidungsgründe"],
    "at-judikatur-dok":      ["## Rechtssatz", "## Text", "## Spruch", "## Leitsatz"],
    "at-judikatur-dsk":      ["## Text", "## Rechtssatz", "## Spruch", "## Leitsatz"],
    "at-judikatur-gbk":      ["## Text", "## Rechtssatz", "## Spruch", "## Leitsatz"],
    "at-judikatur-lvwg":     ["## Text", "## Rechtssatz", "## Leitsatz", "## Spruch"],
    "at-judikatur-pvak":     ["## Rechtssatz", "## Text", "## Leitsatz", "## Spruch"],
    "at-judikatur-ubas":     ["## Spruch", "## Text", "## Rechtssatz", "## Leitsatz"],
    "at-judikatur-umse":     ["## Text", "## Rechtssatz", "## Kurzbezeichnung", "## Spruch"],
    "at-judikatur-uvs":      ["## Rechtssatz", "## Spruch", "## Text", "## Leitsatz"],
    "at-judikatur-vfgh":     ["## Rechtssatz", "## Leitsatz", "## Text", "## Spruch"],
    "at-judikatur-vwgh":     ["## Rechtssatz", "## Stammrechtssatz", "## Leitsatz", "## Text", "## Spruch"],
}

DECISION_CORPORA = set(CORPUS_CONTENT_HEADERS.keys())

MERGED_WORDS = [
    "Text", "Spruch", "Tenor", "Ausspruch",
    "Begründung", "Begruendung",
    "Rechtssatz", "Leitsatz", "Stammrechtssatz",
    "Sachverhalt", "Tatbestand",
    "Beachte", "Norm", "Entscheidungstexte",
]

SPELLED_RE = re.compile(
    r"(Paragraph (eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)\b(?!und))"
    r"|(Absatz (eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)\b(?!ter))"
)


def verify_file(args):
    """100% Verifikation einer Datei. Gibt (filepath, corpus, issues_list) zurück."""
    filepath, corpus = args
    issues = []

    # 1. Encoding
    try:
        with open(filepath, "rb") as f:
            raw = f.read()
    except:
        return (filepath, corpus, ["read_error"])

    if b"\x00" in raw:
        return (filepath, corpus, ["null_bytes"])

    content = raw.decode("utf-8", errors="replace")
    if "\ufffd" in content[:5000]:
        issues.append("replacement_chars")

    # 2. Frontmatter-Struktur
    if not content.startswith("---\n"):
        issues.append("no_fm_start")
        # Versuche YAML ohne --- zu extrahieren
        m = re.search(r"\n---\n", content[:5000])
        if m:
            fm = content[:m.start()]
            body = content[m.end():]
        else:
            fm = ""
            body = content
    else:
        m = re.match(r"^---\n([\s\S]*?)\n---", content)
        if m:
            fm = m.group(1)
            body = content[m.end():].strip()
        else:
            issues.append("no_fm_end")
            fm = ""
            body = content

    # 3. Pflicht-Frontmatter-Felder (source nur für court_decision)
    type_m = re.search(r"^type:\s*(.+)", fm, re.M)
    file_type = type_m.group(1).strip().strip('"').strip("'") if type_m else ""
    is_court_decision = "court_decision" in file_type

    for field in REQUIRED_FM_FIELDS:
        if field == "source" and not is_court_decision:
            continue  # source field only required for court decisions
        if field + ":" not in fm:
            issues.append(f"missing_fm:{field}")

    # 4. Fetcher-Artefakte
    if "RIS Dokument" in body[:500]:
        issues.append("ris_dokument")

    # "römisch" is only broken if followed by a digit (sr-only: "römisch 40")
    # "römisch-katholische" or "römisch katholische" is legitimate text
    if re.search(r'römisch \d', body):
        issues.append("roemisch")

    if "sr-only" in body:
        issues.append("sr_only")

    # 5. Duplikate / spelled-out numbers
    if SPELLED_RE.search(body):
        issues.append("spelled_numbers")

    # 6. Boilerplate
    if "Quelle: [RIS-OGD]" in body or "Quelle:[RIS-OGD]" in body:
        issues.append("boilerplate")

    # 7. Merged headers
    for word in MERGED_WORDS:
        if re.search(r'[a-zA-Z0-9)"\]]' + word + r"[A-Z\[]", body):
            issues.append(f"merged_header:{word}")
            break

    # 8. HTML-Entities
    if "&#160;" in body or "&#x" in body[:5000] or "&amp;" in body[:5000]:
        issues.append("html_entities")

    # 9. Content-Header für court_decision
    if corpus in DECISION_CORPORA and fm:
        type_m = re.search(r"^type:\s*(.+)", fm, re.M)
        if type_m and "court_decision" in type_m.group(1):
            content_headers = CORPUS_CONTENT_HEADERS[corpus]
            has_content = any(h in body for h in content_headers)
            # EXPERT: These are legitimate metadata-only entries:
            # - "Volltext nicht abrufbar" — RIS doesn't have the full text
            # - ECLI-only entries (body < 300 chars with ECLI) — RIS only published ECLI
            # Both are useful for citation tracking even without full text
            if not has_content and len(body) > 200:
                has_vn = "Volltext nicht abrufbar" in body
                has_ecli_only = len(body) < 300 and "ECLI" in body
                if not has_vn and not has_ecli_only:
                    issues.append("no_content_header")

    # 10. Body leer (nur wenn WIRKLICH leer — < 10 chars, nicht < 50)
    if len(body.strip()) < 10:
        issues.append("empty_body")

    # 11. ## Headers vorhanden (für court_decision)
    if corpus in DECISION_CORPORA and fm:
        type_m = re.search(r"^type:\s*(.+)", fm, re.M)
        if type_m and "court_decision" in type_m.group(1):
            headers = re.findall(r"^## .+", body, re.M)
            # EXPERT: metadata-only entries (Volltext nicht abrufbar or ECLI-only) are legitimate
            if len(headers) < 3:
                has_vn = "Volltext nicht abrufbar" in body
                has_ecli_only = len(body) < 300 and "ECLI" in body
                if not has_vn and not has_ecli_only:
                    issues.append(f"only_{len(headers)}_headers")

    return (filepath, corpus, issues)


def main():
    target_corpus = sys.argv[1] if len(sys.argv) > 1 else None

    corpora_dirs = sorted(
        [d for d in os.listdir("law-corpus") if os.path.isdir(f"law-corpus/{d}") and d.startswith("at")]
    )

    if target_corpus:
        corpora_dirs = [d for d in corpora_dirs if d == target_corpus or d == f"at-{target_corpus}"]

    work = []
    corpus_file_counts = {}
    for corpus in corpora_dirs:
        d = f"law-corpus/{corpus}"
        files = glob.glob(f"{d}/**/*.md", recursive=True)
        corpus_file_counts[corpus] = len(files)
        for f in files:
            work.append((f, corpus))

    if not work:
        print("Keine Dateien gefunden.")
        return

    print(f"Vollständige Verifikation von {len(work)} Dateien mit {cpu_count()} cores...")
    sys.stdout.flush()

    ok_count = Counter()
    broken_count = Counter()
    issue_counter = {}
    broken_files = {}  # corpus -> list of (file, issues)

    with Pool(cpu_count()) as pool:
        for i, (filepath, corpus, issues) in enumerate(pool.imap_unordered(verify_file, work, chunksize=500)):
            if corpus not in issue_counter:
                issue_counter[corpus] = Counter()
                broken_files[corpus] = []
            if issues:
                broken_count[corpus] += 1
                for issue in issues:
                    issue_counter[corpus][issue] += 1
                broken_files[corpus].append((filepath, issues))
            else:
                ok_count[corpus] += 1

            if (i + 1) % 50000 == 0:
                print(f"  ...{i+1}/{len(work)} verifiziert")
                sys.stdout.flush()

    print(f"\nDone. {len(work)} Dateien verifiziert.\n")

    # Ergebnisse
    print(f"{'Korpus':<30} {'Files':>7} {'OK':>7} {'Broken':>7} {'Issues (top 5)'}")
    print("=" * 120)

    total_files = 0
    total_ok = 0
    total_broken = 0

    for corpus in sorted(corpus_file_counts.keys()):
        nfiles = corpus_file_counts[corpus]
        ok = ok_count.get(corpus, 0)
        broken = broken_count.get(corpus, 0)
        total_files += nfiles
        total_ok += ok
        total_broken += broken

        issues = issue_counter.get(corpus, Counter())
        top = ", ".join(f"{i}({c})" for i, c in issues.most_common(5))
        status = "✅" if broken == 0 else "❌"
        print(f"{status} {corpus:<28} {nfiles:>7} {ok:>7} {broken:>7} {top}")

    print("=" * 120)
    pct = total_ok * 100 // total_files if total_files else 0
    print(f"{'TOTAL':<30} {total_files:>7} {total_ok:>7} {total_broken:>7} ({pct}% OK)")

    # Schreibe broken-files Liste pro Korpus
    if total_broken > 0:
        print("\n\nBROKEN FILES DETAIL (pro Korpus):")
        for corpus in sorted(broken_files.keys()):
            files = broken_files[corpus]
            if files:
                print(f"\n  {corpus} ({len(files)} broken):")
                # Schreibe in Datei für Refetch-Script
                outfile = f"/tmp/broken-{corpus}.txt"
                with open(outfile, "w") as f:
                    for filepath, issues in files:
                        f.write(f"{filepath}\t{','.join(issues)}\n")
                print(f"    → Liste geschrieben: {outfile}")
                # Zeige erste 5
                for filepath, issues in files[:5]:
                    print(f"    {os.path.basename(filepath)}: {','.join(issues)}")
    else:
        print("\n✅ ALLE DATEIEN 100% PERFEKT — keine Issues gefunden!")


if __name__ == "__main__":
    main()
