# AT-Rechtskorpus auf dem netcup-Server: Bestandsaufnahme und Plan

Stand 18.09.2026, gemessen auf dem Produktionsserver (nur lesend). Alle Zahlen
stammen aus der Datenbank und dem Dateisystem, nicht aus Schätzungen.

## 1. Wie das „Gehirn“ aufgebaut ist

Subsumio sucht **hybrid**, nicht rein semantisch. Das ist für Recht die richtige Wahl:

| Suchweg               | findet                                              | Stand                                   |
| --------------------- | --------------------------------------------------- | --------------------------------------- |
| Stichwort / Volltext  | exakte Zitate: „§ 1295 ABGB“, Geschäftszahlen, ECLI | läuft (ts_rank). BM25-Index fehlt noch  |
| Semantisch (Vektoren) | sinngemäß Ähnliches ohne gleiche Wörter             | 47 % der aktiven Abschnitte eingebettet |
| Strukturierte Filter  | Gericht, Datum, Gesetz, Paragraph, Entscheidungsart | abhängig von den Metadaten (siehe 3.4)  |
| Verweise (Graph)      | Urteil ↔ zitierte Norm, Norm ↔ Norm                 | 367 645 Verknüpfungen                   |

Eine rein semantische Suche verfehlt genau das, was Anwält:innen am häufigsten
eingeben: exakte Fundstellen. Die Ergebnisse der Wege werden zusammengeführt (RRF).

## 2. Das Einheitsformat

Jede Quelle wird in das kanonische Schema v1 gebracht
(`server/scripts/normalize/canonical-schema.ts`, 35 Felder in fester Reihenfolge).
Rechtstext wird dabei nie umformuliert, nur Struktur und Metadaten vereinheitlicht.
Jeder Abschnitt (Chunk, ≤ 1 500 Tokens) trägt Gericht, Geschäftszahl, ECLI,
Gesetz, Paragraph und Rolle (Spruch, Begründung, Rechtssatz, Normtext).

## 3. Befund

### 3.1 In Ordnung

- **RIS-Link bei 100 % der Datensätze**, keiner zeigt nur auf die RIS-Startseite
  (das Tarnmuster erfundener Texte aus dem Juli-Audit).
- **Kein Datensatz ohne Abschnitte**, kein Abschnitt ohne Datensatz.
- **Keine Platzhalter** („Volltext nicht abrufbar“) in der Datenbank.
- Jede Norm hat Gesetzesnummer und Paragraph.
- Über 97 % der AT-Datensätze sind im Einheitsformat.

### 3.2 Duplikate (aktiv, also in der Suche sichtbar)

Ursache fast überall: dieselbe RIS-Entscheidung unter zwei Pfaden importiert
(`legal/judikatur/at/lvwg/…` und `legal/judikatur/at/…`), Text identisch.

| Quelle                                         | doppelte Dokumente |             betroffene Seiten |
| ---------------------------------------------- | -----------------: | ----------------------------: |
| LVwG                                           |             39 761 |                        79 523 |
| AsylGH                                         |             12 678 |                        25 356 |
| BVwG                                           |              1 457 |                         2 914 |
| Gemeinden                                      |              1 821 |                         3 642 |
| Landesrecht (gleicher Text)                    |        888 Gruppen |                         2 090 |
| VfGH                                           |                375 |                           750 |
| Bundesnormen (gleiche Gesetzesnr. + Paragraph) |        368 Gruppen | 1 204 (teils legitim, prüfen) |

**Der eingebaute Duplikatschutz greift nicht:** der eindeutige Index
`pages_judikatur_body_hash_uniq` braucht die Spalte `pages.body_hash`, die bei
allen Datensätzen leer ist (Nachfüllung nach Migration 127 nie gelaufen).

### 3.3 Fehlerhafte oder unvollständige Datensätze

- **Zitierte Normen fehlen** bei VwGH (64 %), OGH (44 %), BVwG (95 %). Ursache:
  das Abrufskript für die großen Gerichte hat das RIS-Feld `Normen` verworfen
  (behoben, siehe 5).
