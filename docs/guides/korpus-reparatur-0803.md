# Korpus-Reparatur: Abrufgeneration 03.08. und Druckartefakte

Betreiber-Anleitung für die Seiten, die der Plausibilitäts-Audit
(`server/scripts/audit-plausibility-full.ts`) ablehnt. Stand der Messung
(Produktion, 26.09.2026, `corpus_status.issue_breakdown`):

| Quelle                                           | Grund                                       | Seiten | Weg                                            |
| ------------------------------------------------ | ------------------------------------------- | ------ | ---------------------------------------------- |
| law-at-landesrecht                               | `generation:known_bad`                      | 25.327 | Schritt 2 (XML-Neuabruf per Id-Liste)          |
| law-at-bezirke                                   | `generation:known_bad`                      | 2.510  | Schritt 3 (PDF-Neuabruf per Id-Liste)          |
| law-at-kmger                                     | `generation:known_bad`                      | 53     | Schritt 3                                      |
| law-at-judikatur-vwgh                            | `body:kein_rechtssatz`                      | 1.345  | Schritt 5 (kein Defekt, s. u.)                 |
| law-at-avn, -gemeinden, kleine Judikatur-Quellen | `body:letterhead`, `body:pdf_pagebreak`     | ≈ 400  | Schritt 4 (Druckartefakte entfernen)           |
| law-at-landesrecht                               | `schema:legacy_frontmatter` / `no_identity` | 961    | nicht Teil dieser Anleitung (s. Offene Punkte) |

`generation:known_bad` heißt: `retrieved_at == "2026-08-03"`. Diese
Abrufgeneration hatte in der Stichprobe ≈ 11 % Textfehler gegenüber dem
RIS-Original. Die Seiten werden neu geholt und laufen danach durch den
normalen Weg Rohdatei → `_normalized` (Prüfschleuse) → Datenbank. Die frische
Datei trägt das heutige `retrieved_at` und fällt damit nicht mehr unter den
Befund.

## Wichtig vorab

- **Neu geholt wird immer an den Pfad der vorhandenen Rohdatei.** Der
  Normalizer behält pro `doc_id` genau eine Datei und wählt sie nach
  Textqualität, nicht nach Alter. Eine frische Kopie daneben kann verlieren —
  dann bleibt der alte Text in der Datenbank. Genau daran scheitert der
  bisherige automatische Reparaturlauf `repair-known-bad-generation.ts` (er
  schreibt nach `<land>/gnr-<land>-<nr>/` statt `<land>/gnr-<nr>/`, und
  Fehlschläge werden nie wiederholt). Mit diesem Branch startet die Pipeline
  ihn nicht mehr.
- **RIS-Regeln** (`server/scripts/ris-pace.ts`): höchstens 0,5 Anfragen/s pro
  Prozess (2 s Pause, fest eingebaut), höchstens zwei Download-Prozesse
  gleichzeitig, Massendownloads nur 20–05 Uhr, am Wochenende und an
  österreichischen Feiertagen. **Achtung:** Die Fenster-Wartezeit
  (`waitForRisWindow`) und die Prozess-Sperre (`acquireRisLock`) sind seit
  dem Operator-Entscheid vom 23.09. im Code abgeschaltet. Die Skripte halten
  deshalb nur die 2-s-Pause ein — Fenster und Prozesszahl muss der Betreiber
  selbst einhalten (Befehle unten mit `timeout` und Startzeit).
- Alles läuft im Container `subsumio-engine-corpus-pipeline-1`
  (`LAW_CORPUS_ROOT=/law-corpus`, `DATABASE_URL` gesetzt, Arbeitsverzeichnis =
  `server/`). `/data` ist dort schreibgeschützt; alle Listen und Protokolle
  liegen unter `/law-corpus/_state/`.

Abkürzung für alle Befehle:

```bash
P="docker exec subsumio-engine-corpus-pipeline-1"
```

## Schritt 0 — Stand prüfen

