# Korpus: Metadaten gegen das RIS und verwaiste Kopien

Stand 26.09.2026. Diese Anleitung gilt für zwei Änderungen, die mit demselben Deploy
kommen: den Metadaten-Abgleich mit dem RIS-Verzeichnis (Normalizer v6) und das
Aussortieren normalisierter Kopien, die keine Quelle mehr haben.

## Was gemessen wurde

Gemessen wurde gegen das amtliche RIS-Verzeichnis (`_state/ris-inforce*.jsonl`). Es
enthält die RIS-Metadaten jeder geltenden Norm. Der Stand war die Produktivdatenbank
am 26.09.2026.

| Feld                                | Bundesrecht (147.787 Normen) | Landesrecht (97.234 Normen) |
| ----------------------------------- | ---------------------------- | --------------------------- |
| Kurztitel fehlt                     | 64.060                       | 95.881                      |
| Abkürzung fehlt                     | 113                          | 47.179                      |
| Kundmachungsorgan mit „Undefined“   | 239                          | 56                          |
| Außerkrafttreten fehlt              | 23                           | 1.136                       |
| Bundesland fehlt                    | –                            | 681                         |
| Seitentitel ist eine Dokumentnummer | –                            | 29.580                      |
| Seitentitel mit wörtlichem `\"`     | 26                           | 1.120                       |

Die Ursachen:

- **Kurztitel:** Der Normalizer las `statute:` nicht. Die Abrufer legen den Kurztitel
  aber genau dort ab, und bei 98 % von 245.000 Dateien ist er identisch mit dem RIS.
- **Abkürzung und Außerkrafttreten:** Der Landesrecht-Abrufer speichert sie nicht.
- **Seitentitel = Dokumentnummer:** Diese Titel stammen aus dem Reparaturlauf vom
  23.–25.09.
- **„Undefined“:** Ein Programmfehler eines alten Abrufers.
- **`\"`:** Maskierte Anführungszeichen wurden beim Einlesen nicht aufgelöst.

## Die Regel (server/scripts/normalize/ris-meta.ts)

Normalizer und Nachweis-Messung verwenden dieselbe Regel für jedes Feld:

- Nennt das Verzeichnis keinen Wert, bleibt unserer.
- Fehlt unser Wert, gilt der Wert des Verzeichnisses.
- Reine Schreibweise ist gleich: „Nr. 03/1983“ = „Nr. 3/1983“, „BGBl.Nr.“ = „BGBl. Nr.“.
- Ein Kurztitel mit Dokument-Zusatz bleibt: „… ÜR“, „… ÜR 2012“, „… EG/EU“, „… EG“,
  „… EU“, „… A“, „… S“, „… BVG“. Das RIS-Dokument selbst trägt ihn. Geprüft wurde das
  an 58 archivierten XML-Dateien und an je einem live abgerufenen RIS-XML.
- Sonst gilt das Verzeichnis. Nur beim Kundmachungsorgan und beim In- und
  Außerkrafttreten bleibt unser Wert, wenn unsere Kopie nach dem Verzeichnis abgerufen
  wurde. Dann ist sie der neuere RIS-Stand.

Ein Probelauf über alle Dateien lief in ein Wegwerf-Verzeichnis. Danach sind alle
Felder oben gleich dem RIS. Kein Normtext hat sich verändert: `content_hash`,
`body_hash` und `doc_id` sind bei allen 274.488 Dateien identisch.

## Was der Deploy von selbst tut

1. `normalized-import.ts` normalisiert `at-normen` und `at-landesrecht` **einmal
   vollständig** neu (`RENORMALIZE_FROM` in `canonical-schema.ts`). Die Marke dafür
   liegt in `_normalized/_state/<korpus>.renormalized-version`.
2. Der Import übernimmt die geänderten Seiten. Die Vektoren bleiben erhalten, weil sich
   der Text der Abschnitte nicht ändert.
3. Bis zum nächsten Prüflauf (alle 6 h) stehen diese Seiten auf „noch nicht geprüft“.
   Das ist gewollt, denn eine geänderte Seite wird neu geprüft.
4. Die Landesrecht-Reparatur (Checkpoint v2) läuft weiter. Ihre Nummern-Titel bereinigt
   der Normalizer.

## Verwaiste und doppelte Kopien — von Hand, nach dem Deploy

Eine normalisierte Kopie zählt nur dann als „auf dem Server“, wenn am selben Pfad eine
Rohdatei **derselben Dokumentnummer** liegt. Alles andere ist nicht belegbar und wird
auf `/ops/corpus` getrennt ausgewiesen. `quarantine-normalized-copies.ts` verschiebt
diese Kopien nach `_normalized/_quarantine/<datum>/<korpus>/`. Es löscht nichts und
schreibt ein Inventar nach `_state/`.

