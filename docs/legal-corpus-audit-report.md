# Legal-Corpus-Audit — Anwaltsgehirn

**Scope:** Vollständigkeit & Coverage der heruntergeladenen Rechtsquellen für DE, AT, CH, EU.  
**Stand:** 26.07.2026  
**Methodik:** Dateisystem-Inventar + strukturelle Metriken pro Markdown-Datei (Bytes, Zeilen, Wörter, §/Artikel-Marker, Überschriften) + Abgleich mit `src/lib/legal-source-coverage.ts` + Postgres-DB-Quellen (`sigmabrain`).

---

## 1. Executive Summary

Der Corpus ist **nicht vollständig** und hat erhebliche Qualitäts-/Strukturlücken:

- **DE:** 86 Bundesgesetze vorhanden, inhaltlich meist groß und gegliedert. Kernkanzleigesetze (BGB, HGB, ZPO, StGB, StPO, AktG, GmbHG, InsO, BGB, AO, EStG, UStG, SGB I–XII, GWB etc.) sind abgedeckt. Verordnungen, Judikatur, Materialien, Behördenpraxis und Literatur fehlen fast vollständig.
- **AT:** 2.315 Gesetzesdateien, aber nur ~2.300 haben **keine Markdown-Überschriften** (plain/roh text). Struktur ist praktisch nicht maschinell navigierbar. Verordnungen, Judikatur, Materialien, Behördenpraxis und Literatur sind nicht vorhanden.
- **CH:** 25 Bundesgesetze (OR, ZGB, StGB, ZPO, BV, BGG etc.), gut strukturiert. Verordnungen, Judikatur, Materialien etc. fehlen.
- **EU:** 8.029 Richtlinien im `directives/`-Ordner, davon 2.800 Dateien < 1 KB (nur Metadaten/Frontmatter, kein substanzieller Text). `regulations/`-Ordner ist **leer**. Hauptakte (DSGVO, Rom I/II, Brüssel Ibis, DAC6 etc.) liegen als einzelne Dateien vor, aber oft ohne Überschriften-Gliederung.
- **Judikatur:** In `server/law-corpus/` vorhanden, jedoch nicht im statischen Corpus (`law-corpus/`): AT 10.807 + Spezialgerichte, DE 74.498, CH 16.108. DB `sigmabrain` enthält nur 7 AT-Sources (Bezirke, Gemeinden, BMERL etc.) mit 28.442 Pages, aber **0** `legal_source_versions`.
- **Coverage-Matrix `src/lib/legal-source-coverage.ts` ist veraltet:** z. B. `law-de` meldet 30 Items, Filesystem zeigt 86; `law-eu` meldet 4 Items, `directives/` allein hat 8.029.

---

## 2. Dateisystem-Inventar

| Speicherort                  | Dateien |  Größe | Inhalt                                                   |
| ---------------------------- | ------: | -----: | -------------------------------------------------------- |
| `law-corpus/at/`             |   2.315 | 105 MB | AT-Bundesgesetze (RIS-OGD)                               |
| `law-corpus/de/`             |      86 |  26 MB | DE-Bundesgesetze (gesetze-im-internet.de)                |
| `law-corpus/ch/`             |      25 | 4,6 MB | CH-Bundesgesetze (Fedlex)                                |
| `law-corpus/eu/`             |      10 | 0,9 MB | EU-Kernakte (DSGVO, Rom I/II, Brüssel Ibis, DAC6, UZK …) |
| `law-corpus/eu/directives/`  |   8.029 | 237 MB | EU-Richtlinien (EUR-Lex)                                 |
| `law-corpus/eu/regulations/` |       0 |    0 B | **leer**                                                 |
| `server/law-corpus/`         | 103.138 | 2,5 GB | Gerichtsentscheide (DE, AT, CH)                          |
| `law-corpus-split/`          |  35.494 | 175 MB | split/chunked Versionen                                  |

**Postgres-DB (`sigmabrain`):**

- `sources` mit `jurisdiction IS NOT NULL`: 7 AT-Sources (bmerl, avsv, avn, spg, kmger, bezirke, gemeinden)
- `pages`: 28.442 (alles AT)
- `legal_source_versions`: 0

---

## 3. Vollständigkeit pro Gesetz

### 3.1 Österreich (`law-corpus/at/`)

