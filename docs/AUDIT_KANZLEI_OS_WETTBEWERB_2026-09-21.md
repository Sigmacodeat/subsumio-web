# Gesamtaudit Kanzlei-OS gegen den Markt

Stand: 21.09.2026. Grundlage sind drei Prüfungen am Code und zwei Web-Recherchen: eine zu Österreich und eine zu DE, CH und international. Die Befunde am Code habe ich stichprobenartig selbst nachgelesen (Datei und Zeile). Aussagen über Konkurrenten stützen sich auf Herstellerseiten, Hilfe-Center, das Anwaltsblatt 06/2026 und Fachpresse. „Nicht gefunden“ heißt bei Konkurrenten nicht, dass es die Funktion dort sicher nicht gibt.

Legende für den Subsumio-Status:

- **✅ echt:** Oberfläche, API und Speicherung sind verbunden.
- **🟡 teilweise:** vorhanden, aber mit wesentlicher Einschränkung.
- **⚪ nur UI/CLI:** Es gibt eine Oberfläche ohne Funktion dahinter, oder die Funktion ist nur über die Kommandozeile erreichbar.
- **❌ fehlt**

## 1. Kurzfazit

Subsumio ist bei **KI, Recherche und Wissensbasis** deutlich weiter als jede österreichische Kanzleisoftware. Das betrifft Aktenchat mit Zitatprüfung, Recherche im RIS-Korpus, Tabular Review, Widerspruchserkennung, Agenten, semantische Suche über Akten und die AT-Fristenberechnung mit verhandlungsfreier Zeit.

Als **vollständiges Kanzlei-OS** fehlen genau die Funktionen, die in Österreich als selbstverständlich gelten. Laut Anwaltsblatt-Vergleich 06/2026 bieten sie alle etablierten Anbieter:

1. **webERV-Versand.** Heute gibt es nur den Import von Exportdateien für den Eingang.
2. **Registerabfragen:** Grundbuch, Firmenbuch, ZMR, GISA, Ediktsdatei/Insolvenzcheck.
3. **Abrechnung nach AHK, NTG, GGG** und Akonto-/Stornonoten mit unveränderbaren Rechnungen. RATG ist vorhanden.
4. **Buchhaltungsexport BMD/RZL** und eine echte Bankanbindung (camt.053).
5. **Forderungsbetreibung:** Mahnklage, Exekution, Zinsrechner.
6. **DMS-Grundfunktionen:** Dateiversionen, Unterordner, Vorlagen mit Aktendaten befüllen, Serienbrief, Scan-Eingang und Postbuch.
7. **Aufgaben mit Zuweisung**, Timer, Telefonie-Anbindung.
8. **Mobile App**, bei ADVOKAT sogar offlinefähig.

Dazu kommen **Defekte an bestehenden Funktionen**, die vor dem Pilotbetrieb behoben werden müssen (Abschnitt 4). Vier davon sind rechtlich heikel:

- Eine Legal-Hold-Akte lässt sich löschen.
- Die Vier-Augen-Prüfung bei Notfristen läuft nur im Browser.
- Versendete Rechnungen lassen sich weiter ändern.
- Die Kanzlei-Pflicht zur Zwei-Faktor-Anmeldung wirkt nicht.

## 2. Marktbild

### Österreich (Launch-Markt)

| Anbieter                                                      | Typ                                                   | Stärke                                                                                                                                                            | KI                                                         | Preisanker                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **ADVOKAT**                                                   | Kanzleisoftware, Marktführer (über 2.500 Kanzleien)   | eigene ERV-Übermittlungsstelle, Register (GB/FB/ZMR/GISA/PEP), Inkasso mit über 400 Vorlagen, Treuhandbuch, offlinefähige App, sproof-QES, ADVOCOM-Mandantenkanal | GPT-Assistent aus dem Akt, ohne Aktenchat und ohne Agenten | Cloud: 64,60 € (1 Platz), 195,68 € (5 Plätze), 393,96 € (15 Plätze); webERV +20 € |
| **jurXPERT**                                                  | Kanzleisoftware (15.000 Arbeitsplätze)                | wertet ERV-Rückmeldungen automatisch aus (Kosten, Termine, Aktenzeichen), Personen-Import aus GB/FB/ZMR/Herold, MEDIX, Lexis-360-Export                           | Zusatzmodul                                                | ab 65–71 €/Monat                                                                  |
| **WinCaus.net**                                               | Kanzleisoftware (über 700 Kanzleien)                  | webERV, Register und Volltext im Grundpreis, unbegrenzte Nutzer, context® (E2E, App), Personalmodul, FinanzOnline                                                 | in Entwicklung                                             | ab 39,90 €/Monat                                                                  |
| **paraOffice**                                                | Kanzleisoftware (Steiermark und Burgenland über 50 %) | automatische Zuordnung der Gerichtspost, Schriftsatz-Automatik                                                                                                    | im Preis                                                   | 90 €/Monat                                                                        |
| **Donna** (Wien)                                              | KI-native Kanzleisoftware, Early Access               | ERV-Eingang im Akt, Fristerkennung, RIS, Diktat, Vorschläge ohne Prompt, eigene Infrastruktur möglich                                                             | Kern                                                       | nicht veröffentlicht                                                              |
| AI:ssociate                                                   | KI-Assistent (ÖRAK)                                   | Recherche AT/EU, Entwürfe, Pseudonymisierung, **Word- und Outlook-Add-in**                                                                                        | Kern                                                       | 39 / 69 / 99 €                                                                    |
| BEAMON                                                        | KI-Arbeitsplatz (ÖRAK)                                | Word-Redlining, Extraktion, Workflows, RIS                                                                                                                        | Kern                                                       | ab 99 €                                                                           |
| MANZ-Noxtua / Genjus, Lexis Protégé, Linde LinDa, JuridicAlly | Verlags-KI bzw. Spezial-KI                            | Verlagsinhalte, Matrix-Analyse, agentische Recherche, Datenraum, Modellwahl; Berufungs-Agent (JuridicAlly)                                                        | Kern                                                       | nicht veröffentlicht bzw. im Abo                                                  |

