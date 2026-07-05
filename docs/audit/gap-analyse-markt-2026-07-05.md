# Gap-Analyse: Was fehlt, um die Nr. 1 am Markt zu sein (2026-07-05)

**Basis:** Vollständige Produktkenntnis aus vier Audit-Runden (alle Workflows verifiziert fertig)
plus gezielte Code-Greps gegen jeden hier behaupteten Gap — damit nicht wieder ein "Gap" gelistet
wird, der längst existiert. Drei Grenzfälle wurden dabei **hochgestuft** (existieren schon in
Grundzügen): Ethical Walls (`src/lib/ethical-wall.ts`, voll enforced inkl. EU-AI-Provider-Policy),
KI-Zeitextraktion aus Konversationen (`api/time/auto-extract`), beA-Versand-Architektur
(`src/lib/efiling-architecture.ts` — Datenmodell fertig, Versand nicht).

**Wettbewerbs-Einordnung in einem Satz:** Gegen **Harvey/Legora** gewinnen wir bereits (die haben
keine Kanzleiverwaltung, kein DACH, kein Fristenbuch); gegen **Clio** gewinnen wir bei KI und DACH-
Compliance; der eigentliche Verdrängungskampf ist gegen **RA-MICRO/Advoware/Actaport** — und dort
entscheiden nicht KI-Features, sondern die unten gelisteten Alltags-Workflows (Posteingang, beA,
Mahnverfahren, FiBu-Anschluss), plus zwei **gesetzliche Pflichten**, die uns aktuell disqualifizieren.

---

## A — Regulatorische Pflicht-Gaps (ohne die sind wir nicht verkaufbar)

### A1 — E-Rechnung: XRechnung + ZUGFeRD ⬛ FEHLT KOMPLETT (0 Code-Treffer)

Seit 2025 müssen deutsche Unternehmen E-Rechnungen **empfangen** können, ab 2027/2028 wird der
**Versand** im B2B stufenweise Pflicht; für öffentliche Auftraggeber gilt XRechnung schon lange.
Eine Kanzleisoftware, deren Rechnungsmodul kein ZUGFeRD/XRechnung erzeugt, ist ab 2027 für jede
Kanzlei mit Unternehmensmandanten **rechtlich unbrauchbar**. → Invoicing um ZUGFeRD-PDF/A-3-Export

- XRechnung-XML erweitern (EN 16931), plus Empfang/Parsing eingehender E-Rechnungen im Posteingang.
  **Höchste Priorität der gesamten Liste — hartes Ausschlusskriterium im Vertrieb.**

### A2 — Schweizer QR-Rechnung ⬛ FEHLT (0 Treffer)

In der Schweiz ist die QR-Rechnung seit 2022 der einzige Standard-Zahlschein. Produkt claims
CH-Support (ZPO-CH-Fristen, Kantone in `computeDueDate`) — aber Rechnungen ohne Swiss-QR-Bill sind
für CH-Kanzleien nicht praxistauglich. Analog EPC-QR ("GiroCode") für DE/AT-Rechnungen als
Zahlungs-Komfort.

### A3 — beA-Versand produktiv machen ◧ TEILWEISE (Architektur + Datenmodell fertig, Versand fehlt)

`efiling-architecture.ts` hat die Entscheidung (Partneradapter-Middleware) und das komplette
FilingPackage-Modell (Approval, Receipt, Fristkopplung, Audit) bereits committed — es fehlt die
Umsetzung. beA-**Empfang** existiert (Import-Config), aber der Rückkanal (Schriftsatz aus Drafting
→ qeS-Signatur → beA-Versand → Zustellnachweis → automatische Fristauslösung) ist DER Workflow,
mit dem RA-MICRO Kanzleien hält. Dazu gehört: **eEB-Handling** (elektronisches
Empfangsbekenntnis — Annahme/Abgabe direkt aus der Akte) und **XJustiz-Parsing** eingehender
Gerichtsnachrichten mit automatischer Fristextraktion in das bestehende Fristen-Read-Model.
Österreich-Pendant: web-ERV; CH: PrivaSphere/IncaMail.

### A4 — GwG/KYC-Automatisierung ◧ TEILWEISE (Checkliste existiert, Automatisierung fehlt)

