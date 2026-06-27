---
description: Optimiere Auth, Security & Compliance Layer nach Agency-Level Standards
---

# Auth, Security & Compliance Optimization

## Scope

- `src/lib/auth/` (10 Module) — Session, OAuth, 2FA/TOTP, Permissions
- `src/lib/permissions.ts` — RBAC Permission System
- `src/lib/encryption.ts` — AES-256-GCM Verschlüsselung
- `src/lib/csrf.ts` — CSRF Token Validation
- `src/lib/rate-limit-api.ts` — Rate Limiting
- `src/lib/audit.ts` — Audit Logging
- `src/lib/totp.ts` — TOTP 2FA
- `src/lib/api-key-store.ts` — API Key Management
- `src/lib/virus-scan.ts` — Virus Scanning
- `src/lib/gobd.ts` + `src/lib/gobd-verfahrensdoku.ts` — GoBD Compliance
- `src/lib/portal-token.ts` — Mandanten-Portal Token
- `src/lib/workos.ts` — WorkOS Integration
- `src/middleware.ts` — Next.js Middleware
- `src/app/api/auth/` (13 Routes) — Auth API Endpoints
- `src/app/api/2fa/` — 2FA API
- `src/app/api/audit/` — Audit API
- `src/app/api/settings/` — Settings API
- `src/app/dashboard/settings/security/` — Security Settings UI
- `src/app/dashboard/settings/kanzlei/` — Kanzlei Settings UI
- `src/app/dashboard/compliance/` — Compliance UI

## Kontext laden

1. Lese `src/middleware.ts` für Auth Pipeline
2. Lese `src/lib/auth/` für Auth-Implementierung
3. Lese `src/lib/permissions.ts` für RBAC
4. Lese `src/lib/encryption.ts` für Crypto
5. Lese `src/lib/audit.ts` für Audit-Log
6. Lese `src/lib/gobd.ts` für GoBD
7. Lese `src/lib/totp.ts` für 2FA

## Optimierungs-Checkliste

- [ ] **Session**: HttpOnly, Secure, SameSite=Lax Cookies
- [ ] **OAuth**: WorkOS Integration, PKCE Flow
- [ ] **2FA**: TOTP (RFC 6238), Backup-Codes, Recovery Flow
- [ ] **RBAC**: Role → Permissions Mapping, Resource-level Checks
- [ ] **Encryption**: AES-256-GCM für PII at rest, TLS 1.3 in transit
- [ ] **CSRF**: Double-Submit Cookie Pattern
- [ ] **Rate Limiting**: Sliding Window, Pro-User + Pro-IP
- [ ] **Audit Log**: Tamper-proof, Append-only, GoBD-konform
- [ ] **GoBD**: Verfahrensdokumentation, Integrität, Nachvollziehbarkeit
- [ ] **DSGVO/GDPR**: Right to Access, Export, Delete, Data Minimization
- [ ] **Virus Scan**: ClamAV oder API-basiert, vor Speicherung
- [ ] **API Keys**: Hashed Storage, Scoped Permissions, Rotation
- [ ] **Headers**: HSTS, X-Frame-Options, X-Content-Type-Options, CSP

## Test-Befehle

```bash
# Auth Flow E2E
npx playwright test tests/e2e-playwright/auth-flow.spec.ts

# Security Tests
npx vitest run src/lib/auth/
npx vitest run src/lib/encryption.test.ts

# GoBD Tests
npx vitest run src/lib/gobd.test.ts
```