**Lage im Markt:** Kanzleisoftware hat Akten, aber kaum KI. Die KI-Anbieter haben Inhalte, aber keine Akten. Beides zusammen versucht nur Donna, und die ist noch nicht fertig. Das ist unsere Lücke im Markt. Wir besetzen sie aber erst, wenn wir die Grundfunktionen aus Abschnitt 3 liefern. Ohne webERV-Versand, Register und BMD-Export wechselt keine österreichische Kanzlei die Software. Sie würde Subsumio nur als teuren KI-Assistenten neben ADVOKAT betreiben.

### DACH und international: der Maßstab für 2026

- **Clio:**
  - Kollisionsprüfung und Fristen nach Gerichtsregeln.
  - Payments und Text-to-Pay, Treuhandkonto, Mandanten-App mit Zahlung.
  - **Grow AI:** Mandatsannahme-Agent rund um die Uhr für Telefon, Chat und Mail, bucht Termine, 25 $ pro gewonnenem Mandat.
  - **Clio Work** mit agentischen Skills.
- **Smokeball:** AutoTime (passive Zeiterfassung), **Archie**-Agent in Word und Outlook (Thread-Zusammenfassung, Antwortentwurf, Playbook-Redlining), Widget mit „nächsten Schritten“.
- **MyCase:** Portal mit Zahlung und **Terminbuchung**, SMS in beide Richtungen, Desktop-Drive-Sync.
- **Harvey und Legora:**
  - Agenten mit sichtbarem Plan.
  - Agentic Vault Search, die selbst die passenden Dokumente findet.
  - Agenten im Word-Add-in.
  - Mandantenportal unter Kanzlei-Marke (Legora Portal, Harvey Shared Spaces).
  - Gedächtnis pro Nutzer.
  - ISO 27001, 42001 und SOC 2.
- **iManage und NetDocuments:** Versionierung und Check-in/Check-out, Desktop-Sync, MCP-Server für Agenten, KI-Regeln pro Akte.
- **RA-MICRO, Advoware, AnNoText (DE):** Aktenchat, eEB, automatische Zuordnung von Post und E-Mail zur Akte, GwG-Modul, Diktat und CTI.

## 3. Lückenmatrix nach Bereich

Priorität: **P0** = ohne das kein Wechsel von ADVOKAT & Co. **P1** = erwarteter Standard, fällt im Pilot auf. **P2** = Differenzierung oder später.

### 3.1 Akte und DMS

