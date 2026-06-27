# Incident Response Plan

**Version:** 1.0  
**Datum:** 27. Juni 2026  
**Owner:** CTO  
**Classification:** Internal

---

## 1. Purpose

This document defines the structured process for detecting, responding to, containing, eradicating, and recovering from security incidents at Subsumio. It ensures rapid restoration of services, minimizes customer impact, and satisfies SOC 2 Type II and GDPR breach-notification requirements.

---

## 2. Incident Response Team (IRT)

| Role                   | Member           | Responsibility                                           |
| ---------------------- | ---------------- | -------------------------------------------------------- |
| **Incident Commander** | CTO              | Overall coordination, decision authority, external comms |
| **Tech Lead**          | Engineering Lead | Technical analysis, containment, eradication             |
| **Communications**     | Head of CS       | Customer notifications, status-page updates              |
| **Security Analyst**   | Security Lead    | Forensics, log analysis, evidence preservation           |
| **Legal/Compliance**   | External Counsel | GDPR notification, regulatory compliance                 |
| **CTO Backup**         | Senior Engineer  | Escalation if CTO unavailable                            |

### 2.1 On-Call Rotation

- **Primary On-Call:** Rotating weekly among senior engineers
- **Secondary On-Call:** Engineering Lead (always reachable for S1)
- **Escalation:** CTO for S1 within 1h, CEO within 4h

### 2.2 Contact Tree

```
Detection → On-Call Engineer (5 min)
         → Engineering Lead (15 min, S1/S2)
         → CTO (30 min, S1)
         → CEO (4h, S1 unresolved)
         → Legal Counsel (1h, confirmed data breach)
         → Customers (72h, confirmed data breach per GDPR Art. 34)
```

---

## 3. Incident Classification

### 3.1 Severity Matrix

| Severity          | Impact                                  | Examples                                    | Response      | Resolution |
| ----------------- | --------------------------------------- | ------------------------------------------- | ------------- | ---------- |
| **S1 — Critical** | Complete outage, data breach, data loss | Service down, DB corrupted, security breach | 15 min (24/7) | 2 h        |
| **S2 — High**     | Major degradation, partial outage       | API 5xx > 10%, auth broken, WhatsApp down   | 30 min        | 4 h        |
| **S3 — Medium**   | Minor degradation, workaround exists    | Slow queries, single feature broken         | 2 h           | 1 BD       |
| **S4 — Low**      | No functional impact                    | Cosmetic bug, log noise, minor warning      | 4 h           | 5 BD       |

### 3.2 Incident Types

| Type               | Description                                      | Default Severity |
| ------------------ | ------------------------------------------------ | ---------------- |
| **Availability**   | Service unreachable or degraded                  | S1–S3            |
| **Security**       | Unauthorized access, data breach, malware        | S1–S2            |
| **Data Integrity** | Data corruption, loss, unauthorized modification | S1–S2            |
| **Performance**    | Response times exceed SLA thresholds             | S2–S4            |
| **Third-Party**    | Dependency outage (WhatsApp, DocuSign, beA)      | S2–S3            |
| **Configuration**  | Misconfiguration causing impact                  | S2–S4            |

---

## 4. Response Process

### 4.1 Phase 1: Detection & Triage (0–15 min)

**Detection Sources:**

- Automated monitoring (UptimeRobot, application alerts)
- Customer reports (support@subsum.io, WhatsApp)
- Internal observation (engine logs, error rates)
- Security alerts (failed auth spikes, anomaly detection)

**Triage Steps:**

1. Acknowledge incident in incident channel (`#incidents` Slack)
2. Assign Incident Commander
3. Classify severity
4. Create incident ticket (Jira / GitHub Issue)
5. Start incident timeline log
6. Page on-call if S1/S2

### 4.2 Phase 2: Containment (15 min–1 h)

**Immediate Actions:**

- **Isolate affected systems** (firewall rules, container stop, traffic redirect)
- **Preserve evidence** (snapshot logs, DB state, memory dumps)
- **Block malicious IPs** (if security incident)
- **Rotate compromised credentials** (if breach suspected)
- **Enable maintenance mode** (if customer-facing)

**Containment Decision Tree:**

```
Is customer data at risk?
├── YES → Isolate system immediately, preserve evidence, notify Legal
└── NO → Is service degraded?
    ├── YES → Implement workaround, monitor
    └── NO → Monitor, no containment needed
```

### 4.3 Phase 3: Eradication (1–4 h)

- Identify root cause (log analysis, code review, dependency check)
- Remove malicious code / unauthorized access
- Apply patches or configuration fixes
- Verify fix in staging environment
- Deploy fix to production
- Monitor for recurrence (minimum 30 min)

### 4.4 Phase 4: Recovery (2–8 h)

- Restore systems from clean backups (if needed)
- Verify data integrity (checksums, row counts, spot checks)
- Resume normal operations
- Remove maintenance mode
- Monitor closely for 24h (hypercare)
- Close incident timeline

### 4.5 Phase 5: Post-Incident Review (within 48 h)

**Post-Incident Report (PIR) Template:**

