# Multi-Industry Architecture Blueprint — Subsumio 2026

> **Datum:** 28. Juni 2026 (Revision 2 — Phase 1 implementiert)
> **Scope:** Transformation von Legal-Only zu Multi-Industry SaaS Platform (Legal + Tax + Future Verticals)
> **Ansatz:** State-of-the-Art 2026 Multi-Tenant Multi-Industry SaaS Architecture
> **Status:** Phase 1 (Foundation) ✅ abgeschlossen — `tax` registriert, Sidebar aktiv, Brain-Provisioning läuft

---

## 1. Architektur-Philosophie: Platform-First

### Was State-of-the-Art 2026 bedeutet:

Moderne Multi-Industry SaaS-Plattformen (Notion, Airtable, Monday, HubSpot) nutzen einen **Platform-First** Ansatz:

```
┌─────────────────────────────────────────────────────────┐
│                    Platform Core                         │
│  (Auth, DMS, Audit, Billing, AI Engine, Search, RBAC)   │
├──────────────┬──────────────┬──────────────┬────────────┤
│  Legal Pack  │  Tax Pack    │  Future Pack │  ...       │
│  (RVG, ZPO,  │  (StBVV, AO, │  (Custom)    │            │
│   beA, BRAO) │   ELSTER)    │              │            │
├──────────────┼──────────────┼──────────────┼────────────┤
│  Legal UI    │  Tax UI      │  Custom UI   │  ...       │
│  (Sidebar,   │  (Sidebar,   │  (Sidebar,   │            │
│   Pages,     │   Pages,     │   Pages,     │            │
│   i18n)      │   i18n)      │   i18n)      │            │
└──────────────┴──────────────┴──────────────┴────────────┘
```

**Kernprinzipien:**

1. **Platform Core** = domain-agnostisch (Auth, DMS, Audit, Billing, AI Engine)
2. **Industry Packs** = vertikale Module (Gesetze, Gebuehren, Fristen, Schreibstile)
3. **Industry UI** = vertikale Oberflaechen (Sidebar, Pages, Quick-Create, Onboarding)
4. **Industry Switch** = Runtime-Conditional, nicht Compile-Time

### Was Subsumio bereits hat und was fehlt:

| Komponente             | Status                        | Was fehlt?                                      |
| ---------------------- | ----------------------------- | ----------------------------------------------- |
| Platform Core          | ✅ 90% ready                  | —                                               |
| Industry Pack Registry | ✅ Implementiert              | `legal` + `tax` registriert                     |
| Industry Theme         | ✅ Implementiert              | `SUBSUMIO_THEME` (Blue) + `TAX_THEME` (Emerald) |
| Sidebar                | ✅ Implementiert              | `navForIndustry()` mit `LEGAL_NAV` + `TAX_NAV`  |
| Quick-Create           | ❌ Legal-only Dialogs         | Industry-specific Dialogs                       |
| Admin Panel            | ❌ Kein Industry-Filter       | Industry-Spalte + Filter                        |
| Onboarding             | ❌ Legal-only Flow            | Industry-specific Onboarding                    |
| Dashboard Pages        | ⚠️ Gemischt                   | Industry-routing fuer vertikale Pages           |
| i18n                   | ⚠️ Legal-Keys + teilweise Tax | Tax-Keys vervollständigen                       |
| Corpus                 | ✅ Format ready               | `law-corpus/de/` um Steuergesetze erweitern     |

---

## 2. Architektur-Komponenten im Detail

### 2.1 Industry Pack Registry (implementiert)

**Datei:** `src/lib/industry-pack.ts`

**Status:** `tax` Profile ist registriert mit eigenem Theme (`TAX_THEME`), Brand ("Subsumio Tax"), Pack (`subsumio-tax`) und Signature. Tests in `industry-pack.test.ts` pruefen beide Industries.

```typescript
export const INDUSTRY_PROFILES = {
  legal: {
    /* ... brand: "Subsumio", theme: SUBSUMIO_THEME, pack: "subsumio-legal" */
  },
  tax: {
    /* ... brand: "Subsumio Tax", theme: TAX_THEME, pack: "subsumio-tax" */
  },
} as const satisfies Record<string, IndustryProfile>;
```

### 2.2 Industry-Conditional Sidebar (implementiert)

**Datei:** `src/components/dashboard/sidebar.tsx`

**Status:** `navForIndustry()` ist implementiert mit `LEGAL_NAV` und `TAX_NAV`. Die Sidebar-Komponente akzeptiert `industry` als Prop und rendert die entsprechende Navigation.