| Fähigkeit                                                                   | Konkurrenz                                                  | Subsumio                                                                                                                                             | Prio   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Akte mit Beteiligten, Gegner, Status, Timeline                              | alle                                                        | ✅ `cases/new/page.tsx:239-290`                                                                                                                      | –      |
| **Aktenzeichen-Schema** (automatischer Nummernkreis)                        | alle                                                        | ❌ ohne Eingabe `Date.now().toString(36)` (`cases/new/page.tsx:236`)                                                                                 | **P0** |
| **Streitwert an der Akte** (Grundlage für RATG)                             | alle                                                        | ❌ nicht im Aktenformular                                                                                                                            | **P0** |
| Unterordner und Subakten                                                    | jurXPERT (Subakt), DMS-Standard                             | ❌ flache Dokumentliste                                                                                                                              | P1     |
| Originale ablegen (lokal/S3, Virenscan, Dubletten, Protokoll)               | alle                                                        | ✅ `server/src/core/storage.ts`, `api/upload`, `api/files`                                                                                           | –      |
| Speichern beim Upload garantiert                                            | –                                                           | 🟡 nur „Best-effort“ (`web-api.ts:275-302`): Upload meldet Erfolg, auch wenn das Original nicht gespeichert wurde                                    | **P0** |
| **Dateiversionen** und Check-in/Check-out                                   | WinCaus, iManage, NetDocuments                              | ❌ nur Text-Schnappschüsse in der Engine; die Seite „Versionsverlauf“ zeigt nur das Audit-Log                                                        | P1     |
| Papierkorb und Wiederherstellen in der Oberfläche                           | Standard                                                    | ⚪ nur in der Engine (`restore_page`), keine Web-Route                                                                                               | P1     |
| Laufwerk- bzw. Desktop-Sync, WebDAV                                         | MyCase Drive, iManage, ADVOKAT (lokal)                      | ❌                                                                                                                                                   | P2     |
| OneDrive, SharePoint, Google Drive, Dropbox                                 | ADVOKAT (SharePoint)                                        | 🟡 Code vorhanden, aber nur Import über die Kommandozeile. Die Oberfläche kennzeichnet sie als „available“                                           | P1     |
| OCR und Volltext- bzw. semantische Suche                                    | ADVOKAT, WinCaus, iManage                                   | ✅ semantische Suche besser als der Markt. OCR ohne durchsuchbare PDF-Textebene                                                                      | –      |
| **Scan-Eingang mit automatischer Aktenzuordnung, Posteingangsbuch**         | ADVOKAT (PDF-Assistent), WinCaus, paraOffice                | ❌ nur Upload; der Posteingang hat keinen Kanal ERV und keinen Eingangsstempel                                                                       | P1     |
| Postausgangsbuch                                                            | –                                                           | ✅ mit Fehler: Engine-Antwort wird nicht geprüft                                                                                                     | –      |
| **Vorlagen mit Aktendaten befüllen, Serienbrief**                           | alle (ADVOKAT-Vertragsassistent, über 400 Inkasso-Vorlagen) | ❌ Vorlagen werden nur in die Zwischenablage kopiert (`templates/page.tsx:146`)                                                                      | **P0** |
| Briefpapier im DOCX                                                         | Standard                                                    | 🟡 nur im PDF-Entwurf, nicht im DOCX-Export                                                                                                          | P1     |
| PDF-Werkzeuge (zusammenfügen, schwärzen, Anlagen stempeln bzw. nummerieren) | Adobe-Ersatz in der Kanzleisoftware, Review Sets            | ❌                                                                                                                                                   | P1     |
| Word-Add-in                                                                 | ADVOKAT, AI:ssociate, BEAMON, Harvey, Smokeball             | 🟡 **Fehler:** Aktenliste fragt `type=case` statt `legal_case` ab (`word-addin/src/taskpane.ts:202`), die Liste bleibt leer. Manifest-Hosting prüfen | **P0** |
| Outlook-Add-in, Mail zur Akte                                               | alle                                                        | 🟡 legt keine Anhänge ab                                                                                                                             | P1     |
| Aufbewahrung und Legal Hold                                                 | Standard                                                    | 🟡 **Legal Hold verhindert das Löschen nicht** (`compliance/retention/page.tsx:120` → `deletePage`; `delete_page` prüft den Hold nicht)              | **P0** |
| Datenexport und Backup für die Kanzlei                                      | Standard (Übergabe beim Wechsel)                            | 🟡 JSON ohne Originaldateien                                                                                                                         | P1     |
| Übernahme aus Altsystem                                                     | alle (Pauschale)                                            | ✅ CSV/XLSX für Akten, Kontakte, Zeiten; ADVOKAT-Dokumentenspiegel per Ordner                                                                        | –      |

### 3.2 Justiz und Register (Österreich)

