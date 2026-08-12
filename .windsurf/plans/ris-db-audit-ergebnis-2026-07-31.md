# RIS ↔ DB Audit — Ergebnis (2026-07-31)

Vollabgleich des geltenden österreichischen Bundesrechts (RIS OGD `BrKons`,
Fassung vom 2026-07-31) gegen die lokale Docker-DB (`subsumio-db-local`,
`source_id='law-at'`).

Reproduktion:

```
bun run server/scripts/ris-inforce-crawl.ts --out /tmp/ris-inforce.jsonl
bun run server/scripts/ris-db-audit.ts --ris /tmp/ris-inforce.jsonl
```

## Kurzfassung

Der Bestand ist **nicht vollständig**. Was in der DB liegt, ist technisch sauber
verarbeitet (100 % Embeddings, keine Dubletten, konsistente Versionierung), aber
es fehlt der Großteil des Bundesrechts, und der vorhandene Text trägt
Extraktionsartefakte.

| Ebene | RIS geltend | in DB | Abdeckung |
| --- | ---: | ---: | ---: |
| Gesetze (Gesetzesnummern) | 10.695 | 563 | **5,3 %** |
| Normen gesamt | 158.741 | 19.745 | **11,0 %** |
| davon Paragraphen | 91.410 | 15.719 | 17,2 % |
| davon Artikel | 59.887 | 4.026 | 6,7 % |
| davon Anlagen | 7.444 | **0** | **0 %** |

## Befunde nach Schwere

### 1. Alphabetischer Abbruch — 911 von 1.014 Gesetzen beginnen mit "A"

Verteilung der Anfangsbuchstaben der Gesetze in der DB: A=911, B=8, C=1, D=1,
E=7, F=2, G=8, … Der systematische Durchlauf ist mitten im Buchstaben A
abgebrochen. Der Rest (103 Gesetze) ist ein handverlesener Kern (ABGB, StGB,
ZPO, StPO, UGB, EO, BAO …).

Prominente vollständig fehlende Gesetze (verifiziert, 0 Seiten in der DB):
**BSVG** (508 Normen), **GSVG** (473), **Geo.** (505), **LAG 2021** (437),
**EisbG** (389), **VAG 2016** (376), **B-KUVG** (354), **VBG** (314),
**GehG** (301), **ÄrzteG 1998** (299), **RStDG** (281), **NO** (259),
**VersVG** (257), **MinroG** (253), **BWG** (228), **StVG** (226),
**TKG 2021** (219), **LFG** (218), **AEUV** (359).

Ebenfalls fehlend: UWG, KFG, FSG, VwGG, VfGG, VwGVG, FinStrG, GrEStG, FBG, GGG.

### 2. Import-Lücke: 1.300 bereits heruntergeladene Dateien sind nicht in der DB

`law-corpus/at/` enthält **2.315** Gesetzesdateien (107 MB) mit guter
Buchstabenverteilung (S=186, E=132, B=117, V=102, G=102 …). In der DB liegen
davon nur **1.021**. Stichprobe von 40 fehlenden Dateien: **40/40 gar nicht in
der DB** (weder als Dump noch als Norm-Seite).

Das ist die billigste Lücke — die Daten liegen auf der Platte, sie wurden nur nie
ingestiert.

### 3. Anlagen werden gar nicht importiert

RIS führt 7.444 geltende Anlagen (Tarife, Formulare, Listen). Die DB hat **null**
`anl-`-Slugs. Kategorialer Ausfall des Splitters.

### 4. Metadaten gehen beim Splitten verloren

Die Korpusdateien haben exzellente Frontmatter (2.307/2.315 mit
`gesetzesnummer`, 2.249 mit `typ`/`kundmachungsorgan`/`eli`). Die daraus
erzeugten Norm-Seiten haben sie nicht.

Beispiel ABGB: 1.348 Norm-Seiten in der DB, davon **0** mit `gesetzesnummer`,
`typ`, `eli` oder `kundmachungsorgan` — obwohl `abgb.md` alle vier trägt.

DB-weit: nur 933 von 21.451 Seiten (4,3 %) tragen `gesetzesnummer` explizit;
20.505 sind aus der `source_url` rekonstruierbar, 13 gar nicht.

`content_chunks.paragraph_ref` ist bei **0** von 47.057 Chunks gefüllt — Spalte
und Index existieren, werden aber nie beschrieben. Damit fällt die
paragraphengenaue Zitat-Retrieval-Ebene aus.

### 5. Textqualität: PDF- und Sprachausgabe-Artefakte

Der Korpus ist eine **PDF-Textextraktion** der RIS-Gesamtfassungen.

