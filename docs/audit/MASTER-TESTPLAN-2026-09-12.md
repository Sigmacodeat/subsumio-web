# MASTER-TESTPLAN 2026-09-12 — Gesamt-Audit & Prüf-Reihenfolge

> **Zweck:** Sukzessiver, abhängigkeitsgeordneter Prüfplan für die gesamte
> Subsumio-Codebasis — aus Anwaltssicht. Ergänzt `ANWALTS-PRUEFWEG.md`
> (Checkliste) um Ist-Zustand, Abdeckungs-Lücken und Ausführungs-Reihenfolge.
>
> **Grundlage:** 165 Dashboard-Pages, 500 API-Routes, ~1.900 Testdateien,
> 51 Playwright-E2E-Specs, 3 Befund-Runden (08-24, 09-03, 09-06).

---

## 1) Ist-Zustand (Baseline, heute gemessen)

| Check                    | Status    | Beweis / Anmerkung                                  |
| ------------------------ | --------- | --------------------------------------------------- |
| `tsc --noEmit`           | ✅ 0      | 2026-09-12                                          |
| `eslint src`             | ✅ 0      | 2026-09-12                                          |
| `npm audit`              | ⚠️ 1 high | nodemailer (GHSA-cc9r-2j5m-2m83) — neu seit 09-06   |
| Tests (Stand 09-06)      | ✅        | 6.659 vitest + 54 bun green — heute nicht erneut    |
| Engine :31429            | ✅ ok     | v0.42.38.0, postgres, healthy                       |
| **Lokale Engine-DB**     | 🔴 leer   | 0 Chunks, 3 Pages — Corpus NICHT lokal importiert   |
| App-DB `subsumio`        | ⚠️ leer   | `content_chunks` = 0 (Tunnel zu Hetzner aktiv)      |
| Law-DB `subsumio_law_v2` | 🔴 Auth   | `sigmabrain` Credentials schlagen fehl (stale .env) |
| Corpus-Dateien auf Disk  | ✅        | 704.489 Dateien, 0 Defekte (law-corpus/AGENTS.md)   |

**Konsequenz:** Der kritischste Fund ist kein Code-Problem, sondern
**Daten-Readiness**: Recherche/Chat/Grounding (Cluster E+F) lässt sich ohne
importierten Corpus nicht real prüfen. → Welle 0.

---

## 2) Abdeckungs-Lücken im Prüfweg (Gap-Analyse)

Der `ANWALTS-PRUEFWEG.md` referenziert 101 Routes. **66 Pages sind nicht
abgedeckt.** Keine toten Referenzen (alle genannten Routes existieren).

### Neu zuzuordnende Pages → Cluster

| Cluster                   | Fehlende Pages                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A Morgen/Orientierung** | `notifications`, `reports`, `operations`                                                                                                                                                                                            |
| **B Mandant/Intake**      | `online-booking`, `case-scanner`, `directory`, `import-kanzlei`, `email-import`, `power-of-attorney`, `altlasten`                                                                                                                   |
| **C Akte**                | `vault`, `upload`, `version-history`, `review-queue`, `review-sets`, `tabular-review`, `litigation`, `process-strategy`, `berufungs-agent`, `crypto-forensics`, `playbooks`, `cases/[slug]/investigation(/[runId])`, `brain/[slug]` |
| **F KI-Assistent**        | `agents`, `autonomous`                                                                                                                                                                                                              |
| **G Drafting**            | `word-addin`                                                                                                                                                                                                                        |
| **H Kommunikation**       | `whatsapp`, `whatsapp/templates`                                                                                                                                                                                                    |
| **I Honorar**             | `billing`                                                                                                                                                                                                                           |
| **J Compliance/Security** | `anonymize`, `api-keys`, `data-export`, `settings/security`, `settings/scim`, `admin/backup`, `admin/dr`, `admin/mailbox`, `admin/decision-records`, `admin/compliance-export`                                                      |
| **K Kanzleisteuerung**    | `settings`, `settings/kanzlei`, `workflows/builder`, `connectors`, `kanzlei-tools`, `adoption-analytics`, `admin/users(/[id])`, `admin/saas-usage`, `admin/feature-flags`                                                           |
| **L Tax**                 | `tax-assessments/[...slug]`, `tax-audit/[...slug]`, `tax-returns/[...slug]` (Detail-Seiten)                                                                                                                                         |
| **X Engine/Admin**        | `admin`, `admin/pipeline`, `admin/eval-review`, `admin/feedback-triage`, `admin/dissensus`, `monitoring/engine`, `settings/ai-model`, `settings/memory`, `settings/rciid`, `settings/webhooks`                                      |
| **M Mobile (NEU)**        | `mobile`, `mobile/pipeline` — eigener Cluster nötig, Anwälte arbeiten auf Tablet                                                                                                                                                    |

