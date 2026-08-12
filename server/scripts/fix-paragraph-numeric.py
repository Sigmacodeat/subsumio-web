#!/usr/bin/env python3
"""Fix 'Paragraph \d+' → '§ \d+' and 'Absatz \d+' → 'Abs. \d+' in all files."""
import glob, re, os
from multiprocessing import Pool, cpu_count

def fix_paragraph(filepath):
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except:
        return False
    if not re.search(r'Paragraph \d+|Absatz \d+', content):
        return False
    m = re.match(r"^---\n([\s\S]*?)\n---\n?", content)
    if not m:
        new_content = re.sub(r'Paragraph (\d+)', r'§ \1', content)
        new_content = re.sub(r'Absatz (\d+)', r'Abs. \1', new_content)
    else:
        fm = m.group(1)
        body = content[m.end():]
        body = re.sub(r'Paragraph (\d+)', r'§ \1', body)
        body = re.sub(r'Absatz (\d+)', r'Abs. \1', body)
        new_content = f"---\n{fm}\n---\n{body}"
    if new_content != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        return True
    return False

if __name__ == "__main__":
    files = []
    for corpus in sorted([d for d in os.listdir("law-corpus") if d.startswith("at") and os.path.isdir(f"law-corpus/{d}")]):
        files.extend(glob.glob(f"law-corpus/{corpus}/**/*.md", recursive=True))
    print(f"Fixing {len(files)} files...")
    import sys; sys.stdout.flush()
    fixed = 0
    with Pool(cpu_count()) as pool:
        for i, was_fixed in enumerate(pool.imap_unordered(fix_paragraph, files, chunksize=500)):
            if was_fixed: fixed += 1
            if (i + 1) % 50000 == 0:
                print(f"  ...{i+1}/{len(files)}")
                sys.stdout.flush()
    print(f"\nFixed: {fixed} files")
