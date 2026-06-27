# Enterprise Support Policy

**Gültig ab:** 27. Juni 2026  
**Version:** 1.0  
**Anbieter:** Sigmacode AT GmbH ("Subsumio")

---

## 1. Support-Tier-Modell

### 1.1 Tier 1 — Standard Support (Pro Plan)

| Attribut           | Wert                           |
| ------------------ | ------------------------------ |
| Kanäle             | E-Mail, Status-Page            |
| Verfügbarkeit      | Mo–Fr 08:00–18:00 CET/CEST     |
| Response Time (S1) | 30 min                         |
| Response Time (S2) | 2 h                            |
| Response Time (S3) | 4 h                            |
| Response Time (S4) | 1 Business Day                 |
| Onboarding         | Dokumentation + Knowledge Base |
| Escalation         | Nach Engineering-Discretion    |

### 1.2 Tier 2 — Enterprise Support (Enterprise Plan)

| Attribut                  | Wert                                        |
| ------------------------- | ------------------------------------------- |
| Kanäle                    | E-Mail, Status-Page, WhatsApp, Telefon      |
| Verfügbarkeit             | Mo–Fr 08:00–18:00 CET/CEST (S1: 24/7)       |
| Response Time (S1)        | 15 min (24/7)                               |
| Response Time (S2)        | 30 min                                      |
| Response Time (S3)        | 2 h                                         |
| Response Time (S4)        | 4 h                                         |
| Onboarding                | 2 geführte Training-Sessions + Custom Setup |
| Dedicated CSM             | ✅                                          |
| Monthly SLA Report        | ✅                                          |
| Quarterly Business Review | ✅                                          |
| Custom Integrations       | ✅ (nach Aufwand)                           |
| Roadmap Input             | ✅ (Quarterly)                              |

### 1.3 Tier 3 — Premium Enterprise (Custom)

| Attribut                  | Wert                             |
| ------------------------- | -------------------------------- |
| Kanäle                    | Alle + dedizierter Slack-Channel |
| Verfügbarkeit             | 24/7 für S1/S2                   |
| Dedicated SRE             | ✅                               |
| Custom SLA                | Verhandelbar                     |
| On-premise Support        | ✅                               |
| White-glove Migration     | ✅                               |
| Priority Feature Requests | ✅                               |

---

## 2. Support-Prozess

### 2.1 Ticket-Erstellung

Ein Support-Ticket kann über folgende Kanäle erstellt werden:

1. **E-Mail:** support@subsum.io — Ticket wird automatisch erstellt
2. **In-App:** Dashboard → Hilfe → Ticket erstellen
3. **WhatsApp:** Enterprise-Kunden können direkt an den Support-Bot schreiben
4. **Telefon:** Enterprise-Kunden erreichen das Team unter +43 XXX

### 2.2 Ticket-Lebenszyklus

```
Created → Triaged → In Progress → Pending Customer → Resolved → Closed
                ↓                              ↓
           Escalated                      Reopened
```

### 2.3 Ticket-Priorisierung

Tickets werden automatisch nach Severity priorisiert:

| Severity | Kriterien                                   | Auto-Priority  |
| -------- | ------------------------------------------- | -------------- |
| S1       | Service down, Datenverlust, Security Breach | P1 — Immediate |
| S2       | Kernfunktion nicht verfügbar                | P2 — High      |
| S3       | Teileinschränkung                           | P3 — Normal    |
| S4       | Frage, Feature Request, kosmetisch          | P4 — Low       |

### 2.4 Eskalationsmatrix

| Eskalationsstufe | Trigger                       | Aktion                             |
| ---------------- | ----------------------------- | ---------------------------------- |
| Level 0          | Ticket erstellt               | Auto-Triage, Bestätigung an Kunden |
| Level 1          | Response Time überschritten   | Ping an Support-Lead               |
| Level 2          | Resolution Time überschritten | Eskalation an Engineering Lead     |
| Level 3          | S1 nach 1h ungelöst           | Eskalation an CTO                  |
| Level 4          | S1 nach 4h ungelöst           | Eskalation an CEO + Kunden-Call    |