### Nicht abgedeckte API-Gruppen (1. Segment)

`copilot`, `dms`, `work-products`, `realtime`, `rciid`, `act-imports`,
`connectors`, `pages`, `brains`, `internal`, `insights`, `marketing-agent`,
`autopilot`, `credit-checks`, `court-directory`, `comments`,
`clause-annotations`, `claims`, `booking`, `fax`, `eval-*`, `human-review`,
`review-table`, `review-inbox`, `share`, `think`, `push`, `readiness`,
`release-gate`, `usage`, `triage`, `activities`, `2fa`, `upload-*`,
`webhooks`, `queries`, `stats`, `dashboard`, `intake`, `team`, `absences`,
`notifications`, `autonomous`, `org`, `demo`, `niche`, `ocr-status`,
`documents`, `export`, `inbox`, `pipeline`, `agent-templates`, `agents`,
`api-keys`, `approvals`, `audit`, `billing/*` (teils), `cron/*` (33 Routes).

→ Viele werden indirekt über die zugeordneten Pages geprüft. Explizit zu
prüfen bleiben: `cron/*` (Jobs laufen? Schedule?), `webhooks` (Signatur-
Verifikation), `internal/*` (Secret-Enforcement), `realtime` (SSE-Stabilität).

---

## 3) Test-Ebenen & vorhandene Automatisierung

### Ebene 0 — Statische Guards (laufen bei `bun run verify`)

| Guard                             | Prüft                    |
| --------------------------------- | ------------------------ |
| `tsc --noEmit`                    | Type-Safety gesamt       |
| `scripts/check-route-actions.ts`  | Route-Actions-Konvention |
| `scripts/check-design-tokens.ts`  | Design-Token-Konformität |
| `scripts/check-jsonb-pattern.sh`  | JSONB-Invariante (Y3)    |
| `scripts/check-template-leaks.sh` | Template-Leaks           |
| `scripts/contrast-audit.ts`       | Kontrast ≥4.5:1 (Y15)    |
| `scripts/validate-jsonld.sh`      | SEO-JSON-LD              |

### Ebene 1 — Unit/Integration (vitest `src/` + bun `server/`)

- 219 Tests `src/lib`, 18 `src/lib/legal`, 15 `src/lib/auth`, 14 whatsapp,
  13 `components/ui`, 10 legal-graph, 9 schemas, 7 security, 6 billing,
  6 chat — plus ~1.500 Engine-Tests unter `server/test/`.
- Invariant-Pins: `chat-grounding.test.tsx`, `use-grounded-answer.test.ts`,
  `engine-parity.test.ts`, `schema-bootstrap-coverage.test.ts`,
  `model-pricing.test.ts`.

### Ebene 2 — Playwright E2E (51 Specs) → Cluster-Mapping

| Spec(s)                                                                                                     | Cluster |
| ----------------------------------------------------------------------------------------------------------- | ------- |
| `auth-flow`, `two-factor-flow`, `2fa-rate-limit`, `account-lockout`, `security-headers`                     | J5      |
| `onboarding-flow`, `onboarding-setup-guide-flow`, `kanzlei-flow`                                            | A/B/K   |
| `smoke`, `redesign-smoke`, `misc-dashboard-flow`, `optimistic-flow`                                         | A       |
| `case-management-flow`, `case-closeout`, `case-close-checklist-flow`, `legal-workflow-flow`, `fristen-sync` | C/D     |
| `chat-flows`, `chat-research-flow`, `adversarial-injection`, `verification-policy`, `verification-receipts` | F/E     |
| `search-flow`, `r1-features`                                                                                | E       |
| `portal-flow`, `portal-upload-flow`, `client-portal-flow`, `whatsapp-flow`, `upload-flow`                   | H/C     |
| `docusign-signature-flow`, `docusign-webhook`, `signature-flow`                                             | H5      |
| `billing-flow`, `invoicing-flow`, `invoice-billing`, `e-invoice-flow`                                       | I       |
| `clm-flow`                                                                                                  | G2      |
| `compliance-settings-flow`, `settings-flow`, `admin-flow`, `api-guard-chain`                                | J/K     |
| `tax-module-flow`, `tax-triage-api`                                                                         | L       |
| `a11y`, `accessibility`, `keyboard-walkthrough`, `dialog-patterns`, `visual-regression`, `marketing-layout` | Y15/A   |
| `review-analytics-flow`, `platform-integration-flow`                                                        | K/C     |

