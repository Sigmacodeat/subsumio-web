# Subsumio Anwalts-Prüfweg — Vollständigkeit-Audit aus Anwaltssicht

> **Zweck:** Dieser Prüfweg ist die überprüfbare Checkliste, mit der wir die
> gesamte Subsumio-Codebasis aus der Perspektive eines Rechtsanwalts prüfen,
> der die Software im Alltag nutzt. Jede Prüfstation hat konkrete, abhakbare
> Kriterien und einen Beweis-Schritt (welche Seite/Route/Datei geöffnet wird).
>
> **Status:** Blueprint / Prüfkatalog — noch nicht abgearbeitet.
>
> **Quellen:** Recherche zu Kanzleisoftware-Standards 2026 (renostar.de,
> optimaite.eu, lexdial.de, datev.de, advolux.de, door3.com, cleverx.com,
> smotrow.com) + Subsumio-Codebasis-Analyse (160 Dashboard-Seiten, 484
> API-Routes, 2 Verticals Legal+Tax, 13 Sidebar-Sektionen).

---

## 0) Audit-Methodik

### Prüfprinzipien

1. **Anwalts-Perspektive zuerst** — nicht "funktioniert die Route", sondern
   "kann der Anwalt seine Arbeit erledigen". Jede Station wird durchgespielt
   wie ein echter Arbeitstag.
2. **Vollständiger Userflow** — nicht Einzelfunktion, sondern
   End-to-End: Mandant anlegen → Akte → Frist → Schriftsatz → Versand →
   Abrechnung. Brüche zwischen Stationen sind Fehler.
3. **Beweispflicht** — jede Station braucht einen Beweis (Screenshot, API-
   Response, Datei-Verweis). "Sieht ok aus" ist kein Beweis.
4. **Edge-Case-Pflicht** — jede Station wird auch mit leeren Daten, falscher
   Eingabe, Netzwerkfehler, Mobil geprüft.
5. **DACH-First** — de-AT/de-DE Texte, berufsrechtliche Konformität
   (BRAO, RVG, DSGVO, §203 StGB, beA, GoBD).

### Audit-Cluster (überprüfbare Teile)

Das Programm wird in **12 Cluster** zerlegt, die einem Anwaltstag folgen:

| #   | Cluster                          | Anwaltssicht                               |
| --- | -------------------------------- | ------------------------------------------ |
| A   | Morgen & Orientierung            | "Was steht heute an?"                      |
| B   | Mandant & Intake                 | "Neuer Mandant kommt rein"                 |
| C   | Akte (Mandat)                    | "Ich öffne eine Akte und arbeite"          |
| D   | Fristen, Termine, Wiedervorlage  | "Keine Frist darf versäumt werden"         |
| E   | Recherche & Wissensbasis         | "Wie ist die Rechtslage? Urteile? Normen?" |
| F   | KI-Assistent & Vertrauen         | "Kann ich der KI-Antwort trauen?"          |
| G   | Schriftsatz & Drafting           | "Ich schreibe einen Schriftsatz"           |
| H   | Kommunikation (beA/Email/Portal) | "Versand an Gericht/Mandant"               |
| I   | Honorar & Abrechnung             | "RVG, Zeiterfassung, Rechnung, Fremdgeld"  |
| J   | Compliance & Sicherheit          | "DSGVO, GoBD, Verfahrensdoku, Legal Hold"  |
| K   | Kanzleisteuerung & Team          | "Controlling, Workflows, Vertretung"       |
| L   | Tax-Vertical                     | "Steuerberater-Nutzung (2. Vertical)"      |

Jeder Cluster hat **Prüfstationen** mit: Userflow, Beweis-Schritt,
Akzeptanzkriterien, Edge-Cases.

---

## A) Cluster: Morgen & Orientierung

### A1 — Dashboard-Home zeigt den Arbeitstag

- **Userflow:** Anwalt loggt sich ein → sieht sofort was heute ansteht.
- **Beweis:** `/dashboard` öffnen. Widget-Board, Morning Briefing, Today View.
- **Akzeptanzkriterien:**
  - [ ] Begrüßung mit Name + Tageszeit (de/en).
  - [ ] Fristen-Widget zeigt heutige/überfällige Fristen (rot markiert).
  - [ ] Posteingang-Widget zeigt ungelesene Nachrichten (beA/Email/Portal).
  - [ ] Wiedervorlagen-Widget zeigt heutige Wiedervorlagen.
  - [ ] Akten-Widget zeigt zuletzt bearbeitete Akten (Quick-Resume).
  - [ ] Morning Briefing (KI-generiert) fasst den Tag zusammen — MIT
        `CitationPanel` + "anwaltlich zu prüfen"-Badge (Invariant!).
  - [ ] Leerer Zustand (neue Kanzlei): Onboarding-CTA statt leerer Seite.
- **Edge-Cases:** 0 Fristen, 0 Nachrichten, 0 Akten, Wochenende, Feiertag.

### A2 — Sidebar-Navigation ist vollständig & logisch

