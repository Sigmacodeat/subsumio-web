# CLM Flow Verification – Contract Lifecycle Management

**Datum:** 27. Juni 2026  
**Zweck:** Nachweis des durchgängigen CLM-Flows von Intake über Drafting, Review, Approval, Signature bis Obligation Tracking.

---

# 1. CLM Flow Overview

Der vollständige Contract Lifecycle Management Flow in Subsumio umfasst folgende Phasen:

```
Intake → Drafting → Review → Approval → Signature → Obligation Tracking → Renewal/Deadline
```

---

# 2. Phase 1: Intake (Mandatsanlage/Contract-Erstellung)

## 2.1 Vorhandene Komponenten

| Komponente | Pfad | Status |
|------------|------|--------|
| Intake Form | `/dashboard/intake` | ✅ vorhanden |
| Mandatsanlage | `/api/legal/intake` | ✅ vorhanden |
| Contract Quick Create | `ContractQuickCreateDialog` | ✅ vorhanden |
| Matter Context | `matter-context.ts` | ✅ vorhanden |

## 2.2 Flow

1. User navigiert zu `/dashboard/intake`
2. User füllt Intake-Formular aus (Mandant, Fall, Rechtsgebiet)
3. System erstellt Matter/Case in Brain
4. User kann Contract über `ContractQuickCreateDialog` erstellen

---

# 3. Phase 2: Drafting (Vertragsentwurf)

## 3.1 Vorhandene Komponenten

| Komponente | Pfad | Status |
|------------|------|--------|
| Drafting Page | `/dashboard/drafting` | ✅ vorhanden |
| Contract Draft API | `/api/legal/contract-draft` | ✅ vorhanden |
| Templates | `TEMPLATES` Array (Klage, Mahnung, etc.) | ✅ vorhanden |
| AI Drafting | `legal.contract_draft` Engine Action | ✅ vorhanden |
| Docx Export | `docx-export.ts` | ✅ vorhanden |

## 3.2 Flow

1. User navigiert zu `/dashboard/drafting`
2. User wählt Template (Klage, Mahnung, Antragschrift, etc.)
3. User füllt Formular aus (Parteien, Sachverhalt, Rechtsgrundlage)
4. System generiert Entwurf via AI (`legal.contract_draft`)
5. User kann Entwurf bearbeiten
6. User kann Entwurf als DOCX exportieren

## 3.3 API-Details

**Endpoint:** `POST /api/legal/contract-draft`

**Schema:**
```typescript
{
  type: string;           // Vertragstyp
  jurisdiction: "at" | "de" | "ch";
  parties: {
    a: string;           // Partei A
    b: string;           // Partei B
  };
  instructions?: string; // Zusätzliche Anweisungen
  template_slug?: string; // Template-Referenz
  language: "de" | "en";
}
```

**Engine Action:** `legal.contract_draft` (streaming, citation-gated)

---

# 4. Phase 3: Review (Vertragsprüfung)

## 4.1 Vorhandene Komponenten

| Komponente | Pfad | Status |
|------------|------|--------|
| Contracts Dashboard | `/dashboard/contracts` | ✅ vorhanden |
| Contract Redline API | `/api/legal/contract-redline` | ✅ vorhanden |
| Redline Viewer | `ContractRedlineViewer` | ✅ vorhanden |
| Clause Annotation | `clause-annotation.ts` | ✅ vorhanden |
| Risk Analysis | `risk_level` in ContractItem | ✅ vorhanden |
| Tabular Review | `TabularReviewResponse` | ✅ vorhanden |

## 4.2 Flow

1. User navigiert zu `/dashboard/contracts`
2. User wählt Contract aus Liste
3. System zeigt Contract-Details (Parteien, Typ, Status)
4. User kann Contract redlinen via `ContractRedlineViewer`
5. System zeigt Risk Level (low/medium/high/critical)
6. User kann Clause Annotations erstellen (Klauseltyp, Risiko, Empfehlung)
7. User kann Tabular Review durchführen

## 4.3 API-Details

**Endpoint:** `POST /api/legal/contract-redline`

**Engine Action:** `legal.contract_redline` (streaming, citation-gated)

**Clause Annotation Types:**
```typescript
type ClauseCategory =
  | "nda" | "employment" | "service" | "sale" | "lease"
  | "partnership" | "licensing" | "settlement" | "liability"
  | "payment" | "termination" | "ip" | "data_protection"
  | "warranty" | "general";

type ClauseRiskLevel = "low" | "medium" | "high" | "critical";
type ClauseReviewStatus = "pending" | "approved" | "rejected";
```