### 2.3 Industry-Conditional Quick-Create (Refactoring)

**Aktuell:** `layout.tsx` hat 6 hartkodierte Quick-Create Dialogs (Case, Deadline, Invoice, Signature, Clause, Contract) — alle Legal.

**Neu:** Industry-conditional Quick-Create.

```typescript
// src/lib/quick-actions.ts (neu)
export interface QuickAction {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  shortcut: string; // "n", "d", "i", etc.
  component: React.ComponentType<{ open: boolean; onOpenChange: (v: boolean) => void }>;
}

export const LEGAL_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "case",
    labelKey: "nav.cases",
    icon: Briefcase,
    shortcut: "n",
    component: CaseQuickCreateDialog,
  },
  {
    id: "deadline",
    labelKey: "nav.deadlines",
    icon: CalendarClock,
    shortcut: "d",
    component: DeadlineQuickCreateDialog,
  },
  {
    id: "invoice",
    labelKey: "nav.invoicing",
    icon: Receipt,
    shortcut: "i",
    component: InvoiceQuickCreateDialog,
  },
  {
    id: "signature",
    labelKey: "nav.signature",
    icon: FileSignature,
    shortcut: "s",
    component: SignatureQuickCreateDialog,
  },
  {
    id: "contract",
    labelKey: "nav.contracts",
    icon: FileCheck,
    shortcut: "c",
    component: ContractQuickCreateDialog,
  },
];

export const TAX_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "tax-return",
    labelKey: "nav.tax_returns",
    icon: FileText,
    shortcut: "n",
    component: TaxReturnQuickCreateDialog,
  },
  {
    id: "tax-deadline",
    labelKey: "nav.tax_deadlines",
    icon: CalendarClock,
    shortcut: "d",
    component: TaxDeadlineQuickCreateDialog,
  },
  {
    id: "invoice",
    labelKey: "nav.invoicing",
    icon: Receipt,
    shortcut: "i",
    component: InvoiceQuickCreateDialog,
  },
  {
    id: "signature",
    labelKey: "nav.signature",
    icon: FileSignature,
    shortcut: "s",
    component: SignatureQuickCreateDialog,
  },
];

export function quickActionsForIndustry(industry: string | null): QuickAction[] {
  return industry === "tax" ? TAX_QUICK_ACTIONS : LEGAL_QUICK_ACTIONS;
}
```

### 2.4 Admin Panel: Industry-Filter (erweitern)

**Datei:** `src/components/admin/user-table.tsx`, `src/app/admin/page.tsx`

**Aenderungen:**

1. **Industry-Spalte** in User-Tabelle
2. **Industry-Filter** Dropdown (All / Legal / Tax / Other)
3. **Industry-Badge** in User-Detail-View
4. **Industry-Stats** in Admin-Overview (wie viele Legal vs Tax Kunden)
5. **Industry-Switch** in Admin User-Edit (Admin kann Industry fuer User aendern)

### 2.5 Industry-Specific Dashboard Pages

**Kategorien:**

| Kategorie       | Legal                              | Tax                                  | Shared?                                   |
| --------------- | ---------------------------------- | ------------------------------------ | ----------------------------------------- |
| Overview        | `/dashboard`                       | `/dashboard`                         | ✅ Shared (aber unterschiedliche Widgets) |
| Cases/Clients   | `/dashboard/cases`                 | `/dashboard/clients` (neu)           | ❌ Industry-specific                      |
| Deadlines       | `/dashboard/deadlines`             | `/dashboard/tax-deadlines` (neu)     | ❌ Industry-specific                      |
| Contacts        | `/dashboard/contacts`              | `/dashboard/contacts`                | ✅ Shared                                 |
| Documents       | `/dashboard/vault`                 | `/dashboard/vault`                   | ✅ Shared                                 |
| Upload          | `/dashboard/upload`                | `/dashboard/upload`                  | ✅ Shared                                 |
| Chat/AI         | `/dashboard/chat`                  | `/dashboard/chat`                    | ✅ Shared                                 |
| Invoicing       | `/dashboard/invoicing`             | `/dashboard/invoicing`               | ✅ Shared                                 |
| DATEV           | `/dashboard/datev-export`          | `/dashboard/datev-export`            | ✅ Shared                                 |
| Compliance      | `/dashboard/compliance`            | `/dashboard/compliance`              | ✅ Shared                                 |
| Audit           | `/dashboard/audit`                 | `/dashboard/audit`                   | ✅ Shared                                 |
| Team            | `/dashboard/team`                  | `/dashboard/team`                    | ✅ Shared                                 |
| Settings        | `/dashboard/settings`              | `/dashboard/settings`                | ✅ Shared                                 |
| Billing         | `/dashboard/billing`               | `/dashboard/billing`                 | ✅ Shared                                 |
| Drafting        | `/dashboard/drafting`              | —                                    | ❌ Legal-only                             |
| Litigation      | `/dashboard/litigation`            | —                                    | ❌ Legal-only                             |
| Tax Returns     | —                                  | `/dashboard/tax-returns` (neu)       | ❌ Tax-only                               |
| Tax Assessments | —                                  | `/dashboard/tax-assessments` (neu)   | ❌ Tax-only                               |
| Tax Audit       | —                                  | `/dashboard/tax-audit` (neu)         | ❌ Tax-only                               |
| ELSTER          | —                                  | `/dashboard/elster` (neu)            | ❌ Tax-only                               |
| Cost Calculator | `/dashboard/cost-calculator` (RVG) | `/dashboard/cost-calculator` (StBVV) | ⚠️ Same URL, different logic              |
| Research        | `/dashboard/research`              | —                                    | ❌ Legal-only                             |
| beA             | `/dashboard/bea`                   | —                                    | ❌ Legal-only                             |