- **Beweis:** Sidebar durchklicken, alle 13 Sektionen + Primary Items.
- **Akzeptanzkriterien:**
  - [ ] Primary Items immer sichtbar: Übersicht, Akten, Fristen, Intake,
        Recherche, Chat.
  - [ ] Sektionen einklappbar, Zustand bleibt erhalten.
  - [ ] Suche filtert über alle Nav-Items (Keywords).
  - [ ] Badges (Zähler) für Fristen/Posteingang/Review-Queue live.
  - [ ] Active-State der aktuellen Route markiert.
  - [ ] Plan-Tier-Gating sichtbar (free/pro/enterprise/admin).
  - [ ] Mobile: Sidebar als Bottom-Sheet/Drawer, Touch-Targets ≥44px.
- **Datei:** `src/components/dashboard/sidebar.tsx`

### A3 — Command Palette & globale Suche

- **Beweis:** Cmd+K drücken, globale Suche `/dashboard/search`.
- **Akzeptanzkriterien:**
  - [ ] Cmd+K öffnet Command Palette.
  - [ ] Suche findet Akten, Mandanten, Dokumente, Normen, Urteile.
  - [ ] Tastatur-Navigation (Pfeile/Enter/Escape).
  - [ ] Recent-Items + Shortcuts.

---

## B) Cluster: Mandant & Intake

### B1 — Neuer Mandant (Intake)

- **Userflow:** Mandant meldet sich → Anwalt legt Mandant an.
- **Beweis:** `/dashboard/intake` + `/dashboard/contacts` (neu anlegen).
- **Akzeptanzkriterien:**
  - [ ] Intake-Queue zeigt eingehende Anfragen (beA/Email/WhatsApp/Portal).
  - [ ] Mandant anlegen: Name, Adresse, Kontakt, Gegner-Flag.
  - [ ] Pflichtfelder validiert (kein Speichern ohne Minimum).
  - [ ] Mandant → Akte-Konvertierung (Intake → Case).
  - [ ] Duplicate-Erkennung (gleicher Name/Adresse → Warnung).
  - [ ] Toast bei Erfolg UND Fehler.
- **Edge-Cases:** Duplikat, unvollständige Daten, Mandant ohne Akte.

### B2 — Kontaktdatenbank (Mandanten + Gegner)

- **Beweis:** `/dashboard/contacts` + `/dashboard/opponents`.
- **Akzeptanzkriterien:**
  - [ ] Liste mit Suche, Filter, Pagination (URL-State!).
  - [ ] CRUD vollständig: anlegen, bearbeiten, löschen (mit Confirm).
  - [ ] Mandant vs. Gegner getrennt.
  - [ ] Kontakt-Historie (welche Akten verknüpft).
  - [ ] Empty-State mit CTA.

### B3 — Kollisionsprüfung (Konfliktscheck)

- **Userflow:** Bevor Mandat angenommen → Konfliktcheck Pflicht.
- **Beweis:** `/dashboard/kollisionspruefung` + `/api/legal/conflict-check`.
- **Akzeptanzkriterien:**
  - [ ] Suche nach Name/Adresse/Gegner über ALLE Akten.
  - [ ] Ergebnis: konfliktfrei / Konflikt gefunden / unklar.
  - [ ] Bei Konflikt: Warnung + betroffene Akten aufgelistet.
  - [ ] Konfliktcheck MUSS vor Mandatsannahme laufen (Workflow-Enforcement).
  - [ ] Ethical Wall (`/dashboard/cases/[slug]/ethical-wall`) für gesperrte Akten.
  - [ ] Audit-Log-Eintrag bei jedem Check.
- **Berufsrecht:** §43a BRAO, §3 BORA — Konfliktsprüfung Pflicht.

---

## C) Cluster: Akte (Mandat)

### C1 — Aktenliste & Akte anlegen

- **Beweis:** `/dashboard/cases` + `/dashboard/cases/new`.
- **Akzeptanzkriterien:**
  - [ ] Liste mit Facetten-Filter (Rechtsgebiet, Status, Priorität, Bearbeiter).
  - [ ] Neue Akte: Aktenzeichen, Mandant, Gegner, Rechtsgebiet, Frist.
  - [ ] Aktenzeichen auto-generiert (Kanzlei-Schema).
  - [ ] Bulk-Import (`/dashboard/bulk-cases`) für CSV-Portfolios.
  - [ ] Case-Search (`/dashboard/case-search`) facettiert.

### C2 — Akten-Detail (Mandatsarbeitsplatz)

- **Userflow:** Anwalt öffnet Akte → sieht alles an einem Ort.
- **Beweis:** `/dashboard/cases/[...slug]` + Matter-Context API.
- **Akzeptanzkriterien:**
  - [ ] Rubrum (Mandant, Gegner, Gericht, Az).
  - [ ] Fristen-Section (alle Fristen dieser Akte).
  - [ ] Dokumente-Section (Vault-Dateien dieser Akte).
  - [ ] Chronologie/Timeline (`/api/legal/chronology`).
  - [ ] Matter-Knowledge (`/api/matter-context/[caseSlug]` — facts, parties,
        gaps, understanding, coverage, explain).
  - [ ] Aktivitäts-Feed (jede Aktion protokolliert).
  - [ ] Sidebar-Section für aktuelle Akte (Matter-Switcher).