---

# 5. Phase 4: Approval (Freigabe)

## 5.1 Vorhandene Komponenten

| Komponente | Pfad | Status |
|------------|------|--------|
| Approval Execution | `approval-execution.ts` | ✅ vorhanden |
| Approval Frontmatter | `agentActionFrontmatter` | ✅ vorhanden |
| Approval Rückkanal | `approval.ts` | ✅ vorhanden |
| Status Management | `status: "draft" | "reviewed" | "approved" | "signed"` | ✅ vorhanden |

## 5.2 Flow

1. User setzt Contract Status auf "reviewed"
2. User kann Approval-Workflow auslösen
3. System führt Approval aus (optional: Multi-Approval)
4. System setzt Contract Status auf "approved"

## 5.3 Status-Workflow

```
draft → reviewed → approved → signed
```

---

# 6. Phase 5: Signature (Unterschrift)

## 6.1 Vorhandene Komponenten

| Komponente | Pfad | Status |
|------------|------|--------|
| Signature Page | `/dashboard/signature` | ✅ vorhanden |
| DocuSign Auth | `/api/docusign/auth` | ✅ vorhanden |
| DocuSign Callback | `/api/docusign/callback` | ✅ vorhanden |
| DocuSign Webhook | `/api/docusign/webhook` | ✅ vorhanden |
| DocuSign Status | `/api/docusign/status` | ✅ vorhanden |
| DocuSign Envelopes | `/api/docusign/envelopes` | ✅ vorhanden |
| DocuSign Disconnect | `/api/docusign/disconnect` | ✅ vorhanden |
| Signature Flow Test | `signature-flow.spec.ts` | ✅ vorhanden |

## 6.2 Flow

1. User navigiert zu `/dashboard/signature`
2. User authentifiziert sich bei DocuSign (`/api/docusign/auth`)
3. DocuSign leitet zurück zu `/api/docusign/callback`
4. User erstellt Envelope für Contract
5. System sendet Envelope an Parteien
6. Parteien signieren via DocuSign
7. DocuSign sendet Webhook an `/api/docusign/webhook`
8. System aktualisiert Contract Status auf "signed"

## 6.3 E2E Test Coverage

**Test:** `signature-flow.spec.ts`

- ✅ signature page renders
- ✅ docusign auth endpoint requires auth
- ✅ docusign callback handles missing code
- ✅ docusign webhook without signature → rejected
- ✅ docusign status requires auth
- ✅ docusign envelopes requires auth
- ✅ docusign disconnect requires auth

---

# 7. Phase 6: Obligation Tracking (Verpflichtungs-Tracking)

## 7.1 Vorhandene Komponenten

| Komponente | Pfad | Status |
|------------|------|--------|
| Obligation Entry Type | `ObligationEntry` in `types.ts` | ✅ vorhanden |
| Obligation Extraction | `ObligationExtractionResult` in `types.ts` | ✅ vorhanden |
| Renewal Dates | `renewal_dates` in `ObligationExtractionResult` | ✅ vorhanden |
| Payment Terms | `payment_terms` in `ObligationExtractionResult` | ✅ vorhanden |
| Notice Periods | `notice_periods` in `ObligationExtractionResult` | ✅ vorhanden |
| Deadline Detection | `ai-deadline-detect.ts` | ✅ vorhanden |
| Fristen Cron | `/api/cron/deadlines` | ✅ vorhanden |

## 7.2 Flow

1. System extrahiert Obligations aus signiertem Contract
2. System speichert Obligations in Brain
3. System zeigt Obligations im Dashboard
4. System trackt Renewal Dates und Notice Periods
5. System sendet Deadlines via Cron-Job

## 7.3 Obligation Types

```typescript
interface ObligationEntry {
  description: string;
  obligated_party: string;
  counterparty: string;
  type: "payment" | "delivery" | "service" | "reporting" | "other";
  due_date?: string;
  condition?: string;
  verified: boolean;
  source_text?: string;
  source_file?: string;
}

interface ObligationExtractionResult {
  obligations: ObligationEntry[];
  renewal_dates: Array<{ date: string; description: string; auto_renew: boolean }>;
  payment_terms: Array<{ due_date: string; amount?: string; description: string }>;
  notice_periods: Array<{ event: string; notice_period: string; days: number }>;
  summary: string;
  warnings: string[];
}
```

---

