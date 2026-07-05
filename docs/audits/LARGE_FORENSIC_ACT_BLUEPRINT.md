# Blueprint: großer forensischer Aktenimport

Stand: 2026-07-05  
Ziel: 800+ Originaldokumente reproduzierbar, revisionssicher und als eine
gemeinsame Akte von Upload bis Copilot verarbeiten.

## 1. Definition von „fertig“

Ein Aktenimport ist erst erfolgreich, wenn alle fünf Ebenen nachweisbar grün
sind:

1. **Originale:** jedes Dokument ist unverändert gespeichert, gehasht und der
   richtigen Akte sowie seinem ursprünglichen relativen Pfad zugeordnet.
2. **Erkennung:** Extraktion/OCR ist pro Dokument und Seite abgeschlossen oder
   mit einem maschinenlesbaren Fehler beziehungsweise Review-Status versehen.
3. **Brain/DB:** Dokumente, Seiten, Chunks, Embeddings und Beziehungen sind
   vollständig persistiert und abfragbar.
4. **Aktenanalyse:** genau ein gemeinsamer, versionierter Legal-Pipeline-Lauf
   verarbeitet den vollständigen Snapshot der Akte.
5. **Arbeitsoberfläche:** Dashboard und Copilot zeigen denselben Akten-Snapshot,
   dieselben Quellen und dieselben Review-Entscheidungen.

Ein grüner OCR-Fixture-Test allein ist ausdrücklich kein Akten-E2E-Beweis.

## 2. Zielarchitektur

```text
Ordner/800 Dateien
  -> Import-Manifest + relativer Pfad + SHA-256
  -> persistente Import-Session
  -> begrenzte Upload-/Extraktions-Queue
  -> Originalspeicher
  -> Extraktion/OCR je Seite
  -> Dokumente/Chunks/Embeddings/Relationen
  -> Readiness- und Qualitäts-Gate
  -> ein unveränderlicher Akten-Snapshot
  -> ein gemeinsamer Legal-Pipeline-Lauf
  -> versionierte Pipeline-Artefakte
  -> Review/Editoren/Copilot mit Quellenbindung
```

Der einzige Rohdokumentpfad bleibt `POST /api/upload`. Direkte Inserts von
vorbereitetem OCR-Text über `/api/pages` sind für E2E-Abnahmen verboten.

## 3. Backend-Arbeitspakete

### B1 — Persistente Import-Session (P0)

Eine `act_import`-Session speichert mindestens:

- `id`, `case_slug`, Benutzer, Start/Ende und Status
- Manifest aller Dateien mit relativem Ordnerpfad, Größe, MIME und SHA-256
- Upload-, Persistenz-, Extraktions-, OCR-, Embedding- und Analysezustand
- Versuchszähler, Fehlercode, letzte Fehlermeldung und Retry-Zeitpunkt
- resultierende Dokument- und Part-Slugs
- Kosten, Modelle und Pipeline-Snapshot-ID

Anforderungen: idempotenter Neustart, Pause/Fortsetzen, Abbruch ohne
Datenverlust, Retry nur fehlgeschlagener Elemente und Wiederaufnahme nach
Serverneustart.

### B2 — Batch-Orchestrierung (P0)

- alle Dokumentuploads verwenden `defer_pipeline=true`
- größenabhängige Parallelität und harte Backpressure für OCR/Embeddings
- Duplikate werden als Manifestzustand erfasst, nicht als undifferenzierter
  Batchfehler
- Pipeline startet erst nach einem expliziten Readiness-Gate
- genau ein Pipeline-Job pro Snapshot; kein Job pro Dokument
- neue Nachträge erzeugen Snapshot `N+1`, ohne frühere Ergebnisse zu überschreiben

### B3 — Skalierbares Akten-Datenmodell (P0)

