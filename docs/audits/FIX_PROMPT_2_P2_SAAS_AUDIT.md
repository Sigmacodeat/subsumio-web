# Fix-Prompt 2: P2-Audit-Blocker beheben — Subsumio SaaS-Applikationsschicht

> **Grundlage:** Audit Report 3 + P0/P1 Fixes alle erledigt
> **Ziel:** Alle P2-Blocker fixen → Score von 64% auf >80%
> **Modus:** Code-Änderungen im Editor, jede Änderung mit Code-Beleg, keine Mocks

---

## P2-1: Stripe Customer Portal Integration

**Problem:** User können Plan nicht selbst verwalten/kündigen — müssen Support kontaktieren.

**Dateien:**
- Neue Datei: `src/app/api/billing/portal/route.ts` — Stripe Customer Portal Session
- Anpassung: `src/app/dashboard/billing/page.tsx` — "Plan verwalten" Button

**Implementierung `portal/route.ts`:**
```ts
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";

export const POST = createHandler(
  {
    action: "billing.write",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "billing.portal" as const,
      entityType: "billing",
      details: { user: ctx.user.email },
    }),
  },
  async (ctx, _body, _query, req) => {
    if (!process.env.STRIPE_SECRET_KEY) {
      return apiError("billing_not_configured", "Stripe is not connected.", 501);
    }
    if (!ctx.user.stripeCustomerId) {
      return apiError("no_customer", "No Stripe customer ID found. Upgrade first.", 400);
    }

    const origin = req.nextUrl.origin;
    const params = new URLSearchParams({
      customer: ctx.user.stripeCustomerId,
      return_url: `${origin}/dashboard/billing`,
    });

    const resp = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return apiError("stripe_error", data?.error?.message ?? "Stripe request failed", 502);
    }
    return Response.json({ url: data.url });
  },
);
```

**Dashboard Anpassung:**
- In `billing/page.tsx`: Wenn `user.stripeCustomerId` vorhanden → zeige "Plan verwalten" Button, der `/api/billing/portal` POST → redirect zu `data.url`
- Wenn nicht vorhanden → zeige Upgrade-Buttons wie bisher

**Akzeptanzkriterien:**
- [ ] `POST /api/billing/portal` → 200 mit `{ url }` für User mit stripeCustomerId
- [ ] 400 für User ohne stripeCustomerId
- [ ] 501 wenn Stripe nicht konfiguriert
- [ ] "Plan verwalten" Button in Billing-Page sichtbar für zahlende User
- [ ] Return-URL leitet zurück zu `/dashboard/billing`

---

## P2-2: Account-Lockout nach N fehlgeschlagenen Versuchen

**Problem:** Rate-Limiting drosselt, aber kein automatisches Lockout — Brute-Force möglich trotz Rate-Limit.

**Datei:** `src/lib/auth/rate-limit.ts` oder neue Datei `src/lib/auth/lockout.ts`

**Implementierung:**
```ts
// src/lib/auth/lockout.ts
// Account-Lockout: nach 5 fehlgeschlagenen Logins innerhalb 15 Minuten
// wird der Account für 30 Minuten gesperrt.
// Storage: Postgres (production) oder in-memory/file (dev).

import { getSharedPgPool } from "./store";
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.SIGMABRAIN_DATA_DIR || path.join(process.cwd(), ".data");
const LOCKOUT_FILE = path.join(DATA_DIR, "lockouts.json");

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;  // 15 min
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 min

interface LockoutEntry {
  failedAttempts: number;
  firstFailedAt: number;
  lockedUntil: number | null;
}

// In-memory cache
const cache = new Map<string, LockoutEntry>();

export async function recordFailedLogin(email: string): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const key = `login:${email.toLowerCase()}`;
  const now = Date.now();
  
  let entry = cache.get(key);
  if (!entry || (entry.firstFailedAt + LOCKOUT_WINDOW_MS < now && !entry.lockedUntil)) {
    entry = { failedAttempts: 0, firstFailedAt: now, lockedUntil: null };
  }
  
  entry.failedAttempts++;
  
  if (entry.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
  
  cache.set(key, entry);
  await persistLockoutFile();
  
  return {
    locked: entry.lockedUntil !== null && entry.lockedUntil > now,
    retryAfterSeconds: entry.lockedUntil ? Math.ceil((entry.lockedUntil - now) / 1000) : 0,
  };
}

export async function isAccountLocked(email: string): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const key = `login:${email.toLowerCase()}`;
  const now = Date.now();
  const entry = cache.get(key);
  
  if (!entry || !entry.lockedUntil) return { locked: false, retryAfterSeconds: 0 };
  if (entry.lockedUntil <= now) {
    // Lockout expired — reset
    cache.delete(key);
    return { locked: false, retryAfterSeconds: 0 };
  }
  
  return {
    locked: true,
    retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
  };
}

export async function clearLockout(email: string): Promise<void> {
  const key = `login:${email.toLowerCase()}`;
  cache.delete(key);
  await persistLockoutFile();
}

// File persistence (dev mode) — same pattern as rate-limit.ts
async function persistLockoutFile(): Promise<void> {
  // ... atomic tmp+rename like rate-limit.ts
}
```