- **Edge-Cases:** Akte ohne Fristen, ohne Dokumente, archivierte Akte.

### C3 — Akten-Switcher & Kontextwechsel

- **Beweis:** Matter-Switcher in Sidebar (`matter-switcher.tsx`).
- **Akzeptanzkriterien:**
  - [ ] Schneller Wechsel zwischen letzten Akten.
  - [ ] Kontext bleibt pro Akte erhalten (Filter, Scroll).
  - [ ] Cross-Case-Timeline (`cross-case-timeline.tsx`).

---

## D) Cluster: Fristen, Termine, Wiedervorlage

> **Kritischster Cluster.** Versäumte Frist = Regress + Berufsrechtsverletzung.

### D1 — Fristen-Management

- **Beweis:** `/dashboard/deadlines` + `/dashboard/fristenbuch` + `/api/legal/fristen` + `/api/legal/frist/compute`.
- **Akzeptanzkriterien:**
  - [ ] Frist berechnen (§187 BGB: Beginn nächsten Tag, Ende Ablauftag;
        §193 BGB: Wochenende/Feiertag → nächster Werktag).
  - [ ] Fristenbuch (chronologisches Register, GoBD-konform).
  - [ ] Frist-Typen: Notfrist, gesetzliche Frist, richterliche Frist,
        vertragliche Frist, Wiedervorlage.
  - [ ] Status: offen → gewahrt / versäumt (mit Datum + Beweis).
  - [ ] Erinnerungen: cron `deadline-reminders`, `deadline-alerts`.
  - [ ] ICS-Export (`/api/legal/deadlines.ics`) für Outlook-Kalender.
  - [ ] Fristenreport (`/api/legal/fristenreport`) für GoBD.
  - [ ] Guardrails: Frist ohne Datum kann nicht gespeichert werden.
- **Edge-Cases:** Wochenende, Feiertag (bundesland-spezifisch), 31.12., Schaltjahr.

### D2 — Kalender & Termine

- **Beweis:** `/dashboard/calendar` + `/dashboard/calendar-export`.
- **Akzeptanzkriterien:**
  - [ ] Tages/Wochen/Monats-Ansicht.
  - [ ] Termin anlegen, bearbeiten, löschen (CRUD).
  - [ ] Outlook-Sync (`/api/outlook/calendar`, cron `outlook-sync`).
  - [ ] Termin-Art: Gerichtstermin, Mandantenbesprechung, interne.
  - [ ] Erinnerung konfigurierbar.

### D3 — Wiedervorlagen

- **Beweis:** `/dashboard/wiedervorlagen` + `/api/legal/wiedervorlage`.
- **Akzeptanzkriterien:**
  - [ ] Wiedervorlage anlegen (Datum, Grund, Akten-Link).
  - [ ] Liste: offen, erledigt, überfällig.
  - [ ] Erinnerung bei Fälligkeit.

### D4 — Aufgaben (Tasks)

- **Beweis:** `/dashboard/tasks`.
- **Akzeptanzkriterien:**
  - [ ] Task anlegen, zuweisen, status ändern.
  - [ ] Verknüpfung mit Akte/Frist.
  - [ ] Bulk-Abschließen.

---

## E) Cluster: Recherche & Wissensbasis

### E1 — Legal Research Hub

- **Beweis:** `/dashboard/research` (6 Tabs: Recherche, Rechtsprechung, Normen,
  Urteils-DB, Präzedenzfälle, Kommentierungen).
- **Akzeptanzkriterien:**
  - [ ] Recherche-Tab: Frage stellen → Supervisor-Pipeline → Antwort + Zitate.
  - [ ] Antwort MIT `CitationPanel` + "anwaltlich zu prüfen"-Badge (Invariant!).
  - [ ] Saved Research (Brain-Pages, type `legal_research`).
  - [ ] Offline-Fallback (Cache aus `offline-store`).
  - [ ] Jurisdiction-Filter (de/at/ch/eu).
- **Datei:** `src/app/dashboard/research/page.tsx`

### E2 — Normen & Gesetze

- **Beweis:** `/dashboard/norms` + `/api/legal/statute` + `/api/legal/statute-search`.
- **Akzeptanzkriterien:**
  - [ ] Norm durchsuchen (Volltext + Artikel-Nummer).
  - [ ] Norm anzeigen mit Quellenangabe (RIS-Verweis).
  - [ ] Statute-Currency (cron `statute-currency` — Aktualitäts-Check).
  - [ ] RIS-Delta-Watcher (cron `ris-delta-watcher` — Änderungen).

### E3 — Rechtsprechung & Urteils-DB

- **Beweis:** `/dashboard/rechtsprechung` + `/dashboard/judgements-db` +
  `/dashboard/precedent-search` + `/dashboard/judgements-sync`.
