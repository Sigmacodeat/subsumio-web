# EPIC 7 — Enterprise Security, Governance & Compliance Blueprint

**Priority:** P1/P2 — parallel with core workflows
**Status:** Blueprint Phase → Implementation
**Date:** 2026-07-14

---

## 1. Ziel des Systems (User-Sicht)

Enterprise-Kanzleien benötigen garantierte Tenant-Isolation, vollständigen Identity-Lifecycle, enforceable Data Governance und tamper-evidente Audit-Trails für ISO-27001/SOC-2-Readiness. Dieses EPIC liefert die fehlenden Implementierungslücken und schließt E2E-Test-Suiten ab, die Cross-Tenant-Lecks und Prompt-Injection abfangen.

---

## 2. Bestandsaufnahme — Was bereits existiert

### T7.1 Tenant/Matter-Isolation

- `data-classification.ts` — 5 Entity-Klassen, 4 Sensitivity-Levels, TenantScope-Validation
- `tenant-boundary.test.ts` — 10 Test-Suiten (Brain/Org/Source/Search/Export/Portal/DMS/Analytics)
- `ethical-wall.ts` — Ethical Wall + AI-Provider-Policy + Data-Residency (eu_only/eu_or_adequate)
- `prompt-sanitizer.ts` — Injection-Pattern-Erkennung (EN+DE), Delimiter-Wrapping
- **Server:** `acl.ts` (isPageAccessible, filterPagesByACL), `operations.ts` (matterScopeFilter, aclFilter, hardSourceFilter), `web-api.ts` (identity tokens, fail-closed middleware)

### T7.2 Identity Lifecycle

- `workos.ts` — SSO/SAML/OIDC via WorkOS
- `scim.ts` — SCIM 2.0 provisioning/deprovisioning with audit logging
- `session.ts` — Session creation with versioning + revocation check
- `revocation-store.ts` — Postgres-backed revocation store
- `/api/scim/Users/[id]/route.ts` — SCIM REST API (GET/PUT/PATCH/DELETE)

### T7.3 Data Governance

- `encryption.ts` — AES-256-GCM at-rest encryption (sbenc: marker format)
- `data-classification.ts` — Retention policies (P10Y, P90D, indefinite) + legal basis
- `/api/cron/retention/route.ts` — Retention cron (6yr review, 10yr delete, legal_hold skip)
- `/api/cases/legal-hold/route.ts` — Legal hold toggle with audit
- `ethical-wall.ts` — Data residency per privilege level (attorney_client→eu_only)

### T7.4 Tamper-evident Audit

- `audit.ts` — Hash-chained audit log (SHA-256), immutability triggers, dev fallback
- `ai-reasoning-trace.ts` — `verifyTraceChain()` for hash chain integrity
- `ai-reasoning-trace-export.ts` — HTML export for compliance dashboard

### T7.5 Security Assurance

- `.gitleaks.toml` — 8 custom secret patterns + allowlist
- `ci.yml` — gitleaks action, Snyk scan, bun audit (frontend + server)
- `dependabot.yml` — Weekly dependency updates (npm + github-actions)
- No SBOM, no SAST/DAST, no threat model, no pentest backlog

---

## 3. Gap-Analyse — Was fehlt

### T7.1 Gaps

| Gap    | Beschreibung                                                       | Severity |
| ------ | ------------------------------------------------------------------ | -------- |
| G7.1.1 | Keine E2E Red-Team-Suite die Cross-Tenant-Lecks aktiv testet       | HIGH     |
| G7.1.2 | Kein Test für indirekte Prompt-Injection über Dokumentinhalte      | HIGH     |
| G7.1.3 | Kein DMS-Permission-Enforcement-Test (SharePoint/Box/NetDocuments) | MEDIUM   |
| G7.1.4 | ACL-Enforcement-Test nur spezifikativ, nicht runtime               | MEDIUM   |

### T7.2 Gaps