---

## 3. Onboarding-Prozess (Enterprise)

### 3.1 Phase 1: Kick-off (Woche 1)

- **Day 1:** Kick-off-Call mit CSM + Technical Lead
- **Day 2-3:** Environment-Setup (Brain-Init, User-Provisioning, IP-Allowlist)
- **Day 4-5:** Daten-Migration (bestehende Akten, Dokumente, Fristen)

### 3.2 Phase 2: Training (Woche 2)

- **Session 1:** Core-Features (Akten, Fristen, KI-Chat, Dokumente) — 90 min
- **Session 2:** Advanced Features (Workflows, Copilot, WhatsApp, CLM) — 90 min
- Aufzeichnung wird bereitgestellt
- Q&A-Dokument wird nach Training erstellt

### 3.3 Phase 3: Go-Live (Woche 3)

- Hypercare-Phase: 2 Wochen täglicher Check-in
- Priority-Bug-Fixes innerhalb 4h
- CSM steht täglich 30 min für Fragen zur Verfügung

### 3.4 Phase 4: Steady State (ab Woche 5)

- Monthly Check-in (30 min)
- Quarterly Business Review (60 min)
- SLA-Report wird monatlich zugestellt

---

## 4. Communication Channels

### 4.1 Status-Page

- **URL:** `https://status.subsum.eu`
- **Real-time-Status:** Web-App, Engine API, WhatsApp, DocuSign
- **Incident-History:** 90 Tage
- **Maintenance-Calendar:** Ankündigung geplanter Wartungen
- **Subscriptions:** E-Mail, Webhook, RSS

### 4.2 WhatsApp-Support (Enterprise)

- Dedizierte Support-Nummer
- Business-Hours: Mo–Fr 08:00–18:00 CET/CEST
- Auto-Reply außerhalb der Geschäftszeiten mit Ticket-Erstellung
- File-Sharing: Screenshots, Dokumente, Logs

### 4.3 Telefon-Support (Enterprise)

- Mo–Fr 09:00–17:00 CET/CEST
- S1-Incidents: 24/7 via Notfall-Nummer
- Call-Back innerhalb 15 min bei S1 außerhalb der Geschäftszeiten

---

## 5. Knowledge Base & Documentation

### 5.1 Verfügbare Ressourcen

| Ressource       | URL                   | Inhalt                                  |
| --------------- | --------------------- | --------------------------------------- |
| Docs            | `docs.subsum.eu`      | API-Docs, Integration-Guides, Tutorials |
| Knowledge Base  | `kb.subsum.eu`        | How-to-Artikel, Best Practices, FAQ     |
| Video-Tutorials | `learn.subsum.eu`     | Screencasts für alle Kern-Features      |
| Status-Page     | `status.subsum.eu`    | Live-Status, Incidents, Maintenance     |
| Community       | `community.subsum.eu` | Forum für User-to-User-Support          |
| Changelog       | `changelog.subsum.eu` | Release-Notes für jedes Update          |

### 5.2 Sprachen

- UI & Docs: Deutsch + Englisch
- Support: Deutsch + Englisch
- Knowledge Base: Deutsch + Englisch

---

## 6. Customer Success Management

### 6.1 CSM-Rolle

Der Customer Success Manager (CSM) ist der primäre Ansprechpartner für Enterprise-Kunden und verantwortlich für:

- Onboarding & Training
- Quarterly Business Reviews
- Adoption-Monitoring (Nutzungs-Analytics)
- Feature-Roadmap-Input
- Eskalations-Management
- Renewal-Verhandlungen

### 6.2 Quarterly Business Review (QBR)

Struktur des QBR (60 min):

