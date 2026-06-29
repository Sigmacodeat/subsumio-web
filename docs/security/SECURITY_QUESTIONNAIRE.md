# Security Questionnaire (Customer-Facing)

**Version:** 1.0  
**Datum:** 27. Juni 2026  
**Owner:** CTO  
**Classification:** Customer-Shareable

---

## 1. Company Information

| Field            | Value                              |
| ---------------- | ---------------------------------- |
| Company name     | Sigmacode AT GmbH                  |
| Product          | Subsumio AI Platform (Legal + Tax) |
| Headquarters     | Austria                            |
| Hosting location | Falkenstein, Germany (EU)          |
| DR site          | Helsinki, Finland (EU)             |
| Founded          | 2025                               |
| Employees        | < 10                               |
| Website          | https://subsum.eu                  |

---

## 2. Data Protection & Privacy

### 2.1 Where is customer data stored?

All customer data is stored exclusively in the European Union:

- Primary: Hetzner Online GmbH, Falkenstein, Germany
- DR: Hetzner Online GmbH, Helsinki, Finland
- No data is transferred to third countries (no SCC or Privacy Shield required)

### 2.2 What data is processed?

- User account data (name, e-mail, role)
- Case/matter data (case names, parties, deadlines)
- Uploaded documents (legal documents, contracts, evidence)
- AI queries and responses
- Audit logs (authentication, API calls, administrative actions)
- WhatsApp messages (if WhatsApp integration is enabled)

### 2.3 Is data encrypted?

- **In transit:** TLS 1.3 (minimum TLS 1.2)
- **At rest:** AES-256-GCM
- **Password hashing:** scrypt (N=2¹⁵, r=8, p=1)
- **Key management:** Keys stored in environment variables + 1Password, rotated annually

### 2.4 GDPR compliance

- ✅ Data Processing Agreement (DPA) available
- ✅ Article 28 processor obligations met
- ✅ Article 32 security measures implemented
- ✅ Article 33/34 breach notification within 72h
- ✅ Data subject rights supported (access, rectification, erasure, portability)
- ✅ EU-only data processing (no third-country transfers)

### 2.5 Data retention

- Customer data: Retained for contract duration + 30 days post-termination
- Audit logs: 365 days
- System logs: 90 days
- AI queries: 90 days
- Backups: Per backup policy (30 days daily, 12 months monthly)
- Secure deletion upon request or contract termination

---

## 3. Access Control

### 3.1 Authentication

- Multi-factor authentication (TOTP) required for all administrative access
- Password policy: Minimum 12 characters, complexity requirements
- Session management: JWT with short-lived access tokens + long-lived refresh tokens
- Session timeout: 24 hours (configurable per organization)

### 3.2 Authorization

- Role-based access control (RBAC): admin, lawyer, assistant, client_viewer
- Principle of least privilege enforced
- Access rights reviewed quarterly
- Inactive accounts disabled after 90 days
- Dormant accounts deleted after 180 days

### 3.3 Network security

- IP allow-listing for administrative access
- Cloudflare WAF with managed rules
- Rate limiting per IP and per user
- DDoS protection (Cloudflare, always-on)
- SSH key-based authentication only (no password SSH)

---

## 4. Infrastructure Security

### 4.1 Hosting

- Provider: Hetzner Online GmbH (ISO 27001 certified, SOC 2 Type II certified data centers)
- Location: EU only (Germany + Finland)
- Server isolation: Dedicated servers per environment
- Network segmentation: Private network between components

### 4.2 Monitoring

- External monitoring: UptimeRobot (5-minute intervals)
- Internal monitoring: Application health checks, error rate monitoring
- Security monitoring: Failed login tracking, anomaly detection, audit log analysis
- Alerting: Slack + e-mail + PagerDuty (for S1)

### 4.3 Patching

- Security patches: Within 7 days of release (critical: within 24h)
- Dependency updates: Monthly via Dependabot + manual review
- OS updates: Monthly maintenance window
- Application updates: Continuous deployment via CI/CD

---

## 5. Compliance & Certifications

| Standard          | Status                                    |
| ----------------- | ----------------------------------------- |
| GDPR / DSGVO      | ✅ Compliant                              |
| BDSG (Germany)    | ✅ Compliant                              |
| DSG (Switzerland) | ✅ Compliant                              |
| DSG (Austria)     | ✅ Compliant                              |
| EU AI Act         | ✅ Compliant (transparent AI labeling)    |
| SOC 2 Type II     | ⚠️ In preparation (audit planned Q3 2026) |
| ISO 27001         | 📋 Planned (2027)                         |
| Penetration test  | ⚠️ Planned (Q3 2026)                      |

