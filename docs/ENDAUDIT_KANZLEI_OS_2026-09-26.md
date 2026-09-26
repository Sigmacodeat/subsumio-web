# Endaudit Subsumio Kanzlei-OS mit Gap-Analyse gegen den Markt

Stand: 26.09.2026, Code-Stand `6474e8d` (main).

**Grundlage:**

- Vier parallele Prüfungen:
  1. Defekte und Kanzlei-Grundfunktionen, am Code mit Datei und Zeile.
  2. Kommunikation, KI und Plattform.
  3. Engineering und Betriebsreife.
  4. Web-Recherche zum Wettbewerb (Stand September 2026).
- Das Audit vom 21.09. (`docs/AUDIT_KANZLEI_OS_WETTBEWERB_2026-09-21.md`) diente als Ausgangsmatrix. Jede Zeile wurde gegen den heutigen Code neu geprüft; Commit-Nachrichten allein zählen nicht als Beleg.

Aussagen über Konkurrenten stammen aus Herstellerseiten und Fachpresse. Einige Preise stammen aus Vergleichsblogs und sind als „indikativ“ markiert.

---

## 1. Urteil in zehn Sätzen

1. **Subsumio ist technisch das ambitionierteste Produkt im österreichischen Kanzleisoftware-Markt, und das mit Abstand.**
   - Kein etablierter AT-Anbieter kombiniert Aktenverwaltung, zitatgeprüfte KI, eigenen RIS-Korpus, Fristen-Engine mit Begründung und Agenten in einem System.
2. **Die Lücke im Markt ist real.** Kanzleisoftware hat Akten, aber kaum KI. Die KI-Anbieter (MANZ-Noxtua, Lexis Protégé, BEAMON, AI:ssociate) haben Inhalte, aber keine Akten. Nur Donna (Wien, Early Access) zielt auf dieselbe Kombination.
3. **Seit dem 21.09. hat sich viel getan.**
   - Von 14 kritischen Defekten sind 11 behoben, einer weitgehend und zwei teilweise.
   - Fast alle P0-Grundfunktionen sind jetzt da: Aktenzeichenkreis, Streitwert, Aufgaben, DOCX-Vorlagen und Serienbrief, AHK/NTG/GGG, Storno, BMD/RZL, camt.053, Erstanfrage, Terminbuchung, CTI.
4. **Es fehlen genau drei Dinge, ohne die eine österreichische Kanzlei nicht wechselt:** webERV-Versand, webERV-Eingang im Akt und Registerabfragen (Grundbuch, Firmenbuch, ZMR, GISA, Ediktsdatei). Alle drei sind **Partnerverträge, kein Code-Problem**. Die Adapter stehen.
5. **Das größte Risiko ist der Betrieb, nicht der Code.**
   - Es gibt einen einzigen Server ohne Staging und ohne Failover.
   - Am 18.09. lief die Platte voll: 25.272 Engine-Neustarts, bis dahin kein Backup.
   - Ein Offsite-Backup ist im Code vorbereitet, im Betrieb aber nicht nachgewiesen. Mail-Versand und Rotation der Zugangsdaten waren offen.
   - Ein SLA von 99,5 bis 99,9 % ist so nicht haltbar.
6. **Das zweite Risiko ist Breite vor Tiefe.**
   - 142 Dashboard-Seiten und 571 API-Routen in wenigen Wochen, gebaut im Wesentlichen von einer Person mit KI-Agenten.
   - Die Audit-Historie zeigt wiederholt Funktionen, die gebaut, aber nicht echt verdrahtet waren: „Legal Hold war Fake-Claim“, „OPOS war komplett tot“.
   - 14 Audit-Pakete (12a–13d, u. a. Mandantentrennung, Geld-Integrität, AT-Fristen) liegen im Code, sind im Ledger aber noch nicht als „live“ abgenommen.