| Metrik                              |           Wert |
| ----------------------------------- | -------------: |
| Dateien                             |          2.315 |
| Gesamtgröße                         |         105 MB |
| Median-Größe                        |        9.472 B |
| Ø Wörter                            |          5.460 |
| Dateien ohne Markdown-Überschriften | 2.308 (99,7 %) |
| Inhaltsverzeichnisse                |              2 |
| `§ …` Marker                        |         24.407 |
| `Art. …` Marker                     |          8.471 |
| Dateien < 1 KB                      |              0 |

**Einschätzung:** Die Quantität ist hoch, aber die **Strukturierung ist extrem schwach**. Ohne Überschriften-Gliederung ist eine zuverlässige §/Absatz-Ebene für RAG/Retrieval nicht gegeben. Vollständigkeit pro einzelnem Gesetz lässt sich ohne Referenz nicht verifizieren; die Marker-Dichte deutet aber auf vollständige Textkörper hin.

### 3.2 Deutschland (`law-corpus/de/`)

| Metrik                     |      Wert |
| -------------------------- | --------: |
| Dateien                    |        86 |
| Gesamtgröße                |     27 MB |
| Median-Größe               | 180.909 B |
| Ø Wörter                   |    40.793 |
| Dateien ohne Überschriften |         0 |
| Inhaltsverzeichnisse       |        30 |
| `§ …` Marker               |       209 |
| `Art. …` Marker            |       205 |

**Vorhandene Kern-Gesetze:** BGB, HGB, ZPO, StGB, StPO, AktG, GmbHG, InsO, AO, BAO, EStG, KStG, UStG, SGB I–XII, GWB, FamFG, BetrVG, ArbZG, BBiG, BVerfG (GG), BVerwG? (VwGO/VwVfG), UWG, UrhG, PatG, MarkenG, ProdHaftG, ErbStG, BewG, EnWG, TKG, VAG etc.

**Einschätzung:** Die vorhandenen Gesetze sind inhaltlich substanziell und gut gegliedert. Es fehlen aber viele Rechtsgebiete/Einzelgesetze (z. B. berufsrechtliche Ordnungen, viele Verordnungen, EU-Anpassungsgesetze).

### 3.3 Schweiz (`law-corpus/ch/`)

| Metrik                     |     Wert |
| -------------------------- | -------: |
| Dateien                    |       25 |
| Gesamtgröße                |   4,8 MB |
| Median-Größe               | 95.059 B |
| Ø Wörter                   |   26.107 |
| Dateien ohne Überschriften |        0 |
| `Art. …` Marker            |    8.008 |

**Vorhandene Kern-Gesetze:** OR, ZGB, ZPO, StGB, StPO, BV, BGG, BVG, DBG, DSG, GWG, IPRG, KVG, MSchG, PatG, SchKG, UWG, VwVG, ZG.

**Einschätzung:** Solide Kernabdeckung, aber sehr dünn (nur 25 Gesetze). Verordnungen, Verwaltungsgerichts-/kantonale Gesetze, Judikatur fehlen.

### 3.4 EU (`law-corpus/eu/`)

| Speicherort       | Dateien |  Größe | Auffälligkeiten                                                                        |
| ----------------- | ------: | -----: | -------------------------------------------------------------------------------------- |
| `eu/` (Root)      |      10 | 898 KB | DSGVO, Rom I/II, DSRL, ePrivacy, Brussels Ibis, EUCO, DAC6, UZK, MwSt-Systemrichtlinie |
| `eu/directives/`  |   8.029 | 237 MB | 2.800 Dateien < 1 KB; keine Artikel-Marker (§~16, Art.~1.236); meist reiner Fließtext  |
| `eu/regulations/` |       0 |    0 B | **vollständig leer**                                                                   |

**Einschätzung:** Richtlinien-Sammlung ist breit, aber viele Dateien nur Schalen (metadaten ohne Volltext). Verordnungen (z. B. EU-DSGVO-Verordnung, GDPR, Verordnungen zu Finanzmärkten, Wettbewerb etc.) fehlen komplett. DSGVO liegt als `dsgvo.md`, ist aber ohne Überschriften.

---

## 4. Coverage Matrix (Jurisdiktion × Quelltyp)

Basiert auf `LEGAL_SOURCE_COVERAGE_MATRIX` in `src/lib/legal-source-coverage.ts`, ergänzt mit tatsächlichem Dateisystem-Status.

