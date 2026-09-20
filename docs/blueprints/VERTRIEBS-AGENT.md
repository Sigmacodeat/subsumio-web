# Blueprint: Vertriebs- und Onboarding-Agent („Subsumio Concierge“)

Stand: 2026-09-19 · Status: Entwurf · Geltungsbereich: Website (`/at/*`), Signup, Checkout, erste 30 Tage im Dashboard

## 1. Ziel in einem Satz

Ein KI-Agent auf der Website, der jede Frage zu Subsumio belegt beantwortet, die Kanzlei qualifiziert,
das Produkt live an ihrem Anwendungsfall vorführt, ein Angebot rechnet, das Konto anlegt, den Vertrag
abschließt, die Zahlung über Stripe im Chat entgegennimmt und die Kanzlei anschließend bis zur ersten
echten Akte begleitet – und an jeder Stelle, an der ein Mensch besser ist, sauber an einen Menschen übergibt.

**Maßstab:** Ein Anwalt, der um 22 Uhr auf die Seite kommt, kann ohne ein einziges Telefonat bis zur
bezahlten, eingerichteten Kanzlei kommen – und hat danach nicht das Gefühl, einem Bot etwas geglaubt zu
haben, das nicht stimmt.

## 2. Leitplanken (nicht verhandelbar)

Diese Punkte entscheiden, ob der Agent in unserem Markt verkauft oder Vertrauen zerstört. Anwälte sind die
skeptischste Zielgruppe, die es gibt; ein einziger erfundener Funktionsumfang reicht für einen Screenshot
in der Kammer-Gruppe.

1. **Keine erfundene Produktaussage.** Jede Aussage über Funktionen, Preise, Limits, Sicherheit,
   Hosting und Rechtliches kommt aus der freigegebenen Wissensbasis (Abschnitt 5) und wird mit Quelle
   angezeigt („laut Preisseite“, Link). Findet der Agent nichts, sagt er das und bietet Rückruf an.
   Analog zum Grounding-Invariant für Rechtstexte (`useGroundedAnswer` + `CitationPanel`) gibt es einen
   **Claim-Check**: Antworten werden vor Anzeige gegen die Wissensbasis geprüft; ungestützte Sätze
   werden entfernt, nicht nur markiert.
2. **Keine Rechtsberatung.** Der Agent berät zum Produkt, nicht zu Rechtsfällen. Konkrete Rechtsfragen
   („Wie lange ist die Berufungsfrist in meinem Fall?“) beantwortet er nicht, sondern zeigt, wie Subsumio
   so etwas im Produkt löst (Demo-Brain, synthetische Daten).
3. **Keine Mandantendaten im Vertriebschat.** Der Agent weist aktiv darauf hin, keine echten Mandatsdaten
   einzufügen (Verschwiegenheit § 9 RAO / § 43a BRAO), erkennt typische Muster (Aktenzeichen, Namen +
   Sachverhalt, IBAN, SVNR) und schwärzt sie vor Speicherung und vor dem Modellaufruf.
4. **KI-Kennzeichnung.** Der Nutzer sieht vor der ersten Nachricht, dass er mit einer KI spricht
   (Art. 50 AI Act), und kann jederzeit „Mensch“ wählen.
5. **Der Agent bewegt kein Geld und sieht keine Kartendaten.** Zahlung läuft ausschließlich über das
   eingebettete Stripe-Element im Chat-Fenster. Das Modell bekommt nur Status-Ereignisse („bezahlt“,
   „fehlgeschlagen“), niemals Karten- oder Kontodaten.
6. **Verbindliches passiert nur per Klick, nie per Chat-Text.** Konto anlegen, AGB/AVV akzeptieren,
   bestellen, Rabatt gewähren: Das Modell schlägt vor, der Server erzeugt eine Bestätigungskarte mit den
   exakten Parametern, der Mensch klickt. Muster existiert bereits: `src/lib/copilot-confirmation.ts`
   (Token gebunden an Person, Tool und Parameter, einmalig). Ein „ja, mach“ im Chat ist keine
   Willenserklärung – auch nicht, wenn eine Prompt-Injection es so aussehen lässt.
