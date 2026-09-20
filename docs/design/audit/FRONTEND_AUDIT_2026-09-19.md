# Frontend-Audit und Feinschliff — 19.09.2026

Auftrag: Dashboard und Frontend Seite für Seite prüfen (Optik, Texte, Abstände, Inhalte, Code),
Übersicht neu denken, Handbuch mit Nachbauten aus dem Produkt, danach Feinschliff.
Methode: Screenshots aller Kernrouten (Desktop hell 1440 px, Handy dunkel 390 px) auf dem lokalen
Stack, dann Code Zeile für Zeile gegen `docs/design/DESIGN_STANDARD.md`. Sechs Seitengruppen parallel
(Akten, Fristen/Kalender, Mandanten/Kommunikation, Finanzen, Dokumente/Wissen, Einstellungen), die
globalen Teile (Layout, Seitenleiste, Übersicht, geteilte Komponenten, Texte, Handbuch) zentral.

## 1. Globale Befunde (alle Seiten)

| # | Befund | Wirkung | Stand |
|---|---|---|---|
| G1 | Assistenten-Panel startete bei ≥ 768 px offen | Auf 1440-px-Laptops blieben ~800 px Inhalt; Tabellen schnitten Datum/Rechtsgebiet ab | behoben: offen erst ab 1680 px, neuer Speicher-Schlüssel (`subsumio-copilot-open-v2`), damit alte Automatik-Werte nicht greifen |
| G2 | Geschlossene Handy-Schublade des Assistenten verbreiterte jede Seite auf 780 px | Seitliches Wischen auf dem Handy | behoben: nach dem Schließen `display: none` (`copilot-sidebar.tsx`) |
| G3 | Rohe Engine-Diagnose „(no LLM available — [chat(openrouter:…)] Insufficient credits…)“ im Morgenbriefing und in Antworten | Anbieter, Abrechnungs-URL und Technik vor dem Anwalt | behoben zentral: `src/lib/engine-degraded.ts` in Citation-Gate-Stream, Client-Stream (`api.ts`), `engine-client.ts`, Briefing-Route; mit Test |
| G4 | „Invalid Date“, ISO-Daten, „vor 3d“, „noch 18T“ | Unprofessionelle Datumsangaben | behoben: `formatDate`/`formatDateTime` liefern „—“ statt Fehler, neue Helfer `daysUntil`/`formatDaysUntil` („in 5 Tagen“, „seit 2 Tagen überfällig“), `formatRelativeTime` ausgeschrieben; Agenten haben die Seiten umgestellt |
| G5 | Fundstellen-Panel mit „Corpus-Grounding“, „Brain-Quellen“, „Lücken im Brain“, „Corpus geprüft am“ und doppeltem KI-Hinweis | Technikjargon bei jeder KI-Antwort | behoben: „Geprüfte Rechtsquellen“, „Quellen aus Akte und Kanzleiwissen“, „Nicht belegt“, „Gegen die Rechtsquellen geprüft am TT.MM.JJJJ“; ein Hinweis „KI-generiert · Anwaltlich zu prüfen“ |
| G6 | ~150 Textschlüssel mit Englisch/Jargon (Upload, Review, Drafting, Cockpit, Playbook, Agent, Token, Legal Hold, Rundown, OCR …) | Mischsprache | behoben in `src/content/dashboard.ts`; Seitennamen vereinheitlicht (Dokumente, Schriftsätze, Vorlagen, Klauseln, Prüfsets, Prüfleitfäden, Aufbewahrungssperre, Signaturen, Freigaben …) |
| G7 | Fehlerseiten zweisprachig („Page could not be loaded … / Try again“), `DashboardError` zeigte `error.message` roh | | behoben; Fehlerkennung (digest) für den Support |
| G8 | Seitenleiste: Gruppen teils umrahmt, teils nicht; Erklärsätze („das Fristenbuch führt alle Deadlines kanonisch“); Schalter „Kernfunktionen“ las sich wie ein Menüpunkt; Akten-Register doppelt (Seitenleiste + Tab-Leiste) | Unruhe, Verwirrung | behoben: einheitliche Gruppen, Abschnitt „Verwaltung“ abgesetzt, Schalter nennt die Aktion („Alle Funktionen“ / „Nur Kernfunktionen“), geöffnete Akte als ein Eintrag mit Titel und Aktenzeichen |
| G9 | Platzhaltertext „Assistent wird geladen…“ als eigene Spalte | | behoben |
| G10 | Diagrammachse „00 / 00 / 00“ (Umsatz abgeschnitten) | | behoben: kompakte €-Achse, Tooltip in € |