- **Akzeptanzkriterien:**
  - [ ] Urteile durchsuchen (Gericht, Datum, Leitsatz, Az).
  - [ ] Urteils-DB-Import-Pipeline (`/api/legal/judgements-db/import`).
  - [ ] Judgements-Sync (cron `judgements-sync`).
  - [ ] Präzedenz-Suche (ähnliche Fälle).
  - [ ] Graph-Embeddings für Urteil-Ähnlichkeit.

### E4 — Kommentierungen

- **Beweis:** `/dashboard/commentaries` + `/api/legal/commentaries`.
- **Akzeptanzkriterien:**
  - [ ] Kommentar zu Norm/Urteil lesen.
  - [ ] Eigene Kommentierung hinzufügen (CRUD).

### E5 — Brain & Knowledge Graph

- **Beweis:** `/dashboard/brain` + `/dashboard/graph` + `/dashboard/sources`.
- **Akzeptanzkriterien:**
  - [ ] Brain-Pages durchsuchen (Wissensbasis der Kanzlei).
  - [ ] Graph: Entitäten & Beziehungen visualisiert.
  - [ ] Sources: Datenquellen-Verwaltung (Connectors).

---

## F) Cluster: KI-Assistent & Vertrauen

> **Cross-cutting Invariant:** Jede KI-Output-Fläche MUSS `useGroundedAnswer`
>
> - `CitationPanel` haben. Keine Ausnahme.

### F1 — Chat / Copilot

- **Beweis:** `/dashboard/chat` + `/components/chat/*`.
- **Akzeptanzkriterien:**
  - [ ] Frage stellen → Antwort mit Zitaten.
  - [ ] `useGroundedAnswer` aktiv (Grounding-Check non-blocking).
  - [ ] `CitationPanel` mit verified/unverified-Zählern.
  - [ ] "anwaltlich zu prüfen"-Badge sichtbar.
  - [ ] Chat-Historie, neue Konversation.
  - [ ] Compare-View (`/dashboard/chat/compare`).
  - [ ] Chat-Analytics (`/dashboard/chat/analytics`).
  - [ ] Test: `chat-grounding.test.tsx` + `use-grounded-answer.test.ts` grün.
- **Invariant-Check:** grep nach KI-Output ohne `CitationPanel` → muss leer sein.

### F2 — Deep Analysis & Subsumption

- **Beweis:** `/dashboard/deep-analysis` + `/dashboard/analyze` +
  `/api/legal/subsumption` + `/api/legal/deep-analysis`.
- **Akzeptanzkriterien:**
  - [ ] Subsumptions-Gutachten (Tatbestand → Norm → Subsumption → Ergebnis).
  - [ ] Mit Zitaten + CitationPanel.
  - [ ] Risiko-Analyse (`/api/legal/risk-analysis`).

### F3 — Contradiction-Probe & Red-Team

- **Beweis:** `/dashboard/red-team` + `/api/legal/contradiction-probe` +
  `/api/legal/contradictions`.
- **Akzeptanzkriterien:**
  - [ ] Adversarielle Prüfung der eigenen Argumentation.
  - [ ] Widersprüche in Akte/Recherche aufgedeckt.
  - [ ] Gegenanwalt-Simulation (`/api/legal/opponent-simulation`).

### F4 — Perspektivenraum (War-Room)

- **Beweis:** `/dashboard/war-room` + `/api/legal/perspektiven-room`.
- **Akzeptanzkriterien:**
  - [ ] Rollen: Richter, Gegenanwalt, Mandant — verschiedene Sichtweisen.
  - [ ] Pro/A contra-Liste pro Rolle.

---

## G) Cluster: Schriftsatz & Drafting

### G1 — Drafting (Schriftsatz-Editor)

- **Beweis:** `/dashboard/drafting` + `/api/legal/schriftsatz`.
- **Akzeptanzkriterien:**
  - [ ] KI-gestützter Entwurf (Schriftsatz aus Akten-Kontext).
  - [ ] Vorlagen (`/dashboard/templates`).
  - [ ] Writing-Styles (`/api/legal/writing-styles`).
  - [ ] Letterhead/Rubrum (`/api/letterhead-rubrum`).
  - [ ] Word-Export (`/api/word-export`).
  - [ ] KI-Output MIT CitationPanel.

### G2 — Vertrags-Drafting & Redlining

- **Beweis:** `/dashboard/contracts` + `/dashboard/clause-library` +
  `/api/legal/contract-draft` + `/api/legal/contract-redline` +
  `contract-redline-viewer.tsx`.
- **Akzeptanzkriterien:**
  - [ ] Vertrag aus Vorlage + Klausel-Bibliothek.
  - [ ] Redlining (Änderungen sichtbar, akzeptieren/ablehnen).
  - [ ] Obligation-Tracking (`/dashboard/obligation-tracking`).

### G3 — Diktat & Document-Interviews

- **Beweis:** `/dashboard/dictation` + `/dashboard/document-interviews` +
  `/api/dictation` + `/api/document-interviews`.
