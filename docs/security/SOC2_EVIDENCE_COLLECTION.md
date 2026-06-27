# SOC 2 Type II Evidence Collection

**Version:** 1.0  
**Datum:** 27. Juni 2026  
**Owner:** CTO  
**Classification:** Internal  
**Purpose:** Prepare evidence for external SOC 2 Type II audit (planned Q3 2026)

---

## 1. Audit Scope

### 1.1 Trust Service Criteria

| Criteria                   | In Scope | Description                                                            |
| -------------------------- | -------- | ---------------------------------------------------------------------- |
| Security (Common Criteria) | ✅       | Protection against unauthorized access                                 |
| Availability               | ✅       | System availability for operation and use                              |
| Processing Integrity       | ✅       | System processing is complete, valid, accurate, timely, authorized     |
| Confidentiality            | ✅       | Information designated as confidential is protected                    |
| Privacy                    | ❌       | Not in scope (no PII collected from end-users beyond business contact) |

### 1.2 System Description

- **System name:** Subsumio Legal AI Platform
- **Components:** Web Application, Engine API, PostgreSQL, Redis, Document Vault, WhatsApp Bot
- **Hosting:** Hetzner Online GmbH (Falkenstein, DE + Helsinki, FI)
- **CDN/WAF:** Cloudflare, Inc. (EU edge)
- **Monitoring:** UptimeRobot (external), application-level (internal)

---

## 2. Evidence Collection Matrix

### CC1 — Control Environment

| Control                                         | Evidence                                    | Source    | Frequency | Status |
| ----------------------------------------------- | ------------------------------------------- | --------- | --------- | ------ |
| CC1.1: Board/management commitment to integrity | Founding charter, values doc                | GitHub    | One-time  | ✅     |
| CC1.2: Board oversight                          | Org chart, meeting minutes                  | Notion    | Quarterly | ✅     |
| CC1.3: Organizational structure                 | Org chart                                   | Notion    | Annually  | ✅     |
| CC1.4: Commitment to competence                 | Job descriptions, training records          | HR system | On hire   | ✅     |
| CC1.5: Accountability                           | Performance reviews, policy acknowledgments | HR system | Annually  | ✅     |

### CC2 — Communication and Information

| Control                                           | Evidence                            | Source      | Frequency        | Status |
| ------------------------------------------------- | ----------------------------------- | ----------- | ---------------- | ------ |
| CC2.1: Internal communication                     | Slack archives, meeting notes       | Slack       | Continuous       | ✅     |
| CC2.2: External communication                     | Customer portal, status page, SLA   | Website     | Continuous       | ✅     |
| CC2.3: Communication of security responsibilities | Security policies, training records | HR + GitHub | On hire + annual | ✅     |

### CC3 — Risk Assessment

| Control                    | Evidence                       | Source                           | Frequency  | Status |
| -------------------------- | ------------------------------ | -------------------------------- | ---------- | ------ |
| CC3.1: Risk identification | Risk Register                  | `docs/security/RISK_REGISTER.md` | Monthly    | ✅     |
| CC3.2: Risk analysis       | Risk scoring methodology       | Risk Register                    | Monthly    | ✅     |
| CC3.3: Risk response       | Mitigation plans, action items | Risk Register                    | Monthly    | ✅     |
| CC3.4: Risk changes        | Risk register version history  | Git history                      | Continuous | ✅     |

### CC4 — Monitoring Activities

| Control                       | Evidence                           | Source                 | Frequency  | Status     |
| ----------------------------- | ---------------------------------- | ---------------------- | ---------- | ---------- |
| CC4.1: Ongoing evaluations    | Monitoring dashboards, alerts      | UptimeRobot + internal | Continuous | ✅         |
| CC4.2: Separate evaluations   | Internal audits, penetration tests | Pen test reports       | Annually   | ⚠️ Planned |
| CC4.3: Deficiency remediation | Issue tracker, action items        | GitHub Issues          | Continuous | ✅         |