800 Dokumente dürfen nicht dauerhaft als wachsendes Array im Frontmatter der
Aktenseite die primäre Datenquelle sein. Benötigt werden paginierbare
Dokument-Akte-Relationen mit Indizes auf:

- `case_slug`, Status, Dokumenttyp, Datum, ON/GZ, relativer Pfad
- Privileg, Reviewstatus, OCR-Konfidenz und Fehlercode
- Import-Session und Snapshot

Frontmatter darf nur aggregierte Zähler und die aktuelle Snapshot-ID tragen.

### B4 — Qualitäts- und Readiness-Gate (P0)

Vor Pipeline-Start werden geprüft:

- Original vorhanden und Hash bestätigt
- Extraktion terminal (`ready`, `partial` oder reviewpflichtiger Fehler)
- erwartete Seitenzahl gegen extrahierte Seitenzahl
- Embeddings vollständig oder bewusst als keyword-only freigegeben
- keine unbehandelten Passwort-, Korruptions- oder Scannerfehler
- ON/GZ-Vorprüfung und Dokumentklassifikation verfügbar

Der Benutzer bestätigt bewusst, ob `partial`-Dokumente in den Snapshot dürfen.

### B5 — Versionierte Artefakte und Editierbarkeit (P1)

ON-Tabelle, Entitäten, Forensikbericht, Schäden, Fristen und Entwürfe erhalten:

- `snapshot_id`, `pipeline_run_id`, Modell- und Promptversion
- Originalwert, geprüften Wert, Bearbeiter, Zeitstempel und Änderungsgrund
- Quellenzitat mit Dokument-Slug, Seite und Textspanne
- Reviewzustand `unreviewed | confirmed | corrected | rejected`

Manuelle Korrekturen dürfen nie still durch einen neuen Pipeline-Lauf
überschrieben werden.

## 4. Dashboard-Arbeitspakete

### F1 — Aktenimport-Cockpit (P0)

- Ordner auswählen, Manifest vor dem Start prüfen
- Gesamtfortschritt nach Dateien, Bytes und Seiten
- getrennte Phasen: Upload, Extraktion/OCR, Embedding, Analyse
- Filter: offen, laufend, fertig, Review, Fehler, Duplikat
- Retry für Auswahl oder nur Fehler
- Pause/Fortsetzen und dauerhaftes Importprotokoll
- Browser-Neuladen darf den sichtbaren Fortschritt nicht verlieren

### F2 — 800-Dokumente-Ansicht (P0)

- serverseitige Pagination und Virtualisierung
- Suche/Filter nach Name, Ordner, Dokumenttyp, Datum, ON/GZ und Status
- Ordnerbaum aus den relativen Quellpfaden
- Bulk-Aktionen und Mehrfach-Review
- stabile Performance bei mindestens 2.000 Dokumenten

### F3 — Forensischer Review-Arbeitsplatz (P1)

Strukturierte Editoren statt bloßer Markdown-Anzeige für:

- ON-/GZ-Tabelle und Querverweisgraph
- Entitäten, Aliasse, Rollenwechsel und Vertretungsverhältnisse
- Chronologie und Widersprüche
- Schäden/Doppelzählungen
- Fristen samt Rechtsgrundlage
- Beweisqualität und fehlende Ermittlungsmaßnahmen

Jede Zeile öffnet Originaldokument und Seite; jede Änderung ist auditierbar.

### F4 — Pipeline-Monitor (P1)

- zeigt Snapshot, Layer, Kosten, Modelle, Warnungen und Outputversionen
- verhindert parallele Läufe auf demselben Snapshot
- unterstützt Review-Checkpoint und kontrolliertes Resume
- zeigt klar, ob Ergebnisse vollständig, partiell oder veraltet sind

## 5. Copilot-Arbeitspakete

### C1 — Exakter Aktenkontext (P0)

- vollständigen verschachtelten `case_slug` aus der Route übernehmen
- niemals Präfixe wie `cases/` erneut davor setzen
- Kontext-Isolation mit Negativtests gegen andere Akten
- aktiven Snapshot und Import-Readiness im Promptkontext führen

