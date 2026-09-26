# Endaudit Subsumio Kanzlei-OS mit Gap-Analyse gegen den Markt

Stand: 26.09.2026, Revision 2 am selben Tag. Code-Stand `6474e8d` (main).

**Grundlage:**

- **Runde 1:** vier Prüfungen am Code und im Markt:
  1. Defekte und Grundfunktionen
  2. Kommunikation, KI und Plattform
  3. Engineering und Betrieb
  4. Web-Recherche zum Wettbewerb
- **Runde 2:** fünf weitere Prüfungen:
  1. **Jeder negative Befund einzeln gegen den Code**, mit Urteil und Beleg
  2. Das Setup des neuen Servers
  3. Tiefe im Kernablauf: Mandat, Posteingang und Frist, Schriftsatz, Dokumente, Aktenabschluss
  4. Tiefe bei Abrechnung, Kommunikation, KI und Controlling
  5. Messung von Breite gegen Tiefe: Tests, Aufrufer, Platzhalter
- Die schwersten Befunde habe ich selbst am Code nachgelesen.

**Korrektur gegenüber Revision 1:**

- Die Betriebsbefunde vom 18.09. (volle Platte, fehlendes Backup, fehlender Mail-Versand, fehlendes DNS) betrafen den **alten Hetzner-Server**. Produktiv läuft jetzt die **Netcup-Box (16 Kerne, 64 GB RAM, 2 TB NVMe)**. Laut `server/deploy/netcup/RUNBOOK.md` ist der alte Server abgeschaltet.
- Der Betreiber gibt an, dass alle alten Probleme behoben sind. Das Repo stützt diese Aussage dort, wo es sie belegen kann (Abschnitt 6).
- Abschnitt 6 bewertet deshalb nur noch, was **strukturell** bleibt.

Legende:

- ✅ **echt:** Oberfläche, API und Speicherung sind verbunden.
- 🟡 **teilweise**
- ❌ **fehlt**

---

## 1. Urteil

1. **Subsumio ist technisch das ambitionierteste Kanzlei-OS im österreichischen Markt.** Kein etablierter AT-Anbieter kombiniert Aktenverwaltung, zitatgeprüfte KI, eigenen RIS-Korpus, eine Fristen-Engine mit Begründung und Agenten.
2. **Die Lücke im Markt ist real.** Kanzleisoftware hat Akten, aber kaum KI. KI-Anbieter (MANZ-Noxtua, Lexis Protégé, BEAMON, AI:ssociate) haben Inhalte, aber keine Akten. Nur Donna (Wien) zielt auf dasselbe.
3. **Die Funktionsbreite ist fast auf Marktniveau.**
   - Von 14 Defekten aus dem Vor-Audit sind 11 behoben.
   - Die P0-Grundfunktionen sind bis auf drei vorhanden. Es fehlen webERV-Versand, webERV-Eingang im Akt und Registerabfragen. Das sind **Partnerverträge, kein Code**.
4. **Die Oberfläche ist sauberer, als „breit“ vermuten lässt.**
   - Es gibt **keine verwaisten Seiten** und praktisch keine Platzhalter oder Mock-Daten.
   - 95 % der API-Routen haben einen Aufrufer.
   - Das Problem ist nicht „leere Hüllen“, sondern **fachliche Tiefe in den Abläufen** (Abschnitt 3).
5. **Tiefe fehlt dort, wo der Anwalt täglich arbeitet: zwischen den Schritten.** Konkret:
   - Das gerichtliche Aktenzeichen fehlt an der Akte.
   - Der Platzhalter `{{gz}}` setzt das **interne** Aktenzeichen in den Schriftsatz.
   - Beim Archivieren gibt es keine Abschluss-Prüfung.
   - Es fehlen Kostenverzeichnis, Beilagenverzeichnis, Mehrfachauswahl und seitengenaue Zitate.
   - Das echte Controlling fehlt.
6. **Sechs Befunde sind haftungs- oder vertrauensrelevant** und gehören vor den ersten Pilotkunden (Abschnitt 2.2):
   - `{{gz}}`
   - EU-Only-Lücke bei Suchanfragen
   - Legal Hold in der Engine
   - Archivieren versteckt offene Fristen
   - WhatsApp-Termine am Wochenende als „bestätigt“
   - Controlling nennt Leistungswert „Umsatz“
7. **Codequalität und Testdisziplin sind für die Teamgröße außergewöhnlich.**
   - Etwa 2.500 Testdateien und zehn Invarianten-Guards.
   - Engine-Parität zwischen PGLite und Postgres.
   - Eval-Gates für die KI.
   - Schwachstelle: 30 % der Seiten ohne echten Verhaltenstest; Kollisionsprüfung und FiBu haben keinen Oberflächentest.
8. **Die KI-Architektur liegt vor dem DACH-Markt. Die KI im Alltag ist noch nicht auf Gerichtsniveau.**
   - Keine Zitate mit Seite und Randzahl.
   - Tabular Review liest pro Dokument nur 16.000 Zeichen, ohne Hinweis.
   - Die Recherche ist standardmäßig auf deutsches Recht eingestellt.
   - Keine harte Enthaltung („keine Quelle, keine Antwort“).
9. **Der Wettbewerb kapitalisiert sich massiv:** Harvey 15,5 Mrd. $, Legora ~5,6 bis 8,5 Mrd. $ mit Büro in München, Noxtua über 100 Mio. € mit Beck und MANZ, Clio 500 Mio. $ ARR. **Im österreichischen Klein- und Mittelkanzleimarkt ist davon aber niemand mit einem Kanzlei-OS aktiv.**
10. **Potenzial: ja.** Der Weg dahin führt über drei Justiz-Partnerverträge, die sechs Haftungsbefunde und ein Tiefenprogramm für die zehn Kernabläufe. Mehr Breite hilft nicht.

**Gesamtnote:** Produkt und Technik **8/10**, fachliche Tiefe **6/10**, Marktreife **5/10**, Betrieb **6/10** (neuer Server; strukturelle Lücken bleiben).

---

## 2. Die Sorgen aus Revision 1, geprüft am Code

### 2.1 Überblick