- **Akzeptanzkriterien:**
  - [ ] Sprach-Aufnahme → Transkription → Text.
  - [ ] Geführtes Interview (Fragebogen → Dokument).

### G4 — Übersetzung

- **Beweis:** `/dashboard/translate` + `/api/legal/translate`.
- **Akzeptanzkriterien:**
  - [ ] Rechtstext übersetzen (de↔en↔fr etc.).
  - [ ] Fachterminologie erhalten.

---

## H) Cluster: Kommunikation (beA / Email / Portal)

### H1 — beA (Besonderes elektronisches Anwaltspostfach)

- **Beweis:** `/dashboard/bea` + `/api/bea/*` + `src/lib/bea-import.ts` +
  `src/lib/bea-send.ts`.
- **Akzeptanzkriterien:**
  - [ ] beA-Posteingang lesen.
  - [ ] beA-Versand (e-Filing ans Gericht).
  - [ ] Authentifizierung (Zertifikat/Client).
  - [ ] Tests: `bea-import.test.ts` + `bea-send.test.ts` grün.

### H2 — Unified Communications

- **Beweis:** `/dashboard/communications` + `/api/email/*` + `/api/whatsapp/*`.
- **Akzeptanzkriterien:**
  - [ ] Inbox: beA + Email + WhatsApp + Portal-Nachrichten vereinigt.
  - [ ] Antwort direkt aus Inbox.
  - [ ] Tracking (gelesen/ungelesen).
  - [ ] Mandant-Zuordnung.

### H3 — Mandantenportal

- **Beweis:** `/dashboard/client-portal` + `/api/portal/*`.
- **Akzeptanzkriterien:**
  - [ ] Portal-Link an Mandant senden.
  - [ ] Mandant lädt Dokumente hoch (`/api/portal/upload`).
  - [ ] Signable-Docs (`/api/portal/signable-docs`, `/api/portal/sign`).
  - [ ] Chat im Portal (`/api/portal/chat`).
  - [ ] Revoke (`/api/portal/revoke`).

### H4 — Dokumentenanforderung

- **Beweis:** `/dashboard/document-requests` + `/api/document-requests`.
- **Akzeptanzkriterien:**
  - [ ] Anforderung an Mandant (Liste fehlender Dokumente).
  - [ ] Erinnerungen (cron `document-request-reminders`).
  - [ ] Status-Tracking.

### H5 — Signatur (DocuSign)

- **Beweis:** `/dashboard/signature` + `/api/docusign/*`.
- **Akzeptanzkriterien:**
  - [ ] Dokument zur Signatur senden.
  - [ ] Status abfragen.
  - [ ] Webhook für Abschluss.

---

## I) Cluster: Honorar & Abrechnung

### I1 — RVG-Kostenrechner

- **Beweis:** `/dashboard/cost-calculator` + `/api/legal/rvg` + `/api/fachrechner`.
- **Akzeptanzkriterien:**
  - [ ] Streitwert → Gebühren (1-3 fach, Verfahrens-/Termins-/Erledigungsgebühr).
  - [ ] RVG-Tabellen aktuell.
  - [ ] PKH-Beratungshilfe (`/api/pkh-beratungshilfe`).

### I2 — Zeiterfassung

- **Beweis:** `/dashboard/time` + `/dashboard/time-tracking` +
  `/dashboard/time-suggestions` + `/api/time/*` + `/api/time-tracking/*`.
- **Akzeptanzkriterien:**
  - [ ] Timer starten/stoppen (Stoppuhr).
  - [ ] Manuelle Erfassung.
  - [ ] Passive Vorschläge (cron `time-suggestions`).
  - [ ] Heartbeat (Inaktivitäts-Check).
  - [ ] Als abgerechnet markieren.

### I3 — Rechnungserstellung

- **Beweis:** `/dashboard/invoicing` + `/api/invoices/*`.
- **Akzeptanzkriterien:**
  - [ ] Rechnung aus Zeiten + RVG generieren.
  - [ ] E-Rechnung (`/api/e-invoice/*` — XRechnung/ZUGFeRD).
  - [ ] Versand (`/api/invoices/send`).
  - [ ] Mahnung (`/api/invoices/remind`).
  - [ ] Dunning-Run (cron `dunning-run`).

### I4 — Honorarvereinbarung & Fremdgeld

- **Beweis:** `/dashboard/fee-agreements` + `/dashboard/trust-accounting` +
  `/dashboard/claim-account` + `/api/legal/trust-accounts/*`.
- **Akzeptanzkriterien:**
  - [ ] Honorarvereinbarung (Deckelung, Stundensatz).
  - [ ] Treuhandkonto (Fremdgelder, §43a BRAO).
  - [ ] Mahnverfahren / Zwangsvollstreckung (`/dashboard/claim-account`).
  - [ ] Rechtsschutzversicherung (`/dashboard/legal-insurance`).

### I5 — FiBu & DATEV

- **Beweis:** `/dashboard/fibu` + `/dashboard/datev-export` +
  `/dashboard/datev-direct` + `/api/fibu/*` + `/api/datev/*`.
