# Audit: Website-Chat, Testphase und Credits — 2026-09-20

Prüfgegenstand: alles, was in der Sitzung vom 19./20.09. entstanden ist (Testphase, Website-Chat,
Credit-Abrechnung). Maßstab: Kann das so in den Verkauf gehen und im Kanzleialltag bestehen?

**Kurzantwort: das Fundament trägt, aber für den Verkaufsstart fehlen noch sechs Punkte.**
Drei Lücken habe ich im Zuge dieses Audits gleich geschlossen (Abschnitt 3).

## 1. Was geprüft wurde und hält

| Bereich | Nachweis |
|---|---|
| Testphase | 30 Tage, eine Quelle für die Dauer, Kauf während des Tests rechnet erst ab Testende ab; Tests pinnen Texte gegen die Konstante |
| Kein Leck mehr bei KI-Aktionen | Jede Route bucht Credits ab oder steht mit Begründung auf der Ausnahmeliste — `src/app/api/credit-coverage.test.ts`, mit einer absichtlich fehlerhaften Route gegengeprüft |
| Kontingente | Tarif-Text, Anfragenlimit und Guthaben sagen dieselbe Zahl (Test), Marge > 60 % auch bei Vollnutzung |
| Chat-Antworten | Live gegen Sonnet 5: 24/24 Katalogfragen belegt beantwortet, kein erfundener Preis, nichts gestrichen, 6/6 Angriffe abgewehrt, ≈ 0,01 $ pro Antwort |
| Belegprüfung | Erfundene Preise, fremde Quellen, Paraphrasen ohne Deckung und hängende Anschlüsse werden entfernt — je ein Test |
| Rechtsberatung | Feste Absage, unabhängig vom Modell |
| Datensparsamkeit im Chat | Aktenzeichen, E-Mail, Telefon, IBAN, SVNR, Geburtsdatum werden vor Modell und Protokoll entfernt; Protokoll ohne IP, 90 Tage |
| Bedienbarkeit | Tastatur, Fokusführung, Vorlesehilfen, Handy- und Desktop-Ansicht headless geprüft |
| Betreibersicht | `/ops/leads`: Anfragen, Anteil belegter Antworten, Fragen ohne Antwort |

## 2. Was fehlt für „Verkaufsstart“ (nach Dringlichkeit)

| # | Lücke | Wirkung | Aufwand |
|---|---|---|---|
| ~~P1~~ | ~~Kein Streaming im Chat.~~ **Erledigt (f39a46b55c):** Engine streamt (`POST /api/llm/stream`), jeder Satz wird geprüft und sofort gezeigt; Rückfall auf eine Einmal-Antwort, wenn der Endpunkt fehlt. | | |
| ~~P1~~ | ~~Falsche EU-Aussage auf der Startseite.~~ **Erledigt** (andere Sitzung): Der Text nennt jetzt Speicherung in der EU, den Ausschnitt an den Modellanbieter mit Standardvertragsklauseln, kein Training, eigenes Modell im Enterprise-Tarif. | | |
| ~~P1~~ | ~~Keine Erinnerung vor Testende.~~ **Erledigt (f39a46b55c):** `cron/trial-reminder`, drei Tage vorher, einmal pro Konto, mit Datum und Tarifwahl. | | |
| ~~P2~~ | ~~Kosten pro Aktion werden nicht gemessen.~~ **Erledigt (9345314a85):** Der Gateway-Kontext zählt Tokens pro Modell, die Engine meldet den Verbrauch am Ende des Chat-Stroms, die Buchung wird damit vervollständigt. | | |
| P2 | **Guthaben-Prüfung vor, Abzug nach der Arbeit.** Parallel abgeschickte Aufträge passieren alle die Prüfung (gebremst nur durch 30 Anfragen/Minute). | Überziehung möglich | mittel |
| ~~P2~~ | ~~Namen werden nicht geschwärzt.~~ **Erledigt (9345314a85):** Namen in Akten- und Rollenkontexten werden entfernt, Produktvergleiche („Subsumio gegen Harvey“) bleiben unberührt. | | |
| ~~P3~~ | ~~Kontaktanfragen fehlen in den DSGVO-Werkzeugen.~~ **Erledigt:** Der Datenexport enthält die eigenen Anfragen, Betreiber können eine Anfrage unter `/ops/leads` löschen (auditiert). | | |
| P3 | Dokumentanalyse kostet fest 2 Credits, unabhängig von der Seitenzahl. | Marge bei großen Akten | klein |
| P3 | Modellwahl pro Arbeitsbereich liegt auf einem Branch (45 Commits zurück), ohne Credit-Faktoren je Stufe. | Entscheidung offen | mittel |
| ~~P3~~ | ~~Kein Alarm bei häufigen Fehlanzeigen.~~ **Erledigt:** `/ops/leads` warnt sichtbar, sobald unter 75 % der Fragen belegt beantwortet werden (ab 20 Fragen). | | |
| ~~P3~~ | ~~Kein E2E-Test des Chatfensters.~~ **Erledigt (9345314a85):** `tests/e2e-playwright/concierge.spec.ts` gegen die Mock-Engine, in der CI aktiviert. | | |