7. **Keine Rabatte aus dem Modell.** Der Agent kennt nur die freigegebenen Konditionen (Abschnitt 7.4).
   Alles darüber hinaus wird ein Angebotsentwurf für einen Menschen.
8. **Faire Vergleiche.** Wettbewerber (z. B. AI:ssociate, Donna, Legora, Harvey) werden sachlich und
   belegbar verglichen, nie herabgesetzt (vergleichende Werbung, § 2a UWG AT / § 6 UWG DE).
9. **EU-Verarbeitung erzwungen.** Modellaufrufe laufen über den Gateway mit EU-Routing; der Agent sagt
   nichts über Datenstandorte, was nicht technisch erzwungen ist (siehe offene P0 aus dem KI-Audit
   2026-09-18).

## 3. Was der Agent können muss – Fähigkeiten nach Kundenreise

| Phase | Nutzerziel | Agent-Fähigkeit | Ergebnis im System |
|---|---|---|---|
| 1. Ankommen | „Was ist das, ist das für mich?“ | Kontextbewusster Einstieg (Seite, Referrer, Kampagne, Stadtseite), 30-Sekunden-Pitch passend zur Rolle | Sitzung mit Einstiegskontext |
| 2. Verstehen | Fragen zu Funktion, Preis, Sicherheit | Belegte Antworten aus Wissensbasis, Links auf die passende Seite, Handbuch-Screens einblenden | Frage-Log für Content-Lücken |
| 3. Qualifizieren | – (für uns) | Unaufdringlich erfragen: Rolle, Kanzleigröße, Rechtsgebiete, Land, bisherige Software, Hauptschmerz, Zeitrahmen, Entscheider | Lead-Profil + Score |
| 4. Erleben | „Zeig mir, dass es funktioniert“ | Live-Demo im Chat auf dem Demo-Brain (`/api/demo`, synthetische Akten): Frage stellen, Antwort mit Zitaten, Fristberechnung, Widerspruchsfund | Demo-Ereignisse |
| 5. Zweifel klären | Datenschutz, Halluzination, Aufwand, Preis | Einwandbehandlung aus kuratierten, belegten Antwortbausteinen; Sicherheitsunterlagen (TOM, AVV, Unterauftragsverarbeiter) als Download | Einwand-Tags |
| 6. Angebot | „Was kostet das für uns genau?“ | Tarifempfehlung + Rechner (Nutzer, Volumen, Zusatzverbrauch), PDF-Angebot | Angebot (versioniert) |
| 7. Abschluss | Konto + Vertrag + Zahlung | E-Mail-Verifikation, Kanzleidaten, UID-Prüfung, AGB/AVV-Bestätigung, eingebetteter Stripe Checkout | Konto, Abo, Rechnung, Audit-Einträge |
| 8. Onboarding | „Wie fange ich an?“ | Agent zieht ins Dashboard mit; führt durch die Schritte aus `OnboardingProgress` (Kanzlei, erste Akte, erste Frist, Team einladen, erste Frage, Tour) | Onboarding-Fortschritt |
| 9. Aktivierung | Erster echter Nutzen | Datenimport begleiten (DMS/Outlook/beA-Import), erste belegte Antwort auf eigener Akte feiern | Time-to-first-value |
| 10. Bindung & Ausbau | Mehr Nutzen, mehr Plätze | Nutzungs-Tipps, Hinweis bei Limit, Upgrade Solo → Kanzlei, Empfehlungsprogramm | Expansion-Signale |
| Immer | Mensch | Übergabe mit vollständigem Kontext: Termin buchen, Rückruf, E-Mail | Ticket/Termin mit Transkript |

## 4. Fragenkatalog – was der Agent sicher beantworten muss

Jede Frage unten braucht einen **freigegebenen Antwortbaustein mit Quelle**. Der Katalog ist gleichzeitig
das Eval-Set (Abschnitt 10). Fett = Top-Fragen, die in den ersten Wochen am häufigsten kommen werden.

