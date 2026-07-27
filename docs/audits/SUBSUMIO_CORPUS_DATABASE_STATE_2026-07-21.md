# Subsumio — DACH-Korpus-Vollständigkeitsaudit (2026-07-21)

**Datenbank:** Hetzner Produktion `sigmabrain` (Port 15432 via SSH-Tunnel `subsumio-hetzner`)
**Snapshot-Zeit:** Live-SQL-Queries, 2026-07-21, ~19:30
**Ersetzt:** `docs/audits/archive/SUBSUMIO_CORPUS_DATABASE_STATE_2026-07-19.md` (2 Tage alt, viele Werte seither überholt)

Dieses Dokument beantwortet die konkrete Frage: **Haben wir für DACH (AT/DE/CH + EU-Bezug) die volle
Abdeckung — Gesetze, Judikatur UND Literatur — oder gibt es Lücken, die sich aus weiteren Quellen
befüllen lassen?** Kurzantwort: **Nein, noch nicht.** Die Gesetzes-Flaggschiffe sind solide, Literatur
ist seit 2 Tagen erstmals live in der DB, aber es gibt vier Kategorien harter Lücken (unten) plus ein
akutes Betriebsproblem (Embedding-Pipeline seit 5 Tagen eingefroren).

## 1. Executive Summary

| Metrik                    | 19.07.    | **21.07. (jetzt)**  | Δ                     |
| ------------------------- | --------- | ------------------- | --------------------- |
| DB-Größe gesamt           | 70 GB     | **126 GB**          | +80%                  |
| Aktive Seiten (pages)     | 385.794   | **591.930**         | +53%                  |
| Chunks                    | 2.087.403 | **3.369.404**       | +61%                  |
| **Chunks ohne Embedding** | 0         | **1.928.352 (57%)** | 🔴 neu                |
| Literatur-Seiten in DB    | 0         | **11.249**          | 🟢 neu (Phase 1 live) |

**Die drei wichtigsten Befunde:**

1. **🔴 Embedding-Pipeline steht seit 5 Tagen still.** 57% aller Chunks (1,93 von 3,37 Mio.) haben kein
   Embedding — sie sind über Volltextsuche, aber nicht über Vektorsuche auffindbar. Das betrifft primär
   den frischen VwGH/BVwG/AsylGH-Zuwachs. Siehe Abschnitt 7.
2. **🟡 Literatur ist zum ersten Mal produktiv, aber schmal.** 11.249 Seiten (DE 10.448 / CH 676 / AT 125)
   — überwiegend freie Quellen (Openrewi, CH-Onlinekommentar, OA-Aufsätze). Kommentarliteratur der
   großen Verlage (Beck, juris, Otto Schmidt) ist **rechtlich blockiert**, nicht technisch offen. Siehe
   Abschnitt 5.
3. **🟡 Strukturelle DACH-Lücke: Landesrecht/Kantonsrecht nur für AT.** AT hat 15.215 Landesrecht-Seiten
   (9 Bundesländer). **DE (16 Länder) und CH (26 Kantone) haben keine einzige Sub-Bundesebene-Quelle.**
   Für „volle DACH-Abdeckung" ist das der größte strukturelle Fleck, nicht die Feinarbeit an
   Platzhaltern. Siehe Abschnitt 4.4.

## 2. Datenbank-Infrastruktur

| Metrik                   | Wert                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL               | 16.14, pgvector 0.8.2, pg_trgm 1.6, pgcrypto 1.3                                                                                                        |
| DB-Größe gesamt          | 126 GB                                                                                                                                                  |
| `content_chunks`         | 104 GB (Haupttreiber des Wachstums)                                                                                                                     |
| `pages`                  | 12 GB                                                                                                                                                   |
| `links`                  | 184 MB                                                                                                                                                  |
| HNSW-Indizes             | 4 Stück (`idx_chunks_hnsw_law_at`, `idx_chunks_embedding_hnsw_v2`, `idx_chunks_hnsw_at_combo`, `idx_chunks_embedding_image`)                            |
| Embedding-Modelle im Mix | `openrouter:openai/text-embedding-3-small:1536` (3.122.491 Chunks) + Altbestand `openai/text-embedding-3-small` (246.913 Chunks)                        |
| halfvec-Migration        | **läuft**, 1.117.564 von 3.122.491 Chunks bereits mit `embedding_half` gefüllt (~36%) — Stand 19.07. war „noch nicht begonnen", das war falsch/veraltet |

## 3. Content-Source-Matrix (aktuell, >0 Seiten)