**E2E-Lücken:** beA-Versand (H1), Fristen-Rechner §187/193 BGB (D1),
RVG-Rechner (I1), DATEV-Export (I5), ELSTER (L2), Kollision-Enforcement (B3),
Matter-Context (C2), Grounding-Panel sichtbar in echten Antworten (F1),
Mobile (M). → Diese Stationen brauchen manuelle Prüfung oder neue Specs.

### Ebene 3 — Manuelle Anwalts-Prüfung (Prüfweg-Stationen)

Alles, was E2E nicht abdeckt + Berufsrecht-Prüfung + UX-Qualität +
Edge-Cases. Ebenen 0–2 laufen VOR jeder manuellen Session als Tor.

---

## 4) Wellen-Plan (sukzessiv, abhängigkeitsgeordnet)

Jede Welle endet mit einem `BEFUND-<datum>.md` (Fundliste + Schweregrad).
Nächste Welle erst, wenn BLOCKER/CRITICAL der laufenden Welle = 0.

### Welle 0 — Umgebung & Daten-Readiness (Voraussetzung für alles)

1. `sigmabrain`-Credentials für `subsumio_law_v2` klären (stale `server/.env`
   oder Tunnel) — ohne Law-DB kein Corpus.
2. Entscheid: lokalen Corpus importieren ODER gegen Hetzner testen.
   Import-Pfad: `law-corpus/{dir}/` → Pipeline → `content_chunks`.
3. Embeddings-Status klären: bewusst ausstehend (Abnahme-Regel) oder Job
   starten? Dashboard-Kommunikation prüfen (0% sieht aus wie Fehlschlag).
4. NULL-Metadaten-Funde verifizieren (348 `chunk_role`/`document_type`,
   4.805 zu lange, 1.092 Nav-Müll) — sobald DB erreichbar.
5. Demo-/Test-User mit realistischen Daten (Mandant, Akte, Frist,
   Dokument) — `scripts/create-demo-account.ts` vorhanden.
6. 33 Cron-Routes: Schedule-Mapping erstellen (welcher Job wann,
   `CRON_SECRET`-Enforcement).

**DoD:** `content_chunks` > 0 mit Embeddings-Plan, Test-User loginfähig,
Dashboard zeigt echte Daten.

### Welle 1 — Invarianten & Baseline (Tor für alle weiteren)

1. `npm audit fix` (nodemailer high).
2. `bun run verify` + alle Guard-Scripts aus Ebene 0.
3. `bun test` (server) + `vitest run` (src) — Vollständigkeits-Baseline.
4. Invariant-Pins einzeln grün: engine-parity, schema-coverage,
   model-pricing, chat-grounding, use-grounded-answer.
5. grep-Audits Y1–Y15: `ctx.remote`, `sourceScopeOpts`, AI-Flächen ohne
   CitationPanel, `any`, fehlende Toasts bei `useMutation`.

**DoD:** Alles grün → "Code-Qualität verifiziert", Befund-Update.

### Welle 2 — Fundament: Auth → Dashboard → Mandant → Akte → Fristen

Reihenfolge = Datenabhängigkeit (kein Mandat ohne Mandant, keine Frist
ohne Akte):

1. **J5 Auth** — Login/2FA/Lockout/Session (E2E vorhanden: auth-flow,
   two-factor, lockout → laufen lassen + manuell Edge-Cases).
2. **A Morgen** — Dashboard, Sidebar, Cmd+K, notifications, reports.
3. **B Mandant** — Intake, Contacts, Opponents, **B3 Kollision (Pflicht!)**,
   online-booking, power-of-attorney, import-kanzlei.
4. **C Akte** — Liste/Neu/Detail, vault, upload, version-history,
   review-queue, tabular-review, litigation, berufungs-agent,
   case-investigation.
5. **D Fristen** — Fristenrechner §187/§193 BGB (Blocker-relevant!),
   Fristenbuch, Kalender+ICS, Wiedervorlagen, Tasks, fristen-sync.
6. **E2E-Suite:** case-management, case-closeout, legal-workflow,
   fristen-sync, optimistic-flow laufen lassen.

**DoD:** Anwalt kann Mandant→Akte→Frist→Kalender ohne Bruch durchspielen.

### Welle 3 — Recherche & KI-Vertrauen (braucht Welle 0 Corpus)

1. **E** — Research-Hub (6 Tabs), Normen, Rechtsprechung, Kommentare,
   Brain/Graph/Sources.
2. **F** — Chat/Grounding (CitationPanel-Sichtprüfung auf JEDER Fläche!),
   Deep-Analysis, Subsumption, Contradiction-Probe, War-Room, agents,
   autonomous.