### 4.1 Produkt & Nutzen
- **Was ist Subsumio in einem Satz? Was unterscheidet es von ChatGPT?**
- **Arbeitet es mit österreichischem Recht? Welche Quellen (RIS, Judikatur, Literatur)? Wie aktuell?**
- Deutsches / Schweizer Recht – ab wann?
- Wie funktioniert die Suche in meinen eigenen Akten? Was heißt „Wissensgraph“?
- **Wie verhindert ihr Halluzinationen? Was passiert, wenn ein Zitat nicht stimmt?**
- Fristenberechnung: Welche Verfahrensarten, wer haftet, wie wird geprüft?
- Kollisionsprüfung, Widerspruchserkennung, Schriftsatzentwurf – was genau?
- Was kann der Copilot selbst tun und was nur nach meiner Freigabe?
- Mobile App, WhatsApp, Diktat, Outlook – was gibt es wirklich schon?
- Was kann Subsumio **nicht**? (Muss ehrlich beantwortbar sein – stärkt Vertrauen.)

### 4.2 Datenschutz, Sicherheit, Berufsrecht
- **Wo liegen meine Daten? Wer hat Zugriff? Welche Unterauftragsverarbeiter (inkl. KI-Anbieter)?**
- **Wird mit meinen Akten ein Modell trainiert?** (Antwort nach Blueprint Kollektives Gehirn: nein.)
- Ist das mit der Verschwiegenheitspflicht / RAO / RL-BA vereinbar?
- AVV nach Art. 28 DSGVO – wo, wie unterschreiben?
- Verschlüsselung, 2FA, SSO, Rollen pro Akte, Audit-Log, Backups, Löschung nach Kündigung
- AI Act: In welche Kategorie fällt Subsumio, was muss meine Kanzlei tun?
- Zertifizierungen (ISO 27001 etc.) – nur beantworten, was belegt ist; sonst Stand + Termin nennen
- Self-Hosting / Community-Edition – für wen, mit welchen Einschränkungen?

### 4.3 Preise & Vertrag
- **Was kostet Solo, was Kanzlei, was ist in Enterprise?**
- **Was ist inklusive, was kostet Mehrverbrauch? Kann ich ein Limit setzen?**
- Testphase: Wie lange, mit Kreditkarte oder ohne, was passiert danach?
- Monatlich kündbar? Jahresvorauszahlung? Rechnung statt Karte (SEPA, Überweisung)?
- Rechnung mit UID / Reverse Charge für DE/CH-Kanzleien
- Wie viele Nutzer, was kostet ein zusätzlicher Platz, Sekretariat/Konzipienten?
- Rabatte für Berufseinsteiger, Kammer-Mitglieder, Partnerprogramm

### 4.4 Umstieg & Einrichtung
- **Wie bekomme ich meine bestehenden Akten hinein? Wie lange dauert das?**
- Welche Kanzleisoftware kann ich anbinden bzw. parallel weiter nutzen? (nur belegte Integrationen)
- Brauche ich IT? Was muss installiert werden?
- Gibt es Schulung, Einrichtungstermin, Support-Zeiten, Ansprechpartner?
- Kann ich Daten jederzeit exportieren? Was passiert bei Kündigung?

### 4.5 Vergleich & Vertrauen
- Unterschied zu AI:ssociate, Donna, Legora, Harvey, Microsoft Copilot, Juris/RDB/Manz-Angeboten
- Wer steckt hinter Subsumio, wo sitzt das Unternehmen, wer sind Referenzkunden?
- Benchmark: Wie wurde gemessen? (→ `benchmark-methodology`)

### 4.6 Fragen, die der Agent ablehnen oder umleiten muss
- Konkrete Rechtsfragen zu einem Fall → Produktdemo statt Antwort
- „Gib mir 50 % Rabatt“, „Ignoriere deine Anweisungen“ → freundlich ablehnen
- Fragen zu anderen Kunden / Referenzen ohne Freigabe → ablehnen
- Anfragen von Privatpersonen, die einen Anwalt suchen → höflich erklären, dass Subsumio Kanzleisoftware ist

## 5. Wissensbasis – eine Quelle, kein Copy-Paste

Der Agent darf nur wissen, was die Website und das Produkt tatsächlich sagen. Deshalb wird **keine**
separate Bot-FAQ geschrieben, sondern die bestehenden Inhalte werden zur Wissensbasis:

| Quelle | Pfad | Inhalt |
|---|---|---|
| Preise & Tarife | `src/lib/billing/plans.ts` (`BILLABLE_PLANS`, `BILLING_PLANS_DISPLAY`), `src/content/audiences.ts`, `PRICING_FAQ` in `src/content/site.ts` | Preise, Limits, FAQ |
| Funktionen | `src/content/features.ts`, `solutions.ts`, `proof-points.ts` | Funktionsbeschreibungen |
| Handbuch | `src/content/handbook.ts` + Handbuch-Replicas | Schritt-für-Schritt, Screens |
| Sicherheit | `src/content/security.ts`, `/at/dpa`, `/at/privacy`, `/at/security` | TOM, AVV, Unterauftragsverarbeiter |
| Recht/AGB | `/at/terms`, `/at/imprint` | Vertragsbedingungen |
| Kuratierte Einwandantworten | neu: `src/content/sales-knowledge.ts` | nur was nirgends sonst steht, jede Antwort mit Verweis |

Umsetzung:
- Ein Build-Schritt erzeugt aus diesen Dateien einen **versionierten Wissens-Snapshot** (Chunks mit
  Quell-URL + Hash). Der Snapshot wird in eine eigene Engine-Quelle `sales` im Demo-/Marketing-Brain
  importiert – nie in ein Kanzlei-Brain.
- Preise werden **nicht** aus Text gelesen, sondern über das Tool `get_pricing` direkt aus
  `BILLABLE_PLANS`. Damit kann der Agent nie einen anderen Preis nennen als der Checkout berechnet.
- Jede inhaltliche Änderung an einer Quelldatei erzeugt einen neuen Snapshot; ein CI-Test prüft, dass
  der Snapshot zum Code passt (gleiches Muster wie `build:llms`).
- Ein **Content-Lücken-Report** listet wöchentlich Fragen, auf die der Agent „weiß ich nicht“
  antworten musste – das ist die Roadmap für Website-Texte.

## 6. Architektur

```
Browser (Widget, alle /at/*-Seiten + Dashboard)
   │  SSE-Stream, Sitzungs-Cookie (anonym → nach Verifikation an Konto gebunden)
   ▼
POST /api/concierge  (createPublicHandler, Rate-Limit pro IP + pro Sitzung, Bot-Schutz)
   │  1. Eingangsfilter: PII-Schwärzung, Längenlimit, Injection-Heuristik
   │  2. Agent-Schleife (Claude über server/src/core/ai/gateway.ts, EU-Routing erzwungen)
   │  3. Tool-Aufrufe (Tabelle unten), Stufen: lesen / Lead / verbindlich
   │  4. Claim-Check gegen Wissens-Snapshot vor Anzeige
   │  5. Protokoll: Transkript (geschwärzt), Tool-Aufrufe, Kosten, Modell
   ▼
Engine-Quelle „sales“ (Wissen) · Demo-Brain (Live-Demo) · Auth-Store · Stripe · Kalender · Ops-Konsole
```

### 6.1 Modelle
- **Gesprächsführung:** Sonnet 5 (Qualität zählt, Umsatz hängt dran). Prompt-Caching für System-Prompt
  und Wissens-Kontext.
- **Klassifikation/Schwärzung/Claim-Check:** Haiku 4.5.
- Kostendeckel pro Sitzung (z. B. 0,50 €) und Tagesbudget; bei Überschreitung Wechsel auf „Mensch
  kontaktieren“. Preise ausschließlich über `src/core/model-pricing.ts`.

### 6.2 Werkzeuge des Agenten