- `no_raw`: Die Rohdatei fehlt.
- `raw_replaced`: Am Pfad liegt inzwischen ein anderes Dokument, meist eine neuere
  Fassung.
- `duplicate_loser`: Die Rohdatei hat die Dubletten-Auswahl des Normalizers verloren,
  und die Kopie des Gewinners existiert. Fehlt diese Kopie noch, bleibt die Dublette,
  sonst verschwände das Dokument vom Server.

Trockenlauf auf dem Server am 26.09.2026 (nur Quellen mit Befund; „bleiben“ = Dubletten,
deren Gewinner noch keine Kopie hat):

| Quelle      | ohne Rohdatei | Rohdatei ersetzt | Dubletten verschoben | Dubletten bleiben |
| ----------- | ------------- | ---------------- | -------------------- | ----------------- |
| Landesrecht | 17.946        | 87               | 0                    | 3                 |
| Bundesrecht | 2             | 0                | 855                  | 0                 |
| VwGH        | 0             | 21               | 43.751               | 51.339            |
| BVwG        | 0             | 0                | 91                   | 36.076            |
| VfGH        | 0             | 0                | 17.784               | 27                |
| LVwG        | 0             | 20               | 16.311               | 0                 |
| Gemeinden   | 0             | 0                | 1.821                | 21                |
| OGH/Justiz  | 0             | 0                | 1.075                | 141               |
| AVSV        | 0             | 0                | 400                  | 0                 |
| UVS         | 0             | 224              | 10                   | 5                 |
| DOK         | 0             | 29               | 15                   | 0                 |
| AsylGH      | 0             | 17               | 3                    | 5                 |
| PVAK        | 0             | 9                | 0                    | 0                 |

Die verschobenen Dubletten entsprechen genau den überzähligen Kopien. Beim LVwG sind es
91.103 Kopien für 74.792 Nummern, also 16.311. Solange zwei Kopien mit verschiedenem
Inhalt dieselbe Nummer tragen, steht das Dokument im Nachweis unter „Prüfsumme weicht
ab“. Das Aussortieren ist deshalb Voraussetzung dafür, dass diese Gerichte grün werden.
Die bleibenden Dubletten bei VwGH und BVwG verschwinden erst, wenn der Normalizer die
Gewinner einmal vollständig schreibt. Das ist ein Volllauf je Gericht, bewusst nicht
automatisch, siehe „Nicht erledigt“.

```bash
P="docker exec subsumio-engine-corpus-pipeline-1"
# 1. Trockenlauf — Zahlen ansehen:
$P sh -c 'for c in at-normen at-landesrecht; do bun scripts/quarantine-normalized-copies.ts --corpus $c; done'
# 2. Anwenden (erst nach dem vollständigen Neu-Normalisieren von Schritt oben):
$P bun scripts/quarantine-normalized-copies.ts --corpus at-landesrecht --apply
$P bun scripts/quarantine-normalized-copies.ts --corpus at-normen --apply
# 3. Datenbankseiten, deren Nummer jetzt weder auf dem Server noch im RIS-Verzeichnis
#    steht, abschalten (Soft-Delete, erst Trockenlauf):
$P bun scripts/tombstone-db-orphans.ts --source law-at-landesrecht
$P bun scripts/tombstone-db-orphans.ts --source law-at-landesrecht --yes
```

Steht eine Nummer noch im RIS-Verzeichnis, gilt sie nach dem Aussortieren als „fehlt“.
Der Nachabruf (`fetch-at-landesrecht-xml.ts --from-index`) holt sie. Der Import
aktualisiert dann dieselbe Datenbankseite.

## Prüfen

Auf `/ops/corpus` zeigt der Topf „Metadaten ≠ RIS“, wie viele Dokumente noch abweichen.
Die Aufstellung „Metadaten gegen das RIS-Verzeichnis“ in der Detailansicht nennt die
Zahl je Feld. Unter „Außerhalb der Töpfe“ steht die Zahl der Kopien ohne Rohdatei.

## Nicht erledigt

- **Gerichte:** Hier wurden die Metadaten noch nicht gegen das RIS geprüft. Die
  Nummernliste aus `ris-jud-index-crawl.ts` enthält Geschäftszahl, Datum und Art und
  wäre die Grundlage dafür.
- **`\"` in Gerichts-Metadaten:** 606 Werte (VwGH 550, UVS 24, DOK 24, OGH 8) werden erst
  beim nächsten Neuschreiben der Datei bereinigt. Die Gerichte stehen bewusst nicht in
  `RENORMALIZE_FROM`, weil ein Volllauf alle 500.000 Entscheidungsseiten neu importieren
  würde.
- **Kleine Quellen:** Die Quellen ohne RIS-Verzeichnis (Bezirke, Gemeinden, Erlässe, AVSV,
  AVN, SPG, KmGer) haben keinen Metadaten-Abgleich.