| # | Sorge aus Revision 1 | Ergebnis | Beleg |
| - | -------------------- | -------- | ----- |
| 1 | Server voll, kein Backup, keine Mail, offene Zugangsdaten | **erledigt** (alter Server). Neuer Server mit Offsite-Backup, Restore-Test und Preflight | `server/deploy/netcup/RUNBOOK.md`, `backup/run.sh`, `preflight.sh:54-61` |
| 2 | Breite ohne Tiefe | **teilweise widerlegt, teilweise bestätigt.** Keine Hüllen, aber Tiefenlücken in den Abläufen | Abschnitt 3 |
| 3 | Copilot über Regex-Marker statt nativem Tool-Use | **bestätigt, dazu verschärft:** Die Server-Freigabe wird vom Client ohne Klick vorbereitet und eingelöst | `chat-panel.tsx:513`, `api.ts:3442-3449` |
| 4 | Legal Hold: nicht lesbare Seite gilt als nicht gesperrt | **teilweise:** Die Web-Route ist fail-closed. Die Engine-Op `delete_page` (erreichbar über MCP und CLI) ist fail-open und prüft den Hold der Mutterakte nicht | `operations.ts:1898` vs. `api/pages/[...slug]/route.ts:729-735` |
| 5 | Aktenzeichen-Fallback | **bestätigt, dazu verschärft:** Nur `/cases/new` nutzt den Zähler | siehe 2.2 |
| 6 | Aufgaben: Lesen-Ändern-Schreiben, keine Benachrichtigung | **bestätigt**, auch im Copilot-Tool `create_task` | `tasks/page.tsx:118-124`, `copilot/tools/route.ts:2129-2150` |
| 7 | WhatsApp-Buchung | **bestätigt, dazu verschärft:** keine Prüfung auf Wochentag oder Feiertag | `flow-endpoint/route.ts:67-80, 106-111, 349` |
| 8 | KI-Limit fail-open, nur Betreiber | **bestätigt, mit Korrektur:** Der Deckel gilt pro Kanzlei-Konto, nicht pro Nutzer. Das Guthaben begrenzt trotzdem | `credits.ts:2348, 2394`, `billing-account.ts:35` |
| 9 | EU-Only ohne Embeddings | **bestätigt, dazu verschärft:** Suchanfragen gehen **immer** an den Embedding-Anbieter | `server/src/core/ai/eu-policy.ts:101-122` |
| 10 | Word-Redlining nur als Text | **weitgehend widerlegt:** Es gibt echte Änderungsverfolgung (`<w:ins>`/`<w:del>`). Sie arbeitet aber absatzweise und ohne Formatierung | `word-addin/src/taskpane.ts:736-790` |
| 11 | Originale nicht versioniert | **bestätigt** | `document-versions.server.ts:234` |
| 12 | Controlling nur Zeiten | **bestätigt, dazu verschärft:** Die Kennzahl heißt „Gesamtumsatz“, ist aber Stunden mal Satz | `controlling.ts:41-54`, `content/dashboard.ts:10189` |
| 13 | OpenAPI mit vier Pfaden | **bestätigt** | `api/openapi.json/route.ts:67-176` |
| 14 | Register ohne ZMR, GISA, Ediktsdatei | **bestätigt:** Der Dateikopf behauptet Ediktsdatei und Testamentsregister, beide fehlen | `register-adapter.ts:4` vs. `:15-21` |
| 15 | Kein PDF-AS in Prod | **bestätigt** | `server/deploy/netcup/docker-compose.yml` |
| 16 | Cloud-Connectoren nur per Kommandozeile | **teilweise:** SharePoint und OneDrive lassen sich im UI einrichten, aber mit einem rohen Graph-Token (läuft nach etwa einer Stunde ab) | `src/lib/dms/sharepoint.ts:9` |
| 17 | webERV nicht verdrahtet | **bestätigt:** `court-channel.ts` hat keinen Importeur; der Versand erzeugt **XJustiz (DE-Standard)** | `api/bea/send/route.ts:12` |
| 18 | Keine Passkeys | **bestätigt** | – |
| 19 | Mobile App als dünne Hülle | **bestätigt:** WebView lädt `subsum.io`, offline nicht nutzbar, Risiko einer Store-Ablehnung | `capacitor.config.ts` |
| 20 | Keine Akonto- und Barauslagennote | **bestätigt:** Die Vorschussverrechnung wird manuell als Betrag eingetragen | `legal-types.ts:509`, `invoice-totals.ts:91-94` |
| 21 | Bus-Faktor 1 | **bestätigt** (Git-Historie) | `git shortlog` |

### 2.2 Haftungs- und vertrauensrelevant: vor dem ersten Pilotkunden beheben

1. **`{{gz}}` und `{{geschaeftszahl}}` setzen das interne Aktenzeichen ein.**
   - Beleg: `src/lib/templates.ts:114-115`. An der Akte gibt es kein Feld für die gerichtliche Geschäftszahl (`cases/new/page.tsx`). `court_file_number` existiert nur im Litigation-Modul.
   - **Folge:** In Schriftsätzen an das Gericht steht die falsche Geschäftszahl.
2. **EU-Only schützt Suchanfragen nie.**
   - Beleg: `eu-policy.ts:101-122`. Mandantenbezogene Suchtexte gehen an einen Embedding-Anbieter außerhalb der EU, ohne zweiten Schalter auch die Dokumente.
   - **Folge:** Widerspricht dem Datenresidenz-Versprechen gegenüber Kanzlei und Mandant (§ 40 Abs. 3 RL-BA).
3. **Archivieren versteckt offene gewöhnliche Fristen ohne Warnung.**
   - Beleg: `case-cascade.ts:74-81` schont nur Notfristen, Legal Hold und abgerechnete Einträge.
   - Es gibt keine Abschluss-Prüfung auf offene Fristen, nicht verrechnete Leistungen, Fremdgeld, offene Rechnungen oder auszufolgende Originale.
4. **Legal Hold in der Engine ist fail-open und ignoriert die Mutterakte.**
   - Beleg: `operations.ts:1898`. Über MCP oder CLI lassen sich Dokumente einer gesperrten Akte löschen.
5. **WhatsApp-Termine:**
   - Feste Slots, auch am Wochenende und an Feiertagen.
   - Keine Prüfung gegen den Anwaltskalender, Verhandlungen oder Abwesenheiten.
   - Werden sofort als `confirmed` gespeichert.
6. **„Gesamtumsatz“ im Controlling ist Leistungswert, kein Umsatz.** Das führt Partner in die Irre.

**Dazu, ebenfalls kurzfristig:**

- **Copilot-Freigabe:** Das Server-Token beweist keinen Klick. Ein Nonce-Store pro Prozess erlaubt die Wiederverwendung bei mehreren Instanzen.
- **Aktenzeichen uneinheitlich:**
  - Die Schnellanlage vergibt immer einen Zeitstempel (`CaseQuickCreateDialog.tsx:380`).
  - Der Copilot vergibt gar keins (`copilot/tools/route.ts:748-759`).
  - Intake vergibt `Jahr-6Ziffern`, WhatsApp `WA-JJJJ-uuid`.
- **Direktanlage einer Akte umgeht KYC und Vollmacht.** Nur der Intake-Pfad blockiert (`intake-acceptance.ts:165-176`), obwohl das GwG die Prüfung verlangt.
- **Fristenrechner zitiert „§ 89a GOG“ für die ERV-Zustellfiktion.** Nach meinem Verständnis ist das **§ 89d Abs 2 GOG** (`frist-engine.ts:23, 170, 801`). Die Rechenlogik ist richtig, das sollte eine Juristin gegenlesen.
- **Recherche ist standardmäßig auf deutsches Recht eingestellt.**
  - Beleg: `api/legal/research/route.ts:25`, `default("de")`.
  - Die RIS-Live-Suche fragt nur `Applikation=Justiz` ab. VfGH, VwGH, BVwG und LVwG fehlen (`judgements.ts:46`).