7. **Die Codequalität ist für diese Größe ungewöhnlich gut.**
   - Etwa 1.000 Unit-Testdateien im Web-Teil und etwa 1.450 in der Engine, 49 E2E-Specs.
   - Zehn Invarianten-Guards in `bun run verify`, Engine-Parität PGLite/Postgres, Release- und Holdout-Gates für KI-Qualität.
   - Das ist ein echter Burggraben. Die meisten Wettbewerber in der Größe haben nichts davon.
8. **Die KI-Architektur liegt vor dem DACH-Markt, der Korpus noch nicht.**
   - Stärken: Grounding als erzwungene Invariante, EU-Only-Schalter, Evals in CI.
   - Der AT-Korpus deckt erst etwa 22 % der RIS-Entscheidungen ab, historische Fassungen fehlen fast ganz, und es gibt einen Embedding-Rückstand.
   - DE/CH-Sekundärliteratur fehlt praktisch. Beck-Noxtua und Lexis bringen Verlagsinhalte mit, die wir nicht haben.
9. **Der Wettbewerb kapitalisiert sich gerade massiv.**
   - Harvey hat 15,5 Mrd. $ Bewertung und über 350 Mio. $ ARR, Legora 5,6 Mrd. $ (Gespräche über ~8,5 Mrd. $) und ein Büro in München.
   - Noxtua hat über 100 Mio. € aufgenommen; C.H.Beck hält die Mehrheit, MANZ ist beteiligt. Clio hat 500 Mio. $ ARR und hat vLex übernommen.
   - Mit Harvey, Legora oder Noxtua kann Subsumio bei Inhalten und Enterprise nicht konkurrieren, **wohl aber bei Klein- und Mittelkanzleien in AT**. Dort ist keiner der Großen aktiv.
10. **Potenzial: ja, eindeutig. Aber nur mit Fokus.**
    - Der Weg zum Erfolg führt über fünf bis zehn echte Pilotkanzleien in Österreich, einen stabilen Betrieb und die drei Justiz-Partnerschaften.
    - Weitere Features bringen dabei nichts. Im Repo gibt es bisher keinen Nachweis einer zahlenden Kanzlei.

**Gesamtnote:** Produkt und Technik **8/10**, Marktreife **5/10**, Betriebsreife **3/10**.

---

## 2. Wie ich die Software finde (ehrliche Einschätzung)

**Was mich beeindruckt:**

- **Grounding als Architekturprinzip.** Jede KI-Ausgabe läuft zwingend durch `useGroundedAnswer` und `CitationPanel`. Das nutzen 25 Komponenten, es ist durch Tests abgesichert und durch ein CI-Skript erzwungen.
  - Das trifft den größten Schmerz im Markt: Laut Legal Tech Barometer 2026 müssen 70 % der österreichischen Anwälte KI-Ausgaben korrigieren.
  - Kein AT-Wettbewerber macht die Prüfung so sichtbar.
- **Fristen-Engine mit gesetzlicher Begründung.** Sie berücksichtigt verhandlungsfreie Zeit, Zustellfiktion nach § 89a GOG, Fristunterbrechung nach § 73 ZPO und die serverseitige Vier-Augen-Prüfung bei Notfristen. Das ist haftungsrelevant und besser als bei allen belegten Wettbewerbern.
- **Tarifrecht AT im Code:** RATG, AHK, NTG, GGG und Verzugszinsen mit OeNB-Historie, dazu eTHB-Entwurf und § 10a RAO. Das ist mühsame Fleißarbeit, die neue KI-Startups nicht haben.
- **Engineering-Disziplin:** Invarianten-Guards, Engine-Parität, Eval-Gates und viele Audit-Runden mit Belegen. Das ist ein Qualitätsniveau, das man sonst bei Scale-ups mit 30 Engineers sieht.
- **Ehrlichkeit im Produkt:**
  - `not_configured` statt Fake-Erfolg.
  - Connector-Labels wie „Nur über IT“.
  - Die Website-Aussagen wurden am 26.09. mit dem Produkt abgeglichen.

**Was mich besorgt:**