| Gap    | Beschreibung                                                              | Severity |
| ------ | ------------------------------------------------------------------------- | -------- |
| G7.2.1 | Vitest-Konfiguration nicht runner-konform (vi.mock-Suites fail unter Bun) | HIGH     |
| G7.2.2 | Kein E2E Test für SSO→Session→Deprovision→Revocation Flow                 | HIGH     |
| G7.2.3 | Kein Test für Token-Revocation nach Deprovisioning                        | HIGH     |
| G7.2.4 | Kein Test für DMS-Access-Revocation nach Deprovisioning                   | MEDIUM   |

### T7.3 Gaps

| Gap    | Beschreibung                                                | Severity |
| ------ | ----------------------------------------------------------- | -------- |
| G7.3.1 | Kein Key-Rotation-Mechanismus (SUBSUMIO_ENCRYPTION_KEY)     | HIGH     |
| G7.3.2 | Keine ZDR/No-Training-Policy-Enforcement pro Model-Provider | HIGH     |
| G7.3.3 | Kein Data-Export/Delete (DSAR/GDPR Art. 15/17) API-Endpoint | HIGH     |
| G7.3.4 | Keine Region-Pinning-Enforcement im API-Layer               | MEDIUM   |
| G7.3.5 | Kein Encryption-at-Rest-Verification-Test                   | MEDIUM   |

### T7.4 Gaps

| Gap    | Beschreibung                                                                   | Severity |
| ------ | ------------------------------------------------------------------------------ | -------- |
| G7.4.1 | Kein Admin-Export-API für Audit-Log (nur Browser-HTML)                         | HIGH     |
| G7.4.2 | Keine unabhängige Verifikation-Endpoint (hash-chain verify via API)            | HIGH     |
| G7.4.3 | Audit-Log deckt nicht alle Events (retrieval, model calls, exports, overrides) | MEDIUM   |
| G7.4.4 | Kein Tamper-Detection-Test (mutation → detection)                              | MEDIUM   |

### T7.5 Gaps

| Gap    | Beschreibung                          | Severity |
| ------ | ------------------------------------- | -------- |
| G7.5.1 | Kein SBOM (CycloneDX/spdx) Generation | MEDIUM   |
| G7.5.2 | Kein SAST Pipeline (semgrep/codeql)   | MEDIUM   |
| G7.5.3 | Kein DAST Scan                        | LOW      |
| G7.5.4 | Kein Threat-Model-Dokument            | MEDIUM   |
| G7.5.5 | Kein Pentest-Backlog                  | LOW      |

---

## 4. Architektur-Entscheidungen

### T7.1: Red-Team Test Architecture

- **Ansatz:** Vitest-basierte Test-Suiten die Mock-Engine mit Multi-Tenant-Data verwenden
- **Pattern:** Arrange (seed tenant data) → Act (cross-tenant request) → Assert (empty/403)
- **Prompt Injection:** Document content mit embedded injection patterns → sanitizeUserInput → verify sanitized output
- **DMS:** Mock DMS connectors with per-tenant folder boundaries

### T7.2: Vitest Configuration

- **Problem:** `vi.mock`-basierte Suites sind unstable unter Bun's test runner
- **Lösung:** Separate `vitest.config.identity.ts` mit `environment: "node"` für Identity-Lifecycle-Tests
- **Runner:** `npx vitest run --config vitest.config.identity.ts` (nicht `bun test`)
- **Package.json Script:** `"test:identity": "vitest run --config vitest.config.identity.ts"`

### T7.3: Data Governance Enforcement

- **Key Rotation:** `rotateEncryptionKey(oldKey, newKey)` — re-encrypt all `sbenc:` values in DB
- **ZDR/No-Training:** `model-provider-policy.ts` — per-provider policy config + runtime check before API call
- **DSAR:** `/api/admin/data-export` (Art. 15) + `/api/admin/data-delete` (Art. 17) with audit
- **Region Pinning:** Extend `ethical-wall.ts` with runtime enforcement in API middleware

### T7.4: Admin Audit Export