---

## 6. Incident Response

### 6.1 Process

Documented Incident Response Plan with defined severity levels, response times, and communication procedures. See `INCIDENT_RESPONSE_PLAN.md` (available on request under NDA).

### 6.2 Breach notification

- Customer notification: Within 72 hours of confirmed data breach
- Regulatory notification: Within 72 hours per GDPR Art. 33
- Communication channel: E-mail + status page + WhatsApp (Enterprise)

### 6.3 Post-incident review

- All S1/S2 incidents receive a Post-Incident Report within 48h
- PIR includes: timeline, root cause, impact, resolution, prevention measures
- PIR shared with affected Enterprise customers

---

## 7. Business Continuity & Disaster Recovery

### 7.1 Availability

- SLA: 99.5% (Pro), 99.9% (Enterprise)
- Active-active redundancy between Falkenstein (DE) and Helsinki (FI)
- DNS failover: < 5 minutes
- PostgreSQL failover: < 15 minutes

### 7.2 Backups

- PostgreSQL: Continuous WAL streaming + daily full backups
- Document Vault: Daily incremental + weekly full
- Retention: 30 days (daily), 12 months (monthly)
- Immutable backups: Weekly and monthly backups are WORM
- Restore tests: Monthly (staging), quarterly (full), annually (DR exercise)

### 7.3 RTO/RPO

| System          | RTO | RPO    |
| --------------- | --- | ------ |
| Web Application | 4 h | 1 h    |
| Database        | 2 h | 15 min |
| Engine API      | 4 h | 1 h    |
| Document Vault  | 4 h | 24 h   |

---

## 8. AI-Specific Security

### 8.1 AI Act compliance

- All AI-generated output is labeled with `AI_NOTICE` and `AI_BADGE_LABEL`
- Machine-readable markers (`AI_FRONTMATTER`) in generated documents
- Transparency: Users always know when output is AI-generated

### 8.2 Data isolation

- Customer data is NOT used to train AI models
- OpenAI/Anthropic API calls use EU endpoints (Azure OpenAI)
- No customer data is persisted by AI providers (zero-retention API)
- Each organization has isolated brain data (source_id scoping)

### 8.3 AI output controls

- Citation system: AI responses include page-level citations to source documents
- Human review: All AI output can be reviewed and approved by a lawyer
- Approval workflow: WhatsApp approval return channel for mobile approval
- Audit trail: All AI queries and responses are logged

---

## 9. Sub-Processors

| Provider            | Purpose                 | Location       | DPA |
| ------------------- | ----------------------- | -------------- | --- |
| Hetzner Online GmbH | Hosting & storage       | DE + FI        | ✅  |
| Cloudflare, Inc.    | CDN & WAF               | EU edge        | ✅  |
| OpenAI (Azure)      | AI inference (optional) | EU             | ✅  |
| Anthropic           | AI inference (optional) | EU             | ✅  |
| Meta (WhatsApp)     | WhatsApp Business API   | EU             | ✅  |
| DocuSign            | E-signature             | EU (Frankfurt) | ✅  |
| GitHub              | Source code hosting     | US (SCC)       | ✅  |
| 1Password           | Credential management   | EU             | ✅  |
| UptimeRobot         | Status monitoring       | EU             | ✅  |

Customers are notified 30 days before adding any new sub-processor.

---

## 10. Physical Security

- Data centers: Hetzner Online GmbH (SOC 2 Type II certified, ISO 27001 certified)
- Physical access: Restricted to authorized Hetzner personnel
- Video surveillance: 24/7
- Environmental controls: Fire suppression, climate control, redundant power
- Office: Access controlled, visitor logging, workstation lock policy

---

## 11. Employee Security

- Background checks: Conducted for all employees with system access
- Security training: On hire + annual refresher
- Phishing simulations: Quarterly
- Acceptable Use Policy: Signed by all employees
- Confidentiality agreements: Signed by all employees and contractors
- Device security: FileVault 2 (macOS), MDM enforced

---

## 12. Contact

| Role                    | E-Mail             | Purpose                                   |
| ----------------------- | ------------------ | ----------------------------------------- |
| Security team           | security@subsum.io | Security questions, vulnerability reports |
| Incident response       | incident@subsum.io | Active security incidents                 |
| Data Protection Officer | dpo@subsum.io      | GDPR / data protection questions          |
| CTO                     | cto@subsum.io      | Technical due diligence                   |
| General                 | support@subsum.io  | General questions                         |

---

**Document Owner:** CTO  
**Last Updated:** 27. Juni 2026  
**Next Review:** 27. Dezember 2026  
**Classification:** Customer-Shareable (under NDA for detailed documents)