---

## 3. Was „Tiefe“ konkret heißt: was fehlt

**Messung der Breite:**

- 122 aktive Dashboard-Seiten, 556 API-Routen.
- **0 verwaiste Seiten**, 0 Mock- oder Lorem-Texte, 1 TODO.
- Etwa 30 Routen (5 %) ohne Aufrufer, zum Beispiel `/api/work-products/*` (vollständige CRUD ohne UI), `clause-annotations`, `fristenreport`, `time/auto-extract`, `writing-styles`.
- Etwa 3.900 Zeilen stillgelegter DE-Code (beA, DATEV, FAO) werden weiter ausgeliefert.
- 53 Routen antworten `not_configured`, solange kein Partner angebunden ist.
- **Tests:** 40 % der Seiten haben einen direkten Seitentest und 43 % einen funktionalen E2E-Ablauf; **30 % haben keins von beiden**.
  - Ohne jeden Test: `kollisionspruefung`, `fibu`, `claim-account`, `absences`, `pdf-tools`, `dictation`.
  - Die Backends dieser Seiten sind getestet.
  - Die E2E-Tests laufen gegen eine Mock-Engine.

**Fazit:** Die Breite ist diszipliniert. Die fehlende Tiefe liegt **in den Abläufen**, nicht in leeren Seiten.

**Tiefe pro Ablauf** (1 = nur Grundfunktion, 5 = ADVOKAT-Niveau oder besser):

| Ablauf                                   | Tiefe | Stärkster Teil                                              | Größte Tiefenlücke                                                        |
| ---------------------------------------- | ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| A. Mandatsannahme                        | 3,5   | Kollisionsprüfung fail-closed, Sanktionslisten              | kein Gericht-AZ, Rollen nur global am Kontakt, Kollision nur für Mandant und Gegner |
| B. Posteingang → Frist                   | 3     | AT-Fristen-Engine, Vier-Augen, Vertretung                   | Posteingangsbuch nicht korrigierbar, kein Zustelldatum, Zuordnung über internes AZ |
| C. Schriftsatz → Versand                 | 2     | 13 KI-Schriftsatztypen mit Grounding, DOCX mit Briefpapier  | `{{gz}}`-Fehler, kein Rubrum, kein Beilagen- und Kostenverzeichnis, ERV fehlt |
| D. Dokumente                             | 3     | Ordner, Versionen, Papierkorb, Dubletten per Hash           | keine Mehrfachauswahl, PDF-Viewer lädt alle Seiten, Suche ohne Filter     |
| E. Akte schließen                        | 2,5   | Aufbewahrungsfrist, Legal Hold, Wiedereröffnung mit Rolle   | keine Abschluss-Prüfung, feste 7 Jahre                                    |
| F. Leistung und Abrechnung               | 3     | Festschreibung, Storno, e-Rechnung, Fremdgeld, RATG-Rechner | RATG nicht an der Leistung, kein Kostenverzeichnis, keine Freigabe, Bank-Matching ±5 % automatisch |
| G. Kommunikation                         | 2,5   | WhatsApp, Portal, CTI, Kommunikationsverlauf pro Akte       | Mail ohne Anhänge aus der Akte, ohne Signatur und ohne Vorlagen; Triage mit DE-Begriffen |
| H. KI im Alltag                          | 3     | Grounding, Tabular mit wörtlichen Zitaten, KI-Belege        | keine Seiten- oder Rz-Zitate, 16k-Kappung, keine harte Enthaltung, Recherche auf DE voreingestellt |
| I. Controlling und Kanzleiführung        | 1,5   | Zeiten und Auslastung                                       | kein echter Umsatz, keine Realisierung, kein WIP, keine Altersstruktur offener Posten |

### 3.1 Die 25 wichtigsten Tiefenlücken

**Schriftsatz und Gericht (Kern des Anwaltsalltags)**

1. **Gerichtliche Geschäftszahl an der Akte**, mit Nutzung in Vorlagen, ERV und Postzuordnung. Dazu `{{gz}}` korrigieren (`templates.ts:114`).
2. **Vorlagen-Variablen für ein vollständiges Rubrum:**
   - Parteien mit Adresse, Geburtsdatum und FN
   - Gericht mit Adresse
   - Gegenvertreter
   - R-Code
   - „Vollmacht erteilt (§ 8 RAO)“
   - Streitwert je Begehren
3. **Deterministisches Beilagenverzeichnis** (./A, ./1): auswählen, nummerieren, umnummerieren, Liste erzeugen, mit dem PDF-Stempel verbinden. Heute gibt es nur einen Hinweis im Prompt.
4. **Kostenverzeichnis nach § 54 ZPO** automatisch aus RATG, GGG und Barauslagen der Akte.
5. **KI-Entwurf nutzt die Kanzleivorlagen.** Heute hat die Entwurfsfunktion eigene Prompts, getrennt von `/templates`.
6. **Postausgangsbuch mit Kanal „erv“ und Zustellarten** (RSa, RSb, Einschreiben), mit automatischem Eintrag beim Versand.

**Akte und Beteiligte**

7. **Beteiligte mit Rolle pro Akte:** Partei, Vertreter, Zeuge, Sachverständiger, Nebenintervenient.
8. **Kollisionsprüfung über alle Beteiligten**, Gegenvertreter und Konzernverbund (Firmenbuch). Das Prüfprotokoll gehört an die Akte, nicht in die Zwischenablage.
9. **Sachbearbeiter als Nutzer-IDs** (verantwortlicher Anwalt und Assistenz). Erinnerungen gehen dann gezielt statt an alle.
10. **KYC- und Vollmachts-Sperre auch bei der Direktanlage.**
11. **Ein gemeinsamer Anlagepfad** mit dem Aktenzeichen-Zähler für alle Wege (Formular, Schnellanlage, Copilot, Intake, WhatsApp, Import).

**Posteingang und Fristen**

12. **Posteingangsbuch mit Korrektur:** Vorschlag annehmen oder umhängen mit Protokoll, Akten-Picker, Zustelldatum, Verknüpfung zur Frist, Filter, Druck, Status „Vorlage an RA“.
13. **Fristenkontrolle am Tagesende** mit Abzeichnung. Dazu ein Erledigungsvermerk mit Verknüpfung zum Ausgangsschriftstück und ein Workflow für Fristverlängerungen.
14. **Mehrfachauswahl** bei Fristen (freigeben, erledigen) und Dokumenten (verschieben, taggen, löschen, senden, zusammenfügen).

**Aktenabschluss**

15. **Abschluss-Prüfung vor dem Archivieren:**
    - offene Fristen und Wiedervorlagen
    - nicht verrechnete Leistungen
    - Fremdgeld-Saldo
    - offene Rechnungen
    - auszufolgende Originale
    - Schlussbericht

    Dazu Aufbewahrungskategorien pro Akte statt fester 7 Jahre.

