# Subsumio für Steuerberater — Umbau-Analyse (Juni 2026)

> **Frage:** Wie umfangreich müssten wir umbauen, um Subsumio für Steuerberater zu machen?
> **Antwort:** Weniger als man denkt. Die Kern-Architektur ist bereits multi-industry-fähig. ~60% der Codebase ist domain-agnostisch. DATEV und GoBD sind bereits implementiert.
>
> **Update 28.06.2026:** Die `tax` Industry ist nun **registriert und aktiv** in `src/lib/industry-pack.ts`.
> Sidebar (`navForIndustry()`), Theme (Emerald/Teal), Brand (Subsumio Tax) und Brain-Provisioning sind implementiert.
> Dieser Umbau-Schritt (Phase 1 des Blueprints) ist **abgeschlossen**.
> Verbleibend: Tax-spezifische Dashboard-Pages, StBVV, Steuerfristen-Regeln, Tax Corpus, ELSTER.

---

## 1. Was bereits vorhanden ist und direkt reusebar ist

### 1.1 DATEV Integration ✅ — bereits gebaut!

- `src/lib/datev-export.ts` — CSV-Export im DATEV-Format (SKR03/SKR04/SKR49)
- `src/lib/datev-import.ts` — DATEV-Import (Buchungsdaten, Konten, Adressdaten)
- `src/app/dashboard/datev-export/` — Dashboard UI
- **Fazit:** Das ist der wichtigste Baustein für Steuerberater. Bereits fertig.

### 1.2 GoBD ✅ — bereits gebaut!

- `src/lib/gobd.ts` — GoBD-Compliance (Hash, Retention, Manipulations-Evidenz)
- `src/lib/gobd-verfahrensdoku.ts` — Verfahrensdokumentation
- `src/app/dashboard/verfahrensdoku/` — GoBD Verfahrensdoku UI
- `src/app/dashboard/compliance/` — Compliance Dashboard
- **Fazit:** GoBD ist steuerberaterspezifisch. Bereits fertig.

### 1.3 Industry Pack Architektur ✅ — multi-industry implementiert

- `src/lib/industry-pack.ts` — Registry-Pattern mit `INDUSTRY_PROFILES`
- **`legal` und `tax` sind beide registriert** mit eigenem Theme, Brand, Pack und Signature
- `IndustryProfile` Interface mit: key, label, brand, theme, pack, signature
- `provision.ts` — Brain Provisioning pro Industry (mountet `subsumio-tax` Skill-Pack)
- `sidebar.tsx` — `navForIndustry()` rendert industry-conditional Navigation (`LEGAL_NAV` + `TAX_NAV`)
- `industry-pack.test.ts` — Tests für beide Industries grün
- **Fazit:** Phase 1 (Foundation) des Multi-Industry Blueprints ist abgeschlossen.

### 1.4 Domain-agnostische Module (reusebar ohne Aenderung)

| Modul                      | Datei                                | Fuer Steuerberater nutzbar?        |
| -------------------------- | ------------------------------------ | ---------------------------------- |
| **DMS**                    | `src/lib/dms/`                       | ✅ Dokumentenmanagement universal  |
| **Audit Trail**            | `src/lib/audit.ts`                   | ✅ Compliance-unabhaengig          |
| **Permissions**            | `src/lib/permissions.ts`             | ✅ RBAC universal                  |
| **Auth/SSO**               | `src/lib/auth/`, `src/lib/workos.ts` | ✅ Universal                       |
| **Billing**                | `src/lib/billing/`                   | ✅ Multi-Currency                  |
| **Time Tracking**          | `src/lib/time-tracking.ts`           | ✅ Universal                       |
| **Invoice PDF**            | `src/lib/invoice-pdf.ts`             | ✅ Universal                       |
| **Contacts**               | Dashboard                            | ✅ Universal                       |
| **Client Portal**          | `src/app/dashboard/client-portal/`   | ✅ Universal                       |
| **Realtime/Presence**      | `src/lib/realtime.ts`                | ✅ Universal                       |
| **Mobile**                 | Capacitor                            | ✅ Universal                       |
| **WhatsApp**               | `src/lib/whatsapp*`                  | ✅ Universal                       |
| **Email**                  | `src/lib/email/`                     | ✅ Universal                       |
| **DocuSign**               | `src/lib/docusign.ts`                | ✅ Universal                       |
| **AI Engine/GBrain**       | `src/lib/engine.ts`                  | ✅ Jurisdiktions-agnostisch        |
| **RAG/Eval**               | `src/lib/rag-eval.ts`                | ✅ Universal                       |
| **Citation Gate**          | `src/lib/citation-gate.ts`           | ✅ Universal                       |
| **Workflow Engine**        | `src/lib/workflow.ts`                | ✅ Universal                       |
| **Kanban/Task Management** | Dashboard                            | ✅ Universal                       |
| **Search**                 | `src/lib/queries/`                   | ✅ Universal                       |
| **Upload Pipeline**        | `src/lib/upload-*.ts`                | ✅ Universal                       |
| **Encryption**             | `src/lib/encryption.ts`              | ✅ Universal                       |
| **Data Classification**    | `src/lib/data-classification.ts`     | ✅ Universal                       |
| **Shared Spaces**          | `src/lib/shared-spaces.ts`           | ✅ Universal                       |
| **SCIM**                   | `src/lib/scim.ts`                    | ✅ Universal                       |
| **Ethical Walls**          | `src/lib/ethical-wall.ts`            | ✅ Universal (Mandanten-Conflicts) |
| **Offline Sync**           | `src/lib/offline-store.ts`           | ✅ Universal                       |

