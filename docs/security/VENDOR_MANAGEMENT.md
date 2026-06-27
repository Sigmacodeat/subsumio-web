# Vendor Management Policy

**Version:** 1.0  
**Datum:** 27. Juni 2026  
**Owner:** CTO  
**Classification:** Internal

---

## 1. Purpose

To ensure that all third-party vendors and sub-processors meet Subsumio's security and compliance requirements, and that vendor risk is systematically assessed, monitored, and managed.

---

## 2. Vendor Inventory

### 2.1 Critical Vendors (Sub-Processors)

| Vendor              | Service                  | Data Accessed                      | Location                    | DPA | Risk   |
| ------------------- | ------------------------ | ---------------------------------- | --------------------------- | --- | ------ |
| Hetzner Online GmbH | Hosting, Storage, Backup | All customer data (infrastructure) | Falkenstein/Helsinki, DE/FI | ✅  | Medium |
| Cloudflare, Inc.    | CDN, DDoS, WAF, DNS      | HTTP traffic (TLS terminated)      | EU Edge                     | ✅  | Low    |
| OpenAI / Anthropic  | AI Inference (optional)  | Query text (no PII if configured)  | EU (Azure)                  | ✅  | Medium |
| Meta Platforms      | WhatsApp Business API    | Phone numbers, message content     | EU                          | ✅  | Medium |
| DocuSign            | E-Signature              | Document content, signer data      | EU (Frankfurt)              | ✅  | Low    |
| GitHub              | Source code hosting      | Source code (no customer data)     | US (with SCC)               | ✅  | Low    |
| 1Password           | Password management      | Credentials                        | EU (AWS)                    | ✅  | Low    |
| UptimeRobot         | Status monitoring        | URLs only                          | EU                          | ✅  | Low    |

### 2.2 Non-Critical Vendors

| Vendor           | Service            | Data Accessed  | Risk |
| ---------------- | ------------------ | -------------- | ---- |
| Google Workspace | E-Mail, Docs       | Internal comms | Low  |
| Stripe           | Payment processing | Billing info   | Low  |
| Slack            | Team communication | Internal comms | Low  |
| Zoom             | Video calls        | Internal comms | Low  |

---

## 3. Vendor Risk Assessment

### 3.1 Assessment Criteria

| Criterion               | Weight | Description                               |
| ----------------------- | ------ | ----------------------------------------- |
| Data sensitivity        | 30%    | What customer data can the vendor access? |
| Data location           | 20%    | Is data processed in the EU?              |
| Security certifications | 20%    | SOC 2, ISO 27001, etc.                    |
| Breach history          | 15%    | Past security incidents                   |
| Access level            | 15%    | Level of system access granted            |

### 3.2 Risk Levels

| Level      | Score  | Requirements                                                           |
| ---------- | ------ | ---------------------------------------------------------------------- |
| **Low**    | 0–30   | Standard contract, annual review                                       |
| **Medium** | 31–60  | DPA required, semi-annual review, security questionnaire               |
| **High**   | 61–100 | DPA + audit rights, quarterly review, on-site assessment (if feasible) |

### 3.3 Current Risk Ratings

| Vendor           | Score | Level  | Justification                                                         |
| ---------------- | ----- | ------ | --------------------------------------------------------------------- |
| Hetzner          | 45    | Medium | Hosts all data, but SOC 2 certified data center, EU-only              |
| Cloudflare       | 25    | Low    | TLS-terminated, no access to payloads, EU edge                        |
| OpenAI/Anthropic | 50    | Medium | Processes query text, but EU deployment, no training on customer data |
| Meta (WhatsApp)  | 55    | Medium | Access to message content, but Business API terms, EU data            |
| DocuSign         | 30    | Low    | EU data center, SOC 2 certified, limited scope                        |
| GitHub           | 20    | Low    | Source code only, SCC in place, 2FA enforced                          |

---

## 4. Vendor Onboarding Process

### 4.1 Selection

1. **Identify need** — Business requirement for vendor
2. **Shortlist** — Identify 2-3 candidates
3. **Security questionnaire** — Send to all candidates (see Section 5)
4. **Risk assessment** — Score each candidate
5. **DPA review** — Review Data Processing Agreement
6. **Approval** — CTO approval for Medium/High risk vendors

### 4.2 Contract Requirements

All vendor contracts must include:

- Data Processing Agreement (DPA) per GDPR Art. 28
- Confidentiality obligations
- Security requirements (encryption, access control)
- Breach notification within 24h
- Right to audit (for High risk vendors)
- Data deletion upon termination
- Sub-processor disclosure and approval rights

### 4.3 Access Provisioning

- Minimum necessary access (least privilege)
- Access documented in vendor access register
- Time-limited access where possible
- MFA required for all vendor access
- All access logged and monitored

---

## 5. Security Questionnaire (Vendor)

Vendors must complete this questionnaire before onboarding:

```
1. Company name and legal entity
2. Data processing location(s)
3. Security certifications (SOC 2, ISO 27001, etc.)
4. Encryption standards (at rest, in transit)
5. Access control mechanisms (MFA, RBAC)
6. Incident response process and notification timeline
7. Breach history (last 24 months)
8. Sub-processors used
9. Data retention and deletion policy
10. Employee background check policy
11. Security training program
12. Penetration test frequency
13. Business continuity and disaster recovery plans
14. Insurance coverage (cyber liability)
15. GDPR/DSGVO compliance status
```

---

## 6. Vendor Monitoring

### 6.1 Ongoing Assessment

| Activity                             | Frequency | Owner            |
| ------------------------------------ | --------- | ---------------- |
| Security questionnaire refresh       | Annually  | Security Lead    |
| DPA review                           | Annually  | Legal            |
| Access review                        | Quarterly | Engineering Lead |
| Performance review                   | Quarterly | CTO              |
| Breach check (public records)        | Monthly   | Security Lead    |
| SOC 2 / ISO certificate verification | Annually  | Security Lead    |

### 6.2 Vendor Incident Response

When a vendor reports a security incident:

1. **Assess impact** (0–4h): What Subsumio data is affected?
2. **Notify customers** (if required, within 72h per GDPR)
3. **Document** in vendor incident log
4. **Review vendor** (within 30 days): Is remediation adequate?
5. **Decide** (within 30 days): Continue, require improvements, or terminate

### 6.3 Vendor Termination

Upon vendor termination:

1. Notify vendor in writing (per contract notice period)
2. Revoke all access (within 24h)
3. Confirm data deletion (within 30 days)
4. Document termination in vendor register
5. Identify replacement (if needed)

---

## 7. Sub-Processor Changes

### 7.1 Notification

- Customers are notified of new sub-processors at least 30 days before activation
- Notification via e-mail + status page
- Customers can object within 30 days

### 7.2 Sub-Processor Register

Maintained at: `docs/security/sub-processor-register.md`

Updated whenever a sub-processor is added, changed, or removed.

---

## 8. Compliance Mapping

| Framework        | Requirement            | This Policy |
| ---------------- | ---------------------- | ----------- |
| SOC 2 CC9.2      | Vendor risk assessment | Section 3   |
| GDPR Art. 28     | Processor obligations  | Section 4.2 |
| ISO 27001 A.15.1 | Supplier relationships | Full policy |

---

**Document Owner:** CTO  
**Last Updated:** 27. Juni 2026  
**Next Review:** 27. Dezember 2026  
**Classification:** Internal
