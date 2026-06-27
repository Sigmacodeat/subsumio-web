# Anwalts-Alltag Use-Case Analyse — Subsumio Abdeckung

## Analyse-Methode

10 typische Anwalts-Workflows nach ARAG / BRAK Studie. Jeder Workflow in Phasen zerlegt, Abdeckung geprüft.

---

## 1. Mandantenannahme (Client Intake)

| Phase                   | Was passiert                      | Subsumio Abdeckung                                             |
| ----------------------- | --------------------------------- | -------------------------------------------------------------- |
| 1.1 Erstkontakt         | Anruf/E-Mail → Kontakt anlegen    | ✅ `dashboard/contacts` — Rolle (client/opponent/court)        |
| 1.2 Konfliktprüfung     | Gleicher Gegner? Gleiche Materie? | ✅ `dashboard/kollisionspruefung` — Proxy + Brain-Suche        |
| 1.3 Erstgespräch        | Notizen → Aktenanlage             | ✅ `dashboard/cases/[slug]` — Facts, Claims, Defenses          |
| 1.4 Kostenkalkulation   | Streitwert → RVG/RATG → Angebot   | ✅ `dashboard/cost-calculator` — Streitwert + Gebühren         |
| 1.5 Mandatsvereinbarung | Template → DOCX → e-Signatur      | ✅ `dashboard/drafting` (13 Templates) + `dashboard/signature` |
| **Score**               |                                   | **5/5 ✅ Komplett**                                            |

---

## 2. Aktenführung (Case Management)

| Phase                 | Was passiert                        | Subsumio Abdeckung                                              |
| --------------------- | ----------------------------------- | --------------------------------------------------------------- |
| 2.1 Akte anlegen      | Titel, AZ, Mandant, Gegner, Gericht | ✅ `dashboard/cases` — Stammdaten mit Kontakt-Verknüpfung       |
| 2.2 Fristen setzen    | Klageerwiderung, Berufung, etc.     | ✅ `dashboard/deadlines` — 10 Templates + Kalenderfristen       |
| 2.3 Zeiterfassung     | Tätigkeit, Dauer, Satz, Bearbeiter  | ✅ `dashboard/cases/[slug]` — Time-Tab mit Rate/Activity/Lawyer |
| 2.4 Auslagen erfassen | Gerichtskosten, Porto, Fahrt        | ✅ `dashboard/cases/[slug]` — Expenses-Tab                      |
| 2.5 Beweismittel      | Beweise sammeln + Stärke bewerten   | ✅ `dashboard/cases/[slug]` — Evidence-Board mit Slider         |
| 2.6 Dokumente         | Upload, Verlinkung, Versionierung   | ✅ `dashboard/upload` + Brain-Pages als Dokumente               |
| 2.7 Aufgaben          | Tasks, Deadlines, Erinnerungen      | ✅ `dashboard/cases/[slug]` — Tasks-Tab                         |
| 2.8 Strategie         | KI-generierter Strategie-Entwurf    | ✅ `dashboard/cases/[slug]` — Strategie-Generator               |
| **Score**             |                                     | **8/8 ✅ Komplett**                                             |

---

## 3. Schriftsatz-Erstellung (Document Drafting)

| Phase                     | Was passiert                           | Subsumio Abdeckung                              |
| ------------------------- | -------------------------------------- | ----------------------------------------------- |
| 3.1 Template wählen       | Klage, Antrag, Berufung, etc.          | ✅ `dashboard/drafting` — 13 Templates          |
| 3.2 Daten eingeben        | Mandant, Gegner, Streitwert, Tatsachen | ✅ Formular mit Akten-Verknüpfung               |
| 3.3 KI-Entwurf generieren | GPT/Claude generiert Schriftsatz       | ✅ KI-Generierung mit Prompt                    |
| 3.4 Vier-Augen-Prüfung    | Zweiter Anwalt prüft Entwurf           | ✅ `dashboard/drafting` — "Zur Freigabe" Button |
| 3.5 Freigabe-Queue        | Admin prüft und genehmigt              | ✅ `dashboard/approvals` — Freigaben-Queue      |
| 3.6 DOCX-Export           | Word-Dokument herunterladen            | ✅ `dashboard/drafting` — DOCX-Download         |
| 3.7 Word-Add-in           | Direkt in Word einfügen                | ✅ `word-addin/` — Manifest + Task Pane         |
| 3.8 e-Signatur            | Mandant unterschreibt digital          | ✅ `dashboard/signature` — Docusign-ready       |
| **Score**                 |                                        | **8/8 ✅ Komplett**                             |

---