## 2. Übersicht (neu aufgebaut)

Vorher: Begrüßung + eigene Suchzeile, Handlungsbedarf-Chips, 9 Schnellaktionen (abgeschnitten),
Kanzlei-Operationen, Umschalter, Morgenbriefing, Wochenrückblick, „Heute zu steuern“ — dieselben
Fristen bis zu dreimal, Fristen ohne Datum, zwei unterschiedliche Begrüßungen auf einem Bildschirm.

Nachher („Mein Tag“ | „Kanzlei“):
- Kopf: Datum, „Guten Morgen, Dr. Nachname“ (Titel + Nachname, `formalNameOf`).
- Kennzahlen: Fällig in 7 Tagen · Überfällig · Ungeprüfte Fristen · Offene Akten (Farbe nur > 0).
- Fristen & Termine: Überfälliges oben, dann 14 Tage nach Kalendertagen, Vorfristen als eigener
  Eintrag, Termine mit Uhrzeit, Notfrist/Ungeprüft als Badge, „Danach“ wenn der Zeitraum ruhig ist
  (`src/lib/overview-agenda.ts`, 6 Tests).
- Zu erledigen: nur offene Punkte (Eingänge, Nachrichten, Freigaben, Unterschriften, Dokumente,
  Anforderungen, Rechnungen, Treuhand-Abgleich).
- Aktive Akten: Aktenzeichen, Mandant, Rechtsgebiet, nächste Frist mit Resttagen.
- Tageslage: nur wenn ein Modell tatsächlich einen Bericht geschrieben hat.
- „Kanzlei“: bisheriges anpassbares Kennzahlen-Board.

## 3. Seitengruppen (Details in den Agentenberichten, hier die Kernpunkte)

- **Akten:** Register 43 statt 95 px Zeilen, Spalten Aktenzeichen/Mandant/Gegner/Nächste Frist/Sachbearbeiter,
  Status nur bei Abweichung; Aktenkopf mit „Hinzufügen“-Menü; Kosten-Tab zählte Abgerechnetes als offen (behoben);
  Massenakten-CSV war vorausgefüllt (Risiko, behoben); Akten-Zuweisung zeigte Personen doppelt (behoben).
- **Fristen/Kalender:** Kalender markierte den falschen Tag als „heute“ (UTC) und zeigte keine Fristen — beides
  behoben; Terminkollisionen neu (`src/lib/calendar-conflicts.ts`, 14 Tests; Warnung schon im Termin-Dialog);
  Outlook-Ende lag 2 h vor dem Beginn, jedes Bearbeiten legte einen neuen Outlook-Termin an (behoben);
  Fristen-KPIs anwaltlich (Überfällig/Diese Woche/Notfristen/Ungeprüft); Freigabe von Kalender-Fristen ohne
  eigene Seite (`src/lib/deadline-approval.ts`); Urlaubsvertretung ließ sich nie anlegen (CSRF, behoben).
- **Mandanten/Kommunikation:** Kollisionsprüfung mit Urteil, Trefferart, Rolle, Protokoll kopieren; Kontakte
  zeigten „Kontakt“ als „Gegner“ (behoben); globale Suche verlinkte auf nicht existierende Routen (behoben).
