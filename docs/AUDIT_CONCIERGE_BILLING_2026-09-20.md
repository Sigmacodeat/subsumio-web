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
| P2 | **Kosten pro Aktion werden nicht gemessen.** Festpreis-Aktionen schreiben Modell und Tokens nicht mit; gehört ins KI-Gateway. | Marge bleibt geschätzt | mittel |
| P2 | **Guthaben-Prüfung vor, Abzug nach der Arbeit.** Parallel abgeschickte Aufträge passieren alle die Prüfung (gebremst nur durch 30 Anfragen/Minute). | Überziehung möglich | mittel |
| P2 | **Namen werden nicht geschwärzt.** Nur strukturierte Kennungen. Schreibt jemand „Mandant Huber ./. Meier“, steht das im Protokoll. | Berufsrecht | mittel |
| P3 | Kontaktanfragen sind nicht in Auskunft und Löschung der DSGVO-Werkzeuge enthalten (nur Konten). | Manuelle Bearbeitung | klein |
| P3 | Dokumentanalyse kostet fest 2 Credits, unabhängig von der Seitenzahl. | Marge bei großen Akten | klein |
| P3 | Modellwahl pro Arbeitsbereich liegt auf einem Branch (45 Commits zurück), ohne Credit-Faktoren je Stufe. | Entscheidung offen | mittel |
| P3 | Kein automatischer Alarm, wenn der Chat reihenweise „keine belegte Auskunft“ antwortet. Zahlen stehen nur in `/ops/leads`. | Späte Reaktion | klein |
| P3 | Kein E2E-Test des Chatfensters in der CI (nur manuell headless geprüft). | Regression fällt spät auf | klein |

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

Die drei dringenden Punkte sind erledigt. Offen bleibt, in dieser Reihenfolge:

1. Token-Protokoll im Gateway — danach sind alle Margen gemessen statt geschätzt.
2. Namensschwärzung im Chat und die Parallel-Abbuchung bei gleichzeitigen Aufträgen.
3. Modellwahl pro Arbeitsbereich mit Credit-Faktoren zusammenführen.
4. Dokumentanalyse nach Größe staffeln, Kontaktanfragen in die DSGVO-Werkzeuge, Alarm bei
   häufigen „keine belegte Auskunft“, E2E-Test des Chatfensters in der CI.

Nicht vergessen: Der neue Streaming-Endpunkt lebt in der Engine — der Chat streamt erst nach einem
Engine-Deploy; bis dahin greift der Rückfall auf die Einmal-Antwort.