| Fähigkeit                                                                          | Konkurrenz                                          | Subsumio                                                                                                                                        | Prio   |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **webERV-Versand** (Klage, Exekution, GB/FB-Eingaben, Sammelversand, Vorabprüfung) | ADVOKAT, jurXPERT, WinCaus, paraOffice              | ❌                                                                                                                                              | **P0** |
| webERV-Eingang im Akt, mit automatischer Auswertung der Rückmeldungen              | alle; jurXPERT wertet Kosten und Termine aus; Donna | 🟡 nur Exportdateien in einem Serverordner (`erv-import.ts`), nicht per Oberfläche einstellbar. Zustellfiktion nach § 89a GOG korrekt berechnet | **P0** |
| **Grundbuch, Firmenbuch, ZMR, GISA, Ediktsdatei bzw. Insolvenzcheck**              | ADVOKAT, jurXPERT (MEDIX), WinCaus                  | ❌                                                                                                                                              | **P0** |
| Treuhandbuch der Kammer (eTHB, § 10a RAO)                                          | ADVOKAT                                             | 🟡 Fremdgeld mit 40.000-€-Schwelle vorhanden, keine eTHB-Meldung                                                                                | P1     |
| QES mit ID Austria / A-Trust                                                       | ADVOKAT (sproof)                                    | 🟡 Code über PDF-AS-WEB vorhanden, **kein PDF-AS-Server im Prod-Deploy**                                                                        | P1     |
| RIS-Recherche                                                                      | Donna, BEAMON, Verlage                              | ✅ eigener Korpus mit Zitatprüfung                                                                                                              | –      |

**Weg zum webERV:** Selbst Übermittlungsstelle zu werden, dauert lange und ist aufwendig. Schneller geht es über eine Partnerschaft mit einer bestehenden Übermittlungsstelle: MANZ webERV-Service, stp.one Austria/WEBSuite oder ÖGIZIN. MANZ bindet bereits jurXPERT und WinCaus an. Registerabfragen lassen sich über einen Abfragedienst mit Abrechnung pro Abfrage einbinden, etwa MEDIX, MANZ oder stp.one.

### 3.3 Fristen, Kalender, Aufgaben

| Fähigkeit                                                                             | Konkurrenz                         | Subsumio                                                                                                                                         | Prio   |
| ------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| AT-Fristberechnung (ZPO/AVG/VwGVG, Feiertage, verhandlungsfreie Zeit, ERV-Zustellung) | alle; Clio mit Gerichtsregeln      | ✅ `src/lib/legal/frist-engine.ts` mit Begründung. **Besser als der Markt**                                                                      | –      |
| Fristen aus Dokumenten erkennen                                                       | Donna, Clio, Advoware              | ✅ als Vorschlag mit Prüfpflicht                                                                                                                 | –      |
| **Vier-Augen-Kontrolle bei Notfristen**                                               | Standard in der Haftpflicht-Praxis | 🟡 wird nur im Browser geprüft (`deadlines/page.tsx:414-445`); der Server nimmt jedes `second_check_by` an                                       | **P0** |
| Fristenbuch vollständig                                                               | Standard                           | 🟡 Ersatzweg liest `limit=300` bei einer Engine-Obergrenze von 200 (`fristenbuch/route.ts:66`): Bei großen Kanzleien fehlen Fristen ohne Warnung | **P0** |
| Erinnerungen per Mail und Push                                                        | alle                               | ✅ ohne SMTP nur In-App; **die Vertretung bekommt keine Erinnerung**                                                                             | P1     |
| Outlook/Exchange-Kalender in beide Richtungen, pro Nutzer                             | ADVOKAT, WinCaus, paraOffice       | 🟡 ein Postfach pro Installation, nur lesend, nur für Admins                                                                                     | P1     |
| Google-Kalender, CalDAV                                                               | –                                  | ⚪/❌ (ICS-Feed ✅)                                                                                                                              | P2     |
| **Aufgaben mit Zuweisung, Delegation, Fälligkeit**                                    | alle                               | ⚪ nur eine Leseliste aus den Aktendaten, ohne zuständige Person                                                                                 | **P0** |
| Wiedervorlagen                                                                        | alle                               | ✅ ohne zuständige Person                                                                                                                        | P1     |
| Abwesenheit und Vertretung                                                            | WinCaus (Personal)                 | 🟡 POST meldet auch bei Fehler Erfolg                                                                                                            | P1     |

### 3.4 Leistung, Abrechnung, Finanzen

