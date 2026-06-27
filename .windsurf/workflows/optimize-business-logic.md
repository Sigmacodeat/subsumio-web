---
description: Optimiere Business Logic / Lib Layer nach Agency-Level Standards
---

# Business Logic / Lib Optimization

## Scope

- `src/lib/` — 87 Module mit Domain-Logik
- `src/lib/auth/` (10 Module) — Session, OAuth, 2FA/TOTP, Permissions
- `src/lib/billing/` — Subscription & Billing Logic
- `src/lib/dms/` (3 Module) — Document Management System
- `src/lib/email/` — Email Processing
- `src/lib/whatsapp/` (4 Module) — WhatsApp Integration
- `src/lib/legal-chat/` — Legal Chat Engine
- `src/lib/queries/` — Query Helpers
- `src/lib/schemas/` (8 Module) — Zod Validation Schemas
- `src/lib/hooks/` — React Hooks

## Kern-Module

- `src/lib/legal-deadlines.ts` (13.8KB) — Fristberechnung (ZPO, BGB, VwGO)
- `src/lib/legal-types.ts` (6.5KB) — Type Definitions für Legal Domain
- `src/lib/rvg.ts` (2.7KB) — RVG Kostenberechnung
- `src/lib/ai-deadline-detect.ts` (7.2KB) — AI-gestützte Fristerkennung
- `src/lib/docusign.ts` (11.4KB) — DocuSign e-Signature Integration
- `src/lib/invoice-pdf.ts` (6.6KB) — PDF-Rechnungsgenerierung
- `src/lib/invoice-template.ts` (3.1KB) — Rechnungs-Template
- `src/lib/judgements.ts` (6.1KB) — Rechtsprechung-Sync
- `src/lib/permissions.ts` (5.9KB) — RBAC Permission System
- `src/lib/encryption.ts` (4.3KB) — Verschlüsselung (AES-256-GCM)
- `src/lib/virus-scan.ts` (6.3KB) — Virus-Scan für Uploads
- `src/lib/gobd.ts` (4.1KB) — GoBD Compliance
- `src/lib/gobd-verfahrensdoku.ts` (5.3KB) — Verfahrensdokumentation
- `src/lib/audit.ts` (5.1KB) — Audit-Logging
- `src/lib/usage.ts` (4.7KB) — Usage Tracking
- `src/lib/plans.ts` (7.0KB) — Subscription Plans
- `src/lib/kanzlei-settings.ts` (3.2KB) — Kanzlei-Einstellungen
- `src/lib/portal-token.ts` (2.6KB) — Mandanten-Portal Token
- `src/lib/mobile-bridge.ts` (4.5KB) — Capacitor Mobile Bridge
- `src/lib/offline-store.ts` (5.9KB) — Offline Data Store
- `src/lib/realtime.ts` (3.7KB) — WebSocket Realtime Layer

## Kontext laden

1. Lese das jeweilige Modul das optimiert werden soll
2. Lese `src/lib/types.ts` für gemeinsame Types
3. Lese `src/lib/schemas/` für zugehörige Validation-Schemas
4. Lese `src/lib/permissions.ts` für Permission-Checks
5. Lese `src/lib/audit.ts` für Audit-Logging Pattern
6. Lese `src/lib/store.ts` für State-Management Pattern

## Optimierungs-Checkliste

- [ ] **Type Safety**: Kein `any`, explizite Types für alle Public APIs
- [ ] **Error Handling**: Custom Error Classes, nie `throw new Error("string")` ohne code
- [ ] **Validation**: Zod-Schemas für alle externen Inputs
- [ ] **Testing**: Unit-Tests für jede Business-Logic-Funktion
- [ ] **Immutability**: Pure Functions wo möglich, keine Side-Effects
- [ ] **Logging**: Structured Logging (JSON), korrelierte Request-IDs
- [ ] **Security**: Input-Sanitization, SQL-Injection-Schutz, XSS-Schutz
- [ ] **Performance**: Memoization, Caching, Batch-Operations
- [ ] **i18n**: Fehlermeldungen übersetzbar
- [ ] **GDPR/DSGVO**: Data Minimization, Right to be Forgotten, Export

## Test-Befehle

```bash
# Unit Tests
npx vitest run src/lib/*.test.ts

# Specific Module Test
npx vitest run src/lib/gobd.test.ts

# TypeScript Check
npx tsc --noEmit

# ESLint
npx eslint src/lib/
```

## Agency-Level Standards

- **Pure Functions**: `calculateDeadline(date, rule) → Deadline` ohne Side-Effects
- **Error Classes**: `class LegalDeadlineError extends Error { code: string; details: {} }`
- **Zod Schemas**: `const DeadlineInputSchema = z.object({ ... })` → inferred type
- **Repository Pattern**: DB-Zugriff isoliert in `*Repository` Functions
- **Service Layer**: Business-Logic in `*Service` Functions, ruft Repository auf
- **Factory Pattern**: Komplexe Objekt-Erstellung in Factory Functions
- **Strategy Pattern**: Fristberechnung nach Rechtsgebiet (ZPO vs BGB vs VwGO)
- **Observer Pattern**: Audit-Log als Observer auf State-Changes
