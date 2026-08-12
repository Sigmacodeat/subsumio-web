#!/usr/bin/env python3
"""
Lokale Reparatur für at/ root und at-landesrecht Dateien.
Fixt merged headers ("KurztitelValue" → "## Kurztitel\nValue")
und entfernt sr-only Duplikate ("BGBl. I Nr. X/YBundesgesetzblatt Teil eins...").
"""
import re
import sys
import os
from pathlib import Path
from multiprocessing import Pool, cpu_count

# Known law metadata header names (from RIS XML structure)
# These appear as "HeaderNameValue" in merged-header files
LAW_HEADERS = [
    "Kurztitel",
    "Kundmachungsorgan",
    "Inkrafttretensdatum",
    "Außerkrafttretensdatum",
    "Langtitel",
    "Änderung",
    "Präambel/Promulgationsklausel",
    "Typ",
    "Index",
    "Abkürzung",
    "Anmerkung",
    "Schlagworte",
    "Gesetzesnummer",
    "Dokumentnummer",
    "§/Artikel/Anlage",
    "Text",
    "Zuletzt aktualisiert am",
    "alte Dokumentnummer",
    "Umschreibung",
    "Bestand",
    "Schlagwort",
    "Normabkürzung",
    "Norm",
    "Volltext",
    "Eli",
    "Europäische Rechtsakte",
    "Inkrafttreten",
    "Außerkrafttreten",
    "Anlage",
    "Paragraph",
]

# sr-only duplicate patterns to remove
# These are long-form duplicates that appear right after the short form
SR_DUP_PATTERNS = [
    # BGBl. I Nr. X/Y → remove "Bundesgesetzblatt Teil eins, Nr. X aus Y,"
    (r'(BGBl\.\s*I\s*Nr\.\s*\d+/\d+)Bundesgesetzblatt Teil eins, Nr\. \d+ aus \d+,?', r'\1'),
    # BGBl. II Nr. X/Y → remove "Bundesgesetzblatt Teil zwei, Nr. X aus Y,"
    (r'(BGBl\.\s*II\s*Nr\.\s*\d+/\d+)Bundesgesetzblatt Teil zwei, Nr\. \d+ aus \d+,?', r'\1'),
    # BGBl. III Nr. X/Y → remove "Bundesgesetzblatt Teil drei, Nr. X aus Y,"
    (r'(BGBl\.\s*III\s*Nr\.\s*\d+/\d+)Bundesgesetzblatt Teil drei, Nr\. \d+ aus \d+,?', r'\1'),
    # BGBl. Nr. X/Y → remove "Bundesgesetzblatt Nr. X aus Y,"
    (r'(BGBl\.\s*Nr\.\s*\d+/\d+)Bundesgesetzblatt Nr\. \d+ aus \d+,?', r'\1'),
    # JGS Nr. X/Y → remove "Justizgesetze Nr. X aus Y,"
    (r'(JGS\s*Nr\.\s*\d+/\d+)Justizgesetze Nr\. \d+ aus \d+,?', r'\1'),
    # StGBl. Nr. X → remove "Staatsgesetzblatt Nr. X aus Y,"
    (r'(StGBl\.\s*Nr\.\s*\d+/\d+)Staatsgesetzblatt Nr\. \d+ aus \d+,?', r'\1'),
    # LGBl. Nr. X/Y → remove "Landesgesetzblatt Nr. X aus Y,"
    (r'(LGBl\.\s*Nr\.\s*\d+/\d+)Landesgesetzblatt Nr\. \d+ aus \d+,?', r'\1'),
    # Remove "Paragraph/Artikel/Anlage" label (sr-only duplicate of §/Artikel/Anlage)
    (r'Paragraph/Artikel/Anlage', ''),
]


def fix_file(filepath):
    """Fix a single file. Returns (filepath, fixes_applied) or (filepath, []) if no changes."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except:
        return (filepath, [])

    # Extract frontmatter
    m = re.match(r'^---\n([\s\S]*?)\n---', content)
    if not m:
        return (filepath, [])
    fm = m.group(1)
    body = content[m.end():].lstrip('\n')

    fixes = []
    body_fixed = body

    # 1. Split merged headers: "HeaderNameValue" → "## HeaderName\nValue"
    # Only if the body does NOT already have ## headers
    has_h2 = bool(re.search(r'^## ', body_fixed, re.M))
    if not has_h2:
        for header in LAW_HEADERS:
            # Match "HeaderName" at start of line followed by a non-whitespace char
            pattern = r'^(' + re.escape(header) + r')(\S)'
            replacement = r'## \1\n\2'
            new_body = re.sub(pattern, replacement, body_fixed, flags=re.M)
            if new_body != body_fixed:
                body_fixed = new_body
                if 'merged_header' not in fixes:
                    fixes.append('merged_header')

    # 2. Remove sr-only duplicates
    for pattern, replacement in SR_DUP_PATTERNS:
        new_body = re.sub(pattern, replacement, body_fixed)
        if new_body != body_fixed:
            body_fixed = new_body
            if 'sr_duplicate' not in fixes:
                fixes.append('sr_duplicate')

    # 3. Clean up: remove empty lines that result from fixes
    # (e.g., "## §/Artikel/Anlage\n" followed by empty content)
    body_fixed = re.sub(r'\n{3,}', '\n\n', body_fixed)

    # 4. Ensure body ends with newline
    body_fixed = body_fixed.rstrip() + '\n'

    if body_fixed != body:
        # Reassemble
        content_new = f"---\n{fm}\n---\n\n{body_fixed}"
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content_new)
        return (filepath, fixes)

    return (filepath, [])


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Fix merged headers and sr-only duplicates in law files')
    parser.add_argument('--dir', required=True, help='Directory to process')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be fixed without writing')
    parser.add_argument('--limit', type=int, default=0, help='Limit number of files (0 = all)')
    args = parser.parse_args()

    folder = Path(args.dir)
    if not folder.exists():
        print(f"Directory not found: {args.dir}")
        return

    # Find all .md files
    files = sorted(folder.glob('**/*.md'))
    if args.limit > 0:
        files = files[:args.limit]

    print(f"Processing {len(files)} files in {args.dir}...")
    sys.stdout.flush()

    if args.dry_run:
        # Dry run: just count
        fixed_count = 0
        fix_types = {}
        for i, f in enumerate(files):
            _, fixes = fix_file(str(f))
            if fixes:
                fixed_count += 1
                for fix in fixes:
                    fix_types[fix] = fix_types.get(fix, 0) + 1
            if (i + 1) % 200 == 0:
                print(f"  ...{i+1}/{len(files)}")
                sys.stdout.flush()
        print(f"\nWould fix: {fixed_count}/{len(files)}")
        for fix, count in sorted(fix_types.items(), key=lambda x: -x[1]):
            print(f"  {fix}: {count}")
    else:
        # Real run with multiprocessing
        fixed_count = 0
        fix_types = {}
        with Pool(cpu_count()) as pool:
            for i, (filepath, fixes) in enumerate(pool.imap_unordered(fix_file, [str(f) for f in files], chunksize=50)):
                if fixes:
                    fixed_count += 1
                    for fix in fixes:
                        fix_types[fix] = fix_types.get(fix, 0) + 1
                if (i + 1) % 200 == 0:
                    print(f"  ...{i+1}/{len(files)}")
                    sys.stdout.flush()

        print(f"\nFixed: {fixed_count}/{len(files)}")
        for fix, count in sorted(fix_types.items(), key=lambda x: -x[1]):
            print(f"  {fix}: {count}")


if __name__ == "__main__":
    main()