**Geld**

16. **RATG-Tarifpost an jeder Leistung und Rechnungszeile** (TP, Bemessungsgrundlage, ES, ERV) statt eines flachen Betrags. Dazu frei konfigurierbare Tätigkeitscodes.
17. **Honorarnoten-Freigabe** (Status zwischen Entwurf und versendet); nicht freigegebene Leistungen blockieren.
18. **Bank-Matching mit Prüfliste:** kein automatisches Verbuchen bei ±5 %, Überzahlungen verbuchen, Sammelzahlungen aufteilen.
19. **Akonto- und Vorschussnote als eigene Belegart** mit automatischer Anrechnung. Dazu Stundensätze pro Anwalt und Mandant, Erfolgshonorar und Pauschalstufen.
20. **BMD/RZL mit Personenkonten und Zahlungsbuchungen**, Kostenstellen nach Anwalt und Fachgebiet. Dazu Drittland-USt (nicht steuerbar).

**KI**

21. **Zitate mit Seite und Randzahl**, mit RIS-Tiefenlink. Das Modul `citation-provenance.ts` existiert, wird aber nirgends importiert.
22. **Tabular Review über das ganze Dokument** (Map-Reduce) mit Warnung pro Zelle, wenn gekappt wurde. Dazu gleiche Größenlimits überall (Upload 500 MB, Engine 50 MB) und OCR für große Konvolute im Hintergrund.
23. **Harte Enthaltung bei schwacher Evidenz.** Recherche auf `at` voreinstellen und die RIS-Live-Suche um VfGH, VwGH, BVwG und LVwG erweitern.
24. **KI-Belege für jede Ausgabe** (auch Chat, Tabular, Analyse, Recherche), eine Prompt-Bibliothek der Kanzlei und eine Feedback-Schleife mit Wirkung aufs Ranking (`getFeedbackBoosts` hat keinen Aufrufer).

**Führung**

25. **Echtes Controlling:**
    - Umsatz aus Rechnungen und Zahlungen
    - Realisierungsquote (erfasst → verrechnet → bezahlt)
    - WIP
    - Altersstruktur offener Posten
    - Fristenstatistik
    - Sollstunden pro Person

    Dazu Rollen pro Kanzlei konfigurierbar (Partner, Konzipient, Sekretariat, Buchhaltung). Heute kann ein Konzipient eine Kollision freigeben.

**Querschnitt:**

- `DataTable` mit Sortierung und Paging wird nur auf 3 von etwa 105 Seiten genutzt.
- Rückgängig-Machen fehlt in den Kernaktionen.
- Tastatur-Navigation in Listen fehlt.
- Der PDF-Viewer braucht Seitensprung, Miniaturen und Suche.

---

## 4. Marktbild September 2026

### 4.1 Global: Kapital und Agenten

| Anbieter                     | Stand 2026                                                                                                                 | Relevanz für uns                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Harvey**                   | 15,5 Mrd. $ Bewertung (09/2026), >350 Mio. $ ARR, deutsches Team, Gleiss Lutz, Telekom                                     | Enterprise und Großkanzlei. Kein Wettbewerb in AT-Kleinkanzleien           |
| **Legora**                   | 5,6 Mrd. $, verhandelt über ~8,5 Mrd. $; Büro München, >80 DACH-Kunden (CMS, Görg, YPOG …); ~3.000 $ pro Nutzer und Jahr (indikativ) | setzt den Maßstab für Agenten-UX und Mandantenportale in Großkanzleien     |
| **Clio** (+vLex)             | 500 Mio. $ ARR; Manage + Work + Vincent; Clio Work seit 04/2026 standalone für kleine Kanzleien                           | **das globale Vorbild für unser Modell**; keine DACH-Präsenz in der Kanzleiverwaltung |
| **TR CoCounsel**             | neue Generation seit 08/2026: Deep Research, Drafting Agent in Word, Tabular bis 10.000 Dokumente                          | nicht in DACH                                                              |
| **Lexis+ mit Protégé**       | agentische Orchestrierung; in AT live, integriert mit jurXPERT                                                             | **direkter AT-Wettbewerber bei der Recherche**                             |
| **Smokeball / MyCase**       | Archie-Agent in Word und Outlook mit proaktiven nächsten Schritten; MyCase MCP-Server (09/2026)                            | Feature-Maßstab, nicht in DACH                                             |

### 4.2 DACH: Verlage plus KI haben sich formiert

- **Beck-Noxtua (DE) und MANZ-Noxtua (AT, seit 24.06.2026).**
  - Über 100 Mio. € Series C; C.H.Beck hält die Mehrheit, MANZ ist beteiligt.
  - Preis etwa 299 bis 499 € pro Lizenz und Monat (indikativ).
  - **Der stärkste Wettbewerber für inhaltsgestützte KI in AT.**
- **Wolters Kluwer:** hat Libra übernommen; AnNoText Expert AI.
- **LexisNexis AT:** Protégé plus jurXPERT-Integration.
- **Folge:** Die beiden größten AT-Verlage (MANZ, LexisNexis) sind vergeben. **Eine Verlagspartnerschaft für AT ist kaum noch offen.** Wir müssen über die Kanzleiverwaltungs- und Workflow-Schicht gewinnen, nicht über Kommentarliteratur.
- **ÖRAK** kooperiert mit BEAMON (Bryter; ISO 27001 und SOC 2, hat die KI-Checkliste unterzeichnet) und bewirbt AI:ssociate (39 bis 99 €).
- **DE-Kanzleisoftware:**

  | Anbieter  | Stellung und KI                           | Preis                                   |
  | --------- | ----------------------------------------- | --------------------------------------- |
  | RA-MICRO  | über 20.000 Kanzleien; KI mit Anonymisierung | –                                    |
  | Advoware  | Legal Twin                                | 99 bis 169 € pro Nutzer (indikativ)     |
  | Actaport  | Cloud                                     | 79 bis 109 €                            |

### 4.3 Österreich: unser Launch-Markt

| Anbieter          | Typ                            | KI                        | Preis                  |
| ----------------- | ------------------------------ | ------------------------- | ---------------------- |
| ADVOKAT           | Marktführer, über 2.500 Kanzleien | GPT-Assistent           | 65 bis 394 €/Monat     |
| jurXPERT          | 15.000 Arbeitsplätze           | Lexis 360 / Protégé       | ab ~65 €               |
| WinCaus.net       | über 700 Kanzleien             | keine KI belegt           | ab 39,90 €             |
| **Donna**         | KI-native Kanzleisoftware      | Kern                      | nicht veröffentlicht   |
| MANZ-Noxtua       | Verlags-KI                     | Kern                      | ~299 bis 499 € (indikativ) |
| BEAMON / AI:ssociate | KI-Assistent (ÖRAK)         | Kern                      | 39 bis 99 €            |

