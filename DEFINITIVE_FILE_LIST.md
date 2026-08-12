# DEFINITIVE DATEI-LISTE — Struktur-aware Scan

> **Stand:** 2026-08-02 22:05  
> **Scan-Methode:** Multiprocessing (10 cores), 8KB/file, struktur-aware  
> **Scan-Dauer:** 84 Sekunden für 704.489 Dateien  
> **Total:** 704.489 Dateien in 27 AT-Korpora  
> **OK:** 581.727 (82%) — **Broken:** 122.762 (18%)

## Struktur-Profile pro Korpus (erkannt)

| Korpus | Typ | Normale Content-Headers |
|--------|-----|------------------------|
| at-judikatur (OGH) | court_decision | `## Rechtssatz`, `## Entscheidungstexte`, `## Leitsatz` |
| at-judikatur-vwgh | court_decision | `## Rechtssatz`, `## Stammrechtssatz`, `## Leitsatz` |
| at-judikatur-vfgh | court_decision | `## Rechtssatz`, `## Leitsatz` |
| at-judikatur-asylgh | court_decision | `## Spruch`, `## Text` |
| at-judikatur-bvwg | court_decision | `## Spruch`, `## Text` |
| at-judikatur-lvwg | court_decision | `## Text`, `## Rechtssatz` |
| at-judikatur-uvs | court_decision | `## Rechtssatz`, `## Spruch`, `## Text` |
| at-judikatur-ubas | court_decision | `## Spruch`, `## Text` |
| at-judikatur-umse | court_decision | `## Text`, `## Rechtssatz`, `## Kurzbezeichnung` |
| at-judikatur-gbk | court_decision | `## Text` |
| at-judikatur-dok | court_decision | `## Rechtssatz`, `## Text` |
| at-judikatur-dsk | court_decision | `## Text`, `## Rechtssatz` |
| at-judikatur-pvak | court_decision | `## Rechtssatz`, `## Text` |
| at-normen | law | (keine Headers — plain text) |
| at-gemeinden | law | (keine Headers — plain text) |
| at-avn | law | (mixed — einige mit ## AVN Nr. etc.) |
| at-avsv | law | (mixed — einige mit ## Urheber etc.) |
| at-bezirke | law | (keine Headers) |
| at-kmger | law | (mixed) |
| at-spg | law | (mixed) |
| at-staatsvertraege | law | (mixed) |
| at-landesrecht | law | (keine Headers — aber boilerplate!) |
| at-bmerl | law | (mixed) |
| at | law | (keine Headers) |
| at-literatur | literatur | `## Abstract` |

## ✅ 100% OK — Behalten, keine Aktion

| Korpus | Files |
|--------|-------|
| at-avn | 1.124 |
| at-bezirke | 2.484 |
| at-kmger | 70 |
| at-spg | 116 |
| at-staatsvertraege | 1.048 |
| **Total** | **4.842** |

## ❌ BROKEN — Neu fetchen via XML

| Korpus | Files | Broken | Hauptproblem |
|--------|-------|--------|--------------|
| **at-judikatur-bvwg** | 47.257 | 34.664 | no_content + roemisch + ris_dokument + no_fm |
| **at-judikatur-vwgh** | 154.149 | 23.592 | merged_header (21.446) + no_content (19.736) |
| **at-judikatur (OGH)** | 86.559 | 32.202 | merged_header (31.201) |
| **at-landesrecht** | 15.216 | 15.216 | boilerplate (11.867) + ris_dokument (3.349) |
| **at-judikatur-vfgh** | 41.883 | 12.260 | merged_header (12.043) |
| **at-bmerl** | 1.623 | 1.286 | merged_header (935) |
| **at** | 2.319 | 1.156 | ris_dokument (1.156) |
| **at-judikatur-asylgh** | 53.113 | 500 | roemisch (460) |
| **at-judikatur-dsk** | 1.873 | 795 | no_content (765) + merged_header (639) |
| **at-judikatur-lvwg** | 74.244 | 780 | no_content (725) |
| **at-judikatur-dok** | 5.567 | 92 | no_content (66) |
| **at-judikatur-uvs** | 26.335 | 79 | no_content (52) + no_fm (16) |
| **at-judikatur-ubas** | 4.052 | 46 | roemisch (37) |
| **at-judikatur-gbk** | 1.042 | 39 | roemisch (33) |
| **at-gemeinden** | 26.591 | 15 | roemisch (14) |
| **at-judikatur-umse** | 744 | 4 | merged_header (4) |
| **at-judikatur-pvak** | 2.698 | 8 | no_content (7) |
| **at-normen** | 147.951 | 25 | roemisch (23) |
| **at-avsv** | 6.306 | 1 | roemisch (1) |
| **at-literatur** | 125 | 2 | roemisch (2) |
| **Total broken** | | **122.762** | |

## REFETCH-REIHENFOLGE (nach Größe)

| # | Korpus | Broken | Zeit @ 1s/file | Status |
|---|--------|--------|----------------|--------|
| 1 | at-judikatur-bvwg | 34.664 | ~9.6h | 🔄 RUNNING (2.100/35.722) |
| 2 | at-judikatur (OGH) | 32.202 | ~8.9h | ⏸️ WAIT |
| 3 | at-judikatur-vwgh | 23.592 | ~6.6h | ⏸️ WAIT |
| 4 | at-landesrecht | 15.216 | ~4.2h | ⏸️ WAIT |
| 5 | at-judikatur-vfgh | 12.260 | ~3.4h | ⏸️ WAIT |
| 6 | at-bmerl | 1.286 | ~21min | ⏸️ WAIT |
| 7 | at | 1.156 | ~19min | ⏸️ WAIT |
| 8 | at-judikatur-dsk | 795 | ~13min | ⏸️ WAIT |
| 9 | at-judikatur-lvwg | 780 | ~13min | ⏸️ WAIT |
| 10 | at-judikatur-asylgh | 500 | ~8min | ⏸️ WAIT |
| 11 | at-judikatur-dok | 92 | ~2min | ⏸️ WAIT |
| 12 | at-judikatur-uvs | 79 | ~1min | ⏸️ WAIT |
| 13 | at-judikatur-ubas | 46 | ~1min | ⏸️ WAIT |
| 14 | at-judikatur-gbk | 39 | ~1min | ⏸️ WAIT |
| 15 | at-gemeinden | 15 | <1min | ⏸️ WAIT |
| 16 | at-judikatur-umse | 4 | <1min | ⏸️ WAIT |
| 17 | at-judikatur-pvak | 8 | <1min | ⏸️ WAIT |
| 18 | at-normen | 25 | <1min | ⏸️ WAIT |
| 19 | at-avsv | 1 | <1min | ⏸️ WAIT |
| 20 | at-literatur | 2 | <1min | ⏸️ WAIT |
| **Total** | | **122.762** | **~34h** | |

## WARUM XML-REFETCH DIESE PROBLEME FIXT

| Problem | XML-Lösung |
|---------|-----------|
| `merged_header` ("NormABGB") | XML hat `<ueberschrift>Norm</ueberschrift>` als eigenes Element → `## Norm` |
| `no_content_header` | XML hat `<ueberschrift>Rechtssatz</ueberschrift>` etc. → `## Rechtssatz` |
| `ris_dokument` | XML hat keine "RIS Dokument" Prefix |
| `roemisch` | XML hat keine sr-only spans |
| `spelled_numbers` | XML hat `<symbol>§</symbol>` statt "Paragraph eins" |
| `no_fm_markers` | Refetch-Script schreibt korrekte `---` markers |
| `boilerplate` | Refetch-Script schreibt keine "Quelle: [RIS-OGD]" Zeile |