- **Oberfläche ohne Tiefe.** 142 Seiten sind für eine Pilotkanzlei eher Last als Nutzen. Jede Seite ist eine Stelle, an der ein Anwalt im Alltag auf einen Fehler stoßen kann.
  - Der Schritt vom 17.09., 14 unerprobte Bereiche zu parken, war richtig. Er sollte konsequent weitergehen.
- **Betrieb wie ein Nebenprojekt.** Es gibt eine VM, auf der auch ein Fremdprojekt läuft. Backups lagen zuletzt auf derselben Platte, und die Platte lief voll.
  - Für Mandantendaten unter § 9 RAO und § 40 Abs. 3 RL-BA ist das nicht vertretbar, sobald echte Akten im System liegen.
- **Bus-Faktor 1.** Ein Gründer schreibt praktisch alle Commits und parallelisiert mit KI-Agenten auf `main`; am 26.09. waren es 225 Commits an einem Tag.
  - Das ist produktiv, aber schwer überprüfbar.
  - Käufer, Investoren und die Kammer werden danach fragen.
- **Copilot-Tool-Aufrufe über Regex-Marker** (`[TOOL:…]`) statt nativem Tool-Use. Das ist bei Streaming fragil, ohne Schema-Garantie und schwächer gegen Prompt-Injection. Es ist die größte technische Schuld in der KI-Schicht.

---

## 3. Marktbild September 2026

### 3.1 Global: Kapital und Agenten

| Anbieter                     | Stand 2026                                                                                                                 | Relevanz für uns                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Harvey**                   | 15,5 Mrd. $ Bewertung (09/2026), >350 Mio. $ ARR, deutsches Team, Gleiss Lutz, Telekom                                     | Enterprise und Großkanzlei. Kein Wettbewerb in AT-Kleinkanzleien           |
| **Legora**                   | 5,6 Mrd. $, verhandelt über ~8,5 Mrd. $; Büro München, >80 DACH-Kunden (CMS, Görg, YPOG …); ~3.000 $ pro Nutzer und Jahr (indikativ) | setzt den Maßstab für Agenten-UX und Mandantenportale in Großkanzleien     |
| **Clio** (+vLex)             | 500 Mio. $ ARR; Manage + Work + Vincent; Clio Work seit 04/2026 standalone für kleine Kanzleien                           | **das globale Vorbild für unser Modell**; keine DACH-Präsenz in der Kanzleiverwaltung |
| **TR CoCounsel**             | neue Generation seit 08/2026: Deep Research, Drafting Agent in Word, Tabular bis 10.000 Dokumente                          | nicht in DACH                                                              |
| **Lexis+ mit Protégé**       | agentische Orchestrierung; in AT live, integriert mit jurXPERT                                                             | **direkter AT-Wettbewerber bei der Recherche**                             |
| **Smokeball / MyCase**       | Archie-Agent in Word und Outlook mit proaktiven nächsten Schritten; MyCase MCP-Server (09/2026)                            | Feature-Maßstab, nicht in DACH                                             |

### 3.2 DACH: Verlage plus KI haben sich formiert

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

### 3.3 Österreich: unser Launch-Markt

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

### 3.4 Nachfrage und Regulierung

- **Nachfrage:** 99 % der AT-Anwälte nutzen KI zumindest gelegentlich, 45 % mehrmals täglich (Legal Tech Barometer 2026). 44 % haben niemanden, der für KI zuständig ist, 27 % kein Budget. **Die Nachfrage ist da, die Kaufkraft pro Kanzlei ist klein.**
- **EU AI Act (Omnibus):** Die Hochrisiko-Pflichten wurden auf den 02.12.2027 verschoben. Kanzlei-KI ist in der Regel nicht Hochrisiko. Zwei Pflichten gelten schon:
  - Transparenz nach Art. 50 seit 02.08.2026.
  - KI-Kompetenz nach Art. 4.