- **Finanzen:** Zeiterfassung zeigte nie Einträge (las nur `time_entry`-Seiten, gebucht wird in der Akte) —
  behoben in `api/time`; Rechnungs-E-Mail „anbei“ ohne Anhang — jetzt PDF-Anhang und Status „versendet“;
  FiBu-Buchung, Zahlungslink und Honorarvereinbarung scheiterten an fehlendem CSRF-Token (behoben);
  Budget-Auslastung stand immer auf 0 % (behoben); erfundener Stundensatz 200 € im Controlling entfernt.
- **Dokumente/Wissen:** Fundstellen-Invariante auf 6 Flächen nachgezogen (Recherche, Analyse, Massenprüfung,
  Verträge, Urteilsdatenbank, Rechtsprechung); >40 rohe Fehlertexte ersetzt; Dokumentenliste zeigte interne
  Einträge (41 → 10 echte Dokumente); Signatur-„Senden“ blieb gesperrt (behoben).
- **Einstellungen/Admin:** Kanzleiwissen-Detail „Speichern“ ohne Funktion (behoben), tote Knöpfe entfernt,
  Abläufe/Aufträge übersetzt und mit Belegprüfung.

## 4. Handbuch (`/at/docs`)

Neu: `src/components/marketing/handbook/*`, Inhalte `src/content/handbook.ts` (24 Kapitel in 6 Gruppen,
FAQ). Jedes Kapitel: Zweck, Ort im Produkt mit Link, Nachbau, „So gehen Sie vor“, „Gut zu wissen“.
Nachbauten aus echten Komponenten bzw. echter Logik:
- Übersicht (echte `OverviewKpis`/`DeadlineAgenda`/`ActiveMatters` + `buildAgenda`),
- Fristenrechner **interaktiv** mit `berechneFristAuto` (Feiertage, § 222 ZPO, § 89a GOG),
- Kalender mit Kollisionen über `findCalendarConflicts`/`describeCalendarConflict`,
- Assistent mit dem echten `CitationPanel`, Honorarnote mit `calculateRatgService`,
- Akte, Fristenbuch, Erinnerungsstufen (7/3/1/0 + Vorfrist), Kollisionsprüfung, Treuhand, Import.
Jede Aussage ist am Code geprüft; Guard-Test `src/content/handbook.test.ts` (Sie-Form, kein Jargon,
nur Österreich). Das Hilfe-Panel im Produkt verlinkt pro Seite das passende Kapitel.

## 5. Offen (Entscheidung oder Serverarbeit nötig)

1. ~~**Rechtsprechungs-Fallback erfindet Entscheidungen**~~ Erledigt am 19.09.: Der Fallback ist entfernt,
   die Suche zeigt nur Kanzleiwissen und RIS-Treffer.
2. **Kalender-Abo (.ics) verlangt Anmeldung** — Outlook/Google können es nicht abonnieren; nötig ist eine
   Abo-Adresse mit eigenem Schlüssel. Bis dahin: Export-Datei (Handbuch beschreibt nur das).
3. **Urlaubsvertretung leitet Fristen nicht weiter** (`forwardDeadlines` wird nirgends aufgerufen).
4. ~~**Badge-Zählung „Eingang prüfen“** (`api/dashboard/badges`) weicht von `api/review-inbox` ab.~~ Erledigt (0b80bdd5a6): Badges und Listen zählen aus `src/lib/approval-summary.ts`; neue Seite `/dashboard/freigaben`.
5. Mobile Tabellenkarten (`DataTable`) zeigen ein leeres Auswahlkästchen.
6. Server-Texte „im Brain“ in `server/src/core/legal/conflict-check.ts` (UI übersetzt sie bereits).
7. Rechnungs-E-Mail mit PDF nicht gegen einen echten SMTP-Server geprüft (lokal kein Mailserver).
8. **Freigaben:** kein erzwungenes Vier-Augen-Prinzip (`api/approvals` PATCH). Bewusst nicht serverseitig
   gesperrt — eine Solo-Kanzlei könnte sonst die eigenen Assistenten-Vorschläge nie freigeben; der Text
   verspricht jetzt „berechtigte Person“. Echte Zweitprüfung gibt es bei Notfristen.