| Jurisdiktion |                    Primärrecht                    |           Verordnungen           |                  Höchstgerichtliche Judikatur                  | Instanzrechtsprechung | Gesetzesmaterialien | Behördenpraxis | Open-Access-Literatur | Lizenzierte Literatur |
| ------------ | :-----------------------------------------------: | :------------------------------: | :------------------------------------------------------------: | :-------------------: | :-----------------: | :------------: | :-------------------: | :-------------------: |
| **DE**       |         ✅ verfügbar (86 FS / Matrix: 30)         |        🔶 geplant (0 FS)         | 🔶 geplant (0 FS; 74.498 in `server/law-corpus/de-judikatur`)  |     ❌ Gap (0 FS)     |    ❌ Gap (0 FS)    | ❌ Gap (0 FS)  |     ❌ Gap (0 FS)     |     ❌ Gap (0 FS)     |
| **AT**       |       ✅ verfügbar (2.315 FS / Matrix: 79)        |        🔶 geplant (0 FS)         | 🔶 geplant (0 FS; 11.132 in `server/law-corpus/at-judikatur*`) |   🔶 geplant (0 FS)   |    ❌ Gap (0 FS)    | ❌ Gap (0 FS)  |     ❌ Gap (0 FS)     |     ❌ Gap (0 FS)     |
| **CH**       |         ✅ verfügbar (25 FS / Matrix: 11)         |        🔶 geplant (0 FS)         | 🔶 geplant (0 FS; 16.108 in `server/law-corpus/ch-judikatur`)  |     ❌ Gap (0 FS)     |    ❌ Gap (0 FS)    | ❌ Gap (0 FS)  |     ❌ Gap (0 FS)     |     ❌ Gap (0 FS)     |
| **EU**       | ✅ verfügbar (10 + 8.029 Richtlinien / Matrix: 4) | 🔶 geplant (`regulations/` leer) |                       🔶 geplant (0 FS)                        |           —           |    ❌ Gap (0 FS)    |       —        |           —           |           —           |

**Legende:** ✅ = Dateien im Filesystem / Matrix `available` · 🔶 = Matrix `planned` / Dateien teilweise vorhanden · ❌ = Matrix `gap` / nicht vorhanden.

### Abdeckung nach Rechtsgebiet

| Rechtsgebiet                | DE  | AT  |   CH    |              EU               |
| --------------------------- | :-: | :-: | :-----: | :---------------------------: |
| Zivilrecht                  | ✅  | ✅  |   ✅    |               —               |
| Strafrecht                  | ✅  | ✅  |   ✅    |               —               |
| Handels-/Gesellschaftsrecht | ✅  | ✅  |   ✅    |              ✅               |
| Steuerrecht                 | ✅  | ✅  |   ✅    |              ✅               |
| Verwaltungsrecht            | ✅  | ✅  |   ✅    |               —               |
| Verfassungsrecht            | ✅  | ✅  |   ✅    |               —               |
| Familienrecht               | ✅  | ✅  | ⚠️ dünn |               —               |
| Arbeitsrecht                | ✅  | ✅  |   ✅    |              ✅               |
| Datenschutz                 | ✅  | ✅  |   ✅    |              ✅               |
| Insolvenzrecht              | ✅  | ✅  |   ✅    |               —               |
| Immaterialgüterrecht        | ✅  | ✅  |   ✅    |              ✅               |
| EU-Recht (Richtlinien)      |  —  |  —  |    —    | ⚠️ Richtlinien teilweise leer |
| Verfahrensrecht             | ✅  | ✅  |   ✅    |               —               |

---

## 5. Gap-Analyse

### 5.1 Kritische Lücken (hohe Priorität)

1. **EU-Verordnungen** — `law-corpus/eu/regulations/` ist leer. Für Anwaltspraxis zentral: GDPR/Datenschutz-VO, Rom-III-VO, Brüssel-Ia-VO, MwSt-VO, Finanzmarktverordnungen, Wettbewerbsverordnungen.
2. **DE Verordnungen & Rechtsverordnungen** — keine Dateien; viele Gesetze erfordern Durchführungsverordnungen (z. B. EStDV, UStDV, AufenthV sind vereinzelt vorhanden, aber systematisch fehlt die Masse).
3. **Höchstgerichtliche Judikatur** — zwar 74.498 DE- und 11.132 AT- und 16.108 CH-Entscheide in `server/law-corpus/`, aber nicht in der `legal_source_versions`-Tabelle und offiziell noch `planned`. Bezüge zu Gesetzesnormen sind unklar.
4. **EU-Richtlinien-Qualität** — 2.800 Dateien < 1 KB enthalten praktisch keinen normativen Text. 35 % der Richtliniensammlung ist hohle Hülle.
5. **AT-Struktur** — 99,7 % der AT-Gesetze ohne Markdown-Überschriften. Parsing/Chunking für RAG ist erschwert.
6. **DE-Gesamtzahl** — 86 Bundesgesetze sind eine gute Basis, aber das BMJ-Portal enthält ~500+ Gesetze/Verordnungen. Lücken in Berufsrecht, Umwelt, Bau, Verbraucherschutz, Sozialleistungen.
7. **Materialien, Behördenpraxis, Literatur** — vollständige Gaps in allen Jurisdiktionen.

