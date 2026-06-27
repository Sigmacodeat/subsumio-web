# Risk Register

**Version:** 1.0  
**Datum:** 27. Juni 2026  
**Owner:** CTO  
**Classification:** Internal

---

## 1. Purpose

To identify, assess, prioritize, and track risks to Subsumio's business, infrastructure, and customer data. This register is reviewed monthly and updated as new risks are identified.

---

## 2. Risk Scoring

### 2.1 Likelihood Scale

| Score | Level          | Description                                |
| ----- | -------------- | ------------------------------------------ |
| 1     | Rare           | Very unlikely to occur (< 5% per year)     |
| 2     | Unlikely       | Could occur but unlikely (5–20% per year)  |
| 3     | Possible       | Might occur occasionally (20–50% per year) |
| 4     | Likely         | Will probably occur (50–80% per year)      |
| 5     | Almost Certain | Expected to occur (> 80% per year)         |

### 2.2 Impact Scale

| Score | Level      | Description                                          |
| ----- | ---------- | ---------------------------------------------------- |
| 1     | Negligible | Minimal impact, no customer effect                   |
| 2     | Minor      | Minor service degradation, no data loss              |
| 3     | Moderate   | Service outage < 4h, limited data exposure           |
| 4     | Major      | Service outage > 4h, significant data exposure       |
| 5     | Severe     | Complete data breach, prolonged outage, legal action |

### 2.3 Risk Score = Likelihood × Impact

| Score | Risk Level | Action                         |
| ----- | ---------- | ------------------------------ |
| 1–4   | Low        | Monitor, no immediate action   |
| 5–9   | Medium     | Mitigation plan within 90 days |
| 10–15 | High       | Mitigation plan within 30 days |
| 16–25 | Critical   | Immediate action required      |

---

## 3. Risk Register

### 3.1 Technology Risks

| ID     | Risk                                  | Likelihood | Impact | Score | Level  | Mitigation                                              | Status         | Owner         |
| ------ | ------------------------------------- | ---------- | ------ | ----- | ------ | ------------------------------------------------------- | -------------- | ------------- |
| TR-001 | Database corruption or loss           | 2          | 5      | 10    | High   | WAL streaming, daily backups, monthly restore tests     | ✅ Mitigated   | Eng Lead      |
| TR-002 | Single data center outage             | 2          | 4      | 8     | Medium | DR site in Helsinki, DNS failover                       | ✅ Mitigated   | CTO           |
| TR-003 | DDoS attack                           | 3          | 3      | 9     | Medium | Cloudflare DDoS protection, rate limiting               | ✅ Mitigated   | Eng Lead      |
| TR-004 | SQL injection                         | 1          | 5      | 5     | Medium | Parameterized queries, input validation, WAF            | ✅ Mitigated   | Eng Lead      |
| TR-005 | XSS attack                            | 2          | 3      | 6     | Medium | CSP headers, output encoding, React auto-escaping       | ✅ Mitigated   | Eng Lead      |
| TR-006 | CSRF attack                           | 1          | 4      | 4     | Low    | CSRF tokens, SameSite cookies                           | ✅ Mitigated   | Eng Lead      |
| TR-007 | Credential theft / phishing           | 3          | 4      | 12    | High   | MFA enforced, security training, phishing simulations   | ⚠️ In Progress | Security Lead |
| TR-008 | Dependency vulnerability (npm)        | 4          | 3      | 12    | High   | Dependabot, monthly audit, `bun audit` in CI            | ✅ Mitigated   | Eng Lead      |
| TR-009 | AI model hallucination / wrong output | 4          | 3      | 12    | High   | Citation system, human review, disclaimer               | ✅ Mitigated   | Eng Lead      |
| TR-010 | Secret leakage in git                 | 2          | 5      | 10    | High   | gitleaks in CI, git-crypt for secrets, pre-commit hooks | ✅ Mitigated   | Eng Lead      |
| TR-011 | Rate limiting bypass / API abuse      | 3          | 2      | 6     | Medium | Rate limiting per IP + user, WAF rules                  | ✅ Mitigated   | Eng Lead      |
| TR-012 | Insider threat — data exfiltration    | 1          | 5      | 5     | Medium | Access logging, least privilege, audit trail            | ⚠️ Monitoring  | Security Lead |

### 3.2 Operational Risks