- **AT-Berufsrecht:** § 9 RAO und § 40 Abs. 3 RL-BA regeln Cloud-Dienstleister. Die ÖRAK-Checkliste für KI-Anbieter zu unterzeichnen ist Pflichtprogramm (BEAMON hat es getan).
- **DE-Berufsrecht:** § 43e BRAO, dazu die beA-Pflicht.

---

## 4. Gap-Matrix: aktueller Stand

Legende:

- ✅ **echt:** Oberfläche, API und Speicherung sind verbunden.
- 🟡 **teilweise**
- ❌ **fehlt**

Die Spalte „21.09.“ zeigt den Stand des Vor-Audits.

### 4.1 Akte, DMS, Dokumente

| Fähigkeit                                  | 21.09. | Heute | Beleg / Rest                                                                                           |
| ------------------------------------------ | ------ | ----- | ------------------------------------------------------------------------------------------------------ |
| Aktenzeichen-Nummernkreis                  | ❌     | ✅    | `case-numbering.ts:75-93`; Rest: Fallback auf Zeitstempel, wenn die Vergabe scheitert (`cases/new/page.tsx:250`) |
| Streitwert an der Akte                     | ❌     | ✅    | `cases/new/page.tsx:283-291`                                                                           |
| Unterordner                                | ❌     | 🟡    | Ordnerbaum mit Drag-and-Drop; kein echtes Subakt-Konzept                                               |
| Versionen, Check-in und Check-out          | ❌     | 🟡    | Textversionen mit Sperre und Diff; **das Original wird nicht versioniert**                             |
| Papierkorb                                 | ⚪     | ✅    | `dashboard/papierkorb`                                                                                 |
| DOCX-Vorlagen, Serienbrief, Briefpapier    | ❌     | ✅    | `docx-template.ts`, `api/legal/docx-fill`                                                              |
| PDF-Werkzeuge                              | ❌     | 🟡    | Zusammenfügen, Stempeln, Nummerieren ✅; Schwärzung im Browser (gerastert)                             |
| Posteingangsbuch, Scan-Eingang             | ❌     | 🟡    | Register mit Aktenvorschlag; kein automatischer Scanner- oder Ordner-Eingang                           |
| Word-Add-in mit KI-Redlining               | 🟡/❌  | ✅    | Playbook-Redlining; **als markierter Text, nicht als echte Word-Änderungsverfolgung**                  |
| Outlook: Anhänge und Antwortentwurf        | 🟡     | ✅    | `outlook-addin/src/taskpane.ts`                                                                        |
| Legal Hold                                 | 🟡     | ✅    | `operations.ts:1894`; Rest: eine nicht lesbare Seite gilt nicht als gesperrt (`.catch(()=>null)`)     |
| OneDrive, SharePoint, Google Drive         | 🟡     | 🟡    | weiter nur über die Kommandozeile; WebDAV-Brücke vorhanden                                             |

### 4.2 Justiz und Register (Österreich): **der entscheidende Block**

| Fähigkeit                                                  | Heute | Rest                                                                     |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------------------ |
| **webERV-Versand**                                         | ❌    | Adapter-Vertrag steht (`court-channel.ts`), es fehlt der Übermittlungsstellen-Partner |
| **webERV-Eingang im Akt**                                  | 🟡    | nur ein Überwachungsordner auf dem Server (`erv-import.ts`), keine Einstellung in der Oberfläche |
| **Grundbuch, Firmenbuch, ZMR, GISA, Ediktsdatei**          | ❌    | generischer Adapter; ZMR, GISA und Ediktsdatei sind nicht einmal als Registerart angelegt |
| QES (ID Austria / A-Trust)                                 | 🟡    | Code vorhanden, kein PDF-AS-Dienst im Prod-Compose                       |
| eTHB                                                       | 🟡    | Meldung wird nur als Text erzeugt, keine elektronische Übermittlung     |
| RIS-Recherche                                              | ✅    | eigener Korpus, zitatgeprüft                                             |

### 4.3 Fristen, Kalender, Aufgaben