### 5.2 Mittlere Priorität

- CH nur 25 Gesetze; Ergänzung um Verordnungen, kantonale Rechtsquellen.
- Instanzrechtsprechung DE/AT/CH nicht abgedeckt.

### 5.3 Niedrige Priorität

- Lizenzierte Literatur (Verlagspartnerschaften) — Business-Track, erst nach Primärquellen.

---

## 6. Qualitäts- & Risikoprofile

| Risiko                       | Auswirkung                                      | Evidenz                                        |
| ---------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| AT-Gesetze ohne Gliederung   | Schlechte Chunk-Qualität, falsche §-Zuordnungen | 2.308 / 2.315 Dateien ohne `## ` Überschriften |
| EU `regulations/` leer       | Lücken in verordnungsbasiertem EU-Recht         | `find law-corpus/eu/regulations -type f` = 0   |
| EU directives fast 35 % leer | Retrieval liefert Metadaten statt Volltext      | 2.800 Dateien < 1 KB                           |
| Coverage-Matrix veraltet     | Führt zu Fehleinschätzung in UI/Eval            | `law-de` 30 vs 86; `law-eu` 4 vs 8.039         |
| `legal_source_versions` leer | Keine versionsbasierte Verifikation             | `SELECT count(*)` = 0                          |
| DB sources nur AT            | DE/CH/EU haben keine DB-Source-Registry         | `sources` = 7 AT-Einträge                      |

---

## 7. Empfohlene Maßnahmen (priorisiert)

1. **EU-Verordnungen importieren**
   - `law-corpus/eu/regulations/` mit EUR-Lex Web Service befüllen (mind. Top-100 für Kanzleipraxis).

2. **EU-Richtlinien-Qualität bereinigen**
   - Alle < 1 KB Dateien prüfen; falls nur Metadaten, entweder Volltext nachladen oder als `planned`/nicht-`available` markieren.

3. **AT-Gesetze neu strukturieren**
   - Parser so anpassen, dass Art./§-Hierarchien in Markdown-Überschriften umgewandelt werden; sonst ist RAG ungenau.

4. **Coverage-Matrix aktualisieren**
   - `src/lib/legal-source-coverage.ts` mit tatsächlichen `item_count` synchronisieren und Status `planned`/`available` korrigieren.

5. **DB `sources` & `legal_source_versions` pflegen**
   - DE, CH, EU als Sources anlegen; `legal_source_versions` für jedes gespiegelte Gesetz/Verordnung füllen.

6. **Verordnungen DE/AT/CH ergänzen**
   - Gesetze-ohne-Verordnungen sind für Praxis unvollständig; zumindest Durchführungs- und Bezugsverordnungen nachladen.

7. **Judikatur-Linkage**
   - Entscheide aus `server/law-corpus/` mit `legal_source_versions`/Statuten verknüpfen, damit Zitate auflösbar sind.

8. **Materialien & Behördenpraxis**
   - Für „Anwaltsgehirn“ erstrebenswert: BT-Drucksachen, Regierungsvorlagen AT, Botschaften CH, BMF/BfDI-Erlasse, EDSA-Leitlinien.

9. **Lizenzliteratur als Option**
   - Langfristig Verlagspartnerschaften (Beck, Nomos, Manz, Schulthess) anstreben.

---

## 8. Definition of Done für ein vollständiges Anwaltsgehirn

- [ ] Mind. 90 % der relevanten Bundesgesetze pro Jurisdiktion vorhanden und strukturiert.
- [ ] Dazugehörige Durchführungs-/Rechtsverordnungen mindestens für Kernbereiche vorhanden.
- [ ] Höchstgerichtliche Judikatur pro Jurisdiktion verfügbar und mit Normen verknüpft.
- [ ] `legal_source_versions` enthält für jede heruntergeladene Quelle Version & Geltungszeitraum.
- [ ] `src/lib/legal-source-coverage.ts` spiegelt den tatsächlichen Filesystem-Stand wider.
- [ ] Keine 0-Byte/leeren Richtlinien- oder Verordnungsdateien mehr.
- [ ] Gesetzesmaterialien (BT-Drucksachen, Vorlagen, Botschaften) für Top-50-Gesetze vorhanden.