1. **Nutzungs-Review** (15 min) — Adoption Analytics, Active Users, Feature-Usage
2. **Feedback & Pain Points** (15 min) — Offene Issues, Feature Requests
3. **Roadmap-Alignment** (15 min) — Geplante Features, Customer Impact
4. **Action Items** (15 min) — Next Steps, Verantwortlichkeiten, Timeline

### 6.3 Adoption-Monitoring

- Automated Dashboard: `/dashboard/adoption-analytics`
- KPIs: Active Users (7d/30d), Feature-Usage, Query-Volume, Agent-Runs
- Alerts bei: < 25% Adoption Rate, Inactive Users > 14 Tage
- CSM kontaktiert Kunden bei negativen Trends proaktiv

---

## 7. Incident Communication

### 7.1 Incident-Notification-Flow

```
Incident detected → Status-Page updated → Customer notification →
Regular updates → Resolution → Post-Incident Report
```

### 7.2 Notification-Channels

| Severity | Channel                         | Timing   |
| -------- | ------------------------------- | -------- |
| S1       | E-Mail + WhatsApp + Status-Page | < 15 min |
| S2       | E-Mail + Status-Page            | < 30 min |
| S3       | Status-Page                     | < 2 h    |
| S4       | Status-Page (nur bei Impact)    | < 4 h    |

### 7.3 Post-Incident Report

Innerhalb 48h nach S1/S2-Incident:

1. **Timeline** — Was passierte und wann
2. **Root Cause** — Technische Ursache
3. **Impact** — Betroffene Kunden, Dauer, Datenverlust
4. **Resolution** — Wie wurde es behoben
5. **Prevention** — Maßnahmen zur Vermeidung
6. **Action Items** — Konkrete Next Steps mit Owner und Deadline

---

## 8. Change Management Communication

### 8.1 Release-Notifications

- **Major Release:** 2 Wochen Vorankündigung per E-Mail
- **Minor Release:** 1 Woche Vorankündigung in Changelog
- **Patch Release:** Changelog-Eintrag, keine separate Notification
- **Breaking Change:** 4 Wochen Vorankündigung + Migration-Guide

### 8.2 Maintenance-Notifications

- **Geplante Wartung:** 72h Vorankündigung per E-Mail + Status-Page
- **Notfall-Wartung:** 1h Vorankündigung (sofern möglich)
- **Erinnerung:** 1h vor Wartungsbeginn

---

## 9. Customer Feedback

### 9.1 Feedback-Kanäle

- In-App Feedback-Button (jede Seite)
- NPS-Survey (quartalsweise)
- Feature Request Portal (`feedback.subsum.eu`)
- CSM-Feedback in QBR
- Support-Ticket-Zufriedenheitsrating (nach jedem Ticket)

### 9.2 Feedback-Processing

- Alle Feature Requests werden innerhalb 5 Business Days triaged
- Status: Under Review → Planned → In Progress → Shipped / Declined
- Kunde erhält Notification bei Status-Änderung

---

## 10. Service Credits

Siehe SLA-Dokument (`docs/enterprise/SLA.md`) Section 2.3.

---

## 11. Contact Information

| Rolle              | E-Mail               | Telefon | Verfügbarkeit     |
| ------------------ | -------------------- | ------- | ----------------- |
| General Support    | support@subsum.io    | —       | Mo–Fr 08:00–18:00 |
| Enterprise Support | enterprise@subsum.io | +43 XXX | Mo–Fr 08:00–18:00 |
| S1 Emergency       | emergency@subsum.io  | +43 XXX | 24/7              |
| Customer Success   | csm@subsum.io        | —       | Mo–Fr 09:00–17:00 |
| Security           | security@subsum.io   | —       | 24/7              |
| Billing            | billing@subsum.io    | —       | Mo–Fr 09:00–17:00 |

---

**Document Owner:** Head of Customer Success  
**Last Updated:** 27. Juni 2026  
**Next Review:** 27. September 2026