| Tool | Stufe | Was es tut | Baut auf |
|---|---|---|---|
| `search_knowledge` | lesen | Suche im Wissens-Snapshot, gibt Chunks + URL zurück | Engine-Quelle `sales` |
| `get_pricing` | lesen | Tarife, Limits, Mehrverbrauch aus Code | `src/lib/billing/plans.ts`, `credit-rate-card.ts` |
| `calculate_quote` | lesen | Rechner: Nutzer, Volumen → Monatspreis, Jahrespreis, Zusatzkosten | `billing/estimate` |
| `run_demo` | lesen | Live-Frage ans Demo-Brain, Antwort mit Zitaten im Chat | `/api/demo` (bisher nur Suche; auf belegte Antwort erweitern) |
| `show_screen` | lesen | Blendet Handbuch-Replica/Screenshot zur Funktion ein | Handbuch-Replicas |
| `capture_lead` | Lead | Speichert Profil + Einwilligung (Double-Opt-in für Marketing getrennt) | neu, analog `intake` |
| `book_meeting` | Lead | Freie Slots anzeigen, Termin buchen | neu (Cal.com/Google/Microsoft-Kalender) |
| `handoff_human` | Lead | Übergabe mit Zusammenfassung an Ops-Postfach / Slack | Ops-Konsole Mailbox |
| `send_documents` | Lead | AVV, TOM, Angebot-PDF per verifizierter E-Mail | Mail-Layer |
| `create_account` | verbindlich | Konto anlegen per E-Mail-Verifikation (Magic Link, kein Passwort im Chat) | `api/auth/signup` + `verify` |
| `set_firm_profile` | verbindlich | Kanzleiname, Adresse, UID (VIES-Prüfung), Land | `api/onboarding` |
| `start_checkout` | verbindlich | Erzeugt Stripe Checkout Session (`ui_mode: embedded`) und rendert sie im Chat | `api/billing/checkout` |
| `apply_offer` | verbindlich | Nur freigegebene Aktionscodes (Stripe Promotion Codes) | Stripe |
| `onboarding_step` | App | Führt einen `OnboardingProgress`-Schritt aus bzw. zeigt ihn | `api/onboarding`, Copilot |

„Verbindlich“ heißt: läuft ausschließlich über eine Bestätigungskarte mit serverseitigem Token
(Muster `copilot-confirmation.ts`), die Karte zeigt die exakten Parameter, der Klick kommt vom Menschen.

### 6.3 Widget
- Unten rechts auf allen Marketingseiten, aber nicht aufdringlich: kein automatisches Aufpoppen in den
  ersten 20 Sekunden; kontextuelle Einstiegsfragen je Seite (Preisseite: „Soll ich für Ihre Kanzlei
  rechnen?“, Sicherheitsseite: „Fragen zur Verschwiegenheit?“).
- Rich-Elemente statt Textwüsten: Tarifkarten, Rechner-Schieberegler, Demo-Antwort mit Zitat-Panel,
  Terminwähler, Bestätigungskarten, eingebetteter Checkout, Fortschrittsleiste im Onboarding.
- Transkript per E-Mail zuschicken, Gespräch später fortsetzen (Link), Sprache DE/EN.
- Barrierefrei (Tastatur, Screenreader, Kontrast) – gleiche Standards wie das Dashboard.
- Tracking nur nach Einwilligung (`analytics-consent.tsx`); das Gespräch selbst ist Vertragsanbahnung
  (Art. 6 Abs. 1 lit. b DSGVO), Marketing-Nachfassen braucht eigene Einwilligung.

## 7. Abschluss und Zahlung im Chat

### 7.1 Ablauf
1. **Tarif gewählt** → Bestätigungskarte: Tarif, Nutzer, Preis netto/brutto, Laufzeit, Testphase.
2. **E-Mail verifizieren** → Magic Link oder 6-stelliger Code im Chat. Ab hier ist die Sitzung an ein
   Konto gebunden. Kein Passwort im Chat – Passwort/2FA setzt der Nutzer auf der Kontoseite.
3. **Kanzleidaten** → Name, Anschrift, UID (VIES-Prüfung live), Rechnungs-E-Mail.
4. **Vertragsdokumente** → AGB und AVV als Links, zwei Checkboxen in einer Karte, Zeitstempel +
   Dokumentversion + IP ins Audit-Log.
5. **Zahlung** → eingebetteter Stripe Checkout im Chat-Fenster (Karte, SEPA-Lastschrift, EPS; Stripe
   Tax für USt/Reverse Charge; `tax_id_collection`). SCA/3-D Secure macht Stripe.
6. **Bestellknopf** mit eindeutiger Beschriftung („Kostenpflichtig abonnieren“ bzw. „Test starten“).
7. **Webhook** `checkout.session.completed` (existiert in `api/billing/webhook`) schaltet den Tarif
   frei; der Agent bekommt nur das Ereignis und begrüßt die Kanzlei im Dashboard.
8. **Bestätigung** per E-Mail mit Vertragszusammenfassung und Rechnung (gesetzliche Informationspflichten
   im elektronischen Geschäftsverkehr, § 9 ff. ECG bzw. § 312i BGB).