**Subsumio:** Solo 249 € (1 Platz), Kanzlei 1.499 € (5 Plätze), dazu Credit-Pakete.

**Preis-Einordnung:**

- Subsumio Solo kostet etwa viermal so viel wie ADVOKAT für einen Platz, der Kanzlei-Tarif etwa siebenmal so viel wie ADVOKAT für fünf Plätze.
- Gerechtfertigt ist das nur, wenn Subsumio **ADVOKAT und Noxtua zugleich ersetzt**. Dafür braucht es webERV und Register.
- Ohne diese beiden Funktionen ist Subsumio ein teurer KI-Zusatz neben ADVOKAT und konkurriert mit BEAMON und AI:ssociate für 39 bis 99 €.

### 4.4 Nachfrage und Regulierung

- **Nachfrage:** 99 % der AT-Anwälte nutzen KI zumindest gelegentlich, 45 % mehrmals täglich (Legal Tech Barometer 2026). 44 % haben niemanden, der für KI zuständig ist, 27 % kein Budget. **Die Nachfrage ist da, die Kaufkraft pro Kanzlei ist klein.**
- **EU AI Act (Omnibus):** Die Hochrisiko-Pflichten wurden auf den 02.12.2027 verschoben. Kanzlei-KI ist in der Regel nicht Hochrisiko. Zwei Pflichten gelten schon:
  - Transparenz nach Art. 50 seit 02.08.2026.
  - KI-Kompetenz nach Art. 4.
- **AT-Berufsrecht:** § 9 RAO und § 40 Abs. 3 RL-BA regeln Cloud-Dienstleister. Die ÖRAK-Checkliste für KI-Anbieter zu unterzeichnen ist Pflichtprogramm (BEAMON hat es getan).
- **DE-Berufsrecht:** § 43e BRAO, dazu die beA-Pflicht.

---

## 5. Gap-Matrix: aktueller Stand

Legende:

- ✅ **echt:** Oberfläche, API und Speicherung sind verbunden.
- 🟡 **teilweise**
- ❌ **fehlt**

Die Spalte „21.09.“ zeigt den Stand des Vor-Audits.

### 5.1 Akte, DMS, Dokumente

| Fähigkeit                                  | 21.09. | Heute | Beleg / Rest                                                                                           |
| ------------------------------------------ | ------ | ----- | ------------------------------------------------------------------------------------------------------ |
| Aktenzeichen-Nummernkreis                  | ❌     | ✅    | `case-numbering.ts:75-93`; **nur `/cases/new` nutzt den Zähler**, Schnellanlage, Copilot, Intake und WhatsApp vergeben eigene Formate (siehe 2.2) |
| Streitwert an der Akte                     | ❌     | ✅    | `cases/new/page.tsx:283-291`                                                                           |
| Unterordner                                | ❌     | 🟡    | Ordnerbaum mit Drag-and-Drop; kein echtes Subakt-Konzept                                               |
| Versionen, Check-in und Check-out          | ❌     | 🟡    | Textversionen mit Sperre und Diff; **das Original wird nicht versioniert**                             |
| Papierkorb                                 | ⚪     | ✅    | `dashboard/papierkorb`                                                                                 |
| DOCX-Vorlagen, Serienbrief, Briefpapier    | ❌     | ✅    | `docx-template.ts`, `api/legal/docx-fill`                                                              |
| PDF-Werkzeuge                              | ❌     | 🟡    | Zusammenfügen, Stempeln, Nummerieren ✅; Schwärzung im Browser (gerastert)                             |
| Posteingangsbuch, Scan-Eingang             | ❌     | 🟡    | Register mit Aktenvorschlag; kein automatischer Scanner- oder Ordner-Eingang                           |
| Word-Add-in mit KI-Redlining               | 🟡/❌  | ✅    | Playbook-Redlining als echte Änderungsverfolgung (`<w:ins>`/`<w:del>`); aber absatzweise und ohne Formatierung                  |
| Outlook: Anhänge und Antwortentwurf        | 🟡     | ✅    | `outlook-addin/src/taskpane.ts`                                                                        |
| Legal Hold                                 | 🟡     | ✅    | Web-Route fail-closed ✅; Engine-Op `delete_page` fail-open und ohne Hold der Mutterakte (siehe 2.2)     |
| OneDrive, SharePoint, Google Drive         | 🟡     | 🟡    | Google Drive/Dropbox nur per Kommandozeile; SharePoint/OneDrive im UI, aber mit kurzlebigem Graph-Token statt OAuth                                             |

### 5.2 Justiz und Register (Österreich): **der entscheidende Block**

| Fähigkeit                                                  | Heute | Rest                                                                     |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------------------ |
| **webERV-Versand**                                         | ❌    | Adapter-Vertrag steht (`court-channel.ts`), es fehlt der Übermittlungsstellen-Partner |
| **webERV-Eingang im Akt**                                  | 🟡    | nur ein Überwachungsordner auf dem Server (`erv-import.ts`), keine Einstellung in der Oberfläche |
| **Grundbuch, Firmenbuch, ZMR, GISA, Ediktsdatei**          | ❌    | generischer Adapter; ZMR, GISA und Ediktsdatei sind nicht einmal als Registerart angelegt |
| QES (ID Austria / A-Trust)                                 | 🟡    | Code vorhanden, kein PDF-AS-Dienst im Prod-Compose                       |
| eTHB                                                       | 🟡    | Meldung wird nur als Text erzeugt, keine elektronische Übermittlung     |
| RIS-Recherche                                              | ✅    | eigener Korpus, zitatgeprüft                                             |

### 5.3 Fristen, Kalender, Aufgaben

| Fähigkeit                                      | Heute | Rest                                                                                                      |
| ---------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| AT-Fristen-Engine (inkl. § 73 ZPO)             | ✅    | **besser als der Markt**                                                                                  |
| Vier-Augen bei Notfristen, serverseitig        | ✅    | `api/legal/fristen/second-check`                                                                          |
| Fristenbuch vollständig                        | ✅    | `failOnTruncate`                                                                                          |
| Erinnerung an die Vertretung                   | ✅    | `activeDelegateFor`                                                                                       |
| Outlook-Kalender pro Nutzer, in beide Richtungen | ✅  | Cron `outlook-user-sync`                                                                                  |
| Aufgaben mit Zuweisung                         | ✅/🟡 | **Neue Race-Gefahr:** Aufgaben liegen im Akten-Frontmatter und werden per Lesen-Ändern-Schreiben gespeichert; keine Benachrichtigung an die zuständige Person |
| Workflows „wenn X, dann Y“                     | ✅    | acht Ereignisse, Cron-Auswertung                                                                          |

### 5.4 Abrechnung und Finanzen

