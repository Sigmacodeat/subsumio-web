# Sidebar Workflow & Goldstandard Audit

**Date:** 2026-07-04
**Scope:** Sidebar navigation, route→page consistency, lawyer workflow coverage, AI Kanzlei OS SaaS benchmark
**Status:** Review completed

---

## 1. Route→Page Consistency Check

All **51 sidebar routes** (5 primary + 40 section + 4 bottom + 2 admin) resolve to real Next.js pages in `src/app/dashboard/**`.

| Result                         | Count                        |
| ------------------------------ | ---------------------------- |
| ✅ Routes with existing page   | 51 / 51                      |
| ❌ Missing pages               | 0                            |
| ⚠️ Pages without sidebar entry | ~37 (see orphaned-tool list) |

### Verified sidebar routes

**Primary 5**

- `/dashboard` ✅
- `/dashboard/cases` ✅
- `/dashboard/deadlines` ✅
- `/dashboard/intake` ✅
- `/dashboard/research` ✅

**Sections**

- Clients & Comm: contacts, opponents, kollisionspruefung, client-portal, document-requests ✅
- Docs & Drafting: vault, upload, drafting, templates, version-history, word-addin, review-sets ✅
- Contracts: contracts, clause-library, signature, obligation-tracking, playbooks ✅
- Knowledge: brain, graph, sources ✅
- Litigation: litigation, process-strategy, litigation-analytics, portfolio-insights, case-scanner, tabular-review ✅
- Billing: invoicing, cost-calculator, datev-export, trust-accounting, controlling ✅
- Firm Ops: reports, analytics, adoption-analytics, workflows, approvals, shared-spaces, monitoring ✅
- Compliance: compliance, compliance/retention, anonymize, verfahrensdoku, data-export, review-queue ✅

**Bottom**

- settings, team, audit, directory ✅

---

## 2. Lawyer Daily Workflow Coverage

### Core matter lifecycle (Mandat → Akte → Frist → Dokument → Rechnung)

| Workflow step       | Sidebar entry                            | Backend support                                                           | Status                        |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------- | ----------------------------- |
| Capture new mandate | `/dashboard/intake`                      | `/api/intake`, `/api/intake/convert`                                      | ✅ Strong                     |
| Conflict check      | `/dashboard/kollisionspruefung`          | `lib/contact-conflict.ts`                                                 | ✅ Present                    |
| Open matter         | `/dashboard/cases`                       | `/api/cases/*`, `lib/legal-types.ts`, `lib/case-status.ts`                | ✅ Strong                     |
| Track deadlines     | `/dashboard/deadlines`                   | `lib/legal-deadlines.ts`, `/api/cron/deadlines`, matter-context deadlines | ✅ Strong                     |
| Request documents   | `/dashboard/document-requests`           | `/api/document-requests`, `lib/document-requests.ts`                      | ✅ Present                    |
| Store documents     | `/dashboard/vault` + `/dashboard/upload` | `/api/upload/*`, `/api/dms/import`, `lib/dms/`, `lib/presigned-upload.ts` | ✅ Strong                     |
| Draft documents     | `/dashboard/drafting`                    | `lib/legal-draft-pdf.ts`, `/api/legal/templates/*`                        | ✅ Present                    |
| Sign documents      | `/dashboard/signature`                   | `lib/docusign.ts`                                                         | ✅ Present                    |
| Manage contracts    | `/dashboard/contracts`                   | `/api/legal/templates/*`                                                  | ⚠️ Naming overlap (see issue) |
| Litigation workflow | `/dashboard/litigation`                  | `/api/legal/litigation/*`, `lib/litigation-flow.ts`                       | ✅ Strong                     |
| Invoice clients     | `/dashboard/invoicing`                   | `/api/invoices/*`, `lib/invoice-pdf.ts`, `lib/rvg.ts`                     | ✅ Strong                     |
| Trust accounting    | `/dashboard/trust-accounting`            | `/api/legal/trust-accounts/*`, `lib/trust-accounting.ts`                  | ✅ Strong                     |
| Compliance          | `/dashboard/compliance`                  | `lib/gobd-verfahrensdoku.ts`, `lib/audit.ts`, DSGVO exports               | ✅ Strong                     |

### Workflow gaps found

1. **Calendar/Agenda view**
   - The primary entry is `Fristen` (deadlines), but there is no pure calendar view that combines deadlines, tasks, meetings, and court dates.
   - `/dashboard/deadlines` does the job functionally, but a calendar visual is missing for many lawyer workflows.
   - **Goldstandard:** Clio, Smokeball, and most practice managers have a calendar as a primary top-level nav item.

2. **Task management**
   - Tasks exist inside case context (`matter-context`), but there is no global `/dashboard/tasks` list.
   - **Goldstandard:** Harvey Assistant, Clio, PracticePanther all have task lists as a primary nav item.

3. **Time tracking / time sheets**
   - `lib/time-tracking.ts` exists, but there is no sidebar entry for time tracking or time sheets.
   - This is critical for billing-oriented law firms.
   - **Goldstandard:** Clio, Smokeball, MyCase all surface time tracking prominently.

4. **Email / Communication center**
   - beA, WhatsApp, email-import are currently moved to intake channel tabs or removed from the nav.
   - There is no unified `/dashboard/communications` or `/dashboard/inbox` that aggregates all client communication across channels.
   - **Goldstandard:** Harvey, Lexion, and most modern legal CRMs use a unified communications inbox.