| Fähigkeit                                      | Heute | Rest                                                                                                      |
| ---------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| AT-Fristen-Engine (inkl. § 73 ZPO)             | ✅    | **besser als der Markt**                                                                                  |
| Vier-Augen bei Notfristen, serverseitig        | ✅    | `api/legal/fristen/second-check`                                                                          |
| Fristenbuch vollständig                        | ✅    | `failOnTruncate`                                                                                          |
| Erinnerung an die Vertretung                   | ✅    | `activeDelegateFor`                                                                                       |
| Outlook-Kalender pro Nutzer, in beide Richtungen | ✅  | Cron `outlook-user-sync`                                                                                  |
| Aufgaben mit Zuweisung                         | ✅/🟡 | **Neue Race-Gefahr:** Aufgaben liegen im Akten-Frontmatter und werden per Lesen-Ändern-Schreiben gespeichert; keine Benachrichtigung an die zuständige Person |
| Workflows „wenn X, dann Y“                     | ✅    | acht Ereignisse, Cron-Auswertung                                                                          |

### 4.4 Abrechnung und Finanzen

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

### 4.5 Mandanten und Kommunikation

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

### 4.6 KI

| Fähigkeit                                    | Heute | Einordnung                                                                    |
| -------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| Aktenchat und Recherche mit Zitatprüfung     | ✅    | **Vorsprung**                                                                 |
| Tabular Review, Widerspruchserkennung, Wissensgraph | ✅ | auf Harvey- und Legora-Niveau im Funktionsumfang                             |
| Agent mit Plan-Ansicht                       | ✅    | `planning-mode-panel.tsx`                                                     |
| „Nächste Schritte“ pro Akte                  | ✅    | `CaseNextStepsPanel`                                                          |
| Gedächtnis pro Nutzer                        | ✅    |                                                                               |
| MCP für Kanzleien                            | ✅    | Tokens als Hash gespeichert                                                   |
| Nativer Tool-Use im Copilot                  | ❌    | **Regex-Marker, technische Schuld**                                           |
| KI-Limits durch den Kanzlei-Admin            | 🟡    | nur über die Betreiber-Oberfläche; Spend-Cap lässt bei DB-Fehler alles durch  |
| EU-Only für Embeddings                       | 🟡    | braucht einen eigenen zweiten Schalter                                        |
| AT-Korpus                                    | 🟡    | ~22 % der RIS-Judikatur, Bundes- und Landesrecht ~91 %, historische Fassungen fehlen |
| DE/CH-Korpus                                 | ❌/🟡 | nur freie Quellen, keine Verlagsinhalte                                       |

### 4.7 Plattform, Sicherheit, Vertrauen

| Fähigkeit                                          | Heute | Rest                                                                  |
| -------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| 2FA-Pflicht                                        | ✅    | Middleware und API geben 403 zurück                                   |
| SSO und SCIM                                       | ✅    | WebAuthn/Passkeys fehlen                                              |
| Audit-Log mit Hash-Kette                           | ✅    | Advisory-Lock pro Kanzlei                                             |
| Ethical Walls, ACL pro Akte                        | ✅    | Paket 12a/13a noch nicht als „live“ abgenommen                        |
| Mandantentrennung strikt                           | 🟡    | Paket 12b im Code, Abnahme offen                                      |
| ISO 27001 / 42001, SOC 2, BSI C5                   | ❌    | nur Vorbereitungsdokumente; **BEAMON hat ISO 27001 und SOC 2**        |
| ÖRAK-KI-Checkliste, Bestätigung nach § 40 RL-BA    | ❌    | Entwurf `docs/compliance/OERAK_KI_PAKET_ENTWURF.md`                   |
| Öffentliche API-Dokumentation                      | 🟡    | OpenAPI nur mit vier Pfaden                                           |
| Betrieb (Staging, Failover, Offsite-Backup)        | ❌/🟡 | siehe Abschnitt 5                                                     |

---

## 5. Betriebsreife: der unterschätzte Block