- **Akzeptanzkriterien:**
  - [ ] FiBu: Bank-Feed, OPos, Zahlungsverkehr.
  - [ ] DATEV-Export (CSV).
  - [ ] DATEV-Direct (API — comingSoon-Flag prüfen!).

---

## J) Cluster: Compliance & Sicherheit

### J1 — DSGVO / GDPR

- **Beweis:** `/dashboard/compliance` + `/api/settings/gdpr/*`.
- **Akzeptanzkriterien:**
  - [ ] Datenschutz-Export (`/api/settings/gdpr/data-export`).
  - [ ] Löschanfrage (`/api/settings/gdpr/data-deletion`).
  - [ ] Aufbewahrungsfristen (`/dashboard/compliance/retention`, cron `retention`).
  - [ ] AI-Act-Compliance (`/dashboard/compliance/ai-act`).

### J2 — Verfahrensdokumentation & GoBD

- **Beweis:** `/dashboard/verfahrensdoku` + `gobd-integrity-panel.tsx`.
- **Akzeptanzkriterien:**
  - [ ] Jede Aktion audit-protokolliert (`/api/audit`-Log).
  - [ ] GoBD-Integrität (nachvollziehbar, unveränderbar).
  - [ ] Audit-Chain-Verifikation (`audit-chain-verification.ts`).

### J3 — Legal Hold & Ausgangsbuch

- **Beweis:** `/dashboard/legal-hold` + `/dashboard/outbound-register`.
- **Akzeptanzkriterien:**
  - [ ] Legal Hold: Dokumente gesperrt gegen Löschung.
  - [ ] Postausgangsbuch (Zustellungsnachweise).

### J4 — KYC / Geldwäsche

- **Beweis:** `/dashboard/kyc` + `/api/kyc`.
- **Akzeptanzkriterien:**
  - [ ] Identitätsprüfung (GWG).
  - [ ] Risk-Assessment.

### J5 — Auth & Session-Sicherheit

- **Beweis:** `src/lib/auth/*` + `/api/auth/*`.
- **Akzeptanzkriterien:**
  - [ ] Login mit Passwort + 2FA.
  - [ ] Lockout & Rate-Limit (`lockout.ts`, `rate-limit.ts`).
  - [ ] API-Key-Auth (`api-key-auth.ts`).
  - [ ] SCIM/SSO (`/dashboard/settings/scim`).
  - [ ] Session-Management sicher (HttpOnly-Cookies).

### J6 — Audit-Log

- **Beweis:** `/dashboard/audit` + `/api/audit`.
- **Akzeptanzkriterien:**
  - [ ] Jede sicherheitsrelevante Aktion protokolliert (wer, was, wann).
  - [ ] Log unveränderbar.
  - [ ] Filterbar (User, Aktion, Datum).

---

## K) Cluster: Kanzleisteuerung & Team

### K1 — Controlling & KPIs

- **Beweis:** `/dashboard/controlling` + `/dashboard/peer-benchmark` +
  `/dashboard/analytics` + `/dashboard/court-analytics` +
  `/dashboard/litigation-analytics` + `/dashboard/portfolio-insights`.
- **Akzeptanzkriterien:**
  - [ ] Umsatz, offene Posten, Erfolgsquote, Durchlaufzeit.
  - [ ] Peer-Benchmark (anonymisierter Vergleich).
  - [ ] Gerichts-Analytics (Erfolgsquote pro Gericht/Richter).

### K2 — Workflows & Approvals

- **Beweis:** `/dashboard/workflows` + `/dashboard/approvals` +
  `/api/workflows/*`.
- **Akzeptanzkriterien:**
  - [ ] Workflow definieren (Schritte, Freigaben).
  - [ ] Approval-Queue (4-Augen-Prinzip).

### K3 — Team & Vertretung

- **Beweis:** `/dashboard/team` + `/dashboard/absences` +
  `/dashboard/case-assignment` + `/dashboard/team-meeting`.
- **Akzeptanzkriterien:**
  - [ ] Mitglieder-Verwaltung (Rollen: Admin, Anwalt, Sachbearbeiter).
  - [ ] Abwesenheit & Vertretung (Fristen-Delegation).
  - [ ] Akten-Zuweisung (Workload-Balance).
  - [ ] Team-Besprechung (Agenda).

### K4 — FAO-Tracking & Onboarding

- **Beweis:** `/dashboard/fao-tracking` + `/dashboard/onboarding` +
  `/dashboard/experience`.
- **Akzeptanzkriterien:**
  - [ ] Fortbildungsnachweise (Fachanwalt).
  - [ ] Onboarding-Flow für neue Nutzer.
  - [ ] Erfahrungs-Profil.

### K5 — Shared Spaces & White-Label

- **Beweis:** `/dashboard/shared-spaces` + `/dashboard/white-label`.
- **Akzeptanzkriterien:**
  - [ ] Geteilte Arbeitsbereiche (Mandanten-Teams).
  - [ ] White-Label (Branding, PWA, Portal-Logo).