| Fähigkeit                                                                       | Konkurrenz                                               | Subsumio                                                                                                               | Prio   |
| ------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| Leistungserfassung                                                              | alle                                                     | ✅ **Fehler:** Lesen-Ändern-Schreiben ohne Sperre, gleichzeitige Einträge gehen verloren (`api/time/route.ts:195-215`) | **P0** |
| **Timer / Stoppuhr**                                                            | alle; ADVOKAT Timer-App                                  | ⚪ Widget vorhanden, aber nirgends eingebunden                                                                         | P1     |
| Passive Zeiterfassung                                                           | Smokeball AutoTime, WinJur                               | ✅ Vorschläge aus dem Audit-Log (Opt-in)                                                                               | –      |
| RATG                                                                            | alle                                                     | ✅ im Rechnungsdialog; Valorisierung prüfen (Stand BGBl. II 131/2023)                                                  | P1     |
| **AHK, NTG, GGG, Einheitssatz, Kostenverzeichnis**                              | alle                                                     | ❌                                                                                                                     | **P0** |
| Rechnungsnummernkreis                                                           | alle                                                     | ✅ atomar                                                                                                              | –      |
| **Unveränderbare Rechnung, Storno-, Akonto-, Barauslagennote**                  | alle (jurXPERT: Honorar, Storno, Akonto, Gerichtskosten) | ❌ versendete Rechnungen per PATCH änderbar, Sperre per `_allow_status_override` umgehbar                              | **P0** |
| e-Rechnung ebInterface, XRechnung, ZUGFeRD                                      | laut Recherche kein AT-Anbieter belegt                   | ✅ Erzeugung. Versand an e-Rechnung.gv.at / PEPPOL fehlt                                                               | P2     |
| Mahnwesen                                                                       | alle                                                     | 🟡 manuell ✅; **Cron läuft nur im „system“-Brain** (`dunning-run/route.ts:10`), erreicht keine Kanzlei                | P1     |
| **Forderungsbetreibung** (Mahnklage, Exekution, Zinsen, Raten, Massenverfahren) | ADVOKAT, jurXPERT, WinCaus                               | ❌                                                                                                                     | P1     |
| Bankabgleich, camt.053, E-Banking                                               | ADVOKAT, WinCaus                                         | 🟡 allgemeiner HTTP-Adapter, kein Anbieter, kein Datei-Import                                                          | P1     |
| Online-Zahlung für Mandanten (Karte, eps, Link)                                 | Clio, MyCase                                             | 🟡 nur EPC-QR                                                                                                          | P2     |
| Fremdgeld und Treuhand                                                          | ADVOKAT                                                  | ✅ § 10a RAO, Prüfung auf dem Server                                                                                   | –      |
| Buchhaltung                                                                     | alle (meist gegen Aufpreis)                              | 🟡 nur offene Posten                                                                                                   | P1     |
| **Export BMD / RZL**                                                            | Erwartung jedes Steuerberaters in AT                     | ❌                                                                                                                     | **P0** |
| Controlling                                                                     | alle                                                     | 🟡 nur Zeiten; keine Rechnungs- und Zahlungszahlen                                                                     | P1     |
| Registrierkasse (RKSV)                                                          | ADVOKAT, WinCaus                                         | ❌                                                                                                                     | P2     |
| Deckungsanfrage Rechtsschutz                                                    | –                                                        | 🟡 nur ein DE-Anbieter (drebis), kein Versand                                                                          | P2     |

### 3.5 Mandantenkommunikation

| Fähigkeit                                                                                                            | Konkurrenz                                                       | Subsumio                                                                                                                                                                                      | Prio                                              |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Portal: Login, Status, Nachrichten in beide Richtungen, Upload, Unterlagen-Anfragen, einfache Signatur, PWA mit Push | ADVOKAT (Akteneinsicht, ADVOCOM), WinCaus context®, Clio, MyCase | ✅ auf Marktniveau                                                                                                                                                                            | –                                                 |
| E-Mail aus der Akte mit Ablage, IMAP/OAuth-Posteingang mit Aktenzuordnung und Triage                                 | Advoware, RA-MICRO                                               | ✅                                                                                                                                                                                            | –                                                 |
| WhatsApp (Anwalt)                                                                                                    | **kein Konkurrent belegt**                                       | ✅ Alleinstellungsmerkmal                                                                                                                                                                     | –                                                 |
| WhatsApp (Mandant)                                                                                                   | –                                                                | 🟡 nur Ablage und Standardantwort                                                                                                                                                             | P1                                                |
| **Onboarding- bzw. Erstanfrage-Formular für die Kanzlei-Website**                                                    | ADVOKAT (Onboarding-Formular), RA-MICRO OMA, Clio Grow           | ❌ Intake nur intern                                                                                                                                                                          | **P0**                                            |
| Fragebögen im Portal                                                                                                 | MyCase, Clio Draft                                               | ❌                                                                                                                                                                                            | P1                                                |
| **Terminbuchung** (Portal, Website)                                                                                  | MyCase, Clio Grow                                                | ❌ die Seite ist geparkt. **WhatsApp-Buchung ist fehlerhaft:** fest eingetragene Zeiten, keine Kollisionsprüfung, gespeichert als `confirmed` (`whatsapp/flow-endpoint/route.ts:76, 210-230`) | **P0** (WhatsApp-Flow abschalten oder reparieren) |
| Rechnungen im Portal einsehen und bezahlen                                                                           | Clio, MyCase                                                     | ❌                                                                                                                                                                                            | P1                                                |
| Automatische Status-Updates                                                                                          | Clio Manage AI                                                   | 🟡 nur als Entwurf, nie versendet, **fest `jurisdiction: "de"`** (`autonomous-engine/route.ts:594`)                                                                                           | P1                                                |
| Kommunikationsverlauf pro Akte über alle Kanäle                                                                      | ADVOCOM (Nachrichten als Leistung im Akt)                        | 🟡 nur kanzleiweit; im Akt nur Mail                                                                                                                                                           | P1                                                |
| Nachricht an Mandant als Leistung buchen                                                                             | ADVOKAT ADVOCOM                                                  | ❌                                                                                                                                                                                            | P2                                                |
| Native Store-App für Mandanten                                                                                       | WinCaus context, Clio for Clients                                | ⚪ Capacitor-Gerüst ohne iOS- und Android-Projekt                                                                                                                                             | P2                                                |
| SMS, Video-Call, Newsletter, NPS                                                                                     | Clio, MyCase (SMS)                                               | ❌                                                                                                                                                                                            | P2                                                |
| Kanzleiübergreifender Austausch                                                                                      | context®, Lexis Workrooms                                        | ✅ Datenräume                                                                                                                                                                                 | –                                                 |