| Punkt                   | Befund                                                                                                                                  | Risiko                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Hosting                 | eine VM (Netcup; die Dokumente nennen teils noch Hetzner), 9 Container, ein Fremdprojekt auf derselben Box                            | Single Point of Failure                 |
| Speicherplatz           | am 18.09. zu 100 % voll, 25.272 Engine-Neustarts, danach 2,7 GB frei auf 150 GB; ein neues Image braucht ~6 GB                          | Deploy-Blockade                         |
| Backup                  | täglich verschlüsselt, Restore-Test wöchentlich; restic-Offsite im Compose vorbereitet, **Offsite-Ziel in Prod nicht nachgewiesen** (`BACKUP-RESTORE-PLAN.md`: „existenzieller Punkt“) | Totalverlust der Mandantendaten möglich |
| Staging                 | keins                                                                                                                                   | jeder Deploy ist ein Prod-Test          |
| Mail-Versand            | am 18.09. nicht konfiguriert                                                                                                            | Fristen-Erinnerungen kommen nicht an    |
| Zugangsdaten            | Datenbank-Passwort und OpenRouter-Key am 18.09. ungeschützt gefunden, Rotation offen                                                    | Sicherheitsvorfall                      |
| Monitoring              | Cron-Health, Alarmierung; Sentry-DSN nicht gesetzt (16.09.)                                                                             | Fehler bleiben unbemerkt                |
| SLA                     | verspricht 99,5 bzw. 99,9 %                                                                                                             | vertraglich nicht haltbar               |

**Einschätzung:** Mit echten Mandantenakten ist das berufsrechtlich (§ 9 RAO) und haftungsrechtlich nicht tragbar. Dieser Block muss vor der ersten Pilotkanzlei erledigt sein und kostet vergleichsweise wenig:

- ein zweiter Server oder ein verwalteter Postgres
- ein Offsite-Bucket
- ein Staging-System
- geschätzt 100 bis 300 € pro Monat

---

## 6. Potenzial

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

## 7. Was fehlt: priorisierte Roadmap

### Stufe 0: vor der ersten echten Akte (1 bis 2 Wochen, überwiegend Betrieb)

1. Offsite-Backup (restic auf S3 oder R2) produktiv schalten und einen Restore-Test von außen durchführen.
2. Staging-Server bereitstellen. Die Prod-Box von Fremdprojekten trennen und die Platte vergrößern.
3. SMTP bzw. Resend für Fristen-Mails, Sentry-DSN setzen, Zugangsdaten rotieren.
4. Die Audit-Pakete 12a–13d deployen und als „live“ abnehmen, vor allem die Mandantentrennung (12b).
5. SLA-Text an die Realität anpassen (z. B. 99,0 % ohne Gutschrift im Pilot).

### Stufe 1: Wechselgrund für AT-Kanzleien (Partnerverträge, 1 bis 3 Monate)

6. **webERV über eine Übermittlungsstelle** (MANZ webERV-Service, stp.one oder ÖGIZIN), für Versand und Eingang direkt in den Akt. MANZ ist über Noxtua jetzt Wettbewerber, deshalb **stp.one oder ÖGIZIN bevorzugen**.
7. **Registerabfragen** über MEDIX oder stp.one: Grundbuch, Firmenbuch, ZMR, GISA, Ediktsdatei, jeweils mit Übernahme in Beteiligte und KYC.
8. PDF-AS für QES deployen.
9. **ÖRAK-KI-Checkliste unterzeichnen** und die Bestätigung nach § 40 Abs. 3 RL-BA veröffentlichen. Das kostet fast nichts und ist das Vertrauenssignal Nummer eins.

### Stufe 2: Qualität in der Tiefe (parallel, Code)

