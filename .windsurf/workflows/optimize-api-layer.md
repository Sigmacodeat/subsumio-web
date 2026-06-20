---
description: Optimiere API Layer / Next.js API Routes nach Agency-Level Standards
---

# API Layer Optimization

## Scope
- `src/app/api/` — 97 API Routes (auth, legal, dms, docusign, billing, connectors, etc.)
- `src/lib/api.ts` — Client-side API Wrapper
- `src/lib/engine-proxy.ts` — Engine Proxy für Server-side Engine Calls
- `src/lib/engine.ts` — Engine Connection Helper
- `src/middleware.ts` — Next.js Middleware (Auth, CSRF, Rate-Limiting)

## API Route Kategorien
- **Auth**: `/api/auth/*` (13 Routes) — Login, Logout, 2FA, Signup, Reset, OAuth
- **Legal**: `/api/legal/*` (16 Routes) — AI-Deadlines, Analyze, Anonymize, Conflict-Check, Contract-Draft/Redline, Document-Review, Due-Diligence, Judgements, Memo, Risk-Analysis, RVG, Statute, Summarize, Tabular-Review
- **DMS**: `/api/dms/*` (3 Routes) — Document Management
- **DocuSign**: `/api/docusign/*` (6 Routes) — e-Signature Integration
- **Billing**: `/api/billing/*` (2 Routes) — Subscription, Invoices
- **Connectors**: `/api/connectors/*` (4 Routes) — External Integrations
- **Email**: `/api/email/*` (5 Routes) — Email Import, Parsing
- **Portal**: `/api/portal/*` (5 Routes) — Mandanten-Portal
- **Org**: `/api/org/*` (4 Routes) — Organization Management
- **Cron**: `/api/cron/*` (4 Routes) — Scheduled Tasks
- **Core**: stats, search, pages, graph, queries, think, upload, usage, health, audit, comments, approvals, agents, api-keys, team, settings, whatsapp, webhook, marketing-agent, rag-eval, demo, data-export, 2fa, brains

## Kontext laden
1. Lese `src/middleware.ts` für Auth & Security Pipeline
2. Lese `src/lib/engine-proxy.ts` für Engine-Proxy Pattern
3. Lese `src/lib/api.ts` für Client-side API Patterns
4. Lese `src/lib/auth/` für Auth-Logik
5. Lese `src/lib/rate-limit-api.ts` für Rate-Limiting
6. Lese `src/lib/csrf.ts` für CSRF-Schutz
7. Lese `src/lib/audit.ts` für Audit-Logging

## Optimierungs-Checkliste
- [ ] **Auth**: Jede Route prüft Session, Role, Permissions
- [ ] **Input Validation**: Zod-Schema für jeden Request Body / Query Params
- [ ] **Error Handling**: Konsistente Error-Responses ({ error: string, code: string })
- [ ] **Rate Limiting**: Pro-User und Pro-IP Limits
- [ ] **CSRF**: Token-Validation für alle POST/PUT/DELETE
- [ ] **Audit Log**: Jede destruktive Action wird geloggt
- [ ] **Response Format**: Konsistente JSON-Struktur, Pagination-Meta
- [ ] **SSE Streaming**: `/api/think` nutzt SSE — andere Long-Running Ops auch?
- [ ] **File Upload**: Validation (MIME, Size, Virus-Scan), Chunked Upload
- [ ] **Caching**: Cache-Control Headers, ETag, SWR-Pattern
- [ ] **CORS**: Korrekte Headers für Cross-Origin (falls Portal/External)
- [ ] **Webhooks**: Signature-Verification, Idempotency, Retry-Logic

## Test-Befehle
```bash
# API Route Tests
npx vitest run src/lib/*.test.ts

# Integration Tests
npx playwright test tests/e2e-playwright/auth-flow.spec.ts

# TypeScript Check
npx tsc --noEmit

# ESLint
npx eslint src/app/api/ src/lib/
```

## Agency-Level Standards
- **Route Handler Pattern**: `export async function POST(req: NextRequest) { ... }`
- **Validation**: Zod-Schema → `schema.parse(body)` → typed handler
- **Error Response**: `{ error: "Human readable", code: "MACHINE_CODE", details?: {} }`
- **Success Response**: `{ data: T, meta?: { page, limit, total } }`
- **Auth Guard**: `const session = await getSession(); if (!session) return 401;`
- **Permission Guard**: `if (!hasPermission(session, 'legal:write')) return 403;`
- **Rate Limit**: `const allowed = await rateLimit(session.userId, 'api:legal');`
- **Audit**: `await audit.log({ userId, action: 'contract.draft', resource, before, after });`
- **Streaming**: SSE für AI-Responses, ReadableStream für Large Exports