### C2 — Quellengebundene Antworten (P0)

- Suche auf Dokumente und freigegebene Pipeline-Artefakte der Akte begrenzen
- jede Tatsachenbehauptung mit Dokument, Seite und nach Möglichkeit ON belegen
- Unsicherheit, OCR-Warnung und widersprüchliche Quellen sichtbar machen
- keine Antwort aus einem noch laufenden oder veralteten Snapshot als final ausgeben

### C3 — Forensische Aktionen (P1)

Quick Actions für:

- „Zeige Dokumente mit OCR-/Reviewproblemen“
- „Welche ON fehlen oder sind nur referenziert?“
- „Zeige Rollenwechsel und Aliaskonflikte“
- „Vergleiche Schadensbeträge und finde Doppelzählungen“
- „Welche Aussagen sind nicht durch Originalseiten belegt?“
- „Was änderte sich zwischen Snapshot N und N+1?“

## 6. Testdaten und korrekte Fallbezeichnungen

Im Repo vorhanden:

- `tests/toni-gericht-ground-truth.ts`
- `tests/toni-gericht-acceptance.test.ts`
- `docs/audits/TONI_GERICHT_PIPELINE_AUDIT_2026-07.md`
- kleine generische PDFs unter `tests/fixtures/`

Der Ground Truth nennt:

- **Martin Eckerstorfer**, Rollenwechsel Beschuldigter -> Anzeiger
- **Adis Hrustemovic**, Rolle/Tatkomplex
- Aliasse **Toni Remik** und **Tony Remik**
- Marjan Vasic, Rudolf Mather und weitere verbundene Personen

Die Bezeichnungen „Marta Eckersdorfer“ und „Toni Remig“ sind nicht die
kanonischen Ground-Truth-Namen. Sie werden als mögliche OCR-/Eingabevarianten in
Alias- und Fuzzy-Matching-Tests aufgenommen, aber nicht ungeprüft zusammengeführt.

Die echten Rohunterlagen liegen nicht im Git-Repo. Die vorhandenen Tests
referenzieren lokale Daten unter `/Users/msc/Toni Gericht/...`. Vor einem Lauf
wird daraus ein Manifest erstellt; Originale werden nicht ins Git aufgenommen.

Lokale Inventur am 2026-07-05:

- `GESAMTAKTEN ORDNER`: 349 Dateien, ca. 0,94 GiB; darunter 11 PDF, 84 HEIC,
  84 JPG, 30 PNG sowie bereits erzeugte Text-/OCR-Artefakte
- `ARCHIV_Analysen`: 18 Dateien, überwiegend manuelle Referenzanalysen
- `FMA Forderungsunterlagen/Martin-Fall`: über 11.000 Dateien, aber überwiegend
  Entwicklungsabhängigkeiten; nur eine fachlich kuratierte Allowlist darf als
  Aktenquelle verwendet werden

Manifest-Scans schließen mindestens `.git`, `.next`, `node_modules`, `dist`,
`build`, Caches, `__pycache__`, `.DS_Store` und AppleDouble-Dateien aus. Bereits
erzeugte OCR-/Analyseartefakte werden als Ground Truth markiert und nicht als
Rohoriginale in denselben E2E-Lauf gemischt.

## 7. Abnahmematrix

### Stufe A — deterministische Regression

- Unit-/Integrationstests für Routing, Import-Session, Retry und Snapshot
- kleine PDF-/Scan-Fixtures
- keine externen Modelle nötig

### Stufe B — Toni OCR Ground Truth

- bestehende OCR-/Analyseunterlagen gegen Ground Truth
- ONs, Entitäten/Aliasse, Rollenwechsel, Schäden, Fristen und Widersprüche
- bleibt ein Output-Regressionslauf, kein Rohakten-E2E

### Stufe C — Toni Rohakten-E2E