### 3.6 Kanzleialltag

| Fähigkeit                                                        | Konkurrenz                             | Subsumio                                                                              | Prio |
| ---------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- | ---- |
| Diktat mit Spracherkennung                                       | RA-MICRO, ADVOKAT (Philips), Donna     | ✅ Whisper; **EU-Routing prüfen**                                                     | P1   |
| **Telefonie/CTI** (Anruferkennung öffnet den Akt, Anrufjournal)  | ADVOKAT (Morefon), WinCaus, Advoware   | ❌ nur manuelle Telefonnotizen, die zudem kanzleiweit mit `limit: 500` geladen werden | P1   |
| **Mobile App** mit Leistungserfassung und Akteneinsicht, offline | ADVOKAT (offline), WinCaus, Clio       | 🟡 PWA plus mobile Web-Oberfläche, keine Store-App, kein Offline-Betrieb              | P1   |
| Personal: Urlaub, Arbeitszeit                                    | WinCaus                                | 🟡 nur Abwesenheiten                                                                  | P2   |
| Kollisionsprüfung                                                | jurXPERT, Clio                         | ✅ unscharfer Namensvergleich, § 10 RAO                                               | –    |
| KYC/GwG, Sanktionslisten, PEP                                    | ADVOKAT (PEP-Abfrage), AnNoText        | 🟡 EU-Sanktionsliste ✅; PEP nur als Checkbox, kein UN/OFAC, keine Ausweisprüfung     | P1   |
| Workflows „wenn X, dann Y“                                       | ADVOKAT Workflow, Actionstep, Actaport | 🟡 Schritte werden per Hand weitergeschaltet, keine Auslöser                          | P1   |

### 3.7 KI (unser Vorsprung)

| Fähigkeit                                                                                                                         | Markt                                                 | Subsumio                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Aktenchat mit Zitatprüfung                                                                                                        | Donna (unscharf), Advoware, Kleos; ADVOKAT nur Prompt | ✅ `useGroundedAnswer` + `CitationPanel`                  |
| AT-Recherche mit Quellen                                                                                                          | AI:ssociate, Verlage                                  | ✅ eigener Korpus                                         |
| Entwurf, Vertragsprüfung mit Playbooks, Tabular Review, Übersetzung, Anonymisierung, Widerspruchserkennung, Wissensgraph, Agenten | Harvey, Legora, Noxtua                                | ✅                                                        |
| **Copilot kann alle Funktionen bedienen**                                                                                         | Smokeball Archie, j-lawyer „Ingo“, Legora Agent       | 🟡 26 Werkzeuge über Regex-Marker, kein natives Tool-Use  |
| Agent mit sichtbarem Plan, Unterbrechen und Umlenken                                                                              | Clio Work, Legora aOS, Protégé, CoCounsel (2026)      | 🟡 Agentenläufe vorhanden, kein Plan-UI                   |
| Proaktive „nächste Schritte“ pro Akte ohne Prompt                                                                                 | Donna, Smokeball, Legora Monitors                     | 🟡 Rundown-Agent, kein Widget in der Akte                 |
| KI im Word-Add-in (Redlining nach Playbook)                                                                                       | BEAMON, Harvey, Smokeball, Legartis                   | ❌ Add-in ohne KI-Redlining                               |
| E-Mail-Thread zusammenfassen, Antwort entwerfen                                                                                   | Smokeball, Bryter, kanzlei-ki.at                      | 🟡 Triage ja, Antwortentwurf prüfen                       |
| Mandatsannahme-Agent (Web-Chat, Kollision, Termin)                                                                                | Clio Grow AI                                          | ❌                                                        |
| Gedächtnis pro Nutzer (Stil)                                                                                                      | Harvey                                                | ❌                                                        |
| MCP-Server für externe Agenten                                                                                                    | iManage, CoCounsel                                    | 🟡 die Engine hat MCP, für Kanzleien nicht freigeschaltet |
| Kostenkontrolle pro Nutzer (Limit, Schätzung)                                                                                     | ADVOKAT KI                                            | 🟡 Credits ✅, Kontingente offen                          |