3. **E2E:** chat-flows, chat-research, adversarial-injection,
   verification-policy/receipts, search-flow.

**DoD:** Jede KI-Antwort zeigt Zitate + CitationPanel + Prüf-Badge;
keine ungroundete Fläche.

### Welle 4 — Drafting & Kommunikation (braucht Welle 2 Akten)

1. **G** — Drafting, Templates, Verträge+Redlining, Klausel-Bibliothek,
   Diktat, Document-Interviews, Übersetzung, word-addin.
2. **H** — beA (Posteingang + e-Filing-Versand!), Unified Inbox, Portal
   (Upload/Sign/Chat/Revoke), Document-Requests, DocuSign, WhatsApp.
3. **E2E:** clm, portal-_, whatsapp, docusign-_, signature, upload.

**DoD:** Schriftsatz aus Akte → Export → beA-Versand → Portal-Teilung
durchspielbar.

### Welle 5 — Honorar & Tax (braucht Welle 2 Akten/Zeiten)

1. **I** — RVG-Rechner (Gebühren-Tabellen aktuell?), Zeiterfassung,
   Rechnung+E-Rechnung, Mahnwesen, Treuhand/§43a, FiBu, DATEV, billing.
2. **L** — Tax-Clients, Returns+ELSTER, Assessments+Einspruch, Audit,
   Deadlines, StBVV, Tax-Analytics.
3. **E2E:** billing, invoicing, invoice-billing, e-invoice, tax-module,
   tax-triage.

**DoD:** Zeit→RVG→Rechnung→Mahnung→DATEV-Kette geschlossen.

### Welle 6 — Kanzlei, Compliance & Admin

1. **K** — Controlling, Workflows+Builder, Approvals, Team/Absences,
   FAO, Shared-Spaces, White-Label, connectors, Settings.
2. **J** — DSGVO-Export/Löschung, Retention, AI-Act, GoBD/Verfahrensdoku,
   Audit-Log+Chain-Verify, Legal-Hold, KYC, anonymize, api-keys,
   admin/backup+dr+compliance-export.
3. **E2E:** compliance-settings, settings, admin, api-guard-chain.

**DoD:** Jede sicherheitsrelevante Aktion im Audit-Log; GoBD-Panel grün.

### Welle 7 — Engine, Mobile & Admin-Oberflächen

1. **X** — Corpus-Stats/Quality/Freshness, Pipeline-Health, RAG-Eval,
   AI-Quality, admin/\* (pipeline, eval-review, feedback-triage,
   dissensus, users, saas-usage, feature-flags, mailbox, decision-records),
   monitoring/engine, settings/ai-model+memory+rciid+webhooks.
2. **M Mobile** — `mobile`, `mobile/pipeline`, Touch-Targets,
   Bottom-Sheets, Offline-Verhalten (mobile-sync-banner).
3. **Load/Stress:** `test:load`, `test:load:heavy`, tests/load/\*.

**DoD:** Admin-Oberflächen konsistent, Mobile-Anwaltstag durchspielbar.

### Welle 8 — End-to-End Anwaltstag + Stress + Gate

1. Kompletter Arbeitstag laut Prüfweg Phase 4 (8 Stationen ohne Bruch).
2. `/edge-case-stress` pro Cluster: leere Daten, Doppelklicks,
   Offline, extreme Inhalte, ungewöhnliche Reihenfolgen.
3. Playwright-Vollsuite + Load-Suite final.
4. `/dod-gate` → `/subsumio-dod-layer` → Befund final.

**DoD:** BLOCKER + CRITICAL = 0 → "produktionsreif aus Anwaltssicht".

---

## 5) Prüf-Prozess pro Station (einheitlich)

1. Ebenen 0–2 grün? (verify + relevante Specs laufen lassen)
2. Userflow durchspielen (Desktop + Tablet-Viewport).
3. Beweis: Screenshot oder API-Response.
4. Edge-Cases provozieren (leer, falsch, langsam, doppelt).
5. Fund → `BEFUND-<datum>.md` mit Schweregrad
   (BLOCKER/CRITICAL/MAJOR/MINOR) + Datei:Zeile.
6. Fix oder dokumentiertes Nicht-Fixen mit Begründung.

## 6) Befund-Konvention

- Ein `BEFUND-<datum>.md` pro Welle (nicht pro Tag).
- Fortlaufende Fund-IDs: B# BLOCKER, C# CRITICAL, M# MAJOR, m# MINOR.
- Am Ende jeder Welle: Priorisierungs-Tabelle wie in Befund 09-06.