- Originaldateien aus `/Users/msc/Toni Gericht/...`
- ausschließlich über den kanonischen Uploadpfad
- danach DB-, Retrieval-, Pipeline- und Dashboard-Abgleich
- Ergebnisbericht wird mit dem Ground Truth verglichen

### Stufe D — 800-PDF-Shadow-Import

- zuerst isolierte Staging-Akte und Kostenlimit
- Pipeline zunächst bis Readiness-Gate, keine automatische Vollanalyse
- Stichprobe nach Dokumentklassen und Risikogruppen
- erst nach Freigabe ein gemeinsamer Voll-Lauf

### Stufe E — Produktionsfreigabe

- Wiederholung eines fehlgeschlagenen Imports ohne Duplikate
- Nachtragslauf als neuer Snapshot
- zwei Benutzer prüfen Dashboard, Review und Copilot auf derselben Akte

## 8. Messbare Go/No-Go-Kriterien

| Bereich           | Go-Kriterium                                                                       |
| ----------------- | ---------------------------------------------------------------------------------- |
| Originale         | 100 % gespeichert; 100 % Hash-Abgleich                                             |
| Zuordnung         | 100 % genau einer Import-Session und korrekten Akte zugeordnet                     |
| Verluste          | 0 still verlorene oder dauerhaft `processing` gebliebene Dateien                   |
| Wiederaufnahme    | Neustart verarbeitet nur offene/fehlgeschlagene Dateien                            |
| Pipeline          | genau 1 Voll-Pipeline-Job je Snapshot                                              |
| ON-Halluzination  | 0 erfundene ONs; jede ON mit Quellenfundstelle                                     |
| Ground Truth      | alle kritischen ONs und bekannten Hauptentitäten erkannt                           |
| Aliasse           | Hrustemovic <-> Toni/ Tony Remik korrekt belegt; Varianten nur als Reviewvorschlag |
| Rollen            | Eckerstorfer-Rollenwechsel zeitlich und quellengebunden dargestellt                |
| Copilot-Isolation | 0 Quellen aus fremden Akten in Negativtests                                        |
| Copilot-Belege    | 100 % forensische Tatsachenbehauptungen mit zitierbarer Quelle                     |
| UI-Skalierung     | 2.000 Dokumente ohne vollständiges DOM-Rendering; Filter/Paging stabil             |
| Audit             | jede manuelle Korrektur versioniert und zurechenbar                                |
| Kosten            | Schätzung vor Start; hartes Limit; tatsächliche Kosten im Run-Bericht              |

Ein No-Go in Originalpersistenz, Aktenisolation, ON-Halluzination oder Audit
blockiert den Voll-Lauf unabhängig von allen anderen Scores.

## 9. Empfohlene Umsetzungsreihenfolge

1. **P0 Backend:** Import-Session, Relationstabelle, Snapshot und genau-ein-Job-Orchestrierung.
2. **P0 Frontend:** persistentes Import-Cockpit, Pagination/Virtualisierung, Retry.
3. **P0 Copilot:** Slug-Korrektur, Snapshotbindung, Aktenisolation und Quellenpflicht.
4. **Stufe A + B:** automatisierte Regression vollständig grün.
5. **P1 Review:** strukturierte, versionierte Forensikeditoren.
6. **Stufe C:** Toni-Rohaktenlauf und Ground-Truth-Differenzbericht.
7. **Stufe D:** neuer 800-PDF-Akt als kontrollierter Shadow-Import.
8. **Stufe E:** erst danach Produktionsfreigabe.

## 10. Verbindliche Betriebsregel

Kein großer Akt wird direkt „blind“ voll analysiert. Jeder Lauf folgt:

`Manifest -> Upload/OCR -> Readiness-Bericht -> menschliche Freigabe -> ein
Snapshot -> eine Pipeline -> Grounding-/Qualitätsbericht -> produktive Nutzung`.