```markdown
## Incident: [Title]

**Date:** [YYYY-MM-DD HH:MM]  
**Severity:** S[1-4]  
**Duration:** [Xh Ym]  
**Impact:** [Affected customers, features, data]

### Timeline

| Time  | Event       |
| ----- | ----------- |
| HH:MM | Detection   |
| HH:MM | Triage      |
| HH:MM | Containment |
| HH:MM | Eradication |
| HH:MM | Recovery    |
| HH:MM | Closed      |

### Root Cause

[Technical analysis]

### Resolution

[What was done to fix]

### Prevention

[Specific measures to prevent recurrence]

### Action Items

- [ ] [Action] — Owner: [Name] — Due: [Date]
```

**PIR Requirements:**

- All S1/S2 incidents require a PIR
- PIR is reviewed in next engineering meeting
- Action items are tracked to completion
- PIR is shared with affected Enterprise customers

---

## 5. Communication Plan

### 5.1 Internal Communication

| Channel               | Purpose                | Audience          |
| --------------------- | ---------------------- | ----------------- |
| `#incidents` (Slack)  | Real-time coordination | IRT + Engineering |
| `#status` (Slack)     | Status updates         | All employees     |
| Emergency call (Zoom) | S1 coordination call   | IRT + Leadership  |

### 5.2 External Communication

| Audience             | Channel            | Timing              | Content                     |
| -------------------- | ------------------ | ------------------- | --------------------------- |
| All customers        | Status-Page        | < 15 min (S1/S2)    | Impact, expected resolution |
| Enterprise customers | E-Mail + WhatsApp  | < 15 min (S1)       | Detailed impact, ETA        |
| Affected customers   | E-Mail             | < 72h (data breach) | GDPR Art. 34 notification   |
| Regulatory authority | Official letter    | < 72h (data breach) | GDPR Art. 33 notification   |
| Public               | Status-Page + Blog | After resolution    | Post-mortem summary         |

### 5.3 Communication Cadence

| Severity | Update Frequency                    |
| -------- | ----------------------------------- |
| S1       | Every 30 min until resolved         |
| S2       | Every 2 h until resolved            |
| S3       | At resolution or significant change |
| S4       | At resolution                       |

---

## 6. GDPR Breach Notification

### 6.1 Criteria

A personal data breach must be notified if it is "likely to result in a risk to the rights and freedoms of natural persons" (GDPR Art. 34).

### 6.2 Notification Process

1. **Assess** (within 1h of confirmation): Is personal data involved?
2. **Document** (within 2h): What data, how many individuals, what risk
3. **Notify Authority** (within 72h): GDPR Art. 33 to DSB (AT) / BfDI (DE) / EDÖB (CH)
4. **Notify Affected Individuals** (within 72h): GDPR Art. 34 — direct notification
5. **Record** (ongoing): All breaches recorded in breach register

### 6.3 Breach Register

Maintained at: `docs/security/breach-register.md` (access restricted)

Required fields:

- Date and time of breach
- Date and time of detection
- Nature of breach
- Personal data involved
- Number of individuals affected
- Risk assessment
- Remedial action taken
- Notification status (authority, individuals)

---

## 7. Tools & Infrastructure

| Tool                           | Purpose                   | Access                 |
| ------------------------------ | ------------------------- | ---------------------- |
| UptimeRobot                    | External monitoring       | On-call + CTO          |
| Hetzner Cloud Console          | Infrastructure management | CTO + Engineering Lead |
| Cloudflare Dashboard           | CDN, DDoS, WAF            | CTO + Engineering Lead |
| GitHub Actions                 | CI/CD, deployment         | Engineering team       |
| Slack                          | Incident coordination     | All engineers          |
| Status-Page (status.subsum.eu) | Customer communication    | IRT                    |
| 1Password                      | Credential vault          | CTO + Engineering Lead |

---

## 8. Training & Testing

### 8.1 Training

- All engineers receive IR training upon hire
- Annual refresher training for all staff
- Tabletop exercise: Quarterly (S1 scenario)
- Red team exercise: Annually (with external tester)

### 8.2 Post-Incident Metrics

| Metric                      | Target               |
| --------------------------- | -------------------- |
| Mean Time to Detect (MTTD)  | < 5 min              |
| Mean Time to Respond (MTTR) | < 15 min (S1)        |
| Mean Time to Resolve (MTTR) | < 2 h (S1)           |
| Incidents per month         | < 2 S1/S2            |
| PIR completion rate         | 100% for S1/S2       |
| Action item closure rate    | > 90% within 30 days |

---

## 9. Incident Checklist (Quick Reference)

### S1 — Critical (print this section)

- [ ] Acknowledge in `#incidents` within 5 min
- [ ] Page on-call + CTO
- [ ] Create incident ticket
- [ ] Update status-page
- [ ] Notify Enterprise customers (WhatsApp + E-Mail)
- [ ] Start timeline log
- [ ] Assess: Is personal data involved?
- [ ] If YES: Notify Legal Counsel immediately
- [ ] Contain: Isolate affected systems
- [ ] Preserve: Snapshot logs, DB, memory
- [ ] Eradicate: Fix root cause
- [ ] Recover: Restore service
- [ ] Verify: Confirm service is healthy
- [ ] Close: Update status-page to "resolved"
- [ ] PIR: Draft within 48h
- [ ] If data breach: GDPR notification within 72h

---

**Document Owner:** CTO  
**Last Updated:** 27. Juni 2026  
**Next Review:** 27. Dezember 2026  
**Classification:** Internal — Not for external distribution
