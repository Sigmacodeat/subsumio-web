# Embedding & Corpus Quality Audit — Zwischenstand

**Datum:** 2026-07-18  
**Scope:** Hetzner Produktions-DB (via SSH-Tunnel localhost:15432)  
**Hinweis:** Read-only Analyse. Keine Reparaturen durchgeführt.

---

## 1. Zusammenfassung

| Metrik                           | Wert      |
| -------------------------------- | --------- |
| Gesamt-Pages                     | 378.267   |
| Gesamt-Chunks                    | 2.074.526 |
| Embedded Chunks                  | 1.925.880 |
| Pending Embeddings               | 148.646   |
| Gesamt-Coverage                  | 92,8 %    |
| Pages ohne Chunks                | 181       |
| Leere Chunk-Texte                | 0         |
| Oversized Chunks (>6000 Zeichen) | 343       |

**Kritisch:** 181 Pages haben `compiled_truth` aber keine `content_chunks`. Diese sind nicht vektorsuchbar.  
**Wichtig:** 148.646 Chunks sind noch nicht embedded (vor allem AT/DE/CH/EU Judikatur).

---

## 2. Embedding-Coverage pro Source

| Source                  | Jurisdiction |  Pages |  Chunks | Embedded | Pending | Coverage |
| ----------------------- | ------------ | -----: | ------: | -------: | ------: | -------: |
| law-at                  | at           | 20.430 |  27.477 |   27.477 |       0 |  100,0 % |
| law-at-judikatur        | at           | 62.277 | 132.087 |  132.087 |       0 |  100,0 % |
| law-at-judikatur-asylgh | at           | 23.876 | 355.541 |  355.541 |       0 |  100,0 % |
| law-at-judikatur-bvwg   | at           | 13.957 | 278.742 |  276.757 |   1.985 |   99,3 % |
| law-at-judikatur-dok    | at           |  3.000 |  13.278 |   13.278 |       0 |  100,0 % |
| law-at-judikatur-dsk    | at           |    816 |   5.539 |    5.539 |       0 |  100,0 % |
| law-at-judikatur-gbk    | at           |    500 |   7.045 |    7.045 |       0 |  100,0 % |
| law-at-judikatur-lvwg   | at           | 23.144 | 216.527 |  178.532 |  37.995 |   82,5 % |
| law-at-judikatur-pvak   | at           |    665 |   2.108 |    2.108 |       0 |  100,0 % |
| law-at-judikatur-uvs    | at           | 17.873 |  91.926 |   91.926 |       0 |  100,0 % |
| law-at-judikatur-vfgh   | at           | 17.801 |  21.096 |   12.163 |   8.933 |   57,7 % |
| law-at-judikatur-vwgh   | at           | 22.523 |  32.256 |   32.256 |       0 |  100,0 % |
| law-at-landesrecht      | at           | 15.215 |  15.521 |   15.521 |       0 |  100,0 % |
| law-at-staatsvertraege  | at           |  1.156 |   3.356 |    3.356 |       0 |  100,0 % |
| law-ch                  | ch           |  3.955 |   3.981 |    3.981 |       0 |  100,0 % |
| law-ch-judikatur        | ch           |  4.664 |  28.621 |   26.775 |   1.846 |   93,6 % |
| law-de                  | de           |  9.094 |  10.864 |   10.864 |       0 |  100,0 % |
| law-de-judikatur        | de           | 72.194 | 520.518 |  426.836 |  93.682 |   82,0 % |
| law-eu                  | eu           |    231 |     274 |      274 |       0 |  100,0 % |
| law-eu-caselaw          | eu           |  5.301 |  40.548 |   40.548 |       0 |  100,0 % |
| law-eu-directives       | eu           | 18.878 |  92.527 |   92.527 |       0 |  100,0 % |
| law-eu-regulations      | eu           | 40.715 | 174.694 |  168.555 |   6.139 |   96,5 % |
| default                 | —            |      2 |       0 |        0 |       0 |        — |

**Auffällig (Pending > 0):**

