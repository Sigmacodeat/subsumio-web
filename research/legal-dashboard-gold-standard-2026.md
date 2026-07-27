# Research-Report: Gold-Standard für Kanzlei-Workflow-Dashboards (2025/2026)

**Kontext:** Audit von „subsumio" (deutsches Legal-Tech: KI-Recherche, Akten, Dokumente)
**Stand der Recherche:** Juli 2026 · Alle Quellen mit URL

---

## (a) Gold-Standard-Checkliste: Was gehört auf das Dashboard einer Kanzlei?

Autoritative Quellen (Attorney at Work / Brooke Lively; Bill4Time Product-Update; Vergleichsplattformen SoftwareFinder/SelectHub; Clio/Smokeball-Produktdoku) konvergieren auf zwei Dashboard-Typen, die Top-Produkte **beide** anbieten:

### Typ 1: Das persönliche „Daily Command Center" (Anwalts-Sicht)

| Element                                                                                | Zweck                                                 | Beleg                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Heute-Agenda / Termine**                                                             | Tagesplanung auf einen Blick                          | Clio: „centralized view of your upcoming tasks and schedule so you know, at-a-glance" ([laurolaw.com Clio-Features](https://laurolaw.com/clio-tools-features/151-clio-practice-management))                               |
| **Fristen / Deadlines** (rot/amber/grün)                                               | Haftungskritisch — wichtigstes Widget überhaupt       | PracticePanther: „centralized view of all active matters, deadlines, billing status, and tasks … within a few clicks from any screen" ([SoftwareFinder](https://softwarefinder.com/resources/practicepanther-vs-clio))    |
| **Aufgabenliste (meine Tasks, überfällig zuerst)**                                     | Tagesarbeit steuern                                   | Smokeball „Daily Digest" ([SoftwareFinder](https://softwarefinder.com/resources/smokeball-vs-clio))                                                                                                                       |
| **Zuletzt bearbeitete Akten / Matters**                                                | Wiedereinstieg in <1 Klick                            | Smokeball Global Dashboard: „recent matters, daily digest, recent activity, activity timeline" (ebd.)                                                                                                                     |
| **Zeiterfassungs-Widget** (laufender Timer + heute erfasste Stunden)                   | Umsatz-Leckage stoppen                                | Smokeball automatische Zeiterfassung; Clio Global Create                                                                                                                                                                  |
| **Aktivitäts-Feed / Firm Feed**                                                        | Team-Transparenz                                      | Rocket Matter „activity feed" ([SelectHub](https://www.selecthub.com/legal-practice-management-software/filevine-vs-rocket-matter/))                                                                                      |
| **Globale Suche (as-you-type, über Akten/Kontakte/Dokumente)**                         | Search-first-Design                                   | Clio: „search functionality with results populating automatically as users type" ([saashop.net](https://www.saashop.net/post/clio-a-firm-administrator-s-introduction-to-the-leading-legal-practice-management-software)) |
| **Global Create / Schnellaktionen** (+ Akte, + Kontakt, + Zeit, + Aufgabe von überall) | Kontextwechsel vermeiden                              | Clio „Global Create button … from anywhere within Clio" (ebd.)                                                                                                                                                            |
| **Personalisierbare Widgets**                                                          | Rollenspezifisch (Partner ≠ Referendar ≠ Sekretariat) | Clio: „Personalized Dashboards: Users can choose what widgets appear" ([softivizes.com](https://softivizes.com/articles/exploring-clio-manage-overview-legal-professionals/))                                             |

### Typ 2: Das Kanzlei-Cockpit (Management-/Partner-Sicht)

Attorney at Work definiert **4 KPI-Kategorien** als Industrie-Referenz — mit dem zentralen Designprinzip **Leading vs. Lagging Indicators** (Dashboard muss Zukunft zeigen, nicht nur Vergangenheit):