| Source                      | Jur. | Pages      | Chunks       | Embedding-Pending   |
| --------------------------- | ---- | ---------- | ------------ | ------------------- |
| law-at-judikatur-vwgh       | at   | 104.542    | 104.544      | **104.544 (100%)**  |
| law-at-judikatur (OGH)      | at   | 84.106     | 89.560       | 62.564 (70%)        |
| law-de-judikatur            | de   | 72.194     | 520.518      | 0                   |
| law-at-judikatur-asylgh     | at   | 52.170     | 71.262       | **71.262 (100%)**   |
| law-at-judikatur-bvwg       | at   | 47.503     | 1.843.100 ⚠️ | **1.688.923 (92%)** |
| law-at-judikatur-lvwg       | at   | 44.631     | 69.331       | 0                   |
| EU Verordnungen (federated) | eu   | 40.715     | 174.694      | 0                   |
| law-at (Statuten)           | at   | 20.430     | 27.481       | 0                   |
| EU Richtlinien (federated)  | eu   | 18.878     | 92.527       | 0                   |
| law-at-judikatur-uvs        | at   | 17.873     | 91.926       | 0                   |
| law-at-judikatur-vfgh       | at   | 17.801     | 21.096       | 0                   |
| law-de (Statuten)           | de   | 16.623     | 23.595       | 0                   |
| AT Landesrecht              | at   | 15.215     | 15.521       | 0                   |
| **law-de-literatur**        | de   | **10.448** | 51.342       | 0                   |
| law-eu (Statuten)           | eu   | 8.269      | 65.014       | 0                   |
| EuGH Urteile (federated)    | eu   | 5.301      | 40.548       | 0                   |
| CH Judikatur (BGE)          | ch   | 4.338      | 26.093       | 0                   |
| law-ch (Statuten)           | ch   | 3.953      | 4.119        | 0                   |
| law-at-judikatur-dok        | at   | 3.000      | 13.278       | 0                   |
| AT Staatsverträge           | at   | 1.156      | 3.356        | 0                   |
| law-at-judikatur-dsk        | at   | 816        | 5.539        | 0                   |
| **law-ch-literatur**        | ch   | **676**    | 5.680        | 0                   |
| law-at-judikatur-pvak       | at   | 665        | 2.108        | 0                   |
| law-at-judikatur-gbk        | at   | 500        | 7.045        | 0                   |
| **law-at-literatur**        | at   | **125**    | 125          | 0                   |

⚠️ **BVwG-Anomalie:** 47.503 Seiten aber 1,84 Mio. Chunks (38,8 Chunks/Seite, Ø 3.348 Zeichen/Chunk —
entspricht ~130k Zeichen pro Dokument). Das ist plausibel für lange Asyl-Sachverhaltsdarstellungen,
aber deutlich außerhalb der Norm anderer Gerichte (VwGH: ~1 Chunk/Seite, DE-Judikatur: ~7 Chunks/Seite).
Vor dem nächsten Embedding-Lauf stichprobenartig prüfen, ob das echte Volltexte oder ein
Chunking-/Duplizierungsartefakt sind — bei 1,69 Mio. offenen Embeddings allein aus dieser Quelle lohnt
sich die Prüfung, bevor man die komplette Rechnung bezahlt.

## 4. Jurisdiktionen: Tiefe & Breite

### 4.1 Statuten — Flaggschiffe intakt, aber bekannte Stubs unverändert

**AT:** 1.014 Codes / 20.430 §§. Flaggschiffe voll (ABGB 1.348, ASVG ~979, UGB 735, ZPO 605).

**DE:** ~70+ Codes / 16.623 §§ über `legal_source_versions` hinaus erfasst (BGB 2.510 komplett; AO 496,
STGB 546, ZPO 1.076, HGB 665 — alle solide). **7 Steuer-/Gebührengesetze sind weiterhin Stubs**, trotz
Datei-Änderungen im aktuellen Branch (`law-corpus/de/*.md` sind laut `git status` modifiziert — vermutlich
nur Frontmatter, nicht Inhalt, denn die DB-Zahlen sind identisch zum 18.07.):

| Gesetz | §§ in DB | Ø Titel-Länge |
| ------ | -------- | ------------- |
| stbvv  | 6        | 36            |
| lstdv  | 7        | 42            |
| erbstg | 7        | 42            |
| gewstg | 8        | 37            |
| grestg | 8        | 38            |
| bewg   | 9        | 39            |
| stberg | 10       | 41            |

