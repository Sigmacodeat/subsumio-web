---
description: Verification Receipts for Work Products
---

# Verification Receipts — Implementation Blueprint

## 1. Ziel

Jedes Work Product (Draft, Memo, Fristenreport, Vertragsreview, Redline, Schriftsatz) erhält eine unveränderliche, auditbare Verification Receipt. Die Receipt wird deterministisch berechnet, nicht vom LLM gesetzt. Inhaltsänderungen invalidieren die alte Receipt oder erzeugen eine neue Version. UI/API zeigt nur den Status an, niemals die Policy umgehend.

## 2. Work Product Types

- `draft` — generischer Entwurf
- `memo` — Rechtsgutachten / Kurzmemorandum
- `fristenreport` — Fristen-Engine Report
- `vertragsreview` — Vertragsprüfung
- `redline` — Contract Redline
- `schriftsatz` — Schriftsatzentwurf

## 3. Datenmodell: WorkProductReceipt

```typescript
interface WorkProductReceipt {
  receipt_id: string; // UUID v4
  product_type: WorkProductType;
  product_ref: string; // slug / case id / document id
  version: number; // 1, 2, 3 ...
  previous_receipt_id?: string;
  invalidated_at?: string;
  invalidated_by?: string;

  state: VerificationState; // VERIFIED | VERIFIED_WITH_WARNINGS | NEEDS_HUMAN_REVIEW | BLOCKED | VERIFIER_ERROR
  checks: ReceiptCheck[];
  flags: string[]; // Guardrail / Policy Flags
  approvals: ReceiptApproval[];

  models: string[]; // z.B. ["openrouter:deepseek/deepseek-chat"]
  prompt_hashes: string[]; // SHA-256 der genutzten Prompts
  source_snapshot_hashes: string[]; // Corpus / Source Snapshots

  output_hash: string; // SHA-256 des finalen Outputs
  output_length: number;

  created_at: string;
  verified_at?: string;

  brain_id: string;
  user_id?: string;
  jurisdiction?: string;
  metadata: Record<string, unknown>; // Erweiterbare Audit-Metadaten
}
```

## 4. State-Management & Policy

- `state` wird ausschließlich aus `checks` + `flags` + `riskLevel` berechnet (`resolveReceiptState`).
- Kein LLM-Output wird in `state` geschrieben.
- Änderung von `output_hash` → `createReceipt()` erzeugt Version N+1, alte Receipt bekommt `invalidated_at` + `invalidated_by`.
- `isReceiptValid(receipt, content)` vergleicht `output_hash` mit SHA-256(content).

## 5. Persistenz

### Tabelle: `subsumio_work_product_receipts`

```sql
CREATE TABLE subsumio_work_product_receipts (
  receipt_id text PRIMARY KEY,
  product_type text NOT NULL,
  product_ref text NOT NULL,
  version integer NOT NULL,
  previous_receipt_id text,
  state text NOT NULL,
  output_hash text NOT NULL,
  brain_id text NOT NULL,
  user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  invalidated_by text,
  receipt jsonb NOT NULL,
  UNIQUE(product_type, product_ref, version)
);
CREATE INDEX idx_wpr_product ON subsumio_work_product_receipts(product_type, product_ref, version DESC);
CREATE INDEX idx_wpr_brain ON subsumio_work_product_receipts(brain_id, created_at DESC);
CREATE INDEX idx_wpr_hash ON subsumio_work_product_receipts(output_hash);
```

### Stores

- `src/lib/work-product-receipts.ts` — reine Typen, Hashing, State-Resolution, Builder
- `src/lib/work-product-receipt-store.ts` — Frontend DB-Adapter (pg Pool via `getSharedPgPool`)
- `server/src/core/legal/work-product-receipt-store.ts` — Engine DB-Adapter (postgres.js via `getDb`)

## 6. Integrationspunkte

1. **Contract Redline** (`server/src/core/legal/contract-redline.ts` + `src/app/api/legal/contract-redline/route.ts`)
   - Receipt nach `redlineContract()` mit Output-Hash der Redlines, Prompt-Hash, Model, Playbook-Source-Hashes.
2. **LAB-DACH Workflows** (`server/src/eval/lab-dach/workflows.ts` + `e2e-harness.ts`)
   - Receipt pro Deliverable nach Workflow-Run mit `RunReceipt`-Metadaten.
3. **AI Deadlines** (`src/app/api/legal/ai-deadlines/route.ts`)
   - Receipt nach Fristen-Engine Enrichment.
4. **Subsumption** (`src/app/api/legal/subsumption/route.ts`)
   - Receipt nach erfolgreichem Guardrail.

## 7. API / UI (read-only)

- `GET /api/legal/receipts?product_type=&product_ref=` → Liste der Receipts
- `GET /api/legal/receipts/[receipt_id]` → Einzelne Receipt
- `<VerificationReceiptBadge receiptId={...} />` → zeigt State + Checks + Version

## 8. Akzeptanzkriterien / Tests

- **Persistenz-Roundtrip**: Receipt speichern, lesen, Felder stimmen.
- **Tamper-Test**: Output-Hash mismatch wird erkannt (`isReceiptValid` false).
- **Mutationstest**: Inhaltsänderung erzeugt neue Version, alte Receipt invalidiert.
- **TypeScript**: `tsc --noEmit` 0 Fehler.
- **Unit Tests**: State-Resolution, Hashing, Versionierung.

## 9. Definition of Done

- [ ] Core-Library + Typen in `src/lib/work-product-receipts.ts`
- [ ] Frontend + Engine DB-Store
- [ ] Mindestens 3 Produktions-Workflows mit Receipt-Ausgabe
- [ ] Read-only API + UI Badge
- [ ] Tests: Roundtrip, Tamper, Mutation
- [ ] TypeScript 0 Fehler
- [ ] Kein Code setzt Receipt-Status außerhalb der Policy