- **Doppelter Text in älteren BVwG-Abrufen**: die Vorlese-Fassung des RIS
  („römisch 40“) steckt zusätzlich im Text.
- **4 400 Seiten im Rohformat** kamen am 18.09. abends dazu (981 BVwG,
  3 379 Bundesgesetze), weil die Pipeline aus Rohdateien importiert.
- **40 000 BVwG-Entscheidungen** liegen formatiert auf der Platte, sind aber nicht
  in der Datenbank.

### 3.4 Metadaten je Abschnitt (aktive Seiten)

| Quelle       | Gericht | ECLI |   GZ |   Gesetz | Paragraph | eingebettet |
| ------------ | ------: | ---: | ---: | -------: | --------: | ----------: |
| AsylGH       |    99 % |  0 % | 99 % |        – |         – |        19 % |
| LVwG         |    97 % | 97 % | 97 % |        – |         – |        35 % |
| VwGH         |    86 % | 86 % | 86 % |        – |         – |       100 % |
| BVwG         |    99 % | 81 % | 99 % |        – |         – |        13 % |
| Bundesnormen |       – |    – |    – | **46 %** |     100 % |        36 % |
| Landesrecht  |       – |    – |    – |  **0 %** |     100 % |        88 % |

Für ein Zitat „§ 14 BEinstG“ muss jeder Normabschnitt das Gesetzeskürzel tragen.

### 3.5 Kosten und gelöschte Daten

- 977 622 Abschnitte gehören zu gelöschten Seiten, 469 219 davon sind noch nicht
  eingebettet. **Das automatische Embedding prüft nicht, ob die Seite gelöscht ist**
  und würde sie bezahlt einbetten (~620 Mio. Tokens).
- Offen für aktive Seiten: 1,61 Mio. Abschnitte, ~1,3 Mrd. Tokens, ≈ 26 USD.

### 3.6 Vollständigkeit gegenüber dem RIS

Judikatur: RIS ~981 700 Entscheidungen, auf der Platte ~216 500 (vor dem Upload
vom Mac). Größte Lücken: VwGH, BVwG, OGH. Geltendes Bundes- und Landesrecht:
91,5 % (Messung 04.08.). Historische Fassungen fehlen fast vollständig.

## 4. Regeln, damit nichts überschrieben oder doppelt wird

1. **Eine Identität pro Dokument:** die RIS-Dokumentnummer (`doc_id`). Pro Quelle
   darf sie nur einmal aktiv sein — per eindeutigem Index erzwungen, nicht per
   Konvention.
2. **Ein Weg in die Datenbank:** Abruf → Rohdatei → Normalisierung (Validator) →
   `_normalized/` → Import. Nie direkt aus Rohdateien.
3. **Nur hinzufügen, nie überschreiben:** Upload und Abruf schreiben nur fehlende
   Dateien (`--ignore-existing`, Erkennung per Dokumentnummer).
4. **Löschen heißt markieren** (`deleted_at`), nie hart löschen. Gelöschtes wird
   weder gesucht noch eingebettet.
5. **Jeder Schritt endet mit dem Prüfbericht** (Abschnitt 6). Weiter nur bei grün.

## 5. Plan

| Phase | Inhalt                                                                                                                                                                                                  | RIS-Zeit   | DB-Änderung                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------- |
| 0     | Pipeline angehalten, Mac-Upload läuft (nur hinzufügen)                                                                                                                                                  | –          | nein                        |
| 1     | Schutz einbauen: Abrufskript mit Normen + Dokumentnummer-Erkennung (erledigt, getestet); Import nur aus `_normalized`; Embedding nur aktiver Seiten; `body_hash` füllen; eindeutiger Index auf `doc_id` | –          | Spalte füllen, Index        |
| 2     | Bereinigen: Duplikate markieren (Regel: kanonischer Pfad bleibt), 4 400 Rohseiten durch Einheitsformat ersetzen, 40 000 fehlende BVwG importieren                                                       | –          | ja, markieren statt löschen |
| 3     | Anreichern: zitierte Normen für alle Urteile aus RIS-Metadaten (100 je Anfrage), Gesetzeskürzel für jeden Normabschnitt, BVwG-Doppeltext per XML neu holen                                              | ~1 Tag     | ja                          |
| 4     | Vervollständigen: fehlende Entscheidungen und Normen je Gericht holen, normalisieren, importieren                                                                                                       | ~8–10 Tage | ja                          |
| 5     | Embeddings aller aktiven Abschnitte                                                                                                                                                                     | –          | ja, ≈ 26 USD + Neues        |
| 6     | BM25-Index für die Stichwortsuche                                                                                                                                                                       | –          | Index                       |