```bash
# 1. Dieser Branch ist deployt (sonst startet die Pipeline den alten Reparaturlauf weiter):
$P grep -c "ABGELÖST" scripts/repair-known-bad-generation.ts   # erwartet: 1

# 2. Keine anderen RIS-Abrufe laufen (höchstens EIN weiterer Prozess erlaubt):
$P sh -c 'ps -eo pid,etime,args | grep -E "fetch-|refetch|repair-known|ris-delta|ris-inforce|ris-xml" | grep -v grep'

# 3. Was der alte Reparaturlauf hinterlassen hat (nur zur Einordnung):
$P cat /law-corpus/_state/repair-law-at-landesrecht-2026-08-03.json 2>/dev/null | head -c 400; echo
$P sh -c 'find /law-corpus/at-landesrecht -mindepth 2 -maxdepth 2 -type d -name "gnr-*-*" | wc -l'
```

Die Verzeichnisse `gnr-<land>-<nr>` stammen vom alten Reparaturlauf. Sie
werden nicht gelöscht: Schritt 2 überschreibt jede Kopie eines Dokuments mit
dem frischen Text, egal welche der Normalizer danach wählt.

## Schritt 1 — Id-Listen erzeugen (nur lesend, keine RIS-Anfrage)

```bash
$P bun scripts/list-rejected-pages.ts --source law-at-landesrecht --reason generation:known_bad
$P bun scripts/list-rejected-pages.ts --source law-at-bezirke     --reason generation:known_bad
$P bun scripts/list-rejected-pages.ts --source law-at-kmger       --reason generation:known_bad
```

Jede Zeile der Ausgabe nennt die Zahl der betroffenen Seiten, der eindeutigen
Dokumentnummern und der Seiten ohne Nummer. Die Listen liegen danach unter
`/law-corpus/_state/rejected-<quelle>-generation-known_bad.txt`
(z. B. `rejected-law-at-landesrecht-generation-known_bad.txt`).

Trockenlauf — zählt die Anfragen, fragt RIS nicht:

```bash
$P bun scripts/fetch-at-landesrecht-xml.ts --dry-run \
   --ids /law-corpus/_state/rejected-law-at-landesrecht-generation-known_bad.txt
$P bun scripts/fetch-ris-pdf-corpus.ts --corpus Bezirke --dry-run \
   --ids /law-corpus/_state/rejected-law-at-bezirke-generation-known_bad.txt
```

## Schritt 2 — Landesrecht neu holen (XML)

Aufwand: eine Anfrage je Dokumentnummer, bei 25.327 Nummern ≈ 25.300
Anfragen × 2 s ≈ **14 h reine Pausenzeit** (mit Antwortzeiten ≈ 15–16 h),
dazu einige Minuten für den Abgleich der vorhandenen Rohdateien beim Start.
Das passt in ein Wochenende oder in zwei Nachtfenster.

Start im Fenster, Laufzeit auf das Fenster begrenzt (Beispiel: Werktag 20:00,
Ende vor 05:00). `--ids-since` = **Datum des ersten Starts**; beim Fortsetzen
am nächsten Abend dasselbe Datum angeben, dann werden bereits geholte Nummern
übersprungen. `docker exec -d` lässt den Lauf weiterlaufen, wenn die
SSH-Sitzung endet:

```bash
docker exec -d subsumio-engine-corpus-pipeline-1 sh -c 'timeout 8h45m bun scripts/fetch-at-landesrecht-xml.ts \
  --ids /law-corpus/_state/rejected-law-at-landesrecht-generation-known_bad.txt \
  --ids-since 2026-09-26 \
  --keep-xml /law-corpus/_xml/at-landesrecht \
  >> /law-corpus/_state/refetch-landesrecht-0803.log 2>&1'
```

Am Wochenende (Freitag 20:00 bis Montag 05:00 durchgehend erlaubt) reicht ein
Lauf mit `timeout 20h`.

Was das Skript tut: holt `https://www.ris.bka.gv.at/Dokumente/Landesnormen/<Nr>/<Nr>.xml`,
baut die Datei wie der normale Abruf (Metadaten aus dem XML) und überschreibt
jede Rohdatei, die diese Nummer trägt. Gibt es keine, entsteht eine am
Standardpfad `<land>/gnr-<nr>/<paragraph>.md`. 404, Abbrüche und XML ohne Text
landen in `/law-corpus/_state/ris-fetch-outcomes.jsonl` und bleiben markiert.

Fortschritt: `$P tail -5 /law-corpus/_state/refetch-landesrecht-0803.log`
(alle 200 geschriebenen Dateien eine Zeile).