- `law-de-judikatur`: 93.682 pending (82,0 %)
- `law-at-judikatur-lvwg`: 37.995 pending (82,5 %)
- `law-at-judikatur-vfgh`: 8.933 pending (57,7 %)
- `law-eu-regulations`: 6.139 pending (96,5 %)
- `law-at-judikatur-bvwg`: 1.985 pending (99,3 %)
- `law-ch-judikatur`: 1.846 pending (93,6 %)

---

## 3. Pages ohne Chunks

**Gesamt: 181 Pages**

| Source                | Anzahl |
| --------------------- | -----: |
| law-ch                |    130 |
| law-de                |     44 |
| law-at                |      4 |
| default               |      2 |
| law-at-judikatur-vwgh |      1 |

**Beobachtung:** Die meisten betroffenen `law-ch` und `law-de` Statuten-Seiten haben sehr kurze `compiled_truth` (23–195 Zeichen). Die Pages existieren, aber es wurden keine `content_chunks` angelegt. Ursache noch nicht abschließend geklärt (möglich: Chunker hat leere/nicht chunkbare Ausgabe erzeugt oder Import wurde vor Fertigstellung der Chunk-Schreibung unterbrochen).

**Kritische Samples:**

- `law-ch`: `legal/statutes/ch/stgb/art-1` (161 Zeichen) — `Art. 1 StGB — Keine Sanktion ohne Gesetz`
- `law-de`: `legal/statutes/de/bgb/p-1354` (27 Zeichen), `legal/statutes/de/bgb/p-2261` (31 Zeichen)
- `law-at`: `legal/statutes/at/abgb/p-1059` (77 Zeichen), `legal/statutes/at/abgb/p-1419` (113 Zeichen)

---

## 4. Chunk-Text-Qualität

| Prüfung                                               | Ergebnis             |
| ----------------------------------------------------- | -------------------- |
| Leere Chunk-Texte (`LENGTH(TRIM(chunk_text)) = 0`)    | 0                    |
| Oversized Chunks (`> 6000` Zeichen)                   | 343                  |
| Encoding-Probleme (`\uFFFD`, `&amp;`, `&lt;`, `&gt;`) | (noch nicht geprüft) |
| Duplikat-Chunk-Texte                                  | (noch nicht geprüft) |

**Oversized:**

- `law-at-judikatur-uvs`: 340 Chunks > 6000 Zeichen
- `law-de`: 3 Chunks > 6000 Zeichen

---

## 5. Embedding-Signaturen

| Signature                                       | Anzahl Pages |
| ----------------------------------------------- | -----------: |
| (null/leer)                                     |      300.922 |
| `openrouter:openai/text-embedding-3-small:1536` |       77.345 |

**Interpretation:** Der Großteil der Pages hat keine `embedding_signature` (null). Das ist im Schema aktuell zulässig. Die 77.345 Pages mit Signature verwenden einheitlich `openrouter:openai/text-embedding-3-small:1536` (1536 Dim, aktuelles Target-Modell). **Kein Model-Mix in den signierten Pages.**

---

## 6. Corpus-Vollständigkeit: Lokale Dateien vs. DB