## 6. Prüfbericht (nach jeder Phase)

Muss zeigen: 0 aktive Duplikate je Dokumentnummer und Text, 100 % RIS-Links,
0 Platzhalter, 0 Abschnitte gelöschter Seiten in der Warteschlange, Metadaten-Quote
je Quelle, Deckung gegen RIS je Gericht (mit Fassungsfilter für Normen), plus eine
Stichprobe von 50 Datensätzen je Quelle gegen den RIS-Originaltext.

## 7. Arbeitsliste (Stand 19.09.2026, Auftrag „alles systematisch und lückenlos“)

Erledigt seit dem Audit: Duplikate bereinigt (59 563 markiert), doc_id-Sperre (Migration 141),
Import nur aus `_normalized`, zitierte Normen nachgetragen (VwGH 207 008), Urteil→Norm-Verknüpfung
neu (448 472), Gesetzes-Metadaten aus RIS-Abschnitten, Embedding-Kontext repariert, RIS-Warteschlange
(`ris-complete-at.sh`) inkl. Urteilstexte OGH/VfGH/VwGH.

Offen, in dieser Reihenfolge:

| #   | Punkt                       | Befund                                                                                                                                                                  |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Inhalt ↔ Datensatz          | Geschäftszahl im eigenen Text: 20 Abweichungen (LVwG 4, UVS 16) prüfen                                                                                                  |
| A2  | RIS-Link ↔ Dokumentnummer   | ~1 700 Links nennen eine andere Nummer (law-at 1 131, UVS 224, LVwG 97 …)                                                                                               |
| A3  | Täglicher RIS-Abgleich      | Stage-Werte, die der CHECK ablehnt; Gültigkeitsdaten gehen verloren; Benachrichtigung ohne Wirkung; Cursor als „letzter Sync“ angezeigt                                 |
| A4  | Protokoll je Dokument       | Keine dauerhafte Aufzeichnung „welches Dokument wann neu/geändert“ — Tabelle + Anzeige                                                                                  |
| A5  | 1:1-Abgleich mit RIS        | Inventar (Dokumentnummer + Änderungsdatum) gegen DB: zu wenig / zu viel / veraltet, je Quelle                                                                           |
| A6  | Dashboard `/ops/corpus`     | Kennzahlen je Rechtsgebiet (Gesetze, Normen, Urteile je Gericht, Seiten, Abschnitte, eingebettet), Protokoll, Abgleich; Zuordnung at-normen → law-at-normen korrigieren |
| A7  | Abschnitte                  | VwGH 46 % Mini-Abschnitte (Kopfzeilen), BVwG 46 % am 1 500-Token-Limit → vor dem Embedding neu schneiden                                                                |
| A8  | Suche: geltendes Recht vorn | in_force_to/in_force_from in der Rangfolge und Kennzeichnung                                                                                                            |
| A9  | Qualitätstest               | Fester Satz echter Rechtsfragen mit erwarteter Norm/Entscheidung, vorher/nachher gemessen                                                                               |
| A10 | Lokale Docker-DB            | Server ist die einzige Quelle; lokale Kopie entfernen (durch den Inhaber)                                                                                               |
| A11 | Endaudit + Embedding        | Erst wenn A1–A9 grün sind                                                                                                                                               |