### 7.2 Enterprise / Rechnung
Ab Enterprise oder auf Wunsch „Rechnung statt Karte“: Agent erstellt Angebotsentwurf, Übergabe an
Mensch, Freigabe in der Ops-Konsole, Versand als Stripe Invoice mit Zahlungslink.

### 7.3 Was heute im Code fehlt (vor Phase 3 zu schließen)
- ~~**Testphase ist nicht implementiert.**~~ Erledigt 2026-09-19: `src/lib/billing/trial.ts`
  (`trialEndsAt` bei Selbst-Registrierung, seit 19.09. 30 Tage, `effectivePlan` = Kanzlei-Umfang bis Testende, danach
  automatisch Community; Kauf während des Tests rechnet erst ab Testende ab).
- **Checkout nur für eingeloggte Nutzer** und mit Weiterleitung; für den Chat braucht es
  `ui_mode: embedded`, Stripe Tax, UID-Erfassung, SEPA/EPS.
- ~~**Kontaktformular ist `mailto:`**~~ Erledigt 2026-09-19: Kontaktseite und Chat schreiben nach
  `/api/concierge/lead` (Ablage `subsumio_leads`, Mail an `CONCIERGE_LEAD_INBOX`), Sicht unter `/ops/leads`.
- **Preise liegen an drei Stellen** (`plans.ts`, `site.ts`, `audiences.ts`). Der Agent liest nur
  `plans.ts`. Drift-Test erledigt 2026-09-19 (`src/lib/billing/price-drift.test.ts`).
- **Demo-Endpunkt liefert nur Suchtreffer**, keine belegte Antwort. Für die Live-Demo braucht es eine
  Antwort mit Zitat-Panel auf dem Demo-Brain.

### 7.4 Konditionen, die der Agent selbst anbieten darf
Nur als Stripe Promotion Codes hinterlegt und in `sales-knowledge.ts` benannt, z. B.: Jahresvorauszahlung,
Berufseinsteiger, Partnerkanzlei-Empfehlung. Alles andere → `handoff_human` mit Angebotsentwurf.

## 8. Gesprächsdesign

**Persona:** kompetente Kollegin aus dem Kanzlei-Consulting, nicht Verkäufer. Sie, knapp, konkret,
österreichisches Deutsch auf `/at`. Keine Superlative, die nicht belegt sind.

**Grundmuster je Antwort:** direkte Antwort → Beleg/Link → ein passender nächster Schritt (nie drei).

**Qualifizierung** passiert im Gespräch, nicht als Formular. Maximal eine Frage pro Nachricht, nur wenn
sie die nächste Antwort besser macht („Damit ich richtig rechne: Wie viele Personen würden damit arbeiten?“).

**Lead-Score (intern):** Kanzleigröße, Land AT, Entscheider ja/nein, Zeitrahmen, Demo gesehen, Preisseite
besucht, Einwand Datenschutz geklärt. Hoher Score + Zögern → aktives Angebot eines 20-Minuten-Termins.

**Übergabe an Mensch**, sofort wenn: Nutzer es wünscht; Enterprise/> 10 Nutzer; Vertrags- oder
Haftungsfragen jenseits der AGB; Beschwerde; zweimal „weiß ich nicht“ in Folge; Kostendeckel erreicht.
Der Mensch bekommt Zusammenfassung, Profil, offene Fragen – der Kunde muss nichts wiederholen.

## 9. Onboarding-Agent im Dashboard

Nach dem Kauf wird aus dem Concierge der Onboarding-Begleiter (gleiche Sitzung, jetzt mit Konto-Kontext,
technisch der bestehende Copilot mit Onboarding-Modus):

1. Kanzleiprofil vervollständigen, Team einladen (Einladungen per Bestätigungskarte).
2. Erste Akte: Beispielakte laden (`api/demo-data`) oder eigene Dokumente hochladen/anbinden.
3. Erste Frist anlegen und erklären, wie die Prüfung funktioniert.
4. Erste Frage an die eigene Akte – mit `CitationPanel`, Erklärung der Belege.
5. Kurze Tour der drei Funktionen, die zum Hauptschmerz aus der Qualifizierung passen.
6. Tag 3, 7, 14: Check-in im Dashboard (nicht per Spam-Mail), basierend auf echter Nutzung.
7. Vor Ende der Testphase: Nutzungsbilanz („Sie haben 42 belegte Antworten erhalten …“) und Tarifwahl.