**Das ist ~60-65% der Codebase.** Diese Module brauchen null Aenderung.

---

## 2. Was angepasst oder neu gebaut werden muss

### 2.1 Law Corpus → Tax Corpus (NEU)

**Aktuell:** `law-corpus/de/` mit BGB, ZPO, StGB, etc.
**Steuerberater braucht:** AO, EStG, UStG, GewStG, BewG, ErbStG, KStG, SolZG, BauGB (steuerlich), EStDV, UStDV, etc.

**Aufwand:**

- ~20-30 Steuergesetze als Markdown einpflegen
- Format bereits etabliert (siehe `law-corpus/de/ao.md` — **bereits vorhanden!**)
- Aufwand: **2-3 Wochen** (ein Steuerberater-Praktikant kann das machen)

**Tatsaechlich bereits vorhanden:**

- `law-corpus/de/ao.md` — Abgabenordnung ✅
- `law-corpus/de/baugb.md` — Baugesetzbuch ✅
- Weitere Steuergesetze muessen ergaenzt werden

### 2.2 Legal Deadlines → Tax Deadlines (ANPASSUNG)

**Aktuell:** `src/lib/legal-deadlines.ts` — Fristen nach ZPO/BGB (DE/AT/CH), Feiertags-Kalkulator
**Steuerberater braucht:** Steuerfristen (§ 149 AO, § 163 AO, § 110 AO, Schätzungsfristen, Einspruchsfristen § 355 AO, etc.)

**Aufwand:**

- Fristen-Engine ist generisch gebaut — neue Rule-Keys hinzufuegen
- Feiertags-Kalkulator bereits fuer DE/AT/CH vorhanden — reusebar
- Neue Frist-Typen: Steuererklaerung, Betriebspruefung, Einspruch, Schätzung
- Aufwand: **1-2 Wochen** (Rule-Definitions + Tests)

### 2.3 RVG → StBVV (NEU, aber aehnlich)

**Aktuell:** `src/lib/rvg.ts` — RVG-Gebuehrenberechnung nach § 13 RVG
**Steuerberater braucht:** StBVV (Steuerberatervergütungsverordnung)

**Aufwand:**

- StBVV hat aehnliche Stufenformel-Struktur wie RVG
- Neues Modul `src/lib/stbvv.ts` — analog zu `rvg.ts`
- Aufwand: **1 Woche** (Implementierung + Tests)

### 2.4 Legal Types → Tax Types (ANPASSUNG)

**Aktuell:** `src/lib/legal-types.ts` — DeadlineEntry, TimelineEntry, TaskEntry, TimeEntry, etc.
**Steuerberater braucht:** Zusaetzliche Typen:

- `TaxReturnEntry` (Steuererklaerung: Art, Jahr, Status, Finanzamt)
- `TaxAssessmentEntry` (Bescheid: Art, Datum, Rechtsbehelf)
- `AuditEntry` (Betriebspruefung: Pruefungszeitraum, Status, Ergebnis)
- `TaxPaymentEntry` (Zahlung: Art, Betrag, Faelligkeit, Zahlungsstatus)

**Aufwand:**

- Bestehende Typen (Deadline, Timeline, Task, Time, Expense) reusebar
- 4-6 neue Typen hinzufuegen
- Aufwand: **3-5 Tage**

### 2.5 Legal Writing Styles → Tax Writing Styles (NEU)