- **API:** `/api/admin/audit-export` — JSON/CSV/HTML export with date range + action filter
- **Verification:** `/api/admin/audit-verify` — independent hash-chain verification endpoint
- **Coverage:** Extend `logAudit()` calls to cover: retrieval, model calls, source access, exports, overrides

### T7.5: Security Assurance

- **SBOM:** `bun run sbom:generate` → `cyclonedx-bom` → `bom.json` + `bom.spdx.json`
- **SAST:** GitHub Actions step mit `semgrep --config=auto`
- **Threat Model:** `docs/audits/THREAT-MODEL.md` — STRIDE per component
- **Pentest Backlog:** `docs/audits/PENTEST-BACKLOG.md` — prioritized findings

---

## 5. Arbeitspakete (Task Breakdown)

### T7.1: Tenant/Matter-Isolation E2E (4 Pakete)

1. **WP7.1.1:** Cross-Tenant Red-Team Suite — `src/lib/security/red-team-tenant-isolation.test.ts`
2. **WP7.1.2:** Prompt Injection E2E — `src/lib/security/prompt-injection-e2e.test.ts`
3. **WP7.1.3:** DMS Permission Enforcement — `src/lib/security/dms-permission-enforcement.test.ts`
4. **WP7.1.4:** ACL Runtime Enforcement — `src/lib/security/acl-runtime-enforcement.test.ts`

### T7.2: Identity Lifecycle (3 Pakete)

1. **WP7.2.1:** Vitest Identity Config — `vitest.config.identity.ts` + package.json script
2. **WP7.2.2:** SSO→Deprovision E2E — `src/lib/auth/identity-lifecycle.test.ts`
3. **WP7.2.3:** Token/Session Revocation Verification — `src/lib/auth/revocation-e2e.test.ts`

### T7.3: Data Governance (5 Pakete)

1. **WP7.3.1:** Key Rotation — `src/lib/key-rotation.ts` + API endpoint
2. **WP7.3.2:** ZDR/No-Training Policy — `src/lib/model-provider-policy.ts`
3. **WP7.3.3:** DSAR Export/Delete — `/api/admin/data-export` + `/api/admin/data-delete`
4. **WP7.3.4:** Region Pinning Middleware — extend API middleware
5. **WP7.3.5:** Data Governance Tests — `src/lib/security/data-governance.test.ts`

### T7.4: Tamper-evident Audit (3 Pakete)

1. **WP7.4.1:** Admin Audit Export API — `/api/admin/audit-export`
2. **WP7.4.2:** Independent Verification API — `/api/admin/audit-verify`
3. **WP7.4.3:** Audit Coverage + Tamper Detection Tests — `src/lib/security/audit-tamper-detection.test.ts`

### T7.5: Security Assurance (4 Pakete)

1. **WP7.5.1:** SBOM Generation — script + CI step
2. **WP7.5.2:** SAST Pipeline — semgrep GitHub Action
3. **WP7.5.3:** Threat Model — `docs/audits/THREAT-MODEL.md`
4. **WP7.5.4:** Pentest Backlog — `docs/audits/PENTEST-BACKLOG.md`

---

## 6. Definition of Done

- [ ] Alle Red-Team-Tests grün (Cross-Tenant-Leak = 0)
- [ ] Prompt-Injection-E2E: alle Injection-Patterns werden sanitized/blocked
- [ ] Identity-Lifecycle: SSO→Deprovision→Revocation flow getestet
- [ ] Key-Rotation: re-encrypt funktioniert, alter Key wird invalidiert
- [ ] ZDR/No-Training: Policy wird vor jedem Model-Call enforced
- [ ] DSAR: Export und Delete API funktionieren mit Audit
- [ ] Admin-Audit-Export: JSON/CSV/HTML mit Hash-Chain-Verification
- [ ] SBOM: wird in CI generiert und als Artifact hochgeladen
- [ ] SAST: semgrep läuft in CI
- [ ] Threat Model: STRIDE-Analyse für alle Komponenten
- [ ] TypeScript: 0 Errors in allen neuen Dateien
- [ ] Tests: alle neuen Tests grün, keine Regressionen