### 3.8 Plattform, Sicherheit, Betrieb

| Fähigkeit                                          | Markt                           | Subsumio                                                                           | Prio          |
| -------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- | ------------- |
| SSO, SCIM                                          | Harvey, Clio                    | ✅ WorkOS, SCIM                                                                    | –             |
| **Kanzleiweite Pflicht zur Zwei-Faktor-Anmeldung** | Standard                        | ⚪ Schalter wird gespeichert, **nirgends durchgesetzt** (`kanzlei-settings.ts:40`) | **P0**        |
| Audit-Log mit Hash-Kette                           | Harvey, Lexis                   | ✅ mit Fehler: gleichzeitige Einträge können die Kette verzweigen                  | P1            |
| Ethical Walls, Rechte pro Akte                     | Harvey, iManage                 | ✅ `matter-access.ts`                                                              | –             |
| Zertifikate ISO 27001 / 42001 / SOC 2              | Harvey, Legora, Noxtua (BSI C5) | ❌                                                                                 | P1 (Vertrieb) |
| Betrieb auf eigener Infrastruktur                  | Donna, ADVOKAT                  | 🟡 die Engine kann das, es gibt kein Produktangebot                                | P2            |
| Offene API für Kanzleien                           | Clio, Actaport                  | 🟡 API-Keys vorhanden, keine öffentliche Dokumentation                             | P2            |

## 4. Defekte an bestehenden Funktionen (vor dem Pilot beheben)

Die folgenden Befunde habe ich selbst am Code nachgeprüft.

1. **Legal Hold wirkungslos beim Löschen.** Die Aufbewahrungsseite ruft `api.brain.deletePage` auf (`compliance/retention/page.tsx:120`). Die Engine-Operation `delete_page` prüft den Hold nicht, nur `forget` tut das.
2. **Vier-Augen-Prüfung bei Notfristen nur im Browser.** Nötig ist eine eigene Server-Route mit Prüfung „Zweitprüfer ≠ Ersteller“.
3. **Versendete Rechnungen lassen sich ändern.** `api/invoices/[slug]/route.ts:68-86` übernimmt beliebige Felder. Der Client kann `_allow_status_override` setzen. Es gibt keinen Storno-Beleg.
4. **Kanzleiweite 2FA-Pflicht wirkungslos.** `require2FA` wird nur in den Einstellungen gelesen und geschrieben.
5. **Word-Add-in findet keine Akten.** Grund ist `type=case` in `word-addin/src/taskpane.ts:202`.
6. **Terminbuchung per WhatsApp bestätigt fest eingetragene Zeiten ohne Prüfung.** Siehe `flow-endpoint/route.ts:76`.
7. **Status-Update-Agent schreibt deutsches Recht.** `jurisdiction: "de"` in `autonomous-engine/route.ts:594`.
8. **Mahnlauf-Cron läuft nur im System-Brain.** Siehe `dunning-run/route.ts:10`.
9. **Fristenbuch liest über die Obergrenze hinaus.** Der Ersatzweg liest `limit=300`, die Engine liefert höchstens 200. Telefonnotizen (`limit: 500`), Aufgaben und Mahnlauf blättern ebenfalls nicht. Grund ist die Listenobergrenze der Engine von 200 Seiten.
10. **Leistungseinträge können sich gegenseitig überschreiben.** Grund ist Lesen-Ändern-Schreiben ohne Sperre.
11. **Speichern des Originals beim Upload nur „Best-effort“.** Das Speichern kann scheitern, während der Upload Erfolg meldet.
12. **Routen melden auch bei Fehlern Erfolg.** Betroffen sind Postausgangsbuch, Abwesenheiten und Honorarvereinbarung (POST).
13. **Zeiterfassungs-Timer nirgends eingebunden.** Die Komponente `time-tracking-widget.tsx` ist verwaist.
14. **Cloud-Connectoren und Google Drive als „available“ angezeigt.** Die Einrichtung geht aber nur über die Kommandozeile.

## 5. Wo Subsumio vorne liegt (für Vertrieb und Website)