---

## L) Cluster: Tax-Vertical (2. Vertical)

### L1 — Steuer-Mandanten

- **Beweis:** `/dashboard/tax-clients`.
- **Akzeptanzkriterien:**
  - [ ] Steuer-Mandanten-Liste (separat von Rechts-Mandanten).
  - [ ] CRUD.

### L2 — Steuererklärungen

- **Beweis:** `/dashboard/tax-returns` + `/api/tax/returns/*`.
- **Akzeptanzkriterien:**
  - [ ] Erklärung anlegen, bearbeiten.
  - [ ] ELSTER-Übermittlung (`/dashboard/elster` + `/api/tax/elster`).

### L3 — Steuer-Bescheide & Einspruch

- **Beweis:** `/dashboard/tax-assessments` + `/dashboard/tax-audit` +
  `/api/tax/assessments/*` + `/api/tax/audits/*` + `/api/tax/appeal-generator`.
- **Akzeptanzkriterien:**
  - [ ] Bescheid erfassen, Einspruch generieren (KI).
  - [ ] Betriebsprüfung-Verwaltung.

### L4 — Steuer-Fristen & StBVV

- **Beweis:** `/dashboard/tax-deadlines` + `/dashboard/tax-stbvv` +
  `/api/tax/stbvv`.
- **Akzeptanzkriterien:**
  - [ ] Steuer-Fristen separat.
  - [ ] StBVV (Steuerberater-Vergütungsverordnung).

### L5 — Steuer-Analytics

- **Beweis:** `/api/tax/analyze` + `/api/tax/case-strategy` +
  `/api/tax/risk-analysis` + `/api/tax/triage` + `/api/tax/summarize` +
  `/api/tax/precedent-search` + `/api/tax/client-letter` + `/api/tax/bfh-feed`.
- **Akzeptanzkriterien:**
  - [ ] KI-Analyse (MIT CitationPanel!).
  - [ ] BFH-Feed (Bundesfinanzhof).

---

## X) Cluster: Engine & Corpus (Admin-Sicht, aber Anwalt spürt Qualität)

> Der Anwalt sieht diese Cluster nicht direkt, aber er spürt die Qualität:
> schlechte Retrieval = schlechte Antworten = schlechter Schriftsatz.

### X1 — Corpus & Embeddings

- **Beweis:** `/dashboard/admin/corpus` + `/api/monitoring/corpus-*`.
- **Akzeptanzkriterien:**
  - [ ] Corpus-Stats: Chunks, Embedded, Embedding-Rate.
  - [ ] Chunk-Quality (`/api/monitoring/chunk-quality`).
  - [ ] Corpus-Freshness (`/api/monitoring/corpus-freshness`).
  - [ ] Pipeline-Health (`/api/monitoring/pipeline-health`).
  - [ ] RAG-Eval (`/dashboard/rag-eval` + `/api/rag-eval`).
  - [ ] AI-Quality (`/dashboard/ai-quality`).
  - [ ] RAG-Optimizer (`/dashboard/admin/rag-optimizer`).
- **Bekanntes Problem (aus vorigem Audit):** Embeddings 0%, 348 Chunks ohne
  Rolle/Typ, 4805 zu lange Chunks, 1092 Nav-Müll-Chunks. → PRÜFEN ob behoben.

### X2 — Engine-Parity & Schema

- **Beweis:** `test/e2e/engine-parity.test.ts` + `test/schema-bootstrap-coverage.test.ts`.
- **Akzeptanzkriterien:**
  - [ ] PGLite + Postgres in Lockstep.
  - [ ] Migrationen im MIGRATIONS-Array.
  - [ ] JSONB-Pattern-Guard (`scripts/check-jsonb-pattern.sh`).

### X3 — Monitoring & SLO

- **Beweis:** `/dashboard/monitoring` + `/dashboard/admin/slo` +
  `/dashboard/admin/token-usage` + `/dashboard/admin/guardrails`.
- **Akzeptanzkriterien:**
  - [ ] SLO-Metriken sichtbar.
  - [ ] Token-Usage (Kosten-Tracking).
  - [ ] Guardrails-Stats (Fristen, Pipeline).

---

## Y) Cross-cutting Invarianten (MUSS überall grün)

Diese Invarianten gelten über ALLE Cluster hinweg. Sie werden zentral geprüft:

- [ ] **Y1 Trust fail-closed:** `ctx.remote === false` für trusted-only. Kein
      falsy Default. (grep `ctx.remote` in server/)
- [ ] **Y2 Source-Isolation:** jede read-side op via `sourceScopeOpts(ctx)`.
      Kein hand-rolled Source-Filter. (grep `source_id` ohne `sourceScopeOpts`)
- [ ] **Y3 JSONB:** kein `JSON.stringify` in `::jsonb`. (`scripts/check-jsonb-pattern.sh`)
- [ ] **Y4 Engine-Parity:** PGLite + Postgres Lockstep. (`test/e2e/engine-parity.test.ts`)
- [ ] **Y5 Contract-first:** `operations.ts` Single Source. CLI + MCP generiert.
- [ ] **Y6 CitationPanel + useGroundedAnswer:** Jede AI-Output-Fläche.
      (`chat-grounding.test.tsx` + `use-grounded-answer.test.ts`)