### CC5 — Control Activities

| Control                   | Evidence                       | Source           | Frequency  | Status |
| ------------------------- | ------------------------------ | ---------------- | ---------- | ------ |
| CC5.1: Control design     | Security policies              | `docs/security/` | Annually   | ✅     |
| CC5.2: Control deployment | Policy acknowledgments         | HR system        | On hire    | ✅     |
| CC5.3: Control operation  | CI/CD logs, deployment records | GitHub Actions   | Continuous | ✅     |

### CC6 — Logical and Physical Access Controls

| Control                     | Evidence                                 | Source                         | Frequency      | Status |
| --------------------------- | ---------------------------------------- | ------------------------------ | -------------- | ------ |
| CC6.1: Logical access       | Access control matrix, user list         | `ASSET_INVENTORY.md` Section 8 | Quarterly      | ✅     |
| CC6.2: User provisioning    | Access request tickets, approval records | GitHub Issues                  | On request     | ✅     |
| CC6.3: User de-provisioning | Offboarding checklists                   | HR system                      | On termination | ✅     |
| CC6.4: Access review        | Quarterly access review records          | Git commits to inventory       | Quarterly      | ✅     |
| CC6.5: Authentication       | MFA enrollment records, password policy  | 1Password + Auth system        | Continuous     | ✅     |
| CC6.6: Physical access      | Data center access logs (Hetzner)        | Hetzner portal                 | On request     | ✅     |

### CC7 — System Operations

| Control                          | Evidence                                 | Source                      | Frequency    | Status |
| -------------------------------- | ---------------------------------------- | --------------------------- | ------------ | ------ |
| CC7.1: Infrastructure management | Ansible playbooks, server configs        | GitHub                      | Continuous   | ✅     |
| CC7.2: Incident identification   | Monitoring alerts, incident tickets      | Slack + GitHub              | Continuous   | ✅     |
| CC7.3: Incident response         | Incident Response Plan, PIR records      | `INCIDENT_RESPONSE_PLAN.md` | Per incident | ✅     |
| CC7.4: Recovery                  | Backup Policy, restore test records      | `BACKUP_POLICY.md`          | Monthly      | ✅     |
| CC7.5: Change management         | CI/CD pipeline, PR approvals, change log | GitHub Actions              | Continuous   | ✅     |

### CC8 — Change Management

| Control                     | Evidence                         | Source         | Frequency   | Status |
| --------------------------- | -------------------------------- | -------------- | ----------- | ------ |
| CC8.1: Change authorization | PR approvals, deployment logs    | GitHub         | Continuous  | ✅     |
| CC8.2: Change testing       | CI test results, staging records | GitHub Actions | Continuous  | ✅     |
| CC8.3: Change documentation | Changelog, release notes         | GitHub         | Per release | ✅     |

### CC9 — Risk Mitigation

| Control                    | Evidence                            | Source                                           | Frequency | Status |
| -------------------------- | ----------------------------------- | ------------------------------------------------ | --------- | ------ |
| CC9.1: Business continuity | BCP, DR plan, test records          | `BUSINESS_CONTINUITY.md`, `DISASTER_RECOVERY.md` | Annually  | ✅     |
| CC9.2: Vendor management   | Vendor inventory, DPAs, assessments | `VENDOR_MANAGEMENT.md`                           | Quarterly | ✅     |

### A1 — Availability

| Control                         | Evidence                                | Source                 | Frequency  | Status |
| ------------------------------- | --------------------------------------- | ---------------------- | ---------- | ------ |
| A1.1: Performance monitoring    | UptimeRobot data, response time metrics | UptimeRobot            | Continuous | ✅     |
| A1.2: Environmental protections | Data center certifications (Hetzner)    | Hetzner SOC 2 report   | Annually   | ✅     |
| A1.3: Recovery infrastructure   | DR site, backup verification            | `DISASTER_RECOVERY.md` | Monthly    | ✅     |