**CH:** 4 echte gesplittete Codes (OR 1.685, ZGB 1.303, StPO 478, StGB 477) — Flaggschiffe gut. **7 Codes
sind als `type='note'` markierte 1-Seiten-Monolithe** (bewusst als nicht-autoritative Notizen
gekennzeichnet, kein stiller Fehler, aber inhaltlich nicht durchsuchbar auf §-Ebene): `bgfa`, `bvg`,
`dsg`, `schkg`, `uwg`, `vwvg`, `zpo`. Zusätzlich 3 weitere Codes mit `type='law'`, aber nur 1 Abschnitt
(echte Lücke, keine bewusste Markierung): `zg`, `mwstg`, `sthg`.

**EU:** 7 Kern-Codes / 231 Art. — DSGVO mit 99 Artikeln vollständig, Brüssel-Ia/Rom-I/Rom-II weiterhin nur
Stub-Niveau (je ~3 Artikel).

### 4.2 Judikatur — großer Fortschritt bei AT, aber weiterhin ungleich

Seit 18.07. lief ein Backfill: VwGH-Seiten in der DB stiegen von 22.523 → **104.542**. Aber:

- Von den 104.544 VwGH-Chunks enthalten **43.219 (41%) weiterhin nur den Platzhaltertext**
  „Volltext nicht abrufbar" (Ø Chunk-Länge 851 Zeichen gesamt). Der Rest (59%) hat jetzt echten Volltext
  — eine deutliche Verbesserung ggü. dem 18.07.-Stand (nur 898 von 104.542 lokalen Dateien echt), aber
  noch nicht fertig.
- **Deckung ggü. RIS-OGD-Gesamtbestand** (offizielle Totale, Stand letzter Pipeline-Zyklus 16.07., leicht
  konservativ da RIS täglich wächst):

  | Gericht  | DB-Seiten (live) | RIS-Gesamt (Referenz) | Deckung                             |
  | -------- | ---------------- | --------------------- | ----------------------------------- |
  | AsylGH   | 52.170           | 53.113                | **98%** ✅                          |
  | VfGH     | 17.801           | 24.067                | 74%                                 |
  | UVS      | 17.873           | 25.939                | 69%                                 |
  | DOK      | 3.000            | 4.815                 | 62%                                 |
  | OGH      | 84.106           | 138.432               | 61%                                 |
  | LVwG     | 44.631           | 76.198                | 59%                                 |
  | GBK      | 500              | 1.021                 | 49%                                 |
  | DSK      | 816              | 1.870                 | 44%                                 |
  | PVAK     | 665              | 2.532                 | 26%                                 |
  | **VwGH** | 104.542          | 356.331               | **29%** (davon 59% echter Volltext) |
  | **BVwG** | 47.503           | 287.358               | **17%** 🔴 größte Lücke             |

- **DE-Judikatur:** 72.194 Seiten, unverändert seit 19.07. BGH 25.580, BFH 11.619, BVerwG 10.988, BAG
  7.218, BSG 6.386, BVerfG 5.703, BPatG 4.696. Solide Breite über alle obersten Bundesgerichte, aber
  keine Wachstumsdynamik in den letzten 2 Tagen (Fokus lag auf AT).
- **CH-Judikatur (BGer):** 4.338 Seiten. Der 18.07. gemeldete Slug-Bug (326 Seiten mit `bger-*` auf
  Top-Level statt `legal/judikatur/ch/…`) ist **behoben** — 0 Seiten mit falschem Pfad mehr. Aber die
  **Jahresabdeckung bleibt kritisch lückenhaft**: nur 2014 (2.406), 2025 (161) und 2026 (1.771) sind
  vertreten. **2015–2024 (10 Jahre) fehlen komplett.** Das ist der größte Einzel-Gap im ganzen Korpus,
  wenn man CH als vollwertige DACH-Jurisdiktion ernst nimmt.

### 4.3 Literatur — jetzt live, aber schmal und rechtlich begrenzt

11.249 Seiten total, alle aus **frei lizenzierten Quellen** (kein beck-online/juris/Otto Schmidt — das
ist per `license-registry.ts` fail-closed by design, § 87b UrhG):

| Quelle                                                         | Seiten | Lizenz                                                               |
| -------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| DE: OA-Literatur (ALJ, sui generis Abstracts, Verfassungsblog) | 10.527 | diverse Open Access                                                  |
| CH: Online-Kommentar (onlinekommentar.ch)                      | 412    | CC BY 4.0                                                            |
| DE/AT: Openrewi (Wikibooks Fallbücher/Lehrbücher)              | 310    | CC BY-SA                                                             |
| **DE: Gesetzesmaterialien (BT/BR-Drucksachen via DIP)**        | **0**  | blockiert — `DIP_API_KEY` fehlt (öffentlicher Key seit längerem 401) |

