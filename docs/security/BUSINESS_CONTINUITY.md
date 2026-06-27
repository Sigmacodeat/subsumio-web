# Business Continuity Plan

**Version:** 1.0  
**Datum:** 27. Juni 2026  
**Owner:** CTO  
**Classification:** Internal

---

## 1. Purpose

This plan ensures that Subsumio can maintain or rapidly resume critical business functions following a disruption. It covers strategy, roles, procedures, and testing for business continuity management.

---

## 2. Business Impact Analysis (BIA)

### 2.1 Critical Business Functions

| Priority | Function                    | Impact if unavailable | MTD  | RTO | RPO    |
| -------- | --------------------------- | --------------------- | ---- | --- | ------ |
| P1       | Web Application (Dashboard) | Customers cannot work | 8 h  | 4 h | 1 h    |
| P1       | Engine API (AI queries)     | No AI functionality   | 8 h  | 4 h | 1 h    |
| P1       | Authentication Service      | No login possible     | 4 h  | 2 h | 15 min |
| P2       | PostgreSQL Database         | All data inaccessible | 4 h  | 2 h | 15 min |
| P2       | Document Vault              | No file access        | 12 h | 4 h | 24 h   |
| P3       | WhatsApp Integration        | No WhatsApp bot       | 24 h | 8 h | 1 h    |
| P3       | DocuSign Integration        | No e-signature        | 48 h | 8 h | N/A    |
| P3       | beA Integration             | No beA postbox        | 48 h | 8 h | N/A    |
| P4       | Status Page                 | No customer comms     | 2 h  | 1 h | N/A    |

### 2.2 Dependencies

```
Web App → Engine API → PostgreSQL
                     → Document Vault
                     → Redis (session)
Auth → PostgreSQL → Redis
WhatsApp → Engine API → PostgreSQL
DocuSign → External API (no dependency)
beA → External API (no dependency)
```

---

## 3. Continuity Strategy

### 3.1 Active-Active Redundancy

| Component       | Primary                           | Secondary               | Failover                   |
| --------------- | --------------------------------- | ----------------------- | -------------------------- |
| Web Application | Hetzner CX33 (Falkenstein)        | Hetzner CX33 (Helsinki) | DNS failover (< 5 min)     |
| Engine API      | Hetzner CX33 (Falkenstein)        | Hetzner CX33 (Helsinki) | DNS failover (< 5 min)     |
| PostgreSQL      | Primary (Falkenstein)             | Replica (Helsinki)      | Promote replica (< 15 min) |
| Redis           | Primary (Falkenstein)             | Replica (Helsinki)      | Auto-failover (< 30 sec)   |
| Document Vault  | Hetzner Storage Box (Falkenstein) | S3 (Helsinki)           | Manual switch (< 1 h)      |

### 3.2 Graceful Degradation

If full failover is not immediately possible, Subsumio degrades gracefully:

| Scenario                | Degraded Mode                   | Customer Impact                             |
| ----------------------- | ------------------------------- | ------------------------------------------- |
| Engine API down         | Read-only mode (cached results) | No new AI queries, cached answers available |
| PostgreSQL primary down | Read from replica (delayed)     | Write operations queued, reads may be stale |
| WhatsApp API down       | E-mail notifications fallback   | WhatsApp bot unavailable, e-mail works      |
| DocuSign down           | Manual signing workflow         | E-signature delayed, manual PDF signing     |
| Redis down              | Database-backed sessions        | Slightly slower session management          |

---

## 4. Continuity Roles

### 4.1 Business Continuity Team (BCT)

| Role               | Member             | Responsibility                           |
| ------------------ | ------------------ | ---------------------------------------- |
| **BC Coordinator** | CTO                | Overall coordination, Go/No-Go decisions |
| **Tech Lead**      | Engineering Lead   | Technical execution, failover            |
| **Comms Lead**     | Head of CS         | Customer & stakeholder communication     |
| **HR Lead**        | Operations Manager | Staff safety, remote work coordination   |
| **Legal**          | External Counsel   | Contractual obligations, regulatory      |

### 4.2 Decision Authority

| Decision           | Authority                         |
| ------------------ | --------------------------------- |
| Declare BC event   | CTO (or backup: Engineering Lead) |
| Initiate failover  | Tech Lead (with CTO approval)     |
| Notify customers   | Comms Lead (with CTO approval)    |
| Declare event over | CTO                               |
| Invoke DR plan     | CTO                               |

---

## 5. Disruption Scenarios

### 5.1 Data Center Outage (Falkenstein)

**Trigger:** Hetzner status page reports Falkenstein outage OR monitoring detects total loss.

**Response:**

1. **0–15 min:** Declare BC event, assess scope
2. **15–30 min:** Promote Helsinki PostgreSQL replica, update DNS to Helsinki
3. **30–60 min:** Verify services on Helsinki infrastructure
4. **60–90 min:** Customer notification (status page + e-mail + WhatsApp)
5. **Ongoing:** Monitor, plan return to primary

### 5.2 Network Partition (partial)

**Trigger:** Some customers report intermittent connectivity issues.

**Response:**

1. **0–15 min:** Assess via monitoring, identify affected regions
2. **15–30 min:** Implement CDN-level routing adjustments (Cloudflare)
3. **30–60 min:** Customer notification if > 5% affected
4. **Ongoing:** Monitor, coordinate with Hetzner support

### 5.3 Key Personnel Unavailable