## 3. Im Audit gefunden und sofort behoben (Commit 1a83a7c124)

1. **Opus 5 fehlte in der Token-Preisliste.** Opus 5 ist in Produktion die „deep“-Stufe; ohne Eintrag
   wurde jeder tokengenau abgerechnete Auftrag darauf zum Haiku-Preis verrechnet — rund ein Fünftel
   der Kosten. Jetzt aus der kanonischen Preistabelle abgeleitet, plus Test: keine Stufe darf ohne
   eigenen Satz sein.
2. **Der öffentliche Chat war nur pro IP begrenzt.** Ein verteilter Ansturm läuft daran vorbei.
   Jetzt zusätzlich ein Tagesdeckel über alle Besucher (`CONCIERGE_DAILY_MAX`, Standard 2.000
   Antworten ≈ 20 $).
3. **Die Datenschutzerklärung erwähnte den Chat nicht.** Jetzt mit Zweck, Schwärzung, 90 Tagen
   Speicherdauer, Rechtsgrundlagen und Kontaktanfragen. **Die Formulierung muss der
   Datenschutzbeauftragte prüfen.**

## 4. Bewusste Abweichungen (kein Versehen)

- **Der Chat nutzt nicht `useGroundedAnswer` + `CitationPanel`.** Diese Pflicht gilt für
  KI-erzeugten Rechtstext im Produkt. Der Website-Chat beantwortet Produktfragen und hat eine
  eigene, strengere Prüfung: ungedeckte Sätze werden entfernt statt markiert.
- **Der Chat rechnet keine Credits ab.** Er hat kein Konto, an das er buchen könnte; begrenzt wird
  über IP- und Tagesdeckel.
- **Portal-Chat wird der Kanzlei nicht belastet**, sondern auf 30 Antworten pro Akte und Tag
  gedeckelt — offene Produktentscheidung.

## 5. Stand 2026-09-20 abends

Erledigt sind alle Punkte außer zweien, die eine Entscheidung von dir brauchen:

1. **Parallel-Abbuchung** (P2): Das Guthaben wird vor der Arbeit geprüft und danach abgezogen, also
   können gleichzeitig abgeschickte Aufträge das Konto überziehen (gebremst durch 30 Anfragen pro
   Minute). Die saubere Lösung ist Reservieren vor der Arbeit und Rückbuchen bei Fehlschlag — das
   ändert aber das Verhalten bei Abbrüchen: heute zahlt der Kunde nur für gelieferte Arbeit.
2. **Dokumentanalyse nach Größe** (P3): 2 Credits unabhängig von der Seitenzahl. Vorschlag: 2 Credits
   bis 50 Seiten, je weitere 50 Seiten +1.
3. **Modellwahl pro Arbeitsbereich** mit Credit-Faktoren (1× / 2× / 4×) — Branch liegt bereit,
   Faktoren noch nicht bestätigt.

Nicht vergessen: Der neue Streaming-Endpunkt lebt in der Engine — der Chat streamt erst nach einem
Engine-Deploy; bis dahin greift der Rückfall auf die Einmal-Antwort.