## Schritt 3 — Bezirke und KmGer neu holen (PDF)

RIS liefert für diese beiden Sammlungen **nur PDF** (kein XML, kein HTML —
am 26.09. an der API nachgeprüft). Deshalb ist `fetch-missing-sources.ts`
hier das falsche Werkzeug (es fällt auf die RIS-Webseite zurück); zuständig
ist `fetch-ris-pdf-corpus.ts` (Textschicht per `pdftotext`, kein OCR).

Aufwand: Bezirke ≈ 27 Listenseiten + 2.510 PDFs ≈ 2.540 Anfragen ≈ **85 min**;
KmGer 1 Listenseite + 53 PDFs ≈ **2 min**.

```bash
docker exec -d subsumio-engine-corpus-pipeline-1 sh -c 'timeout 3h bun scripts/fetch-ris-pdf-corpus.ts --corpus Bezirke \
  --ids /law-corpus/_state/rejected-law-at-bezirke-generation-known_bad.txt --ids-since 2026-09-26 \
  >> /law-corpus/_state/refetch-bezirke-0803.log 2>&1'
$P sh -c 'bun scripts/fetch-ris-pdf-corpus.ts --corpus KmGer \
  --ids /law-corpus/_state/rejected-law-at-kmger-generation-known_bad.txt --ids-since 2026-09-26 \
  >> /law-corpus/_state/refetch-kmger-0803.log 2>&1'
```

Nummern, die RIS nicht mehr listet, stehen am Ende der Ausgabe als „von RIS
nicht mehr gelistet“ und in `ris-fetch-outcomes.jsonl` als `not_found`.

Bezirke laufen nicht gleichzeitig mit Schritt 2, wenn schon ein anderer
RIS-Prozess läuft (höchstens zwei).

## Schritt 4 — Briefkopf und Seitenumbruch entfernen (keine RIS-Anfrage)

`body:letterhead` / `body:pdf_pagebreak` sind Reste der Druckfassung im Text.
Ein Neuabruf hilft bei PDF-Quellen nicht, weil das PDF sie enthält.
`repair-print-artifacts.ts` entfernt nur genau das, was die Prüfschleuse
bemängelt: die RIS-Fußzeile „www.ris.bka.gv.at Seite X von Y“ und ganze
**kurze** Zeilen (≤ 160 Zeichen) mit DVR-Nummer, UID „ATU…“ oder „P.b.b.
Erscheinungsort“. Steht so ein Merkmal in einer langen Textzeile, bleibt sie
unverändert und wird als „manuell prüfen“ gemeldet. Das ältere
`clean-pdf-artifacts.ts` ist dafür nicht geeignet (liest Zugangsdaten aus
`server/.env`, braucht `psql`, liest eine andere Befundtabelle, schreibt nach
`/tmp` und ersetzt breiter — etwa jedes „Seite X von Y“ und jedes doppelte
großgeschriebene Wort).

Je Quelle und Grund (Beispiel AVN):

```bash
$P bun scripts/list-rejected-pages.ts --source law-at-avn --reason body:letterhead
$P bun scripts/repair-print-artifacts.ts --source law-at-avn --dry-run \
   --ids /law-corpus/_state/rejected-law-at-avn-body-letterhead.txt
$P bun scripts/repair-print-artifacts.ts --source law-at-avn \
   --ids /law-corpus/_state/rejected-law-at-avn-body-letterhead.txt
```

Dasselbe für `law-at-gemeinden` (`body:pdf_pagebreak`, `body:letterhead`) und
die kleinen Quellen mit Einzelbefunden (`law-at-judikatur-dsk`, `-lvwg`,
`-bvwg`, `-asylgh`, `-dok`, `-uvs`, `law-at-bmerl`). Für
`law-at-bezirke` (2 × `body:letterhead`) erst **nach** Schritt 3 — der
Neuabruf schreibt die Datei neu, der Briefkopf kommt aus dem PDF mit.

## Schritt 5 — VwGH „Kein RS.“ (kein Defekt)