| Fähigkeit                              | Heute | Rest                                                                     |
| -------------------------------------- | ----- | ------------------------------------------------------------------------ |
| RATG, AHK, NTG, GGG                    | ✅    | RATG-Valorisierung (BGBl. II 131/2023) rechtlich prüfen                  |
| Festgeschriebene Rechnung, Storno      | ✅    | keine eigene Akonto- oder Barauslagennote als Belegart                   |
| BMD/RZL-Export                         | ✅    | `fibu-export/`                                                           |
| camt.053-Bankimport                    | ✅    |                                                                          |
| Mahnlauf pro Kanzlei                   | ✅    |                                                                          |
| Forderungsbetreibung, Verzugszinsen    | 🟡    | Antragstexte ✅; Einbringung bei Gericht hängt am webERV                 |
| Controlling                            | 🟡    | nur Zeiten, keine Umsatz- oder Zahlungszahlen                            |
| Online-Zahlung im Portal               | 🟡    | EPC-QR ✅, keine Kartenzahlung im Portal                                 |
| e-Rechnung (ebInterface, XRechnung, PEPPOL) | ✅ | **Alleinstellung in AT**                                                |

### 5.5 Mandanten und Kommunikation

| Fähigkeit                                        | Heute | Rest                                                                                              |
| ------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------- |
| Öffentliche Erstanfrage mit Kollisionsprüfung    | ✅    | `/erstanfrage`                                                                                    |
| Terminbuchung öffentlich                         | ✅    | `/termin`                                                                                         |
| Terminbuchung per WhatsApp                       | 🟡    | keine Doppelbuchung mehr; feste Zeitslots, sofort `confirmed`, **der Anwaltskalender wird nicht geprüft** |
| Mandatsannahme-Assistent                         | ✅    | `/mandat`, regelbasiert und bewusst ohne LLM                                                      |
| Portal mit Rechnungen und Fragebögen             | ✅    |                                                                                                   |
| Kommunikationsverlauf pro Akte                   | ✅    | Telefonnotizen in einem eigenen Tab                                                               |
| CTI (sipgate, Placetel)                          | ✅    | Anruferkennung öffnet die Akte                                                                    |
| Native App                                       | 🟡    | Capacitor-Projekte vorhanden (dünne Hülle um die Web-App); Veröffentlichung im Store offen        |

### 5.6 KI

| Fähigkeit                                    | Heute | Einordnung                                                                    |
| -------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| Aktenchat und Recherche mit Zitatprüfung     | ✅    | **Vorsprung**                                                                 |
| Tabular Review, Widerspruchserkennung, Wissensgraph | ✅ | auf Harvey- und Legora-Niveau im Funktionsumfang                             |
| Agent mit Plan-Ansicht                       | ✅    | `planning-mode-panel.tsx`                                                     |
| „Nächste Schritte“ pro Akte                  | ✅    | `CaseNextStepsPanel`                                                          |
| Gedächtnis pro Nutzer                        | ✅    |                                                                               |
| MCP für Kanzleien                            | ✅    | Tokens als Hash gespeichert                                                   |
| Nativer Tool-Use im Copilot                  | ❌    | **Regex-Marker, technische Schuld**                                           |
| KI-Limits durch den Kanzlei-Admin            | 🟡    | Deckel nur pro Kanzlei-Konto, nicht pro Nutzer; nur Betreiber kann ihn setzen; fail-open bei DB-Fehler  |
| EU-Only für Embeddings                       | 🟡    | **Suchanfragen gehen immer an den Embedding-Anbieter**, Dokumente nur mit zweitem Schalter in der EU                                        |
| AT-Korpus                                    | 🟡    | ~22 % der RIS-Judikatur, Bundes- und Landesrecht ~91 %, historische Fassungen fehlen |
| DE/CH-Korpus                                 | ❌/🟡 | nur freie Quellen, keine Verlagsinhalte                                       |

### 5.7 Plattform, Sicherheit, Vertrauen

| Fähigkeit                                          | Heute | Rest                                                                  |
| -------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| 2FA-Pflicht                                        | ✅    | Middleware und API geben 403 zurück                                   |
| SSO und SCIM                                       | ✅    | WebAuthn/Passkeys fehlen (bestätigt)                                  |
| Audit-Log mit Hash-Kette                           | ✅    | Advisory-Lock pro Kanzlei                                             |
| Ethical Walls, ACL pro Akte                        | ✅    | Paket 12a/13a noch nicht als „live“ abgenommen                        |
| Mandantentrennung strikt                           | 🟡    | Paket 12b im Code, Abnahme offen                                      |
| ISO 27001 / 42001, SOC 2, BSI C5                   | ❌    | nur Vorbereitungsdokumente; **BEAMON hat ISO 27001 und SOC 2**        |
| ÖRAK-KI-Checkliste, Bestätigung nach § 40 RL-BA    | ❌    | Entwurf `docs/compliance/OERAK_KI_PAKET_ENTWURF.md`                   |
| Öffentliche API-Dokumentation                      | 🟡    | OpenAPI nur mit vier Pfaden                                           |
| Betrieb (Staging, Failover, Offsite-Backup)        | 🟡    | neuer Server, Offsite-Backup mit Restore-Test; kein Staging und kein Failover (Abschnitt 6) |

---

## 6. Betrieb auf dem neuen Server

**Stand laut Repo:**

- Netcup RS 8000 (16 Kerne, 64 GB RAM, 2 TB NVMe, Debian 13), Umzug abgeschlossen, alter Server abgeschaltet (`server/deploy/netcup/RUNBOOK.md:3-9`).
- Der Betreiber gibt an, dass alle Altprobleme behoben sind. Serverseitige Einstellungen (Backup-Ziel, Resend, DNS, rotierte Zugangsdaten) lassen sich aus dem Repo nicht einsehen. Ich übernehme die Aussage.

**Was das Repo belegt:**

| Bereich     | Stand                                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy      | nur sauberer, gepushter `main`; Sperre; Scan auf Secrets im Image; Health-Wartezeit; Vorversion bleibt unter `/opt/subsumio-prev` (`deploy-code.sh`)               |
| Backup      | restic offsite plus lokale AES-Kopie, Aufbewahrung 7 Tage / 4 Wochen / 6 Monate, `restic check`, **Restore-Test jeden Sonntag in eine Wegwerf-DB** (`backup/run.sh`, `verify.sh`) |
| Health      | Readiness mit 503 bei Ausfall von Engine oder Auth-DB; Cron-Health alle 10 Minuten prüft Platte (unter 10 % frei) und Backup-Alter                                 |
| Alarmierung | fehlgeschlagene Jobs, Backups und Pipeline-Läufe werden per Mail an `QUEUE_ALERT_EMAIL` gemeldet; optional Webhook und externe Heartbeats                           |
| Ressourcen  | Speicher- und CPU-Limits pro Dienst, Log-Rotation                                                                                                                  |

**Was strukturell bleibt:**