- [ ] **Y7 Eine kanonische Pricing-Tabelle:** `model-pricing.ts`. (`test/model-pricing.test.ts`)
- [ ] **Y8 Migrationen:** im `MIGRATIONS`-Array. (`server/src/core/migrate.ts`)
- [ ] **Y9 Corpus raw-Sync:** jede Schreib-Op `syncToRawCorpus()`, jede
      Löschung `removeFromRawCorpus()`.
- [ ] **Y10 Toast bei JEDEM Mutation-Erfolg UND -Fehler.**
- [ ] **Y11 `queryClient.invalidateQueries` nach jeder Mutation.**
- [ ] **Y12 Buttons während `isPending` disabled.**
- [ ] **Y13 Kein `any` in neuem Code.**
- [ ] **Y14 DACH-Texte (de-AT/de-DE), keine englischen UI-Labels.**
- [ ] **Y15 WCAG 2.1 AA, Kontrast ≥4.5:1, `prefers-reduced-motion`.**

---

## Z) Audit-Durchführung (Prüfweg-Abarbeitung)

### Phase 1 — Vorbereitung

1. Dev-Server läuft auf :3000 (nicht neu starten).
2. Test-User mit realistischen Daten (Mandanten, Akten, Fristen).
3. Browser auf Desktop + Mobile (Tablet) — Anwälte arbeiten oft auf Tablet.

### Phase 2 — Cluster-Durchlauf (A → L)

- Pro Cluster: jede Prüfstation durchspielen.
- Beweis pro Station: Screenshot oder API-Response speichern.
- Edge-Cases aktiv provozieren (`/edge-case-stress`-Skill).
- Gefundene Lücken dokumentieren: Cluster, Station, Befund, Schweregrad.

### Phase 3 — Cross-cutting Invarianten (Y)

- Zentrale Skripte laufen: `bun run verify`, `scripts/check-jsonb-pattern.sh`.
- Invariant-Tests grün: `chat-grounding.test.tsx`,
  `use-grounded-answer.test.ts`, `engine-parity.test.ts`,
  `schema-bootstrap-coverage.test.ts`, `model-pricing.test.ts`.
- grep-Audits: AI-Output ohne CitationPanel, `any` in neuem Code.

### Phase 4 — End-to-End Anwaltstag

Ein kompletter Arbeitstag wird durchgespielt (ohne Abbruch):

1. Morgen: Dashboard → Briefing → Fristen checken.
2. Neuer Mandant: Intake → Konfliktscheck → Akte anlegen.
3. Recherche: Frage stellen → Antwort prüfen → Zitate validieren.
4. Schriftsatz: Drafting → Vorlage → Word-Export.
5. Versand: beA ans Gericht + Email an Mandant.
6. Frist: berechnen → eintragen → Kalender-Export.
7. Abrechnung: Zeit erfassen → RVG → Rechnung → DATEV-Export.
8. Compliance: Audit-Log prüfen → Verfahrensdoku → GoBD.

Jeder Bruch zwischen Stationen = Fehler.

### Phase 5 — DoD-Gate

- `/dod-gate` aufrufen → 15-item Checkliste.
- `/subsumio-dod-layer` → Engine-Invarianten.
- `/self-audit` → 5 harte Fragen pro Cluster.

### Schweregrad-Klassifikation

- **BLOCKER:** Berufsrechtliche Pflicht verletzt (Frist, Konflikt, GoBD, DSGVO).
- **CRITICAL:** Kern-Userflow bricht (Akte nicht speicherbar, Versand fehlerhaft).
- **MAJOR:** Invariant verletzt (CitationPanel fehlt, Source-Isolation umgangen).
- **MINOR:** UX/Polish (fehlender Empty-State, fehlender Toast, kein Dark-Mode).

---

## Definition of Done (für den Audit-Prüfweg selbst)

- [ ] Alle 12 Cluster (A–L) + Engine (X) + Invarianten (Y) durchgespielt.
- [ ] Pro Station: Beweis (Screenshot/API) vorhanden.
- [ ] Edge-Cases pro Station provozieren und dokumentiert.
- [ ] End-to-End Anwaltstag (Phase 4) ohne Bruch durchgespielt.
- [ ] DoD-Gate + Subsumio-DoD-Layer bestanden.
- [ ] Befund-Liste mit Schweregrad erstellt.
- [ ] BLOCKER + CRITICAL = 0 für "produktionsreif aus Anwaltssicht".

> **Ergebnis-Ziel:** Am Ende können wir sagen: "Ein Anwalt, der die Software
> im Alltag nutzt, findet keine Lücke, die seine Arbeit blockiert — alle
> Userflows sind vollständig, alle berufsrechtlichen Pflichten erfüllt,
> alle KI-Antworten vertrauenswürdig groundiert."