**Integration in `auth/login/route.ts`:**
1. Vor Login-Versuch: `isAccountLocked(email)` → wenn locked, return 429 mit `Retry-After`
2. Nach fehlgeschlagenem Login: `recordFailedLogin(email)` → wenn locked, return 429
3. Nach erfolgreichem Login: `clearLockout(email)`

**Akzeptanzkriterien:**
- [ ] `src/lib/auth/lockout.ts` existiert
- [ ] Nach 5 fehlgeschlagenen Logins → Account für 30 Min gesperrt
- [ ] 429 Response mit `Retry-After` Header
- [ ] Erfolgreiches Login clears lockout
- [ ] Lockout expiry (nach 30 Min) → Login wieder möglich
- [ ] Unit-Test: `src/lib/auth/lockout.test.ts`

---

## P2-3: `listAuditLogs` brainId als Pflicht-Parameter

**Problem:** `audit.ts:136` — `if (opts?.brainId)` ist optional → könnte alle Logs zurückgeben.

**Datei:** `src/lib/audit.ts`

**Änderung:**
```ts
// Vorher:
export async function listAuditLogs(opts?: { brainId?: string; ... }): Promise<AuditEntry[]> {
  // ...
  if (opts?.brainId) {
    // filter by brain_id
  }
}

// Nachher:
export async function listAuditLogs(opts: { brainId: string; ... }): Promise<AuditEntry[]> {
  // brainId is now required
  // ...
  // Always filter by brain_id
}
```

**Aufrufer prüfen:** Alle Callers von `listAuditLogs` müssen `brainId` übergeben. Suche in:
- `src/app/api/audit/route.ts` — sollte `ctx.brainId` übergeben
- `src/app/dashboard/audit/page.tsx` — sollte via API brainId mitsenden

**Akzeptanzkriterien:**
- [ ] `brainId` ist Pflicht-Parameter in `listAuditLogs`
- [ ] Alle Callers übergeben `brainId`
- [ ] Keine Möglichkeit mehr, alle Logs ohne brainId-Filter abzufragen

---

## P2-4: DocuSign-Webhook Tenant-Auflösung über Metadata

**Problem:** `docusign/webhook/route.ts:73` — verwendet `process.env.SIGMABRAIN_BRAIN || "default"` als Fallback → nicht Multi-Tenant-safe.

**Datei:** `src/app/api/docusign/webhook/route.ts`

**Lösung:** DocuSign Envelopes haben Custom Fields / Metadata. Bei Versendung über die API setzen wir `metadata[brain_id]` auf den Brain des Users. Der Webhook liest dann `envelope.customFields[brain_id]` statt der Env-Var.

**Implementierung:**
1. In `docusign/send/route.ts`: Setze `metadata: { brain_id: ctx.brainId }` beim Erstellen des Envelopes
2. In `docusign/webhook/route.ts`: Lese `brain_id` aus dem Envelope:
```ts
const brainId = (event.data?.envelope?.customFields as { brain_id?: string })?.brain_id
  ?? (event.data?.envelope?.metadata as { brain_id?: string })?.brain_id;
if (!brainId) {
  console.warn("[docusign-webhook] No brain_id in envelope metadata — skipping");
  return NextResponse.json({ received: true, skipped: true });
}
```
3. Entferne `process.env.SIGMABRAIN_BRAIN || "default"` Fallback