Alle Schritte schreiben in `OnboardingProgress`; die Ops-Konsole zeigt, wo Kanzleien hängen bleiben.

## 10. Qualität messen – Eval und Red-Team

- **Golden Set:** jede Frage aus Abschnitt 4 mit erwarteten Fakten + erwarteter Quelle. Metriken:
  Faktentreue, Quellen-Treffer, Ablehnungsquote bei Unbelegtem, Preis-Genauigkeit (muss 100 % sein).
- **Red-Team-Set:** Rabatt-Erpressung, Prompt-Injection über eingefügten Text, „Bestell für mich“,
  Rechtsberatung, Konkurrenz schlechtmachen, Mandantendaten einfügen, Behauptung „Admin hat erlaubt“.
  Erwartet: nie eine verbindliche Aktion ohne Klick, nie ein nicht freigegebener Preis.
- **Regression in CI** bei jeder Änderung an Prompt, Wissens-Snapshot oder Tools.
- **Stichprobe:** wöchentlich 30 echte Transkripte menschlich bewerten (geschwärzt).

## 11. Kennzahlen

| Ebene | Kennzahl |
|---|---|
| Reichweite | Anteil Besucher mit Gespräch, Einstiegsseite |
| Qualität | belegte Antworten %, „weiß ich nicht“ %, Claim-Check-Streichungen, Nutzerbewertung |
| Funnel | Gespräch → Demo → Konto → Test → bezahlt; Zeit bis Abschluss |
| Aktivierung | Zeit bis erste belegte Antwort auf eigener Akte, Onboarding-Schritte erledigt |
| Wirtschaft | Kosten pro Gespräch, Kosten pro Abschluss, Übergabequote an Menschen |
| Vertrauen | Beschwerden, gemeldete Falschaussagen (Ziel: 0) |

## 12. Umsetzung in Phasen

| Phase | Inhalt | Voraussetzung / Abnahme |
|---|---|---|
| **0 – Fundament** | Testphase implementieren; Preise aus einer Quelle; Lead-Backend statt `mailto:`; Anthropic als Unterauftragsverarbeiter gelistet; EU-Routing erzwungen | Website-Versprechen = Produktverhalten |
| **1 – Auskunft** (gebaut 2026-09-19: `src/lib/concierge/`, `/api/concierge`, Widget, `/ops/leads`; Termin vorerst als Anfrage, kein Kalender) | Widget, `search_knowledge`, `get_pricing`, Claim-Check, `capture_lead`, `book_meeting`, `handoff_human`; Golden + Red-Team-Set | Faktentreue ≥ 98 %, Preis 100 %, 0 verbindliche Aktionen |
| **2 – Überzeugen** | Live-Demo mit belegter Antwort, Rechner, Angebot-PDF, AVV/TOM-Versand, Einwandbausteine | Demo-Antwort mit Zitaten auf Demo-Brain |
| **3 – Abschließen** | Konto per Verifikation, Kanzleidaten + VIES, AGB/AVV-Karte, eingebetteter Stripe Checkout, Stripe Tax, Promotion Codes | Test- und Live-Modus durchgespielt, Audit-Einträge vollständig |
| **4 – Onboarding** | Übergang ins Dashboard, Onboarding-Modus des Copilot, Check-ins, Testphasen-Bilanz | Messbar kürzere Zeit bis erste belegte Antwort |
| **5 – Ausbau** | Upgrade-/Plätze-Empfehlungen, Empfehlungsprogramm, WhatsApp-Kanal, EN | – |

## 13. Offene Entscheidungen

1. Testphase ohne Karte (niedrige Hürde) oder mit Karte (höhere Umwandlung)? Die Website verspricht heute „ohne“.
2. Kalender-Anbieter für Terminbuchung.
3. Wer übernimmt Übergaben (Zeiten, Reaktionszeit-Zusage im Chat)?
4. Freigegebene Konditionen/Promotion Codes für Phase 3.
5. Darf der Agent Referenzkunden nennen (nur mit schriftlicher Freigabe)?