## 4. Recherche & Analyse (Legal Research)

| Phase                     | Was passiert                       | Subsumio Abdeckung                                                             |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| 4.1 Rechtsprechung suchen | OGH, BGH, EuGH Urteile             | ✅ `dashboard/rechtsprechung` — AT (RIS-OGD) + DE (openlegaldata) + Brain + AI |
| 4.2 Normen prüfen         | Gesetzestexte, Kommentare          | ✅ `dashboard/norms` — Normen-Datenbank                                        |
| 4.3 Gap-Analyse           | Was fehlt in der Argumentation?    | ✅ `dashboard/query` — Legal Gap Categorization (7 Typen)                      |
| 4.4 KI-Query              | Frage stellen, Antwort mit Quellen | ✅ `dashboard/query` — Streaming + Citations + Groundedness                    |
| 4.5 Graph-Visualisierung  | Verknüpfungen zwischen Entitäten   | ✅ `dashboard/graph` — Knowledge Graph                                         |
| **Score**                 |                                    | **5/5 ✅ Komplett**                                                            |

---

## 5. Rechnungsstellung & Abrechnung (Billing)

| Phase                   | Was passiert                     | Subsumio Abdeckung                                   |
| ----------------------- | -------------------------------- | ---------------------------------------------------- |
| 5.1 Rechnung aus Zeiten | Offene Zeiten → Rechnung         | ✅ `dashboard/invoicing` — Auto-Generierung aus Akte |
| 5.2 Auslagen hinzufügen | Gerichtskosten, Porto, etc.      | ✅ `dashboard/invoicing` — Expenses in Rechnung      |
| 5.3 GoBD-Compliance     | Unveränderbarer Hash             | ✅ `lib/gobd.ts` — SHA-256 Hash-Evidenz              |
| 5.4 PDF-Export          | Professionelle Rechnung als PDF  | ✅ `lib/invoice-pdf.ts` — jsPDF mit Tabellen         |
| 5.5 E-Mail-Versand      | Rechnung per E-Mail senden       | ✅ `dashboard/invoicing` — Send-Button + API         |
| 5.6 Mahnwesen           | 1./2./3. Mahnung automatisch     | ✅ `dashboard/invoicing` — Mahn-Button + Gebühren    |
| 5.7 DATEV-Export        | CSV für DATEV Unternehmen Online | ✅ `dashboard/datev-export` — SKR03/04/49            |
| 5.8 Zahlungsstatus      | Bezahlt, Überfällig, Storniert   | ✅ `dashboard/invoicing` — Status-Update             |
| **Score**               |                                  | **8/8 ✅ Komplett**                                  |

---

## 6. Kommunikation & Integration

| Phase                   | Was passiert                      | Subsumio Abdeckung                                                        |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| 6.1 beA                 | Elektronischer Rechtsverkehr (DE) | ✅ `dashboard/bea` — Entwurf + Import-Status                              |
| 6.2 E-Mail-Import       | Mandanten-E-Mail → Akte           | ✅ `dashboard/email-import` — .eml Drag & Drop + Parser + Akten-Zuordnung |
| 6.3 Mandantenportal     | Mandant sieht Fristen/Dokumente   | ✅ `dashboard/client-portal` + Portal-Link-Generator                      |
| 6.4 Kalender-Export     | Fristen in Outlook/iCal           | ✅ `dashboard/calendar-export` — ICS/iCal Export                          |
| 6.5 DATEV-Schnittstelle | Abrechnungsdaten exportieren      | ✅ `dashboard/datev-export` — CSV                                         |
| **Score**               |                                   | **5/5 ✅ Komplett**                                                       |

---

## 7. Offline-Arbeit (Unterwegs)

| Phase                 | Was passiert                     | Subsumio Abdeckung                                         |
| --------------------- | -------------------------------- | ---------------------------------------------------------- |
| 7.1 Offline lesen     | Akten, Fristen, Kontakte ansehen | ✅ `lib/offline-store.ts` — IndexedDB Cache                |
| 7.2 Offline schreiben | Zeit erfassen, Akte bearbeiten   | ✅ `cases/[slug]` nutzt `isOnline()` + `enqueueMutation()` |
| 7.3 Auto-Sync         | Bei Wiederverbindung syncen      | ✅ `public/sw.js` — Background Sync Queue                  |
| 7.4 Offline-Badge     | Visuelles Feedback               | ✅ `dashboard/layout.tsx` — NetworkStatusBadge             |
| **Score**             |                                  | **4/4 ✅ Komplett**                                        |

---

## 8. Compliance & Datenschutz

