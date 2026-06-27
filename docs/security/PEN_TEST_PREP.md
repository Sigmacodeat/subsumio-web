# Penetration Test Preparation & Fix Tracking

**Version:** 1.0  
**Datum:** 27. Juni 2026  
**Owner:** CTO  
**Classification:** Internal

---

## 1. Purpose

This document prepares Subsumio for an external penetration test, defines the scope, provides pre-test self-assessment results, and establishes a framework for tracking and remediating findings.

---

## 2. Penetration Test Scope

### 2.1 In Scope

| Asset                       | Type                 | Testing Approach                            |
| --------------------------- | -------------------- | ------------------------------------------- |
| Web Application (subsum.eu) | Black-box + Grey-box | OWASP Top 10, API testing                   |
| Engine API (api.subsum.eu)  | Grey-box             | API fuzzing, auth bypass, injection         |
| Authentication System       | Grey-box             | Credential attacks, session management      |
| WhatsApp Webhook            | White-box            | Input validation, message spoofing          |
| Document Vault              | Grey-box             | Path traversal, file upload, access control |
| PostgreSQL                  | White-box (internal) | Privilege escalation, injection             |
| CI/CD Pipeline              | White-box            | Secret leakage, deployment security         |
| Infrastructure (Hetzner)    | External scan        | Open ports, services, hardening             |

### 2.2 Out of Scope

- Hetzner data center physical security (covered by Hetzner SOC 2)
- Cloudflare infrastructure (covered by Cloudflare SOC 2)
- Third-party APIs (OpenAI, DocuSign, Meta) — tested via integration layer only
- Customer self-hosted instances (PGLite)

### 2.3 Testing Windows

| Phase                     | Duration | Window                                |
| ------------------------- | -------- | ------------------------------------- |
| Reconnaissance & scanning | 2 days   | Any time                              |
| Active testing            | 3 days   | Business hours (with on-call standby) |
| Reporting                 | 5 days   | Post-testing                          |
| Remediation               | 14 days  | Post-report                           |
| Retest                    | 2 days   | Post-remediation                      |

---

## 3. Pre-Test Self-Assessment

### 3.1 OWASP Top 10 (2021) — Self-Check

| Category                         | Risk   | Status       | Evidence                                                                             |
| -------------------------------- | ------ | ------------ | ------------------------------------------------------------------------------------ |
| A01: Broken Access Control       | High   | ✅ Mitigated | RBAC, CSRF tokens, session validation, IP allow-listing                              |
| A02: Cryptographic Failures      | High   | ✅ Mitigated | TLS 1.3, AES-256-GCM, scrypt password hashing                                        |
| A03: Injection                   | High   | ✅ Mitigated | Parameterized queries (Prisma/Drizzle), input validation (Zod)                       |
| A04: Insecure Design             | Medium | ✅ Mitigated | Threat modeling, security design review in PR process                                |
| A05: Security Misconfiguration   | High   | ✅ Mitigated | Security headers, CSP, HSTS, WAF rules                                               |
| A06: Vulnerable Components       | Medium | ✅ Mitigated | Dependabot, `bun audit` in CI, monthly dependency review                             |
| A07: Auth Failures               | High   | ✅ Mitigated | MFA, rate limiting, account lockout, secure session management                       |
| A08: Software/Data Integrity     | Medium | ✅ Mitigated | Subresource integrity, signed commits, CI pipeline integrity                         |
| A09: Logging/Monitoring Failures | Medium | ✅ Mitigated | Comprehensive audit logging, real-time monitoring, alerting                          |
| A10: SSRF                        | Medium | ✅ Mitigated | URL validation, allow-list for outbound requests, no direct user-to-internal routing |

### 3.2 Known Security Measures

| Measure          | Implementation                                     | Verification                    |
| ---------------- | -------------------------------------------------- | ------------------------------- |
| Security headers | `next.config.js` + middleware                      | `curl -I https://subsum.eu`     |
| CSP              | Strict CSP with nonce                              | Browser console (no violations) |
| HSTS             | `max-age=63072000; includeSubDomains; preload`     | `curl -I`                       |
| Rate limiting    | Per-IP + per-user (sliding window)                 | API testing                     |
| WAF              | Cloudflare managed rules + custom                  | Cloudflare dashboard            |
| DDoS             | Cloudflare always-on                               | Cloudflare dashboard            |
| Input validation | Zod schemas on all API routes                      | Code review                     |
| Output encoding  | React auto-escaping + DOMPurify for markdown       | Code review                     |
| CSRF             | Double-submit cookie + SameSite                    | Code review                     |
| SQL injection    | Parameterized queries (no string concatenation)    | Code review + CI grep           |
| XSS              | React auto-escaping, CSP, DOMPurify                | Code review                     |
| SSRF             | URL allow-list, no user-controlled outbound URLs   | Code review                     |
| Path traversal   | Slug validation, no user-controlled file paths     | Code review                     |
| File upload      | Type validation, size limits, virus scan (planned) | Code review                     |
| Secrets in code  | gitleaks in CI, pre-commit hooks                   | CI logs                         |
| Dependency vulns | Dependabot, `bun audit`                            | CI logs                         |