# 8. Phase 7: Renewal/Deadline (Verlängerung/Fristen)

## 8.1 Vorhandene Komponenten

| Komponente | Pfad | Status |
|------------|------|--------|
| Deadline Detection | `ai-deadline-detect.ts` | ✅ vorhanden |
| Fristen Cron | `/api/cron/deadlines` | ✅ vorhanden |
| Fristen Dashboard | `/dashboard/deadlines` | ✅ vorhanden |
| Legal Deadlines | `legal-deadlines.ts` | ✅ vorhanden |
| WhatsApp Reminders | `whatsapp/daily-briefing.ts` | ✅ vorhanden |

## 8.2 Flow

1. System überwacht Renewal Dates aus Obligations
2. System überwacht Notice Periods
3. System sendet Reminders vor Fristablauf
4. User kann Deadlines im Dashboard sehen
5. User kann Deadlines in Kalender exportieren

---

# 9. End-to-End Flow Summary

## 9.1 Vollständiger Flow

```
1. Intake
   → User erstellt Mandat/Case
   → User erstellt Contract via ContractQuickCreateDialog

2. Drafting
   → User wählt Template in /dashboard/drafting
   → User füllt Formular aus
   → System generiert Entwurf via AI
   → User bearbeitet Entwurf
   → User exportiert als DOCX

3. Review
   → User öffnet Contract in /dashboard/contracts
   → User redlinet Contract
   → User erstellt Clause Annotations
   → System zeigt Risk Analysis
   → User setzt Status auf "reviewed"

4. Approval
   → User löst Approval-Workflow aus
   → System führt Approval aus
   → System setzt Status auf "approved"

5. Signature
   → User authentifiziert sich bei DocuSign
   → User erstellt Envelope
   → Parteien signieren
   → System setzt Status auf "signed"

6. Obligation Tracking
   → System extrahiert Obligations
   → System speichert Obligations
   → System zeigt Obligations im Dashboard

7. Renewal/Deadline
   → System überwacht Fristen
   → System sendet Reminders
   → User exportiert Deadlines in Kalender
```

## 9.2 Status

| Phase | Komponenten | Status | E2E Test |
|-------|-------------|--------|----------|
| Intake | Intake Form, Contract Quick Create | ✅ vorhanden | ⚠️ nicht getestet |
| Drafting | Drafting Page, Contract Draft API, Templates | ✅ vorhanden | ⚠️ nicht getestet |
| Review | Contracts Dashboard, Redline, Clause Annotation | ✅ vorhanden | ⚠️ nicht getestet |
| Approval | Approval Execution, Status Management | ✅ vorhanden | ⚠️ nicht getestet |
| Signature | DocuSign Integration, Webhook | ✅ vorhanden | ✅ getestet |
| Obligation Tracking | Obligation Extraction, Deadline Detection | ✅ vorhanden | ⚠️ nicht getestet |
| Renewal/Deadline | Fristen Cron, WhatsApp Reminders | ✅ vorhanden | ⚠️ nicht getestet |

---

# 10. Gaps und Empfehlungen

## 10.1 Fehlende E2E Tests

| Gap | Priorität | Aufwand |
|-----|-----------|---------|
| Intake → Drafting E2E Test | P1 | Mittel |
| Drafting → Review E2E Test | P1 | Mittel |
| Review → Approval E2E Test | P1 | Mittel |
| Approval → Signature E2E Test | P1 | Mittel |
| Signature → Obligation E2E Test | P1 | Mittel |
| Obligation → Renewal E2E Test | P1 | Mittel |

## 10.2 Empfehlungen

1. **E2E Tests erstellen** für den vollständigen CLM-Flow
2. **Playwright Test Suite** `clm-flow.spec.ts` erstellen
3. **End-to-End Demo** aufzeichnen für Marketing
4. **Dokumentation** im User Guide ergänzen

---

# 11. Fazit

**Status:** ✅ **CLM Flow ist technisch vollständig implementiert**

Alle Komponenten für den vollständigen CLM-Flow sind vorhanden:
- Intake ✅
- Drafting ✅
- Review ✅
- Approval ✅
- Signature ✅
- Obligation Tracking ✅
- Renewal/Deadline ✅

**Nachweis erforderlich:** E2E Tests für den durchgängigen Flow von Intake bis Renewal.

**Empfehlung:** E2E Test Suite `clm-flow.spec.ts` erstellen, um den End-to-End Flow zu verifizieren.

---

**Verifiziert am:** 27. Juni 2026