**Strategie:**

- **Shared Pages** = gleiche URL, Industry-conditional Content wo noetig
- **Industry-only Pages** = eigene URLs, nur in Industry-Sidebar sichtbar
- **Neue Tax Pages** = `src/app/dashboard/tax-returns/`, `tax-assessments/`, `tax-audit/`, `elster/`

### 2.6 Industry-Specific Onboarding

**Aktuell:** `/dashboard/onboarding` fragt nach Kanzlei-Name, Anwalt-Name, etc.

**Neu:** Industry-conditional Onboarding-Form:

```typescript
const LEGAL_ONBOARDING_FIELDS = [
  { key: "kanzleiName", labelKey: "onboarding.kanzlei_name" },
  { key: "anwaltName", labelKey: "onboarding.anwalt_name" },
  { key: "kanzleiEmail", labelKey: "onboarding.kanzlei_email" },
  { key: "focus", labelKey: "onboarding.focus" },
];

const TAX_ONBOARDING_FIELDS = [
  { key: "kanzleiName", labelKey: "onboarding.stb_name" }, // "Name der Steuerberatung"
  { key: "anwaltName", labelKey: "onboarding.stb_inhaber" }, // "Inhaber / Partner"
  { key: "kanzleiEmail", labelKey: "onboarding.stb_email" },
  { key: "focus", labelKey: "onboarding.stb_focus" }, // "Tätigkeitsschwerpunkte"
];
```

### 2.7 Industry-Specific i18n

**Datei:** `src/content/dashboard.ts`

**Neue Keys fuer Tax:**

```typescript
// Tax-spezifische Nav-Items
"nav.tax_returns": { de: "Steuererklaerungen", en: "Tax Returns" },
"nav.tax_assessments": { de: "Bescheide", en: "Assessments" },
"nav.tax_audit": { de: "Betriebspruefung", en: "Tax Audit" },
"nav.tax_deadlines": { de: "Steuerfristen", en: "Tax Deadlines" },
"nav.elster": { de: "ELSTER", en: "ELSTER" },
"nav.clients": { de: "Mandanten", en: "Clients" },

// Tax-spezifische Sections
"nav.section.clients": { de: "Mandanten", en: "Clients" },
"nav.section.tax_returns": { de: "Steuererklaerungen & Bescheide", en: "Tax Returns & Assessments" },

// Tax Onboarding
"onboarding.stb_name": { de: "Name der Steuerberatung", en: "Tax advisory name" },
"onboarding.stb_inhaber": { de: "Inhaber / Partner", en: "Owner / Partner" },
"onboarding.stb_email": { de: "E-Mail der Steuerberatung", en: "Tax advisory email" },
"onboarding.stb_focus": { de: "Tätigkeitsschwerpunkte", en: "Practice areas" },
```

### 2.8 Industry-Specific Corpus

**Aktuell:** `law-corpus/de/` mit BGB, ZPO, etc. + `ao.md` (bereits vorhanden!)

**Neu:** Steuergesetze ergaenzen in `law-corpus/de/`:

