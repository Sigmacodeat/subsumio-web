#!/usr/bin/env python3
"""Fix all remaining structural issues — final pass."""
import re, os, hashlib
from multiprocessing import Pool, cpu_count

SPELLED_MAP = {
    'eins': '1', 'zwei': '2', 'drei': '3', 'vier': '4', 'fünf': '5',
    'sechs': '6', 'sieben': '7', 'acht': '8', 'neun': '9', 'zehn': '10',
    'elf': '11', 'zwölf': '12',
}

def fix_file(filepath):
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except:
        return []
    
    original = content
    fixes = []
    
    # Ensure frontmatter
    if not content.startswith("---\n"):
        m = re.search(r"\n---\n", content[:5000])
        if m:
            content = f"---\n{content[:m.start()]}\n---\n{content[m.end():]}"
            fixes.append("added_fm_start")
        else:
            return []
    
    m = re.match(r"^---\n([\s\S]*?)\n---\n?", content)
    if not m: return []
    fm = m.group(1)
    body = content[m.end():].lstrip("\n")
    
    # 1. Fix missing title
    if "title:" not in fm:
        h1_m = re.match(r'^# (.+)', body, re.M)
        cn_m = re.search(r'case_number:\s*"?([^"\n]+)"?', fm)
        gz_m = re.search(r'geschaeftszahl:\s*"?([^"\n]+)"?', fm)
        ecli_m = re.search(r'ecli:\s*"?([^"\n]+)"?', fm)
        title = (h1_m.group(1) if h1_m else 
                cn_m.group(1) if cn_m else 
                gz_m.group(1) if gz_m else 
                ecli_m.group(1) if ecli_m else 
                os.path.splitext(os.path.basename(filepath))[0].replace('-', ' '))
        fm = f'title: "{title}"\n{fm}'
        fixes.append("added_title")
    
    # 2. Fix missing jurisdiction
    if "jurisdiction:" not in fm:
        fm = f'jurisdiction: at\n{fm}'
        fixes.append("added_jurisdiction")
    
    # 3. Fix missing type
    if "type:" not in fm:
        if "judikatur" in filepath or "bvwg" in filepath or "vwgh" in filepath:
            fm = f'type: court_decision\n{fm}'
        else:
            fm = f'type: law\n{fm}'
        fixes.append("added_type")
    
    # 4. Fix missing source (for court_decision only)
    type_m = re.search(r'^type:\s*"?([^"\n]+)"?', fm, re.M)
    is_court = type_m and "court_decision" in type_m.group(1)
    
    if is_court and "source:" not in fm:
        fm = f'source: ris-ogd\n{fm}'
        fixes.append("added_source")
    
    # 5. Fix missing source_url
    if is_court and "source_url:" not in fm:
        url_m = re.search(r'(https?://[^\s]+)', body)
        if url_m:
            fm = f'source_url: "{url_m.group(1)}"\n{fm}'
        else:
            fm = f'source_url: ""\n{fm}'
        fixes.append("added_source_url")
    
    # 6. Fix missing content_hash
    if is_court and "content_hash:" not in fm:
        h = hashlib.sha1(body.encode('utf-8')).hexdigest()[:16]
        fm = f'content_hash: "{h}"\n{fm}'
        fixes.append("added_content_hash")
    
    # 7. Fix spelled numbers in body
    for word, num in SPELLED_MAP.items():
        new_body = re.sub(r'Paragraph ' + word + r'\b', f'§ {num}', body)
        new_body = re.sub(r'Absatz ' + word + r'\b', f'Abs. {num}', new_body)
        if new_body != body:
            body = new_body
            if "spelled_numbers" not in fixes:
                fixes.append("spelled_numbers")
    
    # 8. Fix ris_dokument
    if "RIS Dokument" in body[:500]:
        body = body[:500].replace("RIS Dokument", "") + body[500:]
        fixes.append("ris_dokument")
    
    # Reassemble
    content = f"---\n{fm}\n---\n\n{body}"
    if not content.endswith("\n"):
        content += "\n"
    
    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
    
    return fixes

if __name__ == "__main__":
    # Read all broken file lists
    broken = set()
    for listfile in os.listdir('/tmp'):
        if listfile.startswith('broken-at-') and listfile.endswith('.txt'):
            with open(f'/tmp/{listfile}') as f:
                for line in f:
                    parts = line.strip().split('\t')
                    if len(parts) == 2:
                        broken.add(parts[0])
    
    broken = [f for f in broken if os.path.exists(f)]
    print(f"Fixing {len(broken)} files...")
    import sys; sys.stdout.flush()
    
    fixed = 0
    fix_counter = {}
    with Pool(cpu_count()) as pool:
        for i, fixes in enumerate(pool.imap_unordered(fix_file, broken, chunksize=10)):
            if fixes:
                fixed += 1
                for fix in fixes:
                    fix_counter[fix] = fix_counter.get(fix, 0) + 1
            if (i + 1) % 50 == 0:
                print(f"  ...{i+1}/{len(broken)}")
                sys.stdout.flush()
    
    print(f"\nFixed: {fixed}/{len(broken)}")
    if fix_counter:
        for fix, count in sorted(fix_counter.items(), key=lambda x: -x[1]):
            print(f"  {fix:30s} {count:6d}")