1. **Financial Health / Cash** — Liquidität 6–8 Wochen voraus
2. **Production** — Billable hours, WIP (Work in Progress) als bester Leading Indicator
3. **Capacity** — Cases per attorney, steigender/fallender Bestand
4. **Marketing & Sales / Pipeline** — Neue Mandate im Funnel
   Quelle: [What Should Be on Your Law Firm Dashboard — Attorney at Work, 2025](https://www.attorneyatwork.com/what-should-be-on-your-law-firm-dashboard/)

**Design-Prinzipien (aus derselben Quelle + Dashboard-Guides):**

- Keep it simple (kein Clutter); Visualisierungen statt Tabellen; Drill-down interaktiv; immer aktuelle Daten; KPIs regelmäßig reviewen
- Bill4Time-Lesson: „at-a-glance totals" + „home of new and most recent information" ([Bill4Time Blog](https://www.bill4time.com/blog/law-firm-metrics-cards-kpi-dashboard/))
- Allgemeine Dashboard-Best-Practices 2025: klare visuelle Hierarchie, Cognitive Load reduzieren, WCAG-Accessibility ([context.dev](https://www.context.dev/blog/dashboard-design-best-practices))

---

## (b) Competitor-Patterns (international)

| Produkt              | Dashboard-/UX-Ansatz                                                                                                                                                                         | Stärke / bemerkenswertes Pattern                                                                                                                                                                                                                                                                 | Kritik in Reviews                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clio Manage**      | Personalisierbare Widget-Dashboards; Matter-Dashboard mit Tabs (Kontakte, Termine, Tasks); Global Create; Search-first; Themes                                                               | Ökosystem (Manage + Grow Intake/CRM + Manage AI/Duo: Rechnungsentwürfe, Deposition-Summaries, Billing-Anomalien) ([aegissofttech](https://www.aegissofttech.com/insights/crm-for-law-firms/), [softivizes](https://softivizes.com/articles/exploring-clio-manage-overview-legal-professionals/)) | Teuer ($49–159/User/Mo); Feature-Fülle überfordert Solos                                                                                              |
| **MyCase**           | Schlichtes All-in-One; Termin-Tracking, CRM, Expense                                                                                                                                         | Preis/Leistung; flache Lernkurve                                                                                                                                                                                                                                                                 | „too much manual work" beim Skalieren; Time-Tracking disziplinabhängig ([Smokeball-Vergleich](https://www.smokeball.com/compare/smokeball-vs-mycase)) |
| **PracticePanther**  | Zentrale Sicht: Matters, Deadlines, Billing-Status, Tasks — alles ≤3 Klicks                                                                                                                  | Intuitiv, schnelles Onboarding                                                                                                                                                                                                                                                                   | Mobile App nicht feature-complete ([SoftwareFinder](https://softwarefinder.com/resources/practicepanther-vs-clio))                                    |
| **Smokeball**        | Data-dense Global Dashboard: Recent Matters, **Daily Digest**, Recent Activity, Activity Timeline; linke Sidebar (Matters/Contacts/Calendar/Tasks/AI/Reports)                                | **Automatische Hintergrund-Zeiterfassung** („capturing every billable minute"); Dokumentenautomatisierung                                                                                                                                                                                        | Komplex, teuer; Integrationen schwierig ([SelectHub](https://www.selecthub.com/legal-software/smokeball-vs-meruscase/))                               |
| **Rocket Matter**    | Customizable Dashboard, modelliert bestehende Kanzlei-Workflows; Activity Feed; Lead-Dashboard (Lead-Volumen, Quellen, Umsatz pro Quelle, Conversion)                                        | LEDES-Billing, Intake-Analytics                                                                                                                                                                                                                                                                  | Steilere Lernkurve für Non-Techies ([Vintti](https://www.vintti.com/blog/filevine-vs-rocket-matter-a-comparative-review))                             |
| **Filevine**         | Voll konfigurierbare „Cases-as-Projects"; AI-Reporting (Revenue, Caseloads, Staff Performance)                                                                                               | Litigation/PI-Workflows, Customization                                                                                                                                                                                                                                                           | Onboarding-Aufwand ([SelectHub](https://www.selecthub.com/legal-practice-management-software/filevine-vs-smokeball/))                                 |
| **Lexis+ / Protégé** | 300+ vorgefertigte Legal-Workflows + No-Code-Workflow-Builder                                                                                                                                | Content-Grounding auf Lexis-Daten                                                                                                                                                                                                                                                                | Vendor-Lock ([Market-Report](https://marketintelo.com/report/ai-legal-technology-and-workflow-automation-market))                                     |
| **Harvey**           | Drei Säulen: **Assistant** (Recherche/Drafting), **Vault** (High-Volume Doc Review), **Workflow Builder** (Multi-Step-Automation); Word/Outlook/SharePoint-Integration; Intapp Ethical Walls | Enterprise-Grade, permissioned/auditable; Power-User sparen 36,9 h/Monat ([Harvey/RSGI 2025](https://riskquiz.me/blog/will-ai-replace-lawyers))                                                                                                                                                  | BigLaw-Preise; $11B-Valuation März 2026 ([ailawyertoolscompared](https://ailawyertoolscompared.com/blog/cocounsel-vs-harvey/))                        |
| **CoCounsel (TR)**   | Agentic **Deep Research** (mehrschrittig, autonom), zitationsgesichert auf Westlaw/Practical Law; Chat + Guided Workflows (Litigation, Drafting)                                             | Citation-backed Research; Vals-Benchmark: Summarization 77,2% vs. 50,3% Lawyer-Baseline                                                                                                                                                                                                          | Nur noch im Westlaw-Bundle ([Vaquill](https://www.vaquill.ai/blog/cocounsel-vs-harvey), [gc.ai](https://gc.ai/blog/cocounsel-ai-legal-assistant))     |

**Meta-Pattern der Kategorie-Führer:** (1) Matter-zentrisch, nicht dokument-zentrisch. (2) „Work where lawyers work": Word-/Outlook-Integration statt Portal-Zwang. (3) Automatisches Erfassen (Zeit, Aktivität) statt manueller Pflege. (4) Drill-down vom KPI zur Akte.

---

## (c) German-Market Must-Haves (Standard-Funktionskatalog)

Basierend auf [kanzleisoftware-vergleich.com](https://kanzleisoftware-vergleich.com/) (27 Produkte) und Hersteller-Factsheets:

**Nicht verhandelbar (Hygiene-Faktoren):**

1. **Fristenkalender + Wiedervorlage** mit automatischer Fristenberechnung und Mehr-Augen-Kontrolle — in DE haftungskritisch, Kern jeder Software (DATEV Anwalt classic: „Fristen- und Terminmanagement"; Advoware: „Termine, Fristen, Aufgaben und Wiedervorlagen" ([STP Factsheet](https://www.stp.one/hubfs/24_Advoware_FactSheet-OnPremise-Premium_DE.pdf)))
2. **beA / EGVP-Integration** (elektronischer Rechtsverkehr) — RA-MICRO wirbt mit „beA-Vollintegration"; DATEV, Kleos, Advoware, Actaport alle mit beA-Postfach
3. **RVG-Abrechnung** (Rechtsanwaltsvergütungsgesetz) inkl. Stundenhonorar-Option; zunehmend **E-Rechnung (xRechnung/ZUGFeRD)**
4. **DATEV-Export / ReWe-Schnittstelle** — DATEV ist „Branchen-Standard im deutschen Rechtswesen"; Advoware Professional bewirbt explizit DATEV-Export
5. **Kollisionsprüfung** (Interessenkonflikt) per Klick — Advoware Standard; Lexolution mit Compliance-Cockpit
6. **Digitale Akte (E-Akte)** mit Volltextsuche, Dokumentenvorschau, Versionskontrolle
7. **Zeiterfassung** — Kleos erst ab Professional (79 €), d.h. Differenzierungsmerkmal
8. **DSGVO-Konformität + Hosting in Deutschland/EU** (STP: „DSGVO-konform", Server DE)
9. **Mandantenportal** (z.B. Renostar Case Share, Advoware Premium) — wachsender Standard
10. **Mobile App** — bei Kleos, RA-MICRO, DATEV Standard

**Wettbewerber-Überblick DE (Kurzprofile):**

- **DATEV Anwalt classic**: Marktstandard, modular, tiefste FiBu-Integration, aber komplexe Paketkonfiguration
- **RA-MICRO**: beA-Vollintegration + **JURA KI Assistent** (Anonymisierung, Verifikation von Gesetzen/Urteilen!)
- **Kleos (Wolters Kluwer)**: Cloud-first, 69–89 €/Mo, e-Signatur, M365
- **Advoware (STP)**: Aufgabenketten/Workflows, KI „Legal Twin" (Fallanalyse, Mandatsannahme), 99–169 €
- **Actaport**: Cloud + M365-nativ, 59–89 €
- **Renostar/Rainmaker**: Dashboard mit „Aufgaben, Fristen und Wiedervorlagen" + **Simultansuche** über jur. Datenbanken
- **j-lawyer**: Open Source, beA, KI-Dokumentenanalyse — Datenhoheit-Argument
- **JUNE**: Großverfahren/Massenmandate, Echtzeit-Team-Dashboards, Batch-Bearbeitung
- **JUPUS / LegalFlow**: KI-Intake (Chatbot, Fragebögen → strukturierte Fallübersicht mit Chronologie, Schlüsselfakten, möglichen Fristen)
- **Libra (Berlin)**: KI-Arbeitsplatz in Word/Outlook, Otto-Schmidt-Content, DMS-Anbindung ([HAV Legal-Tech-Magazin PDF](https://www.hav.de/files/media/downloads/Junge Juristen/Fachinfo-Magazin MkG/ffi-legal-tech-magazin-legal-ai-tools.pdf))
- **Beck-Noxtua (Xayn + C.H.Beck)**: „Europas erste souveräne Rechts-KI", exklusiver beck-online-Zugriff, nur mit Rechtstexten trainiert → Halluzinationsreduktion ([FFI-Broschüre](https://freie-fachinformationen.de/Fachinfo-Broschüren/FFI_KI_in_der_Kanzleipraxis.pdf))
- **Justin Legal**: Schnittstellen-Partner von j-lawyer (kein eigenes Dashboard-Produkt)

**Marktdaten:** 63,6 % der deutschen Kanzleien nutzen bereits aktiv KI (Wolters Kluwer Future Ready Lawyer 2026); ~300 Legal-Techs, ~800 Mio € Marktvolumen ([lulius.ai Vergleich](https://www.lulius.ai/blog/legal-ai-vergleich-deutschland)).

---

## (d) AI-First Workflow-Trends 2025/26

1. **Von Q&A zu agentic AI**: Multi-Step-Agenten (CoCounsel Deep Research, Harvey Workflow Builder) ersetzen Einzelprompts; Lexis: 300+ Pre-Built-Workflows ([Market-Report](https://marketintelo.com/report/ai-legal-technology-and-workflow-automation-market))
2. **Grounding + Zitate als Vertrauens-Feature**: Ergebnisse nur mit Fundstellen (beck-online-Fundstellen bei Noxtua; Westlaw-Citations bei CoCounsel). Halluzinationsrisiko = Haftungsrisiko → spezialisierte Tools schlagen General-LLMs ([AI Agent Square](https://aiagentsquare.com/category/legal-ai-agents))
3. **Workflow-Struktur Research → Draft → Review im Matter-Kontext**: Harvey (Assistant → Vault → Workflow Builder); Libra v2: „jeder Schritt im juristischen Alltag — von der ersten Recherche bis zur finalen Vertragsprüfung" ([LTV-Magazin PDF](https://cdn-assetservice.ecom-api.beck-shop.de/productattachment/readingsample/15771549/39428186_ltv-magazin_2025_01.pdf))
4. **In-Place-Work**: Word-/Outlook-Add-ins statt separatem Portal (Libra, Harvey, CoCounsel alle Word-nativ)
5. **Firm Knowledge Layer**: Suche über eigene Dokumente/Präzedenzfälle (CoCounsel Knowledge Search; Libra DMS-Anbindung)
6. **Governance/Compliance als Feature**: Ethical Walls (Harvey+Intapp), Audit-Logs, BRAO-Konformität. **BRAK KI-Leitlinien (Dez 2024)**: nur Tools mit AV-Vertrag + ausgeschlossenem Training auf Mandantendaten ([rechtsanwalt-fortbildung.net](https://www.rechtsanwalt-fortbildung.net/blog/ki-rechtsanwalt-chancen-fachanwalt/))
7. **Messbarer ROI als Verkaufsargument**: Harvey-Power-User 36,9 h/Monat Ersparnis (Harvey & RSGI 2025)
8. **Benchmarks**: Vals AI (Feb 2025) — Harvey bester Gesamtscore; CoCounsel Summarization 77,2 % vs. 50,3 % Anwalts-Baseline
9. **DE-Spezifikum**: Souveränität (EU-Hosting, deutsches Recht, deutsche Sprachmodelle) ist das Differenzierungsmerkmal von Noxtua/Libra gegenüber US-Tools

**Was Expert-Level ausmacht:** zitationsgesicherte Antworten + Matter-Kontext (die KI kennt die Akte) + Nachvollziehbarkeit/Audit + Verifikation (RA-MICROs JURA KI verifiziert Gesetze/Urteile automatisch) + Governance — nicht Chat-UI.

---

## (e) Accessibility / Rechtliche Anforderungen

- **BFSG** (Barrierefreiheitsstärkungsgesetz, Umsetzung EAA/RL 2019/882): in Kraft seit **28. Juni 2025** ([bfsg-gesetz.de](https://bfsg-gesetz.de/), [Maja Benke](https://maja-benke.de/digitale-barrierefreiheit-in-deutschland-rechtslage/))
- **Scope:** B2C-Dienstleistungen im elektronischen Geschäftsverkehr (Vertragsabschluss/Portal mit Verbrauchern); **Ausnahme Kleinstunternehmen** (<10 MA und <2 Mio € Umsatz) bei Dienstleistungen
- **Technischer Maßstab:** **WCAG 2.2 Level AA** + harmonisierte Norm **EN 301 549** ([heytalo BFSG-Guide](https://heytalo.de/ratgeber/bfsg-hausverwaltung), [sitebrunch](https://www.sitebrunch.com/news/alle-infos-zu-en-301-549-und-wcag-2-2-zusammengefasst))
- **Pflichten:** Erklärung zur Barrierefreiheit, Feedback-Mechanismus, Marktüberwachung mit Bußgeldrahmen; Übergangsfristen für Bestand bis 2030 ([nevercodealone](https://nevercodealone.de/de/glossare/nca-glossar-barrierefreiheit))
- **Konkrete WCAG-2.2-Anforderungen:** Kontrast ≥ 4,5:1 (AA), vollständige Tastaturnavigation mit sichtbarem Fokus, semantisches HTML5, Alt-Texte, Formular-Labels, verständliche Fehlermeldungen ([senorit.de](https://senorit.de/blog/website-relaunch-hamburg-2026))
- **Bewertung für subsumio:** Als B2B-SaaS für Kanzleien formal nicht BFSG-pflichtig, **ABER**: (1) ein Mandantenportal/Intake mit Verbraucher-Kontakt fällt in B2C-Scope; (2) Kanzleien erwarten zunehmend WCAG-Konformität in Ausschreibungen; (3) BITV 2.0 gilt, falls öffentliche Stellen (Behörden, Gerichte) Kunden werden. **Empfehlung: WCAG 2.2 AA als Design-System-Baseline.**

---

## (f) Konkrete Empfehlungen für subsumio (Expert-Level)

**Dashboard-Architektur:**

1. **Zwei-Ebenen-Modell**: „Mein Tag" (persönlich) + „Kanzlei-Cockpit" (Partner) — wie Clio/Smokeball + Attorney-at-Work-KPI-Modell
2. **Widget-Set „Mein Tag"**: Heute-Agenda · Fristen-Ampel (überfällig/≤3 Tage/≤7 Tage) · Meine Aufgaben · Zuletzt geöffnete Akten · Zeiterfassungs-Timer · beA-Posteingang · Aktivitäts-Feed
3. **Widget-Set „Cockpit"**: WIP/offene Leistungen · Produktion (Stunden/User) · Auslastung (Akten pro Bearbeiter) · offene Forderungen · Mandats-Pipeline — Leading Indicators vor Lagging
4. **Search-first**: Globale Suche mit as-you-type über Akten, Kontakte, Dokumente, Fundstellen (Clio-Pattern); Global-Create-Button von überall
5. **Personalisierbarkeit pro Rolle** (Partner/Associate/Sekretariat) — Clio-Widget-Pattern

**Deutsche Pflicht-Integrationen:** 6. Fristenkalender mit automatischer Berechnung + Wiedervorlage-Schleife (Vier-Augen) 7. beA/EGVP-Postfach direkt im Dashboard (Eingänge als Widget!) 8. RVG-Abrechnung + E-Rechnung (XRechnung/ZUGFeRD) + DATEV-Export 9. Kollisionsprüfung bei Mandatsanlage 10. DSGVO: EU-Hosting, AV-Vertrag, Kein-Training-auf-Mandantendaten-Zusicherung (BRAK-Leitlinien-konform) — als Feature kommunizieren

**AI-Differenzierung (2026-State-of-the-Art):** 11. **Zitationsgesicherte Recherche** (Fundstellen wie Noxtua/beck-online) — non-negotiable 12. **Matter-Kontext**: KI kennt die geöffnete Akte (Dokumente, Chronologie, Fristen) → „Ask this file" 13. **Agentic Workflows**: Recherche → Entwurf → Prüfung als geführte Multi-Step-Flows, nicht freier Chat 14. **Verifikations-Layer** (Gesetze/Urteile automatisch prüfen wie RA-MICRO JURA KI) + Anonymisierung vor externer LLM-Nutzung 15. **In-Place-Work**: Word-/Outlook-Integration mittelfristig 16. **Audit-Trail** aller KI-Aktionen (Ethical-Wall-/Compliance-Gedanke)

**Accessibility:** 17. WCAG 2.2 AA + EN 301 549 ins Design-System (Kontraste, Tastatur, Fokus, Labels), Erklärung zur Barrierefreiheit — auch als Vertriebsargument Richtung öffentlicher Auftraggeber

**UX-Prinzipien:** 18. At-a-glance-Totals + Drill-down zur Akte; visuelle Hierarchie statt Tabellenwände; Cognitive-Load-Reduktion; mobile App oder responsive als Pflicht (alle DE-Wettbewerber haben sie)