- `ao.md` ✅ (bereits vorhanden)
- `estg.md` (Einkommensteuergesetz) — NEU
- `ustg.md` (Umsatzsteuergesetz) — NEU
- `gewstg.md` (Gewerbesteuergesetz) — NEU
- `kstg.md` (Körperschaftsteuergesetz) — NEU
- `erbstg.md` (Erbschaftsteuergesetz) — NEU
- `bewg.md` (Bewertungsgesetz) — NEU
- `stbvv.md` (Steuerberatervergütungsverordnung) — NEU
- `stberg.md` (Steuerberatungsgesetz) — NEU

**Aufwand:** 2-3 Wochen (ein Praktikant kann das machen)

### 2.9 Industry-Specific Fee Calculation

**Aktuell:** `src/lib/rvg.ts` — RVG Gebuehrenberechnung

**Neu:** `src/lib/stbvv.ts` — StBVV Gebuehrenberechnung (analog zu RVG)

```typescript
// src/lib/stbvv.ts (neu, analog zu rvg.ts)
export function calculateStbvv(value: number): StbvvResult { ... }
```

**Aufwand:** 1 Woche

### 2.10 Industry-Specific Deadline Rules

**Aktuell:** `src/lib/legal-deadlines.ts` — ZPO/BGB Fristen

**Neu:** Tax-Fristen als zusaetzliche Rule-Definitions:

```typescript
// In legal-deadlines.ts (oder neu tax-deadlines.ts)
const TAX_DEADLINE_RULES: DeadlineRule[] = [
  { key: "est_einspruch", law: "§ 355 AO", days: 1, type: "einspruch" },
  { key: "est_anmeldung", law: "§ 149 AO", type: "anmeldung" },
  { key: "est_schaetzung", law: "§ 162 AO", type: "schaetzung" },
  // ...
];
```

**Aufwand:** 1-2 Wochen

---

## 3. Implementierungs-Plan

### Phase 1: Foundation (Woche 1-2)

1. `industry-pack.ts` erweitern um `tax` Profile + `TAX_THEME`
2. `industry-pack.test.ts` anpassen (tax wird valid)
3. `sidebar.tsx` refactoring zu `navForIndustry()` Pattern
4. `layout.tsx` Industry-conditional Quick-Create
5. `src/lib/quick-actions.ts` neu
6. Admin Panel: Industry-Spalte + Filter
7. i18n: Tax-Keys hinzufuegen

### Phase 2: Tax Pages (Woche 3-4)

1. `/dashboard/tax-returns/` — Steuererklaerungen CRUD
2. `/dashboard/tax-assessments/` — Bescheide CRUD
3. `/dashboard/tax-audit/` — Betriebspruefung
4. `src/lib/tax-types.ts` — TaxEntry, TaxAssessment, TaxAudit Typen
5. `src/lib/tax-deadlines.ts` — Steuerfristen-Engine
6. `src/lib/stbvv.ts` — StBVV Gebuehrenberechnung

### Phase 3: Tax Corpus (Woche 5-6)

1. `law-corpus/de/estg.md` — Einkommensteuergesetz
2. `law-corpus/de/ustg.md` — Umsatzsteuergesetz
3. `law-corpus/de/gewstg.md` — Gewerbesteuergesetz
4. `law-corpus/de/kstg.md` — Körperschaftsteuergesetz
5. `law-corpus/de/erbstg.md` — Erbschaftsteuergesetz
6. `law-corpus/de/bewg.md` — Bewertungsgesetz
7. `law-corpus/de/stbvv.md` — StBVV
8. `law-corpus/de/stberg.md` — Steuerberatungsgesetz

### Phase 4: Tax Onboarding + Marketing (Woche 7)

1. Industry-conditional Onboarding-Form
2. `/tax` Marketing-Landingpage
3. Tax-spezifische Email-Templates
4. Tax-spezifische Guided Tour

### Phase 5: ELSTER Integration (Woche 8-12, optional)

1. ELSTER API Integration (ERiC-SDK)
2. Zertifizierung
3. Submission von Steuererklaerungen
4. `/dashboard/elster/` UI

### Phase 6: Self-Audit + Production (Woche 13)

1. Edge-Case Testing (Industry-Switch, Mixed-Org)
2. Performance Testing
3. Security Audit
4. Production Deployment

---

## 4. Datenmodell

### 4.1 User Model (bestehend, erweitert)

```typescript
interface User {
  // ... bestehende Felder ...
  industry?: string | null; // ✅ bereits vorhanden
  // Keine Aenderung noetig — industry field treibt alles
}
```

### 4.2 Org Model (bestehend, erweitert)

```typescript
interface Org {
  // ... bestehende Felder ...
  industry?: string | null; // NEU — Org-level Industry (override user industry)
}
```