**Aktuell:** `src/lib/legal/writing-styles.ts` — Juristische Schreibstile (Klage, Schriftsatz, etc.)
**Steuerberater braucht:** Steuerrechtliche Schreibstile:

- Einspruchsschreiben
- Schätzungsanfechtung
- Betriebspruefungsprotokoll
- Steuererklaerung-Anschreiben
- Feststellungserklärung

**Aufwand:**

- Neues Modul `src/lib/tax/writing-styles.ts` — analog zu legal
- 5-8 Schreibstile definieren
- Aufwand: **1 Woche**

### 2.6 Sidebar / Navigation (ANPASSUNG)

**Aktuell:** `src/app/dashboard/layout.tsx` — Legal-spezifische Sidebar (Akten, Fristen, Schriftsatz, etc.)
**Steuerberater braucht:** Angepasste Navigation:

- Mandanten (statt Akten)
- Steuerfristen (statt Verfahrensfristen)
- Steuererklaerungen (statt Schriftsaetze)
- Betriebspruefungen (statt Prozesse)
- DATEV (bereits vorhanden)
- Buchhaltung (neu)
- Finanzamt-Kommunikation (neu)

**Aufwand:**

- Industry-spezifische Sidebar-Items basierend auf `industry-pack.ts`
- Bedingte Rendering von Nav-Items je nach Industry
- Aufwand: **1 Woche** (inkl. i18n)

### 2.7 i18n (ANPASSUNG)

**Aktuell:** ~400+ Keys auf DE/EN
**Steuerberater braucht:** Zusaetzliche Keys:

- `tax.*` Namespace (Steuererklaerung, Betriebspruefung, etc.)
- `nav.*` fuer Steuerberater-Navigation
- `dashboard.*` fuer steuerberater-spezifische UI-Texte

**Aufwand:**

- ~150-200 neue i18n Keys
- Aufwand: **3-5 Tage**

### 2.8 ELSTER Integration (NEU — groesstes Einzel-Modul)

**Was:** ELSTER ist das deutsche Steuer-Portal (Elektronische Steuererklärung).
**Aufwand:**

- ELSTER API Integration (ERiC-SDK, nur fuer zertifizierte Steuerberater)
- Authentifizierung ueber Zertifikat/SmartCard
- Submission von Steuererklaerungen (ESt 1, USt 1, GewSt, etc.)
- **Das ist der komplexeste Einzel-Baustein.**
- Aufwand: **4-8 Wochen** (inkl. Zertifizierung, Testing, ELSTER-API-Doku)

**Alternative:** Erst ohne ELSTER starten — Export von XML/DATEV-Format, Steuerberater reicht manuell ein. ELSTER als Phase 2.

### 2.9 DATEV Unternehmen Online API (NEU — optional)

**Aktuell:** DATEV CSV-Export/Import vorhanden
**Steuerberater braucht:** Direkte API-Integration zu DATEV Unternehmen Online
**Aufwand:**

- DATEV API ist dokumentiert aber eingeschraenkt
- Aufwand: **2-4 Wochen** (falls gewuenscht)

### 2.10 Marketing Pages (NEU)

**Aktuell:** Subsumio Marketing ist legal-fokussiert
**Steuerberater braucht:** Eigene Landingpage, eigene Features, eigenes Branding
**Aufwand:**

- Industry-spezifische Marketing-Pages (ueber `INDUSTRY_PROFILES.marketingHref`)
- Aufwand: **1-2 Wochen** (Copywriting + Design)

---

## 3. Zusammenfassung: Umbau-Aufwand

| Kategorie                           | Aufwand    | Status                                                               |
| ----------------------------------- | ---------- | -------------------------------------------------------------------- |
| **Reusebar ohne Aenderung**         | 0          | ~60-65% der Codebase                                                 |
| **Industry Pack (tax registriert)** | ✅ Done    | `industry-pack.ts`, `sidebar.tsx`, `provision.ts` — Phase 1 komplett |
| **Law Corpus → Tax Corpus**         | 2-3 Wochen | Format vorhanden, Gesetze ergaenzen                                  |
| **Fristen-Engine**                  | 1-2 Wochen | Engine vorhanden, Rules ergaenzen                                    |
| **StBVV (Gebuehren)**               | 1 Woche    | Analog zu RVG                                                        |
| **Typen**                           | 3-5 Tage   | Bestehende erweitern                                                 |
| **Schreibstile**                    | 1 Woche    | Analog zu legal                                                      |
| **Sidebar/Navigation**              | ✅ Done    | `navForIndustry()` implementiert, `TAX_NAV` aktiv                    |
| **i18n**                            | 3-5 Tage   | Neue Tax-Keys (teilweise vorhanden)                                  |
| **ELSTER Integration**              | 4-8 Wochen | Komplexester Einzel-Baustein                                         |
| **DATEV API (optional)**            | 2-4 Wochen | Erweiterung bestehender CSV                                          |
| **Marketing Pages**                 | 1-2 Wochen | Neue Landingpage                                                     |