### 3.3 Security Headers Check

```
$ curl -sI https://subsum.eu | grep -iE "strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy"

strict-transport-security: max-age=63072000; includeSubDomains; preload
content-security-policy: default-src 'self'; script-src 'self' 'nonce-...'; ...
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=()
```

---

## 4. Test Accounts & Credentials

### 4.1 Test Accounts (to be provided to tester)

| Account                     | Role          | Purpose                |
| --------------------------- | ------------- | ---------------------- |
| pentest-admin@subsum.io     | admin         | Full access testing    |
| pentest-lawyer@subsum.io    | lawyer        | Standard user testing  |
| pentest-assistant@subsum.io | assistant     | Limited access testing |
| pentest-client@subsum.io    | client_viewer | Read-only testing      |

### 4.2 API Documentation

- OpenAPI spec: `https://api.subsum.eu/api/docs`
- Postman collection: Provided upon request
- Authentication: Bearer token (JWT)

---

## 5. Rules of Engagement

### 5.1 Permitted

- Passive reconnaissance (OSINT, DNS, public info)
- Active scanning (port scan, service detection)
- Vulnerability exploitation (non-destructive)
- API testing (with provided credentials)
- Social engineering (phishing simulation against agreed targets only)
- Code review (if white-box agreed)

### 5.2 Prohibited

- Destructive testing (data deletion, corruption)
- Denial of service (beyond brief proof-of-concept)
- Social engineering against non-consenting employees
- Physical intrusion attempts
- Accessing other customers' data
- Modifying production data

### 5.3 Reporting Requirements

- Real-time notification of critical findings (S1) via phone
- Daily summary of findings
- Final report within 5 business days of testing completion
- Report format: Executive summary + technical details + CVSS scores + remediation recommendations

---

## 6. Finding Tracking

### 6.1 Severity Classification

| Severity      | CVSS     | Response        | Remediation |
| ------------- | -------- | --------------- | ----------- |
| Critical      | 9.0–10.0 | Immediate (24h) | 7 days      |
| High          | 7.0–8.9  | 48h             | 14 days     |
| Medium        | 4.0–6.9  | 1 week          | 30 days     |
| Low           | 0.1–3.9  | 2 weeks         | 90 days     |
| Informational | 0.0      | Acknowledged    | Best effort |

### 6.2 Finding Tracker Template

| ID     | Title   | Severity | CVSS    | Status              | Owner  | Found  | Fixed  | Retest |
| ------ | ------- | -------- | ------- | ------------------- | ------ | ------ | ------ | ------ |
| PT-001 | [Title] | [Sev]    | [Score] | Open/Fixed/Retested | [Name] | [Date] | [Date] | [Date] |

### 6.3 Finding Lifecycle

```
Found → Triaged → Confirmed → Assigned → In Progress → Fixed → Retested → Closed
                ↓                                    ↓
           False Positive                       Wont Fix (with justification)
```

---

## 7. Post-Test Actions

### 7.1 Remediation

1. **Triage** (within 48h of report): Validate each finding, assign severity
2. **Fix** (per severity timeline): Implement fix, add regression test
3. **Retest** (within 5 days of fix): Verify fix, confirm no regression
4. **Document**: Update finding tracker, note root cause
5. **Close**: Mark finding as resolved

### 7.2 Report

- Internal summary: All findings, status, metrics
- Customer communication: Summary (if customer-facing impact)
- SOC 2 evidence: Pen test report + remediation evidence
- Public statement: High-level summary (if appropriate)

### 7.3 Continuous Improvement

- Add new test cases to CI/CD pipeline (if applicable)
- Update security policies (if gaps found)
- Update risk register (if new risks identified)
- Schedule next pen test (annually)

---

## 8. Budget & Timeline

| Item                   | Cost                    | Timeline                |
| ---------------------- | ----------------------- | ----------------------- |
| External pen test      | 2.000–10.000 €          | Q3 2026                 |
| Remediation (internal) | ~0 €                    | 14 days post-test       |
| Retest                 | Included or 500–2.000 € | 5 days post-remediation |
| **Total**              | **2.000–12.000 €**      | **~6 weeks**            |

---

## 9. Tester Selection Criteria

- Certified ethical hacker (OSCP, CEH, or equivalent)
- Experience with SaaS / web application testing
- Experience with API testing
- EU-based (preferred, for data protection)
- Independent (no conflict of interest)
- References from other SaaS companies

---

## 10. Pre-Test Checklist

- [ ] Test accounts created with documented credentials
- [ ] API documentation prepared
- [ ] Rules of engagement signed by both parties
- [ ] On-call engineer briefed and available
- [ ] Monitoring alerts tuned (to avoid false positives during testing)
- [ ] Backup verified (in case of accidental damage)
- [ ] Staging environment available (for destructive tests)
- [ ] Communication channel established (Slack/Teams)
- [ ] Emergency stop procedure agreed
- [ ] NDA signed by tester

---

**Document Owner:** CTO  
**Last Updated:** 27. Juni 2026  
**Next Review:** After pen test completion  
**Classification:** Internal