| Phase                     | Was passiert                     | Subsumio Abdeckung                                                       |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| 8.1 DSGVO-Checkliste      | Compliance-Prüfung               | ✅ `dashboard/compliance` — DSGVO (10 Checks)                            |
| 8.2 GwG-Checkliste        | Geldwäscheprävention             | ✅ `dashboard/compliance` — GwG (6 Checks)                               |
| 8.3 Audit-Trail           | Wer hat wann was geändert?       | ✅ `dashboard/admin` — Audit-Trail mit Filter + CSV-Export               |
| 8.4 EU AI Act             | KI-Transparenz (Art. 50)         | ✅ `lib/ai-act.ts` — Badge + Notice + Groundedness                       |
| 8.5 Löschfristen          | Automatische Hinweise (10 Jahre) | ✅ `dashboard/compliance/retention` — 6/10-Jahres-Regeln + Farbkodierung |
| 8.6 Datenexport (GDPR 20) | Portabilität aller Daten         | ✅ `dashboard/data-export` — GDPR JSON-Export + Admin-Backup             |
| **Score**                 |                                  | **6/6 ✅ Komplett**                                                      |

---

## 9. Team-Zusammenarbeit

| Phase                   | Was passiert                       | Subsumio Abdeckung                                                         |
| ----------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| 9.1 Team-Verwaltung     | Kollegen einladen, Rollen vergeben | ✅ `dashboard/team` — Rollen (admin/lawyer/assistant)                      |
| 9.2 Real-time Updates   | Live-Sync bei Aktenänderungen      | ✅ `lib/realtime.ts` — WebSocket + Event-Bus                               |
| 9.3 Freigaben / 4-Augen | KI-Entwürfe prüfen lassen          | ✅ `dashboard/approvals` — Freigabe-Queue                                  |
| 9.4 Kommentare          | Notizen zu Akten-Einträgen         | ✅ Evidence + Deadlines + Time + Expenses: jeder Eintrag mit CommentThread |
| **Score**               |                                    | **4/4 ✅ Komplett**                                                        |

---

## 10. Kanzlei-Management (Admin)

| Phase                      | Was passiert                | Subsumio Abdeckung                                           |
| -------------------------- | --------------------------- | ------------------------------------------------------------ |
| 10.1 Kanzlei-Einstellungen | Name, Adresse, USt-ID, Bank | ✅ `lib/kanzlei-settings.ts` — Settings-Store                |
| 10.2 Nutzerverwaltung      | Einladen, Deaktivieren      | ✅ `dashboard/team` + Admin-Panel                            |
| 10.3 Abrechnung / Billing  | SaaS-Abonnement verwalten   | ✅ `dashboard/billing` — CreditCard + Plan                   |
| 10.4 Backup / Export       | Gesamte Kanzlei exportieren | ✅ `dashboard/data-export` — Admin-only Voll-Backup als JSON |
| 10.5 Monitoring            | Case-Law Watchlist, Alerts  | ✅ `api/cron/case-law` — Proaktives Monitoring + E-Mail      |
| **Score**                  |                             | **5/5 ✅ Komplett**                                          |

---

## Gesamtergebnis

| Workflow                  | Abdeckung | Fehlend |
| ------------------------- | --------- | ------- |
| 1. Mandantenannahme       | 100%      | —       |
| 2. Aktenführung           | 100%      | —       |
| 3. Schriftsatz-Erstellung | 100%      | —       |
| 4. Recherche & Analyse    | 100%      | —       |
| 5. Rechnungsstellung      | 100%      | —       |
| 6. Kommunikation          | 100%      | —       |
| 7. Offline-Arbeit         | 100%      | —       |
| 8. Compliance             | 100%      | —       |
| 9. Team-Zusammenarbeit    | 100%      | —       |
| 10. Kanzlei-Management    | 100%      | —       |

**Gesamt: ~100% abgedeckt**

### Alle identifizierten Gaps sind geschlossen

- ✅ Datenexport (GDPR Art. 20) — `dashboard/data-export`
- ✅ DSGVO Löschfristen — `dashboard/compliance/retention`
- ✅ E-Mail-Import — `dashboard/email-import`
- ✅ Offline-Schreiben — `cases/[slug]` mit `isOnline()` + `enqueueMutation()`
- ✅ Kommentar-Threads — In Evidence/Deadlines/Time/Expenses
- ✅ Backup / Voll-Export — Admin-Button auf `dashboard/data-export`
- ✅ RAG-Eval — `dashboard/rag-eval`
- ✅ Multi-Tenant-Isolation — `lib/tenant-guard.ts`