Das ist ein guter Start, aber im Vergleich zu Wettbewerbern mit Verlagslizenz (Beck/juris-basierte
Konkurrenz) bleibt Kommentarliteratur zu den DACH-Flaggschiff-Gesetzen (ABGB, BGB, ZPO, StGB) die
größte inhaltliche Lücke — lösbar nur über eine Lizenzierung (LDA/Verlags-Track, bereits als
Business-Development-Kontakt identifiziert), nicht über zusätzliches Scraping.

### 4.4 Landesrecht/Kantonsrecht — strukturelle DACH-Lücke

| Jurisdiktion        | Sub-Bundesebenen | Seiten in DB  |
| ------------------- | ---------------- | ------------- |
| AT (9 Bundesländer) | Landesrecht      | **15.215** ✅ |
| DE (16 Länder)      | Landesrecht      | **0** 🔴      |
| CH (26 Kantone)     | Kantonsrecht     | **0** 🔴      |

Für eine Plattform, die „volle DACH-Abdeckung" verspricht, ist das der auffälligste Fleck: AT ist
gut ausgebaut, DE und CH haben schlicht keine Quelle für Landes-/Kantonsrecht. Viel Praxisrelevanz
(Bau-, Polizei-, Schulrecht in DE; kantonales Steuer-, Zivilprozess- und Verwaltungsrecht in CH) liegt
komplett außerhalb des heutigen Korpus.

## 5. Integrität & offene Invarianten

| Prüfung                                                | 19.07.                           | **21.07.**                                                                                                    |
| ------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Seiten ohne Chunks                                     | 0                                | (nicht neu geprüft, keine Anzeichen für Regression)                                                           |
| Soft-deleted Seiten                                    | 0                                | 0                                                                                                             |
| `legal_source_versions` mit doppeltem `status=current` | 26 Gesetze (Invariante verletzt) | **0 — behoben** ✅                                                                                            |
| CH-Judikatur mit Top-Level-Slug-Bug                    | 326                              | **0 — behoben** ✅                                                                                            |
| Zitiergraph-Kanten                                     | 615.470, alle `judikatur-cites`  | 615.470, **immer noch 0 §→§-Kanten**                                                                          |
| `corpus_snapshots` / `corpus_amendments`               | 0 / 0                            | **0 / 0 — unverändert**, keine Fassungs-Historie                                                              |
| `links_extracted_at`                                   | NULL für alle                    | (nicht neu geprüft — vermutlich unverändert, da Link-Extraktions-Stufe laut Pipeline seit 16.07. nicht läuft) |

## 6. Betriebsstatus: Pipeline eingefroren, aber Daten wachsen trotzdem

`pipeline_state` zeigt **keinen einzigen Stage-Übergang seit 2026-07-16 06:50 UTC** (5 Tage) — `embed`
hängt im Status `importing` mit einer toten PID (18197), mehrere Backfill-Stages hängen auf
`backfilling`. Trotzdem sind seither 206.136 neue Seiten und 1,28 Mio. neue Chunks dazugekommen. Das
heißt: **entweder laufen Imports manuell/außerhalb der getrackten Pipeline, oder das Tracking selbst ist
kaputt, während echte Cron-Jobs im Hintergrund weiterlaufen.** So oder so: das operative Monitoring ist
aktuell nicht vertrauenswürdig — `gbrain doctor`/Pipeline-Dashboard würde fälschlich "seit 5 Tagen
nichts passiert" anzeigen, während in Wahrheit +53% Wachstum stattfand. Das größte unmittelbare Risiko
ist der daraus resultierende **57%-Embedding-Rückstand** (Abschnitt 1) — ohne funktionierendes
Pipeline-Tracking bleibt unklar, ob/wann `auto-embed-pg.ts` den Rückstand von selbst aufholt.

## 7. Wo weitere Quellen den Umfang tatsächlich vergrößern würden

Sortiert nach Hebelwirkung für „volle DACH-Abdeckung":

1. **RIS-OGD-Backfill fortsetzen (AT, kostenlos, bereits angebunden).** BVwG (17%) und VwGH-Volltext
   (41% noch Platzhalter) sind die größten Hebel. `backfill-judikatur-text.ts` + Rate-Limit (1,5s,
   Nebenzeiten) laufen lassen, bis RIS-Gesamttotale erreicht sind.
2. **entscheidsuche.ch für CH-Judikatur 2015–2024 + Kantonsgerichte.** Schließt gleichzeitig die
   10-Jahres-BGer-Lücke UND liefert erstmals kantonale Rechtsprechung (CC0/offen, aggregiert alle
   Schweizer Gerichte inkl. Kantone) — höherer Hebel als ein reiner BGer-Nachimport.