Nachgeprüft am 26.09. an einem Beispiel direkt bei RIS
(`JWR_1995200268_19960912X01`, VwGH 12.09.1996, 95/20/0268): das RIS-XML
enthält als Rechtssatz wörtlich nur „Kein RS“. Das ist der RIS-Vermerk, dass
zu dieser Entscheidung kein Rechtssatz existiert — ein Neuabruf liefert
dasselbe. Die Seiten sind also nicht defekt, sondern **„RIS liefert keinen
Inhalt“**, und gehören nicht in Suche und Embedding.

`tombstone-dead-end-pages.ts` behandelt genau diesen Fall (und nur Seiten,
deren **einziger** Befund so ein Endpunkt ist). Soft-Delete (`deleted_at`),
umkehrbar; das Inventar wird vor jedem Update geschrieben.

```bash
# Trockenlauf: zählt, schreibt nur das Inventar
$P bun scripts/tombstone-dead-end-pages.ts --source law-at-judikatur-vwgh
# erwartet ≈ 1.345; dann:
$P bun scripts/tombstone-dead-end-pages.ts --source law-at-judikatur-vwgh --yes
```

Inventar: `/law-corpus/_state/tombstone-dead-end-inventory-<datum>.jsonl`.
Immer mit `--source`: ohne schränkt das Skript nicht ein und nimmt auch
`body:image_only` / `body:meta_dump_only` aller Quellen mit.

Vorschlag (nicht umgesetzt): im Audit `body:kein_rechtssatz` nicht als
„nicht plausibel“, sondern als eigene Klasse „RIS liefert keinen Inhalt“
zählen, damit das Dashboard diese Seiten nicht als Reparaturrückstand zeigt.
Das ändert `validateBody`-Semantik und braucht einen eigenen Test.

## Schritt 6 — Übernahme in die Datenbank

Nichts manuell zu tun. Der nächste Pipeline-Zyklus (alle 10 min) sieht die
geänderten Rohdateien (`needsImport` vergleicht mtime), `normalized-import.ts`
normalisiert genau diese Dateien neu (Doubletten-Auswahl über den ganzen
Korpus) und importiert. Bei Landesrecht mit ≈ 25.000 geänderten Dateien kann
der erste Import-Zyklus länger dauern.

## Schritt 7 — Prüfen

```bash
# 1. Plausibilität neu messen (läuft sonst automatisch alle 6 h, schreibt corpus_status):
$P bun scripts/audit-plausibility-full.ts --source law-at-landesrecht
$P bun scripts/audit-plausibility-full.ts --source law-at-bezirke
$P bun scripts/audit-plausibility-full.ts --source law-at-kmger

# 2. Was noch übrig ist, als Liste (erwartet: nur Nummern mit Eintrag in ris-fetch-outcomes):
$P bun scripts/list-rejected-pages.ts --source law-at-landesrecht --reason generation:known_bad

# 3. Warum sie übrig sind:
$P sh -c 'grep -c "\"corpus\":\"at-landesrecht\"" /law-corpus/_state/ris-fetch-outcomes.jsonl'

# 4. Sync-Tabelle im Dashboard (läuft sonst stündlich):
$P bun scripts/corpus-sync-inventory.ts
```

Bleiben nach Abschluss von Schritt 2 noch Nummern übrig, die **nicht** in
`ris-fetch-outcomes.jsonl` stehen, prüft man eine davon von Hand: liegt die
frische Rohdatei vor (`retrieved_at` = Laufdatum), lehnt aber der Normalizer
sie ab (`$P bun scripts/normalize/normalize-corpus.ts --corpus at-landesrecht --dry-run`
nennt die Gründe), dann liegt es am Text, nicht am Abruf.

## Offene Punkte

- `schema:legacy_frontmatter` (960) / `schema:no_identity` (1) bei Landesrecht
  sind Seiten aus der Zeit vor dem kanonischen Format. `list-rejected-pages.ts
--reason schema:legacy_frontmatter` liefert ihre Nummern (`nor_id`); ob ein
  Neuabruf per `--ids` dieselbe Datenbankseite aktualisiert oder eine zweite
  anlegt, ist nicht geprüft — erst mit einer Handvoll Nummern testen.
- Nach Schritt 5: im nächsten Audit nachsehen, dass die Zahl der VwGH-Seiten
  nicht wieder steigt (die alten `_normalized`-Kopien liegen noch auf der
  Platte).
