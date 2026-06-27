---
description: Optimiere External Integrations (DocuSign, WhatsApp, beA, Email, Connectors)
---

# External Integrations Optimization

## Scope

- `src/lib/docusign.ts` (11.4KB) — DocuSign e-Signature
- `src/app/api/docusign/` (6 Routes) — DocuSign API
- `src/lib/whatsapp/` (4 Module) — WhatsApp Business API
- `src/app/api/whatsapp/` (2 Routes) — WhatsApp API
- `src/lib/email-parser.ts` (4.8KB) — Email Parsing
- `src/lib/email/` — Email Processing
- `src/app/api/email/` (5 Routes) — Email API
- `src/app/api/email-import/` — Email Import
- `src/app/api/connectors/` (4 Routes) — Connector Management
- `src/app/api/bea/` — beA (besonderes elektronisches Anwaltspostfach)
- `src/lib/judgements.ts` (6.1KB) — Rechtsprechung-Sync
- `src/app/api/judgements-sync/` — Urteile-Sync API
- `src/lib/mobile-bridge.ts` (4.5KB) — Capacitor Mobile Bridge
- `src/app/api/calendar-export/` — Kalender-Export
- `src/app/api/datev-export/` — DATEV-Export
- `src/app/api/data-export/` (2 Routes) — Datenexport

## Kontext laden

1. Lese das jeweilige Integrations-Modul
2. Lese die zugehörigen API Routes
3. Lese `src/lib/api-key-store.ts` für Credential Management
4. Lese `src/lib/encryption.ts` für Credential Verschlüsselung

## Optimierungs-Checkliste

- [ ] **Webhook Verification**: Signature-Validation für alle eingehenden Webhooks
- [ ] **Idempotency**: Webhook-Deduplication via Event-ID
- [ ] **Retry Logic**: Exponential Backoff für externe API Calls
- [ ] **Rate Limiting**: Externe API Rate-Limits respektieren
- [ ] **Error Handling**: Externe API Errors → User-friendly Messages
- [ ] **Credential Storage**: Verschlüsselt (AES-256-GCM), nie im Plain Text
- [ ] **Token Refresh**: OAuth Token Auto-Refresh
- [ ] **Pagination**: Externe API Pagination korrekt gehandhabt
- [ ] **Sync Status**: Progress-Indicator für Long-Running Syncs
- [ ] **Conflict Resolution**: Was passiert bei gleichzeitigen Edits?

## Test-Befehle

```bash
# Integration Tests
npx vitest run src/lib/docusign.test.ts
npx vitest run src/lib/email-parser.test.ts

# E2E
npx playwright test tests/e2e-playwright/
```
