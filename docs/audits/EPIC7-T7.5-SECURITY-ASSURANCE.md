# T7.5 — Security Assurance: Threat Model, SBOM, Dependency Scans, SAST/DAST, Secret Scan, Pentest Backlog

## 1. Threat Model (STRIDE)

### System Boundaries

- **Frontend**: Next.js app on port 3000 (public)
- **Engine**: GBrain engine on port 8080 (internal, behind firewall)
- **Database**: PostgreSQL with pgvector (internal, behind firewall)
- **External APIs**: OpenRouter, DeepSeek, WorkOS, Stripe, DMS connectors

### STRIDE Analysis

| Threat                           | Category               | Vector                                | Mitigation                                                         | Status      |
| -------------------------------- | ---------------------- | ------------------------------------- | ------------------------------------------------------------------ | ----------- |
| Cross-tenant data access         | Spoofing               | RLS bypass via crafted queries        | PostgreSQL RLS + brain_id scoping + ACL runtime enforcement        | ✅ T7.1     |
| Prompt injection                 | Tampering              | Malicious user input to AI            | Regex sanitization + risk scoring + audit logging                  | ✅ T7.1     |
| Session hijacking                | Spoofing               | Stolen session token                  | Signed JWT + version-based revocation + 30d TTL                    | ✅ T7.2     |
| Unauthorized SCIM provisioning   | Elevation of privilege | SCIM endpoint without auth            | Bearer token + admin-only operations                               | ✅ T7.2     |
| Encryption key compromise        | Information disclosure | Key leak or rotation failure          | AES-256-GCM + key rotation module + production key requirement     | ✅ T7.3     |
| AI provider data retention       | Information disclosure | Provider trains on user data          | ZDR/No-Training policy enforcement + provider policy registry      | ✅ T7.3     |
| GDPR Art. 17 non-compliance      | Repudiation            | User requests erasure, data remains   | DSAR export/delete endpoints + 30-day grace + legal hold check     | ✅ T7.3     |
| Audit log tampering              | Tampering              | Direct DB modification of audit rows  | Hash chain + GoBD immutability triggers + independent verification | ✅ T7.4     |
| Secret leakage in git            | Information disclosure | API keys/passwords committed          | Gitleaks CI + custom patterns + allowlist                          | ✅ Existing |
| Dependency vulnerabilities       | Tampering              | Known CVEs in npm packages            | Snyk + bun audit + Dependabot weekly                               | ✅ Existing |
| CSRF on state-changing endpoints | Spoofing               | Cross-site request forgery            | CSRF token validation on all POST routes                           | ✅ Existing |
| Rate limit bypass                | DoS                    | Burst requests to expensive endpoints | 3-tier rate limiting (standard/heavy/search)                       | ✅ Existing |

### Attack Surface Inventory

1. **Public endpoints**: `/api/auth/*`, `/api/think`, `/api/legal/*`, `/api/admin/*`
2. **SCIM endpoint**: `/api/scim/v2/*` (bearer token auth)
3. **Webhook endpoints**: `/api/webhooks/*` (signature verification)
4. **Cron endpoints**: `/api/cron/*` (CRON_SECRET auth)
5. **Admin endpoints**: `/api/admin/*` (role=admin required)
6. **Engine API**: port 8080 (firewall-restricted, not public)

## 2. SBOM (Software Bill of Materials)

### Generation

- **Tool**: `bun pm ls --all` produces dependency tree
- **Format**: SPDX 2.3 (JSON)
- **CI Integration**: SBOM generated on every release tag
- **Storage**: Uploaded as CI artifact, retained 90 days
- **Scope**: Frontend (`package.json`) + Server (`server/package.json`)

### Known Components

- **Runtime**: Next.js 15, React 19, Bun 1.3
- **AI**: OpenRouter SDK, DeepSeek API
- **Auth**: WorkOS SDK, jose (JWT), bcrypt
- **DB**: pg, pgvector, PGLite
- **Security**: zod (validation), csrf, gitleaks
- **UI**: TailwindCSS, shadcn/ui, Lucide icons

## 3. Dependency Scanning

### CI Pipeline (`.github/workflows/ci.yml`)

- **gitleaks**: Secret scanning on every push/PR (fetch-depth: 0 for full history)
- **bun audit**: Dependency vulnerability check (severity ≥ high)
- **Snyk**: Node.js dependency monitoring (severity ≥ high)
- **Dependabot**: Weekly update PRs for npm + GitHub Actions

### Coverage

- **Frontend**: `package.json` → bun audit + Snyk
- **Server**: `server/package.json` → bun audit + Snyk monitor
- **GitHub Actions**: Dependabot weekly

### Gaps to Address

- [ ] Add Trivy container scanning for Docker images
- [ ] Add CodeQL SAST analysis workflow
- [ ] Add Semgrep for custom security rules
- [ ] Add OWASP ZAP DAST scan in CI

## 4. SAST/DAST

### Current SAST

- **ESLint**: Security-relevant rules in `eslint.config.mjs`
- **TypeScript**: Strict type checking prevents type confusion bugs
- **Gitleaks**: Secret detection in source code

### Current DAST

- **Playwright E2E**: Accessibility + keyboard + visual tests
- **42-step workflow simulation**: Mock engine E2E

### Pentest Backlog

1. **OWASP Top 10**: A01-A10 coverage assessment
2. **API security**: REST API fuzzing with RESTler or similar
3. **Authentication bypass**: Session token manipulation tests
4. **Authorization bypass**: Cross-tenant access attempts (covered in T7.1)
5. **Injection attacks**: SQL injection via API parameters
6. **SSRF**: Server-side request forgery via DMS connectors
7. **XSS**: Stored and reflected XSS in chat/legal output
8. **Rate limit bypass**: Concurrent request testing
9. **File upload**: Malicious file upload via DMS import
10. **Supply chain**: Dependency confusion attack simulation

## 5. Secret Scanning

### Gitleaks Configuration (`.gitleaks.toml`)

- **Custom patterns**: 8 Subsumio-specific secret patterns
- **Default ruleset**: Extended with project-specific patterns
- **Allowlist**: Docs, tests, env examples, legal corpus, build artifacts
- **CI**: Runs on every push and PR with full git history

### Secret Patterns Covered

1. `SUBSUMIO_AUTH_SECRET` (32+ chars)
2. `SUBSUMIO_ENCRYPTION_KEY` (32+ chars)
3. `SUBSUMIO_INTERNAL_SECRET` (16+ chars)
4. `SUBSUMIO_WEB_API_KEY` (16+ chars)
5. `CRON_SECRET` (8+ chars)
6. `WORKOS_API_KEY` (16+ chars)
7. `SCIM_BEARER_TOKEN` (16+ chars)
8. `UPSTASH_REDIS_REST_TOKEN` (16+ chars)
9. Server root password (literal match)

## 6. Security Assurance Test Suite

### Test Coverage

- **T7.1**: 104 tests — Tenant isolation, RLS, prompt injection, DMS, ACL
- **T7.2**: 92 tests — Identity lifecycle, SCIM, session revocation
- **T7.3**: 38 tests — Data governance, encryption, key rotation, ZDR, DSAR
- **T7.4**: 31 tests — Hash chain verification, tamper detection, GoBD
- **T7.5**: This document + security assurance tests

### Total: 265+ security tests across 5 work packages