10. Aufgaben als eigene Seiten mit atomaren Schreibvorgängen und Benachrichtigung an die zuständige Person.
11. Aktenzeichen: keinen Zeitstempel als Fallback vergeben, stattdessen einen Fehler zeigen und erneut versuchen.
12. Legal Hold: eine nicht lesbare Seite gilt als gesperrt (fail-closed).
13. WhatsApp-Terminbuchung gegen den Anwaltskalender prüfen und als „angefragt“ statt `confirmed` speichern.
14. Copilot auf nativen Tool-Use umstellen, mit Schema-Validierung und Freigabe für schreibende Aktionen.
15. Korpus: RIS-Judikatur vollständig, Gesetzesabkürzungen, Embedding-Rückstand und historische Fassungen. Das braucht man für Fristen und Altfälle.
16. Controlling mit Umsatz, offenen Posten und Realisierungsquote.
17. Originale versionieren, nicht nur Textschnappschüsse.

### Stufe 3: Fokus statt Breite

18. **Feature-Freeze für neue Bereiche, bis fünf Pilotkanzleien produktiv arbeiten.** Weitere wenig genutzte Bereiche parken. Pro Pilot die zehn Kernabläufe mit einem echten Anwalt abnehmen (`ANWALTSTAG-TESTSCRIPT.md`).
19. Preis und Packaging prüfen.
    - Solo zu 249 € ist nur ohne ADVOKAT haltbar.
    - Denkbar ist ein „KI-Add-on“ zu 79 bis 99 € neben dem Bestandssystem. Es würde als Einstieg gegen BEAMON und AI:ssociate antreten, mit Upgrade-Pfad zum Voll-OS.
20. ISO 27001 anstoßen (6 bis 9 Monate). Parallel einen externen Penetrationstest beauftragen und den Bericht für den Vertrieb verwenden.
21. Zweite Person für Engineering oder Betrieb gewinnen (Bus-Faktor).

### Stufe 4: Deutschland (ab 2027)

22. beA über einen Middleware-Partner, DATEV-Partnerschaft, RVG und FAO reaktivieren (Code vorhanden).
23. Content-Strategie: Da Beck, WK und Lexis gebunden sind, bleiben kleinere Verlage (Nomos, Otto Schmidt, De Gruyter), Open-Access-Kommentare oder vLex als Lizenzgeber.

---

## 8. Kurzbewertung pro Dimension

| Dimension                        | Note (1–10) | Kommentar                                                        |
| -------------------------------- | ----------- | ---------------------------------------------------------------- |
| Vision und Positionierung        | 9           | trifft die Marktlücke genau                                      |
| KI-Architektur                   | 8           | Grounding, EU-Only und Evals vorbildlich; Tool-Use ist Schuld    |
| Rechtsfachliche Tiefe AT         | 8           | Fristen und Tarife stark; Korpus lückenhaft                      |
| Funktionsbreite Kanzlei-OS       | 7           | fast Parität; es fehlt der Justiz- und Register-Block            |
| Codequalität und Tests           | 8           | außergewöhnlich für die Teamgröße                                |
| Sicherheit (Code)                | 7           | viele Härtungsrunden; Abnahme der Pakete 12/13 offen             |
| Sicherheit (Nachweise)           | 3           | keine Zertifikate, keine ÖRAK-Checkliste                         |
| Betrieb                          | 3           | eine VM, kein Staging, Offsite-Backup offen                      |
| Go-to-Market                     | 3           | keine nachgewiesenen Pilot- oder Zahlkunden, Preis über dem Markt |
| Team und Skalierbarkeit          | 4           | Bus-Faktor 1                                                     |

**Schlusswort:** Das Produkt ist weiter, als es der Markt erwartet. Das Unternehmen ist noch nicht so weit wie das Produkt. Die nächsten 90 Tage sollten gehören:

1. dem Betrieb,
2. drei Partnerverträgen (webERV, Register, QES),
3. der ÖRAK-Checkliste,
4. fünf echten Kanzleien.

Neue Features gehören nicht dazu. Gelingt das, ist Subsumio die erste echte KI-native Kanzleisoftware Österreichs und hat eine belastbare Ausgangslage für Deutschland.

## 9. Quellen (Auswahl)

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