- **Zitatgeprüfte KI über den ganzen Akt und das österreichische Recht in einem Produkt.** Kein etablierter österreichischer Anbieter hat das. Donna nur im Early Access.
- **Fristenberechnung mit Begründung aus dem Gesetz.** Sie umfasst verhandlungsfreie Zeit und ERV-Zustellfiktion. Belegt hat das kein Konkurrent.
- **WhatsApp-Sekretariat für Anwälte mit Freigabe-Schleife.** Bei keinem Konkurrenten belegt.
- **e-Rechnung (ebInterface, XRechnung, ZUGFeRD).** Bei keinem österreichischen Anbieter belegt.
- **Weitere Stärken:**
  - Tabular Review, Widerspruchserkennung, Wissensgraph, Datenräume zwischen Kanzleien
  - Rechte pro Akte und Ethical Walls, auch für Admins
  - SCIM

## 6. Empfohlene Reihenfolge

**Welle A: Defekte beheben (1–2 Wochen, rein im Code).** Das sind die Punkte 1–14 aus Abschnitt 4. Ohne diese Fixes ist der Pilot haftungsrechtlich riskant.

**Welle B: Kanzlei-Grundfunktionen, ohne die niemand wechselt (P0).**

1. Aktenzeichen-Nummernkreis und Streitwert an der Akte.
2. Aufgaben mit Zuweisung, Delegation und Fälligkeit, im Cockpit sichtbar.
3. Vorlagen-Engine: DOCX-Vorlage mit Platzhaltern aus Akte, Beteiligten und Kanzlei, Briefpapier, Serienbrief.
4. Abrechnung erweitern: AHK, Einheitssatz, Barauslagen, Akonto- und Stornonote, festgeschriebene Rechnung.
5. BMD/RZL-Export der Buchungen und offenen Posten.
6. Öffentliches Erstanfrage-Formular mit Kollisionsprüfung. Das ist der Einstieg in die Mandanten-App (§ 10 RAO).

**Welle C: Justiz-Anbindung Österreich (P0, braucht Partnerverträge – Entscheidung beim Nutzer).**

7. webERV über eine Partner-Übermittlungsstelle (MANZ, stp.one oder ÖGIZIN), für Versand und Eingang direkt in den Akt. Die Rückmeldungen wertet die Fristen-Engine aus.
8. Registerabfragen für GB, FB, ZMR, GISA und Ediktsdatei über einen Abfragedienst, mit Übernahme in Beteiligte und KYC.
9. PDF-AS-Server für QES in Betrieb nehmen.

**Welle D: Alltag und Mandanten (P1).**

10. DMS: Dateiversionen, Unterordner, Papierkorb in der Oberfläche, Scan-Eingang mit automatischer Zuordnung, Posteingangsbuch, PDF-Werkzeuge.
11. Kalender in beide Richtungen pro Nutzer (Graph/Exchange), Erinnerungen an die Vertretung.
12. Kommunikationsverlauf pro Akte über alle Kanäle, Fragebögen und Rechnungen im Portal, Status-Updates nach Freigabe versenden, Terminbuchung mit echter Kalenderprüfung.
13. Timer einbinden, Forderungsbetreibung, Bankdatei-Import (camt.053), Controlling mit Umsatzzahlen.
14. Telefonie über CTI-Partner (z. B. Placetel, sipgate, 3CX), Store-App mit Leistungserfassung.

**Welle E: KI-Vorsprung ausbauen (P2).**

15. Natives Tool-Use im Copilot für alle Kanzlei-Aktionen, mit Plan-Ansicht und Freigabe.
16. Widget „Nächste Schritte“ in der Akte, ohne Prompt.
17. KI-Redlining im Word-Add-in, Antwortentwurf für E-Mails im Outlook-Add-in.
18. Mandatsannahme-Agent auf der Website der Kanzlei.
19. ISO 27001 und 42001 als Vertriebsvoraussetzung vorbereiten.

## 7. Quellen

Österreich:

- advokat.at (Module, KI-Assistent, Kanzleigründungspreise)
- x-bs.at (jurXPERT)
- edv2000.net (WinCaus)
- paragraph-software.at
- mitdonna.at
- future-law.eu (Donna, Legal Tech-Barometer 2026)
- anwaltsblatt.at/artikel/kanzleisoftwareanbieter-im-vergleich (24.06.2026)
- aissociate.at
- beamon.ai
- manz.at (Noxtua, webERV-Service)
- ots.at (Lexis Protégé, 17.09.2026)
- extrajournal.net (LinDa, 10.09.2026)
- juridically.ai
- edikte.justiz.gv.at (Liste der Übermittlungsstellen)

International:

- lawnext.com (Clio, Smokeball, PracticePanther 2025/2026)
- help.harvey.ai (Release Notes)
- legora.com
- thomsonreuters.com (CoCounsel, 08/2026)
- imanage.com
- netdocuments.com
- ra-micro.de
- stp.one
- wolterskluwer.com

Code-Belege stehen jeweils in den Tabellen.