Compliance-Seite hat GwG als manuelle Checkliste. Für Transaktionspraxen fehlt: automatisierte
Identitätsprüfung (IDnow/POSTIDENT/it's-me-Anbindung), wirtschaftlich-Berechtigten-Abfrage
(Transparenzregister-API), Risiko-Scoring pro Mandat, Wiedervorlage bei Ablauf der Ausweisdokumente.

---

## B — Verdrängungs-Features gegen die DACH-Incumbents (Alltag schlägt KI)

### B1 — Einheitlicher digitaler Posteingang mit KI-Triage ◧ TEILE EXISTIEREN, VERBINDUNG FEHLT

Es gibt: Intake, E-Mail-Import, WhatsApp-Triage, beA-Import, Portal-Uploads — **fünf getrennte
Eingänge**. Der Kanzleialltag beginnt aber mit EINEM Posteingang: alles Eingehende (beA, E-Mail,
Scan, WhatsApp, Portal, Fax-Gateway) landet in einer Warteschlange, KI schlägt Akte + Dokumenttyp +
extrahierte Fristen vor, Mensch bestätigt mit einem Klick, fertig abgelegt. Das ist der
RA-MICRO-Kernworkflow ("Posteingang") — und mit unserer bestehenden Pipeline (Auto-Matching,
Fristextraktion, Insights) könnten wir ihn **besser** bauen als jeder Incumbent. Größter
Einzelhebel dieser Kategorie.

### B2 — Outlook-Add-in / M365-Integration ⬛ FEHLT (nur Word-Add-in existiert)

E-Mails leben in Outlook. Ohne "In Akte ablegen"-Button direkt in Outlook (Graph-API, analog zum
bestehenden Word-Add-in) bleibt der manuelle EML-Import eine Adoption-Bremse. Zwei-Wege-
Kalendersync (Graph/CalDAV) gehört in dasselbe Paket — wurde in der Daily-Use-Runde bewusst
zurückgestellt, bleibt offen.

### B3 — Mahnverfahren + Zwangsvollstreckung ⬛ FEHLT (nur Phasen-Namen in litigation-flow)

Automatisierter Mahnbescheid (Online-Mahnantrag/EGVP-Schnittstelle), Vollstreckungsauftrag
(GVFV-Formulare), Forderungskonto mit Zinsberechnung (§ 288 BGB), Teilzahlungs-Verrechnung nach
§ 367 BGB. Brot-und-Butter für Inkasso-/Forderungspraxen — Clio hat dafür kein DACH-Äquivalent,
die Incumbents sind hier stark. Ohne das verlieren wir jede Kanzlei mit Forderungsmanagement.

### B4 — PKH/VKH + Beratungshilfe ⬛ FEHLT (0 Treffer)

Prozesskostenhilfe-Antrag (amtliches Formular, Bedürftigkeitsprüfung), Beratungshilfe-Abrechnung,
Kostenfestsetzungsantrag-Generator (auf dem vorhandenen RVG-Rechner aufbauend — der ist schon da,
es fehlt nur der Formular-Output). Für Sozial-/Familien-/Strafrechtler Pflicht.

### B5 — Rechtsschutzversicherungs-Schnittstelle (drebis/E-Rechtsschutz) ◧ NUR INTAKE-FELD

RSV-Deckung ist heute ein Feld bei der Aktenanlage — es fehlt die elektronische Deckungsanfrage +
Schadenmeldung + Abrechnung direkt an die Versicherer (drebis-Standard). Für Verkehrsrechts- und
Volumenkanzleien das wichtigste einzelne Integrations-Feature überhaupt.

### B6 — FiBu-Anschluss: Bankabgleich + OPOS + Mahnläufe ⬛ FEHLT

DATEV-Export existiert, aber: kein Bank-Feed (FinTS/EBICS), kein automatisches Matching von
Zahlungseingängen gegen offene Rechnungen, keine offene-Posten-Liste, keine automatisierten
Mahnläufe für eigene Honorarrechnungen (wir mahnen Mandanten-Dokumente an, aber nicht unsere
eigenen Rechnungen!). Zahlungslink (Stripe/SEPA) auf der Rechnung + Mandanten-Zahlungsportal
gehört dazu.

### B7 — Fachrechner-Pakete (deterministische Werkzeuge je Rechtsgebiet) ⬛ FEHLEN

KI ist gut, aber der Alltag läuft über geprüfte Rechner: Düsseldorfer Tabelle/Unterhalt
(Familienrecht), Zugewinnausgleich, Pflichtteilsrechner (Erbrecht), Abfindungs- und
Kündigungsfristenrechner (Arbeitsrecht), Schmerzensgeld-Tabellen + Haftungsquoten-DB
(Verkehrsrecht), Mieterhöhungs-Rechner (Mietrecht), GKG-/GNotKG-Gerichtskostenrechner
(RVG existiert schon — Gerichtskosten fehlen). Jedes Paket = ein konkreter Fachanwalts-Kaufgrund.
Architektonisch ins bestehende `industry-pack.ts`-Muster als "Rechtsgebiets-Packs".

### B8 — Diktat-Workflow ◧ TEILWEISE (mobile Voice-Notes existieren)

Professioneller Diktat-Loop fehlt: Diktat (mobil/desktop) → Whisper-Transkription mit
Legal-Vokabular → Korrektur-Queue fürs Sekretariat → als Schriftsatz-Entwurf in die Akte.
Anwälte über 45 diktieren — das ist der halbe Markt.

### B9 — Online-Terminbuchung + Mandats-Funnel ⬛ FEHLT

Selbstbuchung für Erstberatungen (Calendly-artig, mit Konfliktcheck VOR Terminvergabe!),
Honorar-Angebots-Generator, Mandatsvereinbarung mit E-Signatur direkt im Funnel
(DocuSign-Loop existiert schon — nur der Funnel davor fehlt). Lead → Mandat in einem Fluss.

---

## C — Innovations-Moat (womit wir Harvey UND Clio gleichzeitig schlagen)

### C1 — Der autonome Sachbearbeitungs-Loop (Leuchtturm-Feature)

Alle Bausteine existieren einzeln: beA/E-Mail-Eingang → Analyze → Fristextraktion →
Insights → Drafting mit Vier-Augen → Rundown. Es fehlt die **Verkettung als ein autonomer,
konfigurierbarer Loop**: Eingehende Klageschrift wird nachts automatisch analysiert, Fristen
notiert (Vier-Augen-pending), Erwiderungs-Skelett mit Tatsachen-Tabelle + Beweislücken-Liste als
Entwurf erstellt, morgens im Rundown präsentiert: "Akte X: Klage eingegangen, Frist notiert,
Entwurf liegt bereit — 3 offene Fragen an Sie." Das kann heute **niemand** am Markt end-to-end,
und wir sind zu ~70% dort. Positionierung: "Ihre Kanzlei arbeitet nachts weiter."

### C2 — Passive Zeiterfassung ausbauen ◧ FUNDAMENT EXISTIERT (`api/time/auto-extract`)

Heute: KI-Extraktion aus WhatsApp/Chat-Konversationen. Ausbau: alle Aktivitätsquellen
(geschriebene E-Mails, bearbeitete Dokumente, Telefonate via CTI, Recherche-Sessions) → täglicher
"unerfasste Zeit"-Vorschlag pro Akte im Rundown. Kanzleien verlieren 20-30% abrechenbarer Zeit
durch Nichterfassung — das Feature **bezahlt das Produkt selbst** und ist das beste
Vertriebsargument gegen jeden Wettbewerber ("Subsumio verdient sein Geld selbst").

### C3 — Red-Team-Agent ("Gegner-Simulation")

Bestehende Agent-Infrastruktur (Supervisor, DAG) nutzen: Ein Agent argumentiert die **beste
Version des gegnerischen Vortrags** gegen den eigenen Schriftsatz-Entwurf, mit Grounding gegen
Rechtsprechungs-Korpus. Output: Schwachstellen-Liste + Gegenargument-Vorschläge. Kein Anbieter
hat das produktiv; unsere Grounding-Pipeline macht es vertrauenswürdig statt halluzinierend.

### C4 — Mandanten-Chatbot im Portal (gated + grounded)

Das Portal hat Nachrichten — der häufigste Mandantenanruf ist aber "Wie ist der Stand?". Ein
grounded Chatbot im Portal, der NUR aus dem freigegebenen Aktenstand antwortet (bestehende
Grounding-/Privilege-Infrastruktur!), mit Eskalation an den Anwalt bei allem Inhaltlichen,
reduziert Sekretariats-Last messbar. Ethical-Wall/Privilege-Enforcement existiert bereits als
Fundament (`ethical-wall.ts`, AI-Provider-Policy nach Privilege-Level).

### C5 — Massenverfahren-Modul

Diesel, Fluggastrechte, Datenschutz-Massenklagen: Bulk-Import von Mandaten (CSV/API),
Template-gesteuerte Massen-Schriftsatzerzeugung, Batch-beA-Versand (baut auf A3 auf),
Sammel-Fristenverwaltung, Portfolio-Statusboard. Legal-Tech-Volumenkanzleien sind die am
schnellsten wachsenden Kunden und haben heute nur Eigenbau-Lösungen.

### C6 — Entscheider-Analytics (rechtlich geprüft einführen)

Gerichts-/Kammer-spezifische Auswertung veröffentlichter Entscheidungen (Verfahrensdauer,
Vergleichsquoten, Tendenzen) aus dem bestehenden Judgements-Korpus. **Achtung:** In Frankreich
verboten, in DE zulässig aber sensibel — als opt-in Analytics-Feature mit klarer Datenbasis
(nur veröffentlichte Entscheidungen) bauen, Rechtsprüfung vorschalten. Lex-Machina-Äquivalent
für DACH existiert nicht — First-Mover-Chance.

### C7 — Peer-Benchmarking (Netzwerkeffekt)

Anonymisierte Kennzahlen über alle Subsumio-Kanzleien: Realisationsquote, Durchlaufzeiten,
Umsatz je Rechtsgebiet vs. anonymer Durchschnitt. Schafft Daten-Moat, der mit jedem Kunden
wächst und für Incumbents unerreichbar ist. Datenschutz: nur aggregiert, opt-in, k-Anonymität.

### C8 — Dokumenten-Interviews (Fragebogen → Dokument)

Templates mit Variablen existieren; es fehlt der geführte Interview-Modus (BRYTER/Lawlift-artig):
Fragebogen definieren → Mandant füllt ihn im Portal selbst aus → Dokument entsteht fertig
ausgefüllt in der Akte. Verbindet Templates + Portal + Document-Requests zu einem Selbstbedienungs-
Workflow.

---

## D — Enterprise & Vertrieb

### D1 — Self-Hosted/Private-Cloud als Produkt formalisieren

Die Architektur kann es bereits (Hetzner-Deploy, Postgres/PGLite, EU-AI-Provider-Policy pro
Privilege-Level schon im Code!). Fehlt: das **Angebot** — dokumentiertes Self-Hosted-Paket,
AVV-Vorlagen, BSI-C5/ISO-27001-Roadmap. "Ihre Mandantendaten verlassen nie Ihre Infrastruktur"
schlägt Harvey (US-Cloud) im DACH-Vertrieb bei jeder Großkanzlei.

### D2 — Ethical-Wall-Verwaltungs-UI ◧ ENFORCEMENT EXISTIERT, UI FEHLT

`ethical-wall.ts` erzwingt blocked_users + AI-Provider-Policy — aber es gibt keine sichtbare
Verwaltungsoberfläche (Wall pro Akte einrichten, betroffene Nutzer sehen, Audit der Wall-Zugriffe).
Kleiner Aufwand, großer Enterprise-Haken auf der Feature-Matrix.

### D3 — Öffentliche API + Automations-Ökosystem

API-Keys existieren; fehlt: dokumentierte öffentliche REST-API, Webhook-Verzeichnis,
Zapier/Make-Connector. Jede Kanzlei ab 20 Anwälten fragt danach in der Ausschreibung.

### D4 — White-Label-Mandanten-App

Portal existiert (Web); eine installierbare PWA/App mit Kanzlei-Branding + Push ("Ihr Anwalt hat
ein Dokument für Sie") macht das Portal vom Feature zum Mandantenbindungs-Instrument.

---

## E — Bekannte technische Restposten (aus plan-remaining-dimensions.md, unverändert offen)

1. `/security-review` — nie durchgeführt, vor Go-Live Pflicht
2. Playwright-E2E für die kritischen Loops (Fristen-Sync, DocuSign, Aktenschließung, Portal)
3. `/design-review` + `/qa` — visueller Feinschliff, Copilot-Bedienbarkeit real testen
4. Performance/Skalierung (1000+ Akten), Insights-Berechnung cachen
5. Kalender-Zwei-Wege-Sync (→ jetzt Teil von B2)
6. Portal "Phase 5" (separates mandantenseitiges Deployment)
7. Push-Notification-Setup-Wizard (APNs/FCM heute stiller No-Op ohne Env-Vars)
8. Onboarding-Reibung (WhatsApp-Frage mitten im Flow)
9. i18n-Vollsweep außerhalb des Portals; Barrierefreiheits-Audit

---

## Priorisierte Reihenfolge (Empfehlung)

| Welle                | Inhalt                                                                | Begründung                                                                          |
| -------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **1 — Pflicht**      | A1 (XRechnung/ZUGFeRD), E1 (Security-Review), E2 (E2E-Tests)          | Gesetzliche Pflicht + Go-Live-Absicherung                                           |
| **2 — Verdrängung**  | B1 (Einheits-Posteingang), A3 (beA-Versand), B2 (Outlook)             | Die drei Features, an denen ein Wechsel von RA-MICRO real scheitert oder gelingt    |
| **3 — Moat**         | C1 (autonomer Loop), C2 (passive Zeiterfassung)                       | Leuchtturm + Selbstfinanzierungs-Argument; beides zu >60% aus Bestandsteilen baubar |
| **4 — Umsatzbreite** | B6 (FiBu/Zahlungen), B3 (Mahnverfahren), B7 (Fachrechner), A2 (QR-CH) | Erschließt Praxis-Segmente, die heute gar nicht kaufen können                       |
| **5 — Skalierung**   | C4-C8, D1-D4, B4/B5/B8/B9, Rest E                                     | Enterprise, Netzwerkeffekte, Nischen                                                |

**Ein Satz zur Einordnung:** Wellen 1-2 machen uns **kaufbar**, Welle 3 macht uns **unkopierbar**,
Wellen 4-5 machen uns **unumgänglich**.