1. **Ein Host ohne Failover und ohne Replikat.** Datenbank, lokale Backup-Kopie, Alarmierung, Proxy und ein Fremdprojekt (sanicura.com im geteilten Caddy) laufen auf derselben Maschine.
2. **Kein Staging.** Jeder Deploy ist ein Test in Produktion.
3. **Preflight und Post-Deploy-Smoke-Test werden nicht erzwungen.** `deploy-code.sh` ruft keinen der beiden auf. Der Rollback der Anwendung ist manuell, Datenbank-Migrationen laufen nur vorwärts.
4. **Die Alarmierung hängt am selben Host.** Fällt die Box aus, meldet sich nichts, es sei denn, die externen Heartbeat-URLs sind gesetzt. Im Repo ist kein externer Uptime-Monitor definiert.
5. **Der Rechtskorpus ist nicht im nächtlichen Backup.** Das wöchentliche Korpus-Backup enthält keine Vektoren. Ein Neuaufbau heißt etwa 4 Mio. Chunks neu einbetten und dauert Tage (RTO-Ziel: unter 1 Stunde).
6. **Das Secret-Scanning prüft das Web-Image nicht**, nur die Images von Engine und Pipeline.
7. **Veraltete Dokumente** beschreiben noch den alten Server:
   - `docs/deploy/SERVER_STATUS_2026-09-18.md`
   - `docs/deploy/PILOT_GO_LIVE.md`
   - `docs/BACKUP-RESTORE-PLAN.md` (sagt „NICHT implementiert“)
   - `docs/DEPLOY_ENGINE.md`
   - `docs/deploy/self-hosted.md` (verweist auf Dateien, die es nicht gibt)
   - `docs/deploy/CRON_SCHEDULE.md` (Jobanzahl und „entfernte“ Jobs stimmen nicht)

**Einschätzung:** Für einen Pilot mit wenigen Kanzleien ist das tragfähig. Für einen Vertrag mit SLA von 99,5 bzw. 99,9 % (`docs/enterprise/SLA.md`) ist es das nicht. Der nächste Schritt kostet wenig:

- Staging-Server
- Preflight und Smoke-Test als Pflicht in `deploy-code.sh`
- externer Uptime-Monitor
- Korpus-Snapshot mit Vektoren
- mittelfristig ein Replikat der Datenbank
- das Fremdprojekt von der Box trennen

---

## 7. Potenzial

**Ja, Subsumio hat Potenzial.** Die Gründe:

1. **Timing:** Die AT-Kanzleisoftware ist technisch alt (Desktop-Ära). Die KI-Nachfrage ist voll da (99 % Nutzung), aber das Vertrauen fehlt (70 % korrigieren). Genau diese Lücke schließt ein Produkt mit „geprüften Zitaten“.
2. **Kein großer Spieler ist im AT-Mittelstand aktiv.**
   - Harvey und Legora zielen auf Großkanzleien.
   - Clio ist nicht in DACH.
   - Noxtua und Lexis verkaufen Recherche, keine Aktenführung.
3. **Vorlage Clio:** 500 Mio. $ ARR mit genau der Kombination „Kanzleiverwaltung plus KI-Arbeitsplatz“ beweisen, dass das Modell trägt.
4. **Burggraben aus Fleißarbeit:** AT-Tarifrecht, Fristenrecht mit Begründung, RIS-Korpus, e-Rechnung und Treuhand sind schwer zu kopieren und für KI-first-Startups unattraktiv.

**Realistische Größe:**

- Österreich hat rund 7.000 Rechtsanwälte in etwa 4.000 bis 5.000 Kanzleien. Die Zahl ist nicht verifiziert (ÖRAK-Statistik prüfen).
- Rechenbeispiel: 5 % Marktanteil bei durchschnittlich ~600 € pro Monat ergeben etwa **1,5 Mio. € ARR** in AT.
- Das ist ein solides Geschäft, aber kein Venture-Case. **Das Venture-Potenzial liegt in Deutschland**: rund 165.000 Anwälte, also etwa 20-mal so viele.
- Voraussetzungen für Deutschland: beA über einen Partner, DATEV, RVG (Code vorhanden, stillgelegt) und eine Content-Strategie ohne Beck.

**Größte Bedrohungen:**

1. **Donna** besetzt dieselbe Nische in AT, möglicherweise früher.
2. **ADVOKAT und jurXPERT** kaufen oder integrieren KI (Noxtua, Protégé) und sind damit „gut genug“.
3. **Clio** tritt mit Work oder Vincent in DACH an.
4. **Ein Betriebsvorfall mit Datenverlust in der Pilotphase** würde den Ruf im kleinen AT-Markt dauerhaft beschädigen.

---

## 8. Priorisierte Roadmap

### Stufe 0: vor dem ersten Pilotkunden (1 bis 2 Wochen, Code)

1. **`{{gz}}` korrigieren und die gerichtliche Geschäftszahl an der Akte einführen:** im Formular, in der Übersicht und in der Liste, genutzt von Vorlagen, ERV und Postzuordnung.
2. **EU-Only:** Suchanfragen und Dokument-Embeddings bei gesetztem `SUBSUMIO_EU_ONLY` immer über ein EU-Modell (die Neu-Einbettung ist eine eigene Migration). Bis dahin in Oberfläche und AVV offenlegen.
3. **Abschluss-Prüfung vor dem Archivieren.** Offene Fristen werden nicht mehr stillschweigend versteckt.
4. **Legal Hold in der Engine fail-closed**, mit Prüfung der Mutterakte in `delete_page`.
5. **WhatsApp-Buchung:** Wochentag, Feiertage, Kalender, Verhandlungen und Abwesenheiten prüfen; Status „angefragt“ statt `confirmed`.
6. **Controlling:** die Kennzahl in „Leistungswert“ umbenennen, bis echter Umsatz kommt.
7. **Ein Anlagepfad für Akten** mit dem Aktenzeichen-Zähler; KYC- und Vollmachts-Sperre auch bei der Direktanlage.
8. **Recherche auf `at` voreinstellen** und die RIS-Live-Suche um VfGH, VwGH, BVwG und LVwG erweitern. Das Zitat § 89a gegenüber § 89d GOG juristisch prüfen.
9. **Aufgaben mit atomarem Schreiben** (If-Match oder eigene Seiten) und Benachrichtigung an die zuständige Person.
10. **Copilot-Freigabe:** das Token erst nach dem Klick vorbereiten lassen; Nonce-Store in die DB.

### Stufe 1: Wechselgrund für AT-Kanzleien (Partnerverträge, 1 bis 3 Monate)

11. **webERV** über stp.one oder ÖGIZIN (MANZ ist über Noxtua Wettbewerber), für Versand und Eingang im Akt. Österreichisches ERV-Format statt XJustiz, automatischer Eintrag im Postausgangsbuch mit Einbringungsbestätigung.
12. **Registerabfragen** für Grundbuch, Firmenbuch, ZMR, GISA und Ediktsdatei, mit Übernahme in Beteiligte, KYC und Kollisionsprüfung.
13. **PDF-AS für QES** deployen.
14. **ÖRAK-KI-Checkliste unterzeichnen** und die Bestätigung nach § 40 Abs. 3 RL-BA veröffentlichen.