### C1 — Confidentiality

| Control                           | Evidence                           | Source                                | Frequency    | Status |
| --------------------------------- | ---------------------------------- | ------------------------------------- | ------------ | ------ |
| C1.1: Confidentiality commitments | Customer contracts, NDA templates  | Legal                                 | Per contract | ✅     |
| C1.2: Confidentiality controls    | Encryption policy, access controls | `SOC2_SECURITY_POLICIES.md` Section 9 | Continuous   | ✅     |

---

## 3. Evidence Artifacts to Collect

### 3.1 Pre-Audit (T-90 days)

- [ ] Organization chart and roles
- [ ] Security policy acknowledgments (all employees)
- [ ] Risk register (current version)
- [ ] Vendor inventory and DPAs
- [ ] Access control matrix (current)
- [ ] Backup policy and test records (12 months)
- [ ] Incident response plan and any PIRs
- [ ] BCP and DR plan
- [ ] Change management log (12 months)
- [ ] CI/CD pipeline configuration
- [ ] Penetration test report (latest)
- [ ] Security training records
- [ ] Physical security description (Hetzner SOC 2 report)

### 3.2 During Audit (continuous evidence)

- [ ] Monthly access review records
- [ ] Monthly backup verification records
- [ ] Incident tickets and PIRs
- [ ] Change requests and approvals
- [ ] Deployment logs
- [ ] Monitoring uptime reports
- [ ] Vendor performance reviews
- [ ] Risk register updates

### 3.3 Post-Audit

- [ ] Management assertion letter
- [ ] Corrective action plan (if any findings)
- [ ] Updated policies (if required)
- [ ] Evidence retention (7 years per SOC 2 requirements)

---

## 4. Evidence Retention

| Evidence Type       | Retention         | Storage                 | Format          |
| ------------------- | ----------------- | ----------------------- | --------------- |
| Security policies   | Current + 7 years | GitHub (git history)    | Markdown        |
| Access reviews      | 7 years           | GitHub (git commits)    | Markdown        |
| Incident records    | 7 years           | GitHub + Hetzner backup | Markdown + logs |
| Backup test records | 7 years           | GitHub                  | Markdown        |
| Change logs         | 7 years           | GitHub (git history)    | Git commits     |
| Training records    | 7 years           | HR system               | PDF             |
| Vendor assessments  | 7 years           | GitHub                  | Markdown        |
| Risk register       | 7 years           | GitHub (git history)    | Markdown        |
| Pen test reports    | 7 years           | 1Password (encrypted)   | PDF             |
| Audit reports       | 7 years           | 1Password (encrypted)   | PDF             |

---

## 5. Auditor Selection

### 5.1 Criteria

- CPA firm with SOC 2 audit experience
- Experience with SaaS / cloud-native companies
- EU presence (preferred)
- AICPA peer review program member

### 5.2 Target Timeline

| Milestone                              | Target Date | Status     |
| -------------------------------------- | ----------- | ---------- |
| Auditor selection                      | July 2026   | ⚠️ Pending |
| Readiness assessment                   | August 2026 | ⚠️ Pending |
| Fieldwork (Type II observation period) | Q3–Q4 2026  | ⚠️ Pending |
| Report issuance                        | Q1 2027     | ⚠️ Pending |

---

## 6. Estimated Costs

| Item                 | Estimated Cost      | Notes                            |
| -------------------- | ------------------- | -------------------------------- |
| Readiness assessment | 2.000–5.000 €       | Optional, can be done internally |
| SOC 2 Type II audit  | 8.000–30.000 €      | Depends on firm and scope        |
| Penetration test     | 2.000–10.000 €      | Required as evidence             |
| Internal preparation | ~0 €                | Done by team (this document)     |
| **Total external**   | **10.000–40.000 €** |                                  |

---

**Document Owner:** CTO  
**Last Updated:** 27. Juni 2026  
**Next Review:** Monthly until audit completion  
**Classification:** Internal