| Jurisdiction | Source                  | Lokale .md-Dateien | DB Pages | DB Chunks | Coverage | Bemerkung                                                                           |
| ------------ | ----------------------- | -----------------: | -------: | --------: | -------: | ----------------------------------------------------------------------------------- |
| at           | law-at                  |              1.021 |   20.430 |    27.477 |  100,0 % | Per-§ Split (erwartet)                                                              |
| de           | law-de                  |                 34 |    9.094 |    10.864 |  100,0 % | Per-§ Split (erwartet)                                                              |
| ch           | law-ch                  |                 15 |    3.955 |     3.981 |  100,0 % | Per-§ Split (erwartet)                                                              |
| at           | law-at-staatsvertraege  |              1.048 |    1.156 |     3.356 |  100,0 % | Teilweise in Abschnitte gesplittet                                                  |
| at           | law-at-landesrecht      |             15.216 |   15.215 |    15.521 |  100,0 % | Nahezu 1:1                                                                          |
| eu           | law-eu-regulations      |                0\* |   40.715 |   174.694 |   96,5 % | \*`eu/regulations` existiert nicht als eigener Ordner; vermutlich in `eu/` gemischt |
| eu           | law-eu-directives       |              8.029 |   18.878 |    92.527 |  100,0 % | Per-Artikel Split (erwartet)                                                        |
| at           | law-at-judikatur        |             53.714 |   62.277 |   132.087 |  100,0 % | Mehr Pages als Files (Enthält wahrscheinlich z.B. Anhänge/Gesplittete Urteile)      |
| at           | law-at-judikatur-asylgh |             52.170 |   23.876 |   355.541 |  100,0 % | Pages < Files (manche Files sehr lang, mehrere Chunks pro Page)                     |
| at           | law-at-judikatur-bvwg   |             44.902 |   13.957 |   278.742 |   99,3 % | Pages < Files                                                                       |
| at           | law-at-judikatur-lvwg   |             44.625 |   23.144 |   216.527 |   82,5 % | Pages < Files                                                                       |
| at           | law-at-judikatur-uvs    |             17.873 |   17.873 |    91.926 |  100,0 % | 1:1                                                                                 |
| at           | law-at-judikatur-vfgh   |             17.801 |   17.801 |    21.096 |   57,7 % | 1:1                                                                                 |
| at           | law-at-judikatur-vwgh   |            104.542 |   22.523 |    32.256 |  100,0 % | Pages < Files                                                                       |
| at           | law-at-judikatur-dok    |              3.022 |    3.000 |    13.278 |  100,0 % | Nahezu 1:1                                                                          |
| at           | law-at-judikatur-dsk    |                816 |      816 |     5.539 |  100,0 % | 1:1                                                                                 |
| at           | law-at-judikatur-gbk    |                523 |      500 |     7.045 |  100,0 % | Nahezu 1:1                                                                          |
| at           | law-at-judikatur-pvak   |                665 |      665 |     2.108 |  100,0 % | 1:1                                                                                 |
| de           | law-de-judikatur        |             74.882 |   72.194 |   520.518 |   82,0 % | Pages < Files                                                                       |
| ch           | law-ch-judikatur        |              4.338 |    4.664 |    28.621 |   93,6 % | Pages > Files (Urteile ggf. gesplittet)                                             |

**Anmerkung zu EU-Regulations:** Der Ordner `law-corpus/eu/regulations` existiert nicht. Die 8.039 Dateien in `law-corpus/eu/` scheinen überwiegend Richtlinien zu sein. Die 40.715 DB-Pages für `law-eu-regulations` stammen wahrscheinlich aus einem früheren Split/Import und müssen gegen die tatsächlichen EUR-Lex-Regulations abgeglichen werden.

---

## 7. Offene Punkte & Empfohlene nächste Schritte

1. **Pending Embeddings (148.646 Chunks)** abschließen — nur wenn gewünscht.
2. **181 Pages ohne Chunks** reparieren — Ursache klären, chunks neu erzeugen.
3. **343 Oversized Chunks** prüfen, ob der `legal-statute` Chunker korrekt an juristischen Grenzen geteilt hat.
4. **EU-Regulations-Vollständigkeit** verifizieren: `law-corpus/eu/` Struktur prüfen, DB vs. EUR-Lex Abgleich.
5. **AT/DE/CH Judikatur** Vollständigkeit gegen offizielle Quellen (RIS, dejure, Bundesgericht) prüfen.
6. **Encoding-Probleme und Duplikate** in Chunks abschließend auditten.
7. **Embedding-Signaturen** auf 100 % füllen, damit Model-Mix-Zustände zukünftig sofort erkennbar sind.

---

## 8. Verwendete Befehle / Audit-Spuren

- DB-Abfragen via `psql` auf localhost:15432 (SSH-Tunnel zu Hetzner)
- Lokale Dateizählung: `find law-corpus/<dir> -name '*.md' | wc -l`
- Ausgaben liegen in `/tmp/audit_*.txt` und in diesem Dokument