### Gesamtaufwand ohne ELSTER: ~6-10 Wochen (1 Entwickler, vollzeit) — Phase 1 bereits done

### Gesamtaufwand mit ELSTER: ~10-18 Wochen (1 Entwickler, vollzeit)

---

## 4. Strategische Empfehlung

### Option A: White-Label Multi-Industry (empfohlen — UMGESETZT)

**Ansatz:** Subsumio ist eine Multi-Industry-Plattform. Steuerberater ist als **zweite Industry** im selben Codebase registriert.

- ✅ `industry-pack.ts` hat `tax` Profile mit Theme, Brand, Pack
- ✅ Industry-conditional Sidebar (`navForIndustry()` mit `TAX_NAV`)
- ✅ Brain-Provisioning mountet `subsumio-tax` Skill-Pack
- Shared Codebase, shared AI Engine, separate Law/Tax Corpora
- Vorteil: Eine Codebase, zwei Maerkte, gleiche Wartung
- Aufwand: 8-12 Wochen (ohne ELSTER)

### Option B: Separate Product (nicht empfohlen)

**Ansatz:** Fork der Codebase als "Subsumio Tax"

- Nachteile: Code-Duplikation, doppelte Wartung, divergierende Features
- Vorteil: Schnelle Time-to-Market durch Unabhaengigkeit
- Aufwand: Aehnlich, aber langfristig hoehere Wartungskosten

### Option C: Partner-Integration (schnellster Start)

**Ansatz:** Subsumio als AI-Layer ueber existierender Steuerberater-Software (DATEV, WISO, Haufe)

- Subsumio AI liest Steuerberater-Dokumente, beantwortet Fragen, findet Fristen
- Kein eigenes Practice Management, nur AI-Add-on
- Aufwand: 2-4 Wochen (API-Layer auf bestehende Tools)
- Vorteil: Sehr schnell, keine Konkurrenz zu DATEV
- Nachteil: Abhaengig von DATEV/WISO APIs

### Empfehlung: **Option A** — Multi-Industry in einer Codebase

- Die `industry-pack.ts` Architektur ist dafuer gebaut
- DATEV und GoBD sind bereits vorhanden
- ELSTER kann als Phase 2 nachkommen
- Time-to-Market: ~3 Monate (ohne ELSTER) bis ~5 Monate (mit ELSTER)
- TAM: ~95.000 Steuerberater in Deutschland + ~15.000 in Oesterreich + ~10.000 in Schweiz

---

## 5. Was der Steuerberater-Markt anders macht

| Aspekt                    | Anwalt                           | Steuerberater                           |
| ------------------------- | -------------------------------- | --------------------------------------- |
| **Kern-Triebkraft**       | Fristen (ZPO/BGB)                | Steuerfristen (AO) + Buchhaltung        |
| **Dokumente**             | Schriftsaetze, Klagen, Vertraege | Steuererklaerungen, Bescheide, Bilanzen |
| **E-File**                | beA (bereits vorhanden)          | ELSTER (neu)                            |
| **Gebuehren**             | RVG (bereits vorhanden)          | StBVV (neu, aehnlich)                   |
| **Compliance**            | GoBD + BRAO                      | GoBD + StBerG + AO                      |
| **Software-Standard**     | Clio, Beck, Juris                | DATEV (dominant!)                       |
| **DATEV**                 | Export vorhanden                 | Kern-System, API noetig                 |
| **Buchhaltung**           | Nein (außer Trust Accounting)    | Ja — Kernfunktion                       |
| **Klienten**              | Mandanten mit Rechtsproblemen    | Mandanten mit Steuerpflicht             |
| **Wiederkehrende Arbeit** | Fallbezogen                      | Jaehrlich (Steuererklaerungen)          |
| **AI-Use-Case**           | Schriftsatz, Recherche, Fristen  | Bescheid-Pruefung, Erklaerung, Fristen  |

**Wichtigster Unterschied:** Steuerberater brauchen **Buchhaltung** und **ELSTER**. Das sind die zwei groessten Neubauten. Alles andere ist Anpassung bestehender Module.

---

_Analyse erstellt: 28. Juni 2026_