- **5.673 Seiten (26 %)** enthalten PDF-Seitenumbrüche im Normtext. Beispiel
  `legal/statutes/at/abgb/p-96`: „… zur ungeteilten Hand. **Bundesrecht
  konsolidiert www.ris.bka.gv.at Seite 29 von 191**".
- **3.110 Seiten (14,5 %)** enthalten die RIS-Sprachausgabe doppelt, z. B.
  „§. 197.**Paragraph 197,**" oder „BGBl. Nr. 403/1977) **Bundesgesetzblatt
  Nr. 403 aus 1977,**". Fast deckungsgleich mit den 3.113 Roh-Dumps
  („RIS Dokument"-Block).

Beides bläht Embeddings auf und verschlechtert Retrieval und Zitatqualität.

### 6. Metadatenblock um eine Norm verschoben

Bei den Roh-Dump-Seiten gehört der angehängte RIS-Metadatenblock zur **nächsten**
Norm. Messung über 381 Seiten, bei denen beides extrahierbar ist:

- Normtext ↔ Slug stimmt überein: **381/381 (100 %)**
- Metadatenblock ↔ Slug stimmt überein: **30/381 (8 %)**

Der Gesetzestext ist also korrekt zugeordnet — aber Inkrafttretens- und
Außerkrafttretensdatum im angehängten Block sind der falschen Norm zugeordnet
(1.157 Seiten tragen ein gesetztes Außerkrafttretensdatum).

### 7. 505 nicht mehr geltende Gesetze (2.788 Seiten) stehen als geltendes Recht

Stichprobe gegen den RIS-Geltendbestand: „Abschlussprüfungs-Qualitätssicherungs-
gesetz", „Abgabe auf bestimmte Stärkeerzeugnisse", „2. Budgetüberschreitungs-
gesetz 1995" — alle 0 Treffer in RIS geltend.

Hinweis: Aufhebungs-Platzhalter („Anm.: Aufgehoben durch …") innerhalb geltender
Gesetze führt RIS selbst so; die sind korrekt und **kein** Fehler.

## Nachtrag: Redundanz-Prüfung und API-Format (2026-07-31, 2. Durchgang)

### Keine doppelte Datenbank — aber doppelte Inhalte

Im Docker liegt genau **eine** Subsumio-DB: `sigmabrain`, 100 GB (die übrigen
Container `foerderportal-*`, `yt_automator_*` gehören zu anderen Projekten).
Gesamtbestand: **796.000 Seiten / 4.626.244 Chunks** (65 GB Chunks, 20 GB Pages).

Die Masse ist Judikatur, nicht Gesetzestext:

| Kategorie | Seiten |
| --- | ---: |
| Judikatur (Urteile) | 647.551 |
| EU | 70.551 |
| DE | 27.071 |
| **AT Bundesrecht (Gesetze)** | **21.451** |
| AT Landesrecht | 15.215 |
| CH | 13.069 |
| AT Staatsverträge | 1.156 |

Die 5,3 %-Aussage oben bleibt damit gültig — sie bezieht sich auf `law-at`
(Bundesgesetze), nicht auf den Gesamtbestand.

### ~44.800 doppelt importierte Judikatur-Fälle

Mehrere Judikatur-Quellen wurden zweimal ingestiert, unter zwei `type`-Werten
und zwei Slug-Konventionen (`<datum>-<az>` vs. `<az>-<datum>`):

| Quelle | doppelt erfasste Fälle |
| --- | ---: |
| `law-at-judikatur-asylgh` | 24.123 |
| `law-at-judikatur-uvs` | 17.471 |
| `law-at-judikatur-ubas` | 2.778 |
| `law-at-judikatur-umse` | 333 |
| `law-at-judikatur-vwgh` | 63 |

Verifiziert an B1 229548-0/2008 (30.03.2009): `type='court_decision'` ist sauber
strukturiert („# Asylgerichtshof — B1 229548-0/2008 ## Gericht …"), `type='judikatur'`
ist die alte PDF-Extraktion ohne Wortabstände („Asylgerichtshof30.03.200930.03.2009
www.ris.bka.gv.atSeite 2 von 2…"). Beide sind embedded und konkurrieren im Retrieval.

**Kein** Blanko-Doppelimport: VwGH führt 104.121 `court_decision` neben 48.727
`judikatur` mit nur 63 Überschneidungen — das sind Rechtssätze vs.
Entscheidungstexte, also legitim getrennt.

### Das richtige API-Format: XML statt PDF

Pro Norm liefert RIS vier Formate:

```
https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR{id}/NOR{id}.xml   ← richtig
                                                        …/NOR{id}.html  (Sprachausgabe doppelt)
                                                        …/NOR{id}.rtf
                                                        …/NOR{id}.pdf   ← aktuell genutzt
```

Die `ContentUrl`-Liste steht bereits in jeder API-Antwort unter
`Data.Dokumentliste.ContentReference.Urls.ContentUrl[]`.

Das XML (Namespace `http://www.bka.gv.at`) ist semantisch ausgezeichnet:

- `<absatz ct="text">` = Gesetzestext
- `<absatz ct="kurztitel|kundmachungsorgan|artikel_anlage|ikra">` = Metadaten
- `<ueberschrift typ="g1|g2|para">` = Gliederungshierarchie
- `<gldsym>§ 1.</gldsym>` = Paragraphensymbol
- `<kzinhalt>` / `<fzinhalt>` = Kopf-/Fußzeile — **strukturell getrennt**

Genau diese Kopf-/Fußzeilen („www.ris.bka.gv.at Seite X von Y") stehen aktuell
mitten in unserem Normtext, weil aus PDF extrahiert wurde. Die Sprachausgabe-
Duplikate („Paragraph 197,") sind ein reines HTML-Artefakt und im XML gar nicht
vorhanden.

Probeextraktion aus `NOR12017691` (ABGB § 1) über `ct="text"` liefert sauber:

```
Einleitung. / Von den bürgerlichen Gesetzen überhaupt. / Begriff des bürgerlichen Rechtes.
§ 1. Der Inbegriff der Gesetze, wodurch die Privat-Rechte und Pflichten …
```

Damit sind Metadaten, Gliederung und Text ohne Heuristik gewinnbar — der
Splitter, der `gesetzesnummer`/`typ`/`eli` verliert und Anlagen überspringt,
wird überflüssig.

## Was in Ordnung ist

- **Embeddings**: 47.057 / 47.057 Chunks vektorisiert (100 %).
- **Dubletten**: keine (0 doppelte `content_hash`).
- **`effective_date`**: auf allen 21.451 Seiten gesetzt.
- **Lizenz**: 21.445 / 21.451 mit RIS-OGD-Namensnennung.
- **`legal_source_versions`**: 1.014 `current` + 5 `superseded` für AT, konsistent
  zur Gesetzesanzahl; `valid_from`/`valid_to`-Ketten sauber.
- **Chunk-Abdeckung**: 21.370 / 21.451 Seiten haben Chunks.

## Ursachen

1. **Fetch ist stichprobengetrieben, nicht enumerierend.**
   `fetch-at-complete-corpus.ts` sucht über `Suchworte`-Begriffslisten mit
   Quote (`if (totalFetched >= target) break`). Das kann Vollständigkeit
   strukturell nicht erreichen. Richtig wäre Pagination über den
   `BrKons`-Gesamtindex mit `Fassungvom` (1.588 Seiten à 100).
2. **Ingest Korpus → DB unvollständig.** 1.300 vorhandene Dateien nie importiert.
3. **Splitter** verwirft Eltern-Frontmatter, erzeugt keine Anlagen, hängt den
   Metadatenblock der Folgenorm an, füllt `paragraph_ref` nicht.
4. **Extraktion aus PDF statt XML.** RIS liefert pro Norm sauberes XML
   (`https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR…/NOR….xml`); die
   PDF-Route erzeugt die Kopf-/Fußzeilen- und Sprachausgabe-Artefakte.

## Empfohlene Reihenfolge

1. **Die 1.300 vorhandenen Dateien importieren** — größter Effekt pro Aufwand,
   kein Netzverkehr nötig.
2. **Metadaten-Backfill**: `gesetzesnummer` aus `source_url` (20.505 Seiten),
   restliche Felder aus der Elterndatei; `paragraph_ref` in `content_chunks`
   füllen.
3. **Vollenumeration statt Suchbegriffe** — `ris-inforce-crawl.ts` liefert bereits
   den vollständigen Zielbestand (158.741 Normen, `/tmp/ris-inforce.jsonl`);
   daraus die 10.132 fehlenden Gesetze nachladen.
4. **Auf XML-Extraktion umstellen** und die 5.673 PDF-Artefakt-Seiten sowie die
   3.110 Sprachausgabe-Seiten neu erzeugen; danach neu embedden.
5. **Anlagen-Pfad im Splitter ergänzen** (7.444 Normen).
6. **Geltungsstatus führen** — die 505 nicht mehr geltenden Gesetze markieren
   (`legal_source_versions.status`), nicht löschen.

Nach Schritt 1–3 ist der Bestand konsistent und maschinell anschlussfähig; nach
4–6 ist er vollständig und zitierfähig.