**Trigger:** Key team member unavailable for > 24h.

**Response:**

1. **0–4 h:** Identify backup role holder
2. **4–8 h:** Transfer access credentials (1Password, Hetzner, Cloudflare)
3. **8–24 h:** Brief backup role holder on current state
4. **Ongoing:** Cross-training ensures no single point of knowledge

### 5.4 Pandemic / Force Majeure

**Trigger:** Government restrictions prevent office access.

**Response:**

1. All staff transition to remote work (already standard for Subsumio)
2. Daily check-in calls (15 min)
3. Enhanced monitoring of system health
4. Reduced deployment frequency (only critical fixes)
5. Customer notification of potential slower response times

---

## 6. Communication Plan

### 6.1 Internal Communication

| Channel | Purpose                | Fallback                     |
| ------- | ---------------------- | ---------------------------- |
| Slack   | Real-time coordination | Signal group                 |
| Zoom    | Video calls            | Google Meet                  |
| E-Mail  | Formal communication   | Slack DM                     |
| Phone   | Emergency              | Mobile (stored in 1Password) |

### 6.2 External Communication

| Audience             | Channel                | Template                                              |
| -------------------- | ---------------------- | ----------------------------------------------------- |
| Customers            | Status page + E-mail   | "We are experiencing [issue]. [Impact]. ETA: [time]." |
| Enterprise customers | WhatsApp + Phone       | Personal message from CSM                             |
| Partners             | E-mail                 | Brief factual update                                  |
| Public               | Status page + Twitter  | Brief factual update                                  |
| Media                | E-mail / press release | Via Communications Lead only                          |
| Regulators           | Official letter        | Via Legal Counsel only                                |

### 6.3 Communication Cadence

| Phase                | Frequency                           |
| -------------------- | ----------------------------------- |
| Active disruption    | Every 30 min (S1) or every 2 h (S2) |
| Recovery in progress | Every 1 h                           |
| Post-recovery        | Summary within 24 h                 |
| Post-incident review | Within 48 h                         |

---

## 7. Resource Requirements

### 7.1 Minimum Viable Team

| Role             | Minimum | Required for                    |
| ---------------- | ------- | ------------------------------- |
| On-call engineer | 1       | System health, initial response |
| Engineering Lead | 1       | Technical decisions, failover   |
| CTO              | 1       | BC coordination, Go/No-Go       |
| Comms person     | 1       | Customer communication          |

### 7.2 Infrastructure

| Resource                  | Primary            | Backup                       |
| ------------------------- | ------------------ | ---------------------------- |
| Hetzner Cloud             | CX33 (Falkenstein) | CX33 (Helsinki)              |
| Hetzner Storage Box       | Falkenstein        | Helsinki                     |
| Cloudflare                | EU edge            | Global edge (auto)           |
| GitHub                    | Primary            | Local mirror + GitLab backup |
| 1Password                 | Cloud              | Local vault backup           |
| Status page (UptimeRobot) | Cloud              | Static HTML fallback         |

### 7.3 Financial Provisions

- Emergency fund: 10.000 € (immediately available)
- Insurance: Cyber liability insurance (planned Q3 2026)
- Cloud credit reserve: 2.000 € Hetzner + 500 € Cloudflare

---

## 8. Training & Testing

### 8.1 Training

| Training                | Frequency        | Audience         |
| ----------------------- | ---------------- | ---------------- |
| BCP awareness           | On hire + annual | All staff        |
| Failover procedure      | Quarterly        | Engineering team |
| Communication procedure | Quarterly        | CS team          |
| Full BC exercise        | Annually         | BCT + all staff  |

### 8.2 Exercise Types

| Type             | Description                           | Frequency     |
| ---------------- | ------------------------------------- | ------------- |
| Tabletop         | Walkthrough of scenario, no execution | Quarterly     |
| Partial failover | Failover one service to backup        | Semi-annually |
| Full failover    | Complete failover to Helsinki         | Annually      |
| Surprise drill   | Unannounced scenario                  | Annually      |

### 8.3 Exercise Documentation

Each exercise is documented with:

- Scenario description
- Participants
- Timeline of actions
- What worked well
- What didn't work
- Action items with owners and deadlines
- Updated BCP sections (if needed)

---

## 9. Plan Maintenance

### 9.1 Review Cycle

| Element                  | Review Frequency    | Owner              |
| ------------------------ | ------------------- | ------------------ |
| Full BCP                 | Annually            | CTO                |
| BIA                      | Annually            | CTO                |
| Contact list             | Quarterly           | Operations Manager |
| Infrastructure inventory | Quarterly           | Engineering Lead   |
| Exercise results         | After each exercise | CTO                |

### 9.2 Change Triggers

The BCP is reviewed and updated when:

- Significant infrastructure changes
- New critical services added
- Personnel changes in key roles
- After any real disruption
- After any exercise revealing gaps
- Annual review cycle

---

## 10. Compliance Mapping

| Framework    | Requirement                    | This Plan    |
| ------------ | ------------------------------ | ------------ |
| SOC 2 A1.2   | Environmental protections      | Section 5    |
| SOC 2 A1.3   | Recovery infrastructure        | Section 3, 7 |
| ISO 22301    | Business continuity management | Full plan    |
| GDPR Art. 32 | Availability and resilience    | Section 3, 5 |

---

**Document Owner:** CTO  
**Last Updated:** 27. Juni 2026  
**Next Review:** 27. Juni 2027  
**Classification:** Internal