5. **Notes / memos**
   - No `/dashboard/notes` or case notes hub.
   - Lawyers create memos constantly.
   - **Goldstandard:** Clio Grow, PracticePanther, Filevine.

6. **Billing ledger / payments**
   - Invoicing exists, but there is no `/dashboard/payments` or trust ledger overview.
   - Trust accounting is present, but payments/reconciliation is not top-level.

7. **Document automation / assembly**
   - Templates and drafting exist, but the sidebar does not surface a dedicated document-automation workflow.
   - `word-addin` is hidden in the docs section; it should probably be an action, not a nav destination.

---

## 3. Goldstandard Benchmark — AI Kanzlei OS SaaS

### Reference platforms

| Platform                | Core nav model                                                                    | AI focus                                                | Strengths vs. Subsumio                                                    |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Harvey**              | Assistant + Vault + Workflow Agents + Knowledge + Ecosystem                       | Contract analysis, due diligence, litigation, knowledge | Cleaner top-level: only 4-5 pillars. AI is the central interaction layer. |
| **Clio**                | Matters + Contacts + Calendar + Activities + Billing + Documents + Communications | Limited native AI                                       | Strong on calendar, tasks, time tracking, billing.                        |
| **Smokeball**           | Matters + Contacts + Calendar + Tasks + Email + Documents + Billing               | Auto-time tracking, matter timeline                     | Very workflow-driven; every feature maps to a matter.                     |
| **CoCounsel / Westlaw** | Research + Draft + Review                                                         | Legal research                                          | Deep research, but narrow scope.                                          |
| **Filevine**            | Projects + Contacts + Docs + Tasks + Reports                                      | AI case summaries                                       | Project-centric; strong on tasks and docs.                                |

### Subsumio vs. goldstandard

#### Where Subsumio is ahead

- **AI-native primary nav** (Rechtsrecherche as top-level) matches Harvey's Knowledge pillar.
- **Brain + Graph + Sources** is a unique knowledge layer most competitors lack.
- **Compliance** as a dedicated section is stronger than most US-centric tools.
- **Trust accounting + RVG/DATEV** is DACH-specific goldstandard.
- **Copilot** with route context is ahead of generic chat-first competitors.

#### Where Subsumio lags goldstandard

- **Too many nav items** (51) vs. Harvey's 5 pillars + context actions.
- **Missing primary calendar** — standard in every practice management tool.
- **Missing tasks/time tracking** as primary nav — critical for billing.
- **No unified communication hub** — email/beA/WhatsApp are fragmented.
- **Some items are tools, not workflows** — e.g. `word-addin`, `case-scanner`, `tabular-review`, `version-history` are better as contextual actions inside a case/document.
- **Adoption analytics / monitoring** feel like admin/vendor features, not lawyer workflows — they should probably be in admin or collapsed.

---

## 4. Concrete Recommendations

### A. Add missing primary items

Consider adding to primary or secondary nav:

1. **Kalender** `/dashboard/calendar` — global calendar with deadlines, court dates, tasks, meetings.
2. **Aufgaben** `/dashboard/tasks` — global task list across all matters.
3. **Zeiterfassung** `/dashboard/time-tracking` — time sheets, timers, billable-hours.
4. **Kommunikation** `/dashboard/communications` — unified beA/email/WhatsApp/portal messages.

### B. Demote tools to contextual actions

These items should not be top-level nav entries; they should be buttons inside the right context (case, document, contract):

- `word-addin` → Document editor action
- `case-scanner` → Case detail tab / action
- `tabular-review` → Vault / Review-sets action
- `version-history` → Document detail action
- `deep-analysis`, `analyze`, `translate`, `anonymize` → Document actions
- `adoption-analytics` → Admin only
- `monitoring` → Admin only
- `rag-eval`, `chat/analytics`, `chat/compare` → Admin only

### C. Consolidate analytics

- `analytics`, `adoption-analytics`, `litigation-analytics`, `portfolio-insights`, `reports` could be grouped into a single **Reporting & Insights** section or a `/dashboard/analytics` hub with tabs.
- This reduces nav clutter from 5 to 1 entry.

### D. Improve naming

- `/dashboard/contracts` page is backed by `/api/legal/templates/*` — this is confusing. Either rename the page to "Vertragsvorlagen" or separate contract management from template management.
- `signature` should be `Signatures` or `Signaturanfragen` if it's a queue.
- `obligation-tracking` inside Contracts is correct; but playbooks also fits there.

### E. Workflow-first navigation

Instead of 8 sections, consider a flatter model:

- **Primary 5**: Heute, Akten, Fristen/Kalender, Posteingang, Kommunikation
- **Werkbänke**: Dokumente, Verträge, Recherche, Prozess, Abrechnung
- **Kanzleisteuereung**: Compliance, Berichte, Workflows, Einstellungen

This would reduce the mental model from 8 sections to ~3 groups + search/copilot.

---

## 5. Verdict

**Overall verdict:** The current sidebar is **functionally complete** (no broken links) and **workflow-rich** (covers most lawyer tasks). However, it is **not yet goldstandard** because it exposes too many implementation-level features as top-level navigation and lacks three primary lawyer workflows: calendar, tasks, and time tracking.

**Priority fixes for goldstandard:**

1. Add Calendar, Tasks, Time Tracking as top-level or prominent secondary items.
2. Create a unified Communications hub.
3. Demote tool pages to contextual actions.
4. Consolidate analytics into one hub.
5. Reduce total visible nav items from 51 to ~35.

**Risk level:** Medium — the current nav works, but power users and partner-level buyers will expect calendar/tasks/time tracking as first-class citizens.