### Stufe 2: Tiefenprogramm (6 bis 10 Wochen, Code, parallel zu Stufe 1)

Reihenfolge nach Häufigkeit im Anwaltsalltag:

15. **Schriftsatzpaket:** Rubrum-Variablen, Beilagenverzeichnis, Kostenverzeichnis nach § 54 ZPO, KI-Entwurf auf Kanzleivorlagen, Postausgangsbuch mit ERV und Zustellarten (3.1, Punkte 2–6).
16. **Posteingang und Fristen:** korrigierbares Posteingangsbuch mit Zustelldatum, Fristenkontrolle am Tagesende, Erledigungsvermerk, Fristverlängerung, Mehrfachauswahl (Punkte 12–14).
17. **Beteiligte mit Rolle pro Akte**, Kollisionsprüfung über alle Beteiligten, Sachbearbeiter als Nutzer (Punkte 7–9).
18. **Geld:** RATG an der Leistung, Freigabe der Honorarnote, Prüfliste für das Bank-Matching, Akonto-Note, Stundensätze pro Anwalt und Mandant, BMD/RZL mit Personenkonten (Punkte 16–20).
19. **KI auf Gerichtsniveau:** Zitate mit Seite und Randzahl, Tabular über das ganze Dokument, harte Enthaltung, Belege für jede Ausgabe (Punkte 21–24).
20. **Controlling und Rollen** (Punkt 25).
21. **Testschulden:** Oberflächen- und E2E-Tests für Kollisionsprüfung, FiBu, Forderungskonto, Abwesenheiten; ein E2E-Lauf gegen die echte Engine pro Nacht.
22. **Aufräumen:** 30 Routen ohne Aufrufer entfernen oder anbinden (`work-products` braucht eine UI oder muss weg); stillgelegten DE-Code aus dem Build nehmen, bis Deutschland kommt.

### Stufe 3: Betrieb und Vertrauen (parallel)

23. Staging, Preflight und Smoke-Test als Pflicht beim Deploy, externer Uptime-Monitor, Korpus-Backup mit Vektoren, das Fremdprojekt von der Box trennen, veraltete Dokumente korrigieren.
24. Passkeys (WebAuthn), externer Penetrationstest, ISO 27001 anstoßen.
25. SLA-Text an die Architektur mit einem Host anpassen.
26. Zweite Person für Engineering oder Betrieb (Bus-Faktor).

### Stufe 4: Deutschland (ab 2027)

27. beA über Middleware, DATEV, RVG und FAO reaktivieren; Content-Strategie ohne Beck, Wolters Kluwer und Lexis (Nomos, Otto Schmidt, De Gruyter, vLex, Open Access).

**Regel bis fünf Pilotkanzleien produktiv arbeiten:** keine neuen Bereiche. Jede Woche geht in Tiefe, Tests oder Partner.

---

## 9. Kurzbewertung pro Dimension

| Dimension                                    | Note (1–10) | Kommentar                                                                    |
| -------------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| Vision und Positionierung                    | 9           | trifft die Marktlücke genau                                                  |
| KI-Architektur                               | 8           | Grounding, Evals, EU-Schalter; Tool-Use und EU-Suchanfragen sind Schulden    |
| KI im Alltag (Gerichtsniveau)                | 6           | keine Seiten- oder Rz-Zitate, 16k-Kappung, keine harte Enthaltung            |
| Rechtsfachliche Tiefe AT (Fristen, Tarife)   | 8           | Engine stark; Tarife noch nicht bis in Leistung und Rechnung durchgezogen    |
| Tiefe der Abläufe (Schriftsatz, Post, Abschluss) | 5       | siehe Abschnitt 3                                                            |
| Funktionsbreite Kanzlei-OS                   | 8           | fast Parität, Justiz- und Register-Block fehlt                               |
| Oberflächenhygiene (keine Hüllen)            | 8           | 0 verwaiste Seiten, 95 % der Routen mit Aufrufer                             |
| Codequalität und Tests                       | 8           | außergewöhnlich; 30 % der Seiten ohne Verhaltenstest                         |
| Sicherheit (Code)                            | 7           | viele Härtungsrunden; Legal Hold in der Engine, Copilot-Freigabe, Passkeys offen |
| Sicherheit (Nachweise)                       | 3           | keine Zertifikate, keine ÖRAK-Checkliste                                     |
| Betrieb                                      | 6           | neuer Server mit Offsite-Backup und Restore-Test; kein Staging, kein Failover |
| Go-to-Market                                 | 3           | keine nachgewiesenen Pilot- oder Zahlkunden im Repo, Preis über dem Markt    |
| Team und Skalierbarkeit                      | 4           | Bus-Faktor 1                                                                 |

**Schlusswort:** Das Produkt ist breiter als jede österreichische Kanzleisoftware und sauberer gebaut, als „breit“ vermuten lässt.

- **Was fehlt, ist Tiefe an den Übergängen:** Aktenzeichen des Gerichts, Rubrum, Beilagen, Kosten, Posteingang, Abschluss, Controlling und KI-Zitate mit Seite.
- Das ist gut planbare Arbeit von 6 bis 10 Wochen und kein Architekturproblem.
- Zusammen mit den drei Partnerverträgen und den sechs Haftungsbefunden ergibt das ein Produkt, das eine ADVOKAT-Kanzlei ohne Kompromiss wechseln kann.

---

## 10. Quellen (Auswahl)

**Wettbewerb:**

- techcrunch.com/2026/09/09 (Harvey, 15,5 Mrd. $)
- bloomberg.com/news/articles/2026-09-22 (Legora)
- legora.com/newsroom (Büro München)
- clio.com/about/press (vLex)
- lawnext.com/2026/04 (Clio Work)
- thomsonreuters.com (CoCounsel, 08/2026)
- lawnext.com/2026/08 (Protégé)
- tech.eu/2026/09/23 (Noxtua)
- manz.at (MANZ-Noxtua)
- wolterskluwer.com (Libra)
- oerak.at (BEAMON, AI:ssociate)
- mitdonna.at
- anwaltsblatt.at (Vergleich 06/2026)

**Markt:**

- future-law.eu (Legal Tech Barometer 2026)
- wolterskluwer.com (Future Ready Lawyer 2026)
- legaltechverband.de (Legal Tech Monitor 2025)

**Regulierung:**

- gibsondunn.com (AI-Act-Omnibus)
- gesetze-im-internet.de/brao/\_\_43e.html
- ÖRAK-Erläuterungen RL-BA 2015

**Code:** Belege stehen jeweils in den Tabellen. Vor-Audits:

- `docs/AUDIT_KANZLEI_OS_WETTBEWERB_2026-09-21.md`
- `docs/blueprints/MARKT-PARITAET-2026-09-22.md`
- `docs/audits/AUDIT-STATUS.md`