9. **Zugangsschlüssel der KI-Anbieter** (`api/settings/api-keys` POST): das Ändern eines Schlüssels löscht die
   anderen bzw. scheitert an maskierten Werten.
10. **Datenexport/Backup** enthalten keine Dokumenttexte, Backup bricht still bei 5.000 Einträgen ab, DSGVO-Export
    fragt `deadline` statt `legal_deadline` ab. Handbuch verspricht daher nur den Konto-Export.
11. `api/webhook/incoming` protokolliert nur, antwortet aber „queued“; Word-Add-in (`public/word-addin/taskpane.js`)
    zeigt KI-Ausgaben ohne Belegprüfung (Invariante).
12. Einstellungen: vorher scheinbar speichernde, aber wirkungslose Schalter (Suchmodus, Engine-URL, Konsolidierung,
    RCIID) wurden entfernt bzw. ehrlich als Status dargestellt.

## 6. Premium-Durchgang (19.09.2026, nachmittags)

Grundlage: Recherche zu Harvey, Legora, Mercury, Attio, Linear, Vercel, Stripe (Schriften und Farben
aus dem live abgerufenen CSS), Experten-Leitfäden (NN/g-Animationsdauern, Next.js View Transitions,
APCA/WCAG 2.2, Vercel Design Guidelines). Regeln festgehalten in `DESIGN_STANDARD.md` § 8.

- **Rechtsprechungs-Fallback entfernt:** keine KI-„gefundenen“ Entscheidungen mehr, nur Kanzleiwissen + RIS.
- **Schrift:** Space Grotesk (gilt als KI-generisch) ersetzt durch **Newsreader** (Serif, optische Größen)
  für Seitentitel und Website-Headlines; **Inter** mit `opsz`-Achse für Oberfläche und Zahlen.
  Hervorhebungszeile der Headlines: Serif-Kursive in Sapphire statt Blau-Violett-Verlauf.
- **Farbe:** Sapphire als einzige Aktionsfarbe; Navigations-Icons neutral statt sieben Bereichsfarben;
  Gold nur als Signet (Text-Variante accent-700); Dunkelmodus entsättigt.
- **Bug:** ein alter Branchen-Inline-Stil überschrieb die Markenfarbe im Dashboard in hell und dunkel
  (Links im Dunkelmodus 2,8:1). Entfernt; neuer Token `--brand-solid` für gefüllte Flächen
  (Codemod über 62 Dateien), `--brand-primary` für Links.
- **Kontrast gemessen** (`qa/contrast.mjs`, echtes Rendering): alle Texttöne ≥ 4,5:1 auf allen Flächen
  in hell und dunkel, Eingabefeld-Rahmen ≥ 3:1 (vorher 1,3:1), Platzhalter dezenter als Inhalt.
- **Schatten:** mehrschichtig, navy getönt (Produkt und Website gleich); dunkel mit feiner Lichtkante.
- **Bewegung:** Seitenwechsel 120 ms aus / 210 ms ein mit 6 px.
- **Barrierefreiheit-Bug:** bei „Bewegung reduzieren“ blieben Hero-Überschriften unscharf/unsichtbar
  (Hydration-Mismatch in ~15 Motion-Komponenten). Behoben mit `src/lib/use-safe-reduced-motion.ts`.
- **Build-Bruch einer anderen Session behoben:** `::highlight()` in `globals.css` ließ jede Seite mit 500
  scheitern; die Regel wird jetzt zur Laufzeit von `src/lib/highlight-quote.ts` gesetzt.
- Offen/Option: Wortmarke bleibt Fraunces (Markenentscheidung); View-Transitions-API erst mit
  React ≥ 19.3/Next 16 (derzeit 19.2/15.5) — bis dahin Framer-Seitenwechsel.