| ID     | Risk                      | Likelihood | Impact | Score | Level  | Mitigation                                                 | Status       | Owner    |
| ------ | ------------------------- | ---------- | ------ | ----- | ------ | ---------------------------------------------------------- | ------------ | -------- |
| OR-001 | Key personnel unavailable | 2          | 4      | 8     | Medium | Cross-training, documentation, backup roles                | ✅ Mitigated | CTO      |
| OR-002 | Deployment failure        | 3          | 3      | 9     | Medium | Staging environment, CI/CD gates, rollback plan            | ✅ Mitigated | Eng Lead |
| OR-003 | Configuration drift       | 2          | 3      | 6     | Medium | Infrastructure as Code (Ansible), config versioning        | ✅ Mitigated | Eng Lead |
| OR-004 | Backup failure            | 1          | 5      | 5     | Medium | Daily verification, monthly restore tests, monitoring      | ✅ Mitigated | Eng Lead |
| OR-005 | Vendor service outage     | 3          | 3      | 9     | Medium | Multi-vendor strategy where possible, graceful degradation | ✅ Mitigated | CTO      |

### 3.3 Compliance & Legal Risks

| ID     | Risk                             | Likelihood | Impact | Score | Level  | Mitigation                                                 | Status         | Owner    |
| ------ | -------------------------------- | ---------- | ------ | ----- | ------ | ---------------------------------------------------------- | -------------- | -------- |
| CR-001 | GDPR violation                   | 1          | 5      | 5     | Medium | DSGVO compliance, DPA with all processors, EU-only hosting | ✅ Mitigated   | CTO      |
| CR-002 | AI Act non-compliance            | 2          | 4      | 8     | Medium | AI labeling (AI_NOTICE, AI_BADGE_LABEL), transparency      | ✅ Mitigated   | Eng Lead |
| CR-003 | Attorney-client privilege breach | 1          | 5      | 5     | Medium | Encryption, access control, no third-party AI training     | ✅ Mitigated   | CTO      |
| CR-004 | Missing SOC 2 certification      | 4          | 3      | 12    | High   | SOC 2 prep complete, external audit planned Q3 2026        | ⚠️ In Progress | CTO      |
| CR-005 | DACH legal regulation change     | 3          | 3      | 9     | Medium | Legal corpus monitoring, quarterly legal review            | ⚠️ Monitoring  | CTO      |

### 3.4 Business Risks

| ID     | Risk                                | Likelihood | Impact | Score | Level  | Mitigation                                           | Status         | Owner |
| ------ | ----------------------------------- | ---------- | ------ | ----- | ------ | ---------------------------------------------------- | -------------- | ----- |
| BR-001 | Customer churn (security concerns)  | 2          | 4      | 8     | Medium | SOC 2, transparency, security questionnaires         | ⚠️ In Progress | CTO   |
| BR-002 | Competitive pressure (Harvey, etc.) | 4          | 3      | 12    | High   | DACH focus, feature depth, competitive pricing       | ⚠️ Active      | CEO   |
| BR-003 | Data breach — reputational damage   | 1          | 5      | 5     | Medium | Security program, IR plan, cyber insurance (planned) | ⚠️ In Progress | CTO   |
| BR-004 | Financial — cash flow               | 2          | 4      | 8     | Medium | Emergency fund, runway planning                      | ✅ Mitigated   | CEO   |

---

## 4. Risk Review Schedule

| Frequency | Activity                                   | Participants             |
| --------- | ------------------------------------------ | ------------------------ |
| Weekly    | New risks identified in engineering review | Engineering team         |
| Monthly   | Full risk register review                  | CTO + Security Lead      |
| Quarterly | Risk assessment refresh                    | Leadership team          |
| Annually  | Complete risk register audit               | External auditor (SOC 2) |

---

## 5. Risk Treatment Options

| Option       | Description                                       | When to Use            |
| ------------ | ------------------------------------------------- | ---------------------- |
| **Mitigate** | Implement controls to reduce likelihood or impact | Most risks             |
| **Transfer** | Shift risk to third party (insurance, contract)   | Financial, legal risks |
| **Accept**   | Acknowledge risk without action                   | Low-score risks (1–4)  |
| **Avoid**    | Eliminate the activity causing the risk           | Unacceptable risks     |

---

## 6. Key Risk Indicators (KRIs)

| KRI                                        | Target   | Alert Threshold | Current  |
| ------------------------------------------ | -------- | --------------- | -------- |
| Failed login attempts (per hour)           | < 50     | > 200           | < 20     |
| API error rate (5xx)                       | < 0.1%   | > 1%            | < 0.05%  |
| Backup success rate                        | 100%     | < 99%           | 100%     |
| Patch age (critical vulnerabilities)       | < 7 days | > 14 days       | < 3 days |
| Security incidents per month               | 0        | > 2             | 0        |
| Dependency vulnerabilities (high/critical) | 0        | > 5             | 0        |
| Access review completion                   | 100%     | < 90%           | 100%     |

---

**Document Owner:** CTO  
**Last Updated:** 27. Juni 2026  
**Next Review:** 27. Juli 2026 (monthly)  
**Classification:** Internal