**Regel:** Wenn `org.industry` gesetzt, gilt dieser fuer alle Member. Sonst `user.industry`.

### 4.3 Neue Tax Typen

```typescript
// src/lib/tax-types.ts (neu)
interface TaxReturn {
  id: string;
  clientId: string;
  type: "est" | "ust" | "gewst" | "kst" | "erbst" | "gew";
  year: number;
  status: "draft" | "filed" | "assessed" | "amended";
  filedAt?: string;
  assessedAt?: string;
  assessmentNotice?: string;
  elsterId?: string;
  deadline?: string;
  notes?: string;
}

interface TaxAssessment {
  id: string;
  taxReturnId: string;
  type: "notice" | "amended" | "correction";
  date: string;
  amount: number;
  dueDate?: string;
  appealDeadline?: string;
  status: "received" | "appealed" | "final";
}

interface TaxAudit {
  id: string;
  clientId: string;
  auditPeriod: { from: string; to: string };
  status: "scheduled" | "in_progress" | "completed" | "appealed";
  auditor?: string;
  findings?: string;
  result?: "no_change" | "additional_tax" | "refund";
  additionalAmount?: number;
}
```

---

## 5. Edge Cases & Fehlerszenarien

| Szenario                                         | Loesung                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| User wechselt Industry von legal zu tax          | Admin kann Industry aendern → Brain wird neu provisioned mit neuem Pack |
| Org hat Members mit unterschiedlichen Industries | Org.industry override → alle Members sind gleiche Industry              |
| Legal User oeffnet Tax-Page URL                  | Redirect zu `/dashboard` mit Warning Toast                              |
| Tax User oeffnet Legal-Page URL (z.B. /drafting) | Redirect zu `/dashboard` mit Warning Toast                              |
| Industry ist null/undefined                      | Default zu `legal` (backward compat)                                    |
| Quick-Create Shortcut bei Industry-Switch        | Industry-conditional Shortcuts                                          |
| Command Palette zeigt Legal-Items fuer Tax-User  | Industry-conditional `ALL_NAV_ITEMS`                                    |
| Mobile Tab Bar                                   | Industry-conditional Primary Items                                      |

---

## 6. Definition of Done

- [x] `tax` ist valid industry in `industry-pack.ts`
- [x] Tax-User sieht Tax-Sidebar (nicht Legal-Sidebar) — `navForIndustry()` mit `TAX_NAV`
- [x] Tax-User sieht Tax-Quick-Create (nicht Case/Deadline) — `TaxQuickCreateDialog` in `layout.tsx`
- [x] Admin Panel zeigt Industry-Spalte + Filter — `user-table.tsx` + `user-detail-form.tsx`
- [x] Tax-User kann Steuererklaerungen CRUD — API `/api/tax/returns` + Dashboard + Detail-Seite
- [x] Tax-User kann Bescheide CRUD — API `/api/tax/assessments` + Dashboard + Detail-Seite
- [x] Tax-User kann Betriebspruefungen CRUD — API `/api/tax/audits` + Dashboard + Detail-Seite
- [x] StBVV Gebuehrenrechner funktioniert — `src/lib/stbvv.ts` + 6 Tests
- [x] Steuerfristen-Engine funktioniert — `src/lib/tax-deadlines.ts` + 11 Tests
- [x] Tax Corpus hat 8+ Steuergesetze — 12 Dateien (ao, estg, ustg, kstg, gewstg, erbstg, stbvv, stberg, bewg, grestg, lstdv, ao-index)
- [x] Tax Onboarding funktioniert — Industry-Auswahl mit Tax-Option in `onboarding/page.tsx`
- [x] Tax Marketing Page existiert — `/tax` Landingpage
- [x] Industry-Switch im Admin funktioniert — PATCH `/api/admin/users/[id]` mit `isValidIndustry()`
- [x] Legal-Only Pages sind fuer Tax-User nicht sichtbar (Sidebar-conditional)
- [x] Tax-Only Pages sind fuer Legal-User nicht sichtbar (Sidebar-conditional)
- [x] Command Palette ist industry-conditional (`navForIndustry()` in `command-palette.tsx`)
- [x] Mobile Tab Bar ist industry-conditional (`tabsForIndustry()` in `mobile-tab-bar.tsx`)
- [x] Alle Tests gruen
- [x] Build erfolgreich
- [x] 0 TypeScript Errors

---

_Blueprint erstellt: 28. Juni 2026 — Revision 3: Alle DoD-Items abgeschlossen_