3. **DE-Landesrecht-Portale der 16 Länder** (z.B. Bravors Berlin, Landesrecht BW/Bayern/NRW — je Land
   ein offenes Landesnormen-Portal) als neue `law-de-landesrecht`-Quelle nach Vorbild von
   `fetch-at-landesrecht.ts`. Größter struktureller Gap in Abschnitt 4.4.
4. **CH-Kantonsrecht** über die „Systematische Rechtssammlung" der Kantone oder ebenfalls via
   entscheidsuche.ch/Fedlex-Kantonsanhang — analog zu (3), aber für CH.
5. **DIP-API-Key beantragen** (parlamentsdokumentation@bundestag.de) — schaltet
   `fetch-de-gesetzesmaterialien.ts` frei, das bereits fertig gebaut ist und nur auf den Key wartet.
6. **EU-Verordnungen-Backfill vervollständigen.** Nur 40.715 von 161.043 lokal gefundenen Dateien sind
   importiert (OOM in `import-eu-corpus.ts`, `loadFiles()` lädt alle Dateien auf einmal in RAM) — Fix ist
   Batching, keine neue Quelle, aber schließt eine bereits vorhandene 75%-Lücke.
7. **Verlagsliteratur (Beck/juris/Otto Schmidt) NICHT scrapen** — das ist bewusst blockiert
   (`license-registry.ts` fail-closed, § 87b UrhG / § 44b TDM erlaubt keine Wiedergabe im Produkt). Der
   einzige legale Weg ist eine Lizenzierung, z.B. über LDA Legal Data Hub — bereits als
   Business-Development-Kontakt in der Roadmap.
8. **§→§-Zitiergraph aufbauen** (kein externer Datenimport, sondern Extraktion aus bereits vorhandenen
   Gesetzestexten) — schließt die Lücke aus Abschnitt 5, verbessert Grounding-Qualität für
   Gesetzesverweise spürbar.

## 8. Risiken & nächste Schritte (priorisiert)

1. **P0 — Embedding-Rückstand (57%) beheben.** Ursache diagnostizieren (tote PID 18197,
   `auto-embed-pg.ts` prüfen, ggf. sauber neu starten), dann Fortschritt aktiv überwachen statt sich auf
   `pipeline_state` zu verlassen (das ist selbst seit 5 Tagen eingefroren).
2. **P0 — Pipeline-Tracking-Vertrauenswürdigkeit wiederherstellen.** Klären, warum `pipeline_state` seit
   16.07. keine Updates mehr schreibt, obwohl Imports offensichtlich weiterlaufen — sonst ist jedes
   künftige "läuft/läuft nicht"-Signal wertlos.
3. **P1 — BVwG-Chunk-Anomalie verifizieren** (38,8 Chunks/Seite) vor dem nächsten Embedding-Batch — bei
   1,69 Mio. offenen Embeddings aus dieser einen Quelle lohnt sich die Stichprobe.
4. **P1 — CH-Judikatur 2015–2024 nachimportieren** (über entscheidsuche.ch, siehe Abschnitt 7.2).
5. **P2 — DE-Landesrecht + CH-Kantonsrecht als neue Quellen aufbauen** (strukturelle DACH-Lücke,
   Abschnitt 4.4/7.3/7.4).
6. **P2 — EU-Verordnungen-Import-OOM fixen**, danach auf 100% der 161k lokalen Dateien auffüllen.
7. **P3 — DIP-API-Key beantragen**, dann `fetch-de-gesetzesmaterialien.ts` scharf schalten.
8. **P3 — §→§-Zitiergraph** und Fassungs-Historie (`corpus_snapshots`) nachrüsten.

## 9. Methodik

- Alle Zahlen aus Live-`psql` gegen Hetzner-Prod via SSH-Tunnel (`ssh subsumio-hetzner` →
  `localhost:15432`), ausgeführt 2026-07-21.
- RIS-OGD-Referenztotale aus `pipeline_state.ris_total` (Stand letzter erfolgreicher Zyklus 16.07.,
  daher leicht konservativ, RIS wächst täglich).
- Lokale Literatur-Zählung: `law-corpus/{at,de,ch}-literatur`, `law-corpus/de-materialien` (Dateisystem).
- Alte Einzelaudits liegen unverändert in `docs/audits/archive/`; das 19.07.-Masterdokument wurde
  dorthin verschoben und durch dieses Dokument ersetzt.
