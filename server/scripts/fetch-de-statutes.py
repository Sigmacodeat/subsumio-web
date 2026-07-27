#!/usr/bin/env python3
"""
Fetch German federal statutes from gesetze-im-internet.de (amtlich, BfJ)
and convert them to the law-corpus/de/*.md format consumed by
server/scripts/split-statutes.ts (DE mode: `## § N — Title` headings).

Usage:
  python3 server/scripts/fetch-de-statutes.py sgb_1 stvo owig ...
  python3 server/scripts/fetch-de-statutes.py --batch2   # built-in priority list

Output: law-corpus/de/<abk>.md  (frontmatter + `## § n — titel` sections)
"""

import io
import re
import sys
import time
import zipfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import date

OUT_DIR = Path(__file__).resolve().parent.parent.parent / "law-corpus" / "de"

# Priority batch: Sozialrecht, Verkehrsrecht, Arbeitsrecht-Ergänzung,
# Gesellschafts-/Finanzrecht, Wettbewerb, Bau, Medizin, Energie, Verfahren
BATCH2 = [
    "sgb_1", "sgb_2", "sgb_3", "sgb_4", "sgb_5", "sgb_6",
    "sgb_7", "sgb_8", "sgb_9", "sgb_10", "sgb_11", "sgb_12", "sgg",
    "stvo", "feg", "pflvg",
    "owig", "designg", "gwb",
    "tkg", "kwg", "vag", "wphg", "zag",
    "amg", "enwg",
    "jveg", "gbo",
    "baunvo",
    "partgg", "muschg", "jarbschg", "milog", "bbig",
]

LICENSE = "Amtliches Werk, § 5 UrhG (gemeinfrei). Quelle: gesetze-im-internet.de, Bundesamt für Justiz."
UA = {"User-Agent": "subsumio-corpus-fetch/1.0 (legal research, amtliche Daten)"}


def fetch_xml_zip(abk: str) -> bytes:
    url = f"https://www.gesetze-im-internet.de/{abk}/xml.zip"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    zf = zipfile.ZipFile(io.BytesIO(data))
    xml_names = [n for n in zf.namelist() if n.lower().endswith(".xml")]
    if not xml_names:
        raise RuntimeError(f"kein XML in {url}")
    return zf.read(xml_names[0]), url


def norm_text(norm: ET.Element) -> str:
    content = norm.find(".//textdaten/text/Content")
    if content is None:
        return ""
    paras = []
    for p in content.iter("P"):
        t = "".join(p.itertext()).strip()
        if t:
            paras.append(t)
    if not paras:
        t = "".join(content.itertext()).strip()
        return t
    return "\n".join(paras)


def convert(abk: str) -> tuple[int, str]:
    xml_bytes, url = fetch_xml_zip(abk)
    root = ET.fromstring(xml_bytes)

    langue = root.findtext(".//langue") or abk.upper()
    amtabk = (root.findtext(".//amtabk") or abk).strip()
    version = root.findtext(".//ausfertigung-datum") or "unknown"

    abbr = abk.upper()  # slug-safe (sgb_1 -> SGB_1, stvo -> STVO)
    sections = []
    for norm in root.iter("norm"):
        enbez = (norm.findtext("./metadaten/enbez") or "").strip()
        titel = (norm.findtext("./metadaten/titel") or "").strip()
        m = re.match(r"^§\s*(\d+[a-zA-Z]?)\s*$", enbez)
        if not m:
            continue  # nur §-Normen; ToC/Anlagen/Eingang v1 überspringen
        body = norm_text(norm)
        if not body and "weggefallen" in titel.lower():
            continue  # aufgehobene Normen ohne Text überspringen
        heading = f"## § {m.group(1)}"
        heading += f" — {titel}" if titel else ""
        sections.append(f"{heading}\n\n{body}".rstrip())

    if not sections:
        raise RuntimeError(f"keine §-Normen gefunden in {abk}")

    fm = [
        "---",
        f'title: "{amtabk} — {langue}"',
        'type: "law"',
        'jurisdiction: "de"',
        f'abbreviation: "{abbr}"',
        f'version_date: "{version}"',
        f'retrieved_at: "{date.today().isoformat()}"',
        f'source_url: "{url}"',
        f'license: "{LICENSE}"',
        "---",
        "",
    ]
    out = "\n".join(fm) + "\n\n".join(sections) + "\n"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"{abk}.md").write_text(out, encoding="utf-8")
    return len(sections), f"{amtabk} ({version})"


def main():
    args = [a for a in sys.argv[1:]]
    abks = BATCH2 if "--batch2" in args else args
    if not abks:
        print(__doc__)
        sys.exit(1)
    ok, failed = 0, []
    for abk in abks:
        try:
            n, info = convert(abk)
            print(f"  ✓ {abk:12s} {n:4d} §§  {info}")
            ok += 1
        except Exception as e:
            print(f"  ✗ {abk:12s} FEHLER: {e}")
            failed.append(abk)
        time.sleep(0.5)
    print(f"\nFertig: {ok} Gesetze konvertiert, {len(failed)} fehlgeschlagen: {failed}")


if __name__ == "__main__":
    main()