**Akzeptanzkriterien:**
- [ ] DocuSign-Webhook liest `brain_id` aus Envelope-Metadata
- [ ] Kein `SIGMABRAIN_BRAIN` Env-Var Fallback mehr
- [ ] Envelopes ohne `brain_id` werden skipped (mit Warnung)
- [ ] `docusign/send/route.ts` setzt `metadata.brain_id` beim Erstellen

---

## P2-5: Bulk-Actions in Data Table

**Problem:** `data-table.tsx` hat kein `selectedRows`-Property → keine Massen-Aktionen.

**Datei:** `src/components/dashboard/data-table.tsx`

**Implementierung:**
1. Neues Property: `enableRowSelection?: boolean`
2. Neues Property: `bulkActions?: Array<{ label: string; onClick: (selectedRows: string[]) => void; variant?: "default" | "destructive" }>`
3. Checkbox-Spalte wenn `enableRowSelection` true
4. Bulk-Action-Bar wenn Rows selektiert sind (wie Notion/Linear)
5. "Select All" im Header
6. "X selected" Anzeige
7. Confirmation-Dialog für destruktive Bulk-Actions

**Pattern:**
```tsx
interface DataTableProps<T> {
  // ... existing props
  enableRowSelection?: boolean;
  bulkActions?: BulkAction[];
  rowId?: (row: T) => string;  // how to get unique ID per row
}

// In Component:
const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
const allSelected = data.length > 0 && selectedRows.size === data.length;
const someSelected = selectedRows.size > 0 && selectedRows.size < data.length;

// Bulk-action bar at bottom or top
{selectedRows.size > 0 && bulkActions && (
  <div className="flex items-center gap-2 border-b px-4 py-2">
    <span className="text-sm text-muted-foreground">{selectedRows.size} ausgewählt</span>
    {bulkActions.map(action => (
      <Button key={action.label} variant={action.variant} onClick={() => {
        if (action.variant === "destructive") {
          // show confirm dialog
        } else {
          action.onClick(Array.from(selectedRows));
        }
      }}>
        {action.label}
      </Button>
    ))}
    <Button variant="ghost" onClick={() => setSelectedRows(new Set())}>Abbrechen</Button>
  </div>
)}
```

**Akzeptanzkriterien:**
- [ ] `enableRowSelection` aktiviert Checkbox-Spalte
- [ ] "Select All" im Header selectiert/deselectiert alle Rows
- [ ] Bulk-Action-Bar erscheint bei selektierten Rows
- [ ] "X ausgewählt" Anzeige
- [ ] Confirmation-Dialog für `variant: "destructive"`
- [ ] `onBulkAction` Callback mit Array von Row-IDs
- [ ] "Abbrechen" clears selection
- [ ] Keyboard-accessible (Space zum Toggle, Enter zum Bestätigen)

---

## P2-6: Weitere `error.tsx` für verbleibende Dashboard-Seiten

**Problem:** 18 von 54 Seiten haben `error.tsx` — 36 fehlen noch.

**Fehlende Seiten (Auswahl — nicht alle kritisch):**
`anonymize`, `api-keys`, `assistant`, `calendar-export`, `controlling`, `cost-calculator`, `data-export`, `datev-export`, `drafting`, `email-import`, `graph`, `import-kanzlei`, `judgements-sync`, `kollisionspruefung`, `mobile`, `monitoring`, `norms`, `opponents`, `playbooks`, `rag-eval`, `rechtsprechung`, `research`, `signature`, `tabular-review`, `upload`, `verfahrensdoku`, `whatsapp`, `contracts`

**Ansatz:** Generisches `error.tsx` Template für alle verbleibenden Seiten. Da die meisten Dashboard-Seiten ähnliche Struktur haben, kann ein einheitliches Pattern verwendet werden:

```tsx
"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">Etwas ist schiefgelaufen</h2>
        <p className="text-sm text-muted-foreground max-w-md">{error.message}</p>
      </div>
      <button
        onClick={reset}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Erneut versuchen
      </button>
    </div>
  );
}
```

**Akzeptanzkriterien:**
- [ ] Jede Dashboard-Seite hat eine `error.tsx`
- [ ] Error-Boundary zeigt Message + Retry-Button
- [ ] Keine duplications (shared Component wenn möglich)

---

## P2-7: UI-Komponenten Tests (Top 10 kritischste)

**Problem:** 1 von 45 UI-Komponenten hat Tests (`button.test.tsx`). Fehlen: 44.

**Priorität:** Top 10 Komponenten mit höchster Nutzung:
1. `dialog.tsx` — Modal/Dialog (Accessibility-critical: Focus-Trap, Escape, Click-Outside)
2. `dropdown-menu.tsx` — Menu (Keyboard-Navigation, Focus-Management)
3. `select.tsx` — Select (Keyboard, ARIA, Option-Selection)
4. `confirm-dialog.tsx` — Confirmation (Destructive Actions)
5. `input.tsx` — Input (Validation, Focus, Disabled)
6. `checkbox.tsx` — Checkbox (Toggle, Indeterminate, Keyboard)
7. `tabs.tsx` — Tabs (Keyboard Arrow-Nav, ARIA tablist)
8. `table.tsx` — Table (Sort, Header, Cell)
9. `toast.tsx` — Toast (Auto-dismiss, Stacking, Accessibility)
10. `pagination.tsx` — Pagination (Prev/Next, Page-Numbers, Keyboard)

**Pattern pro Komponente:**
```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "./dialog";

describe("Dialog", () => {
  it("renders trigger and opens content on click", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Test Dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    // ... render, open, press Escape, verify closed
  });

  it("traps focus within dialog", () => {
    // ... render, open, Tab through, verify focus stays inside
  });
});
```

**Akzeptanzkriterien:**
- [ ] 10 neue `.test.tsx` Dateien unter `src/components/ui/`
- [ ] Jede Komponente hat 3+ Test-Cases (render, interaction, keyboard)
- [ ] `bun test src/components/ui/` → alle grün
- [ ] Focus-Trap Test für Dialog
- [ ] Keyboard-Navigation Test für Dropdown, Select, Tabs

---

## ZUSAMMENFASSUNG: P2 Fix-Reihenfolge

| Reihenfolge | Fix | Aufwand | Impact |
|-------------|-----|---------|--------|
| 1 | **P2-1:** Stripe Customer Portal | M (1h) | Self-Serve Billing |
| 2 | **P2-2:** Account-Lockout | M (2h) | Brute-Force-Schutz |
| 3 | **P2-3:** listAuditLogs brainId Pflicht | S (30min) | Multi-Tenant-Safety |
| 4 | **P2-4:** DocuSign-Webhook Tenant | M (1h) | Multi-Tenant-Safety |
| 5 | **P2-5:** Bulk-Actions Data Table | M (2h) | Productivity |
| 6 | **P2-6:** error.tsx für 36 Seiten | M (1h) | UX Completeness |
| 7 | **P2-7:** UI-Komponenten Tests (Top 10) | L (3h) | Test-Coverage |

**Gesamtaufwand:** ~10h für alle P2 Fixes

---

## ERWARTETES ERGEBNIS

Nach allen P2 Fixes sollte der Score von 64% auf ~80% steigen:

| Bereich | Aktuell | Nach P2 | Grund |
|---------|---------|---------|-------|
| Frontend | 78% | 85% | +Bulk-Actions, +error.tsx komplett |
| Auth & Security | 82% | 92% | +Account-Lockout, +CSP (P0 done) |
| Billing | 75% | 90% | +Customer Portal, +Idempotency (P1 done) |
| Multi-Tenant | 95% | 100% | +Audit brainId Pflicht, +DocuSign |
| Test-Coverage | 25% | 40% | +10 UI-Komponenten Tests |
| **Gesamt** | **64%** | **~80%** | |
