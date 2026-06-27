# Service Level Agreement (SLA)

**Gültig ab:** 27. Juni 2026  
**Version:** 1.0  
**Anbieter:** Sigmacode AT GmbH ("Subsumio")  
**Geltungsbereich:** Alle Subsumio Pro- und Enterprise-Kunden mit aktivem Vertrag

---

## 1. Definitions

| Begriff                 | Definition                                                                 |
| ----------------------- | -------------------------------------------------------------------------- |
| **Service**             | Die Subsumio SaaS-Plattform (Web-App, Engine API, WhatsApp-Bot, Copilot)   |
| **Uptime**              | Zeit, in der der Service über HTTP 200/201/204 erreichbar ist              |
| **Downtime**            | Zeit, in der der Service nicht über HTTP 5xx oder Timeout (>30s) antwortet |
| **Planned Maintenance** | Ankündigungspflichtige Wartung außerhalb der Geschäftszeiten               |
| **Incident**            | Ungeplante Störung, die den Service beeinträchtigt                         |
| **RTO**                 | Recovery Time Objective — max. Zeit bis zur Wiederherstellung              |
| **RPO**                 | Recovery Point Objective — max. Datenverlust-Zeitraum                      |
| **Business Hours**      | Mo–Fr, 08:00–18:00 CET/CEST                                                |
| **Critical Hours**      | 24/7 — für Severity-1-Incidents                                            |

---

## 2. Service Availability

### 2.1 Uptime-Garantie

| Plan       | Uptime-Garantie | Messzeitraum  |
| ---------- | --------------- | ------------- |
| Pro        | 99,5 %          | Kalendermonat |
| Enterprise | 99,9 %          | Kalendermonat |

### 2.2 Messmethode

- Externes Monitoring via UptimeRobot (5-Minuten-Intervall)
- Endpunkte: `GET /` (Web-App), `GET /api/health` (Engine API)
- Geplante Wartungen werden von der Downtime ausgenommen
- Kunden können jederzeit den aktuellen Status unter `https://status.subsum.eu` einsehen

### 2.3 Service Credits

Bei Unterschreitung der Uptime-Garantie erhält der Kunde Service Credits:

| Uptime (Monat)         | Credit (% der Monatsgebühr) |
| ---------------------- | --------------------------- |
| < 99,9 % aber ≥ 99,0 % | 10 %                        |
| < 99,0 % aber ≥ 95,0 % | 25 %                        |
| < 95,0 %               | 50 %                        |

Service Credits werden mit der nächsten Rechnung verrechnet. Ein Credit-Anspruch muss innerhalb von 30 Tagen nach Monatsende geltend gemacht werden.

---

## 3. Performance

### 3.1 Response Times

| Endpunkt                | Ziel     | Max    |
| ----------------------- | -------- | ------ |
| Web-App (SSR)           | < 500 ms | < 2 s  |
| Engine API (Query)      | < 2 s    | < 10 s |
| Engine API (Think)      | < 15 s   | < 60 s |
| WhatsApp Webhook        | < 200 ms | < 1 s  |
| Dashboard (Client-Side) | < 300 ms | < 1 s  |

### 3.2 Throughput

| Plan       | Requests/min | Concurrent Users |
| ---------- | ------------ | ---------------- |
| Pro        | 100          | 25               |
| Enterprise | 500          | 200              |

---

## 4. Incident Response

### 4.1 Severity Levels

| Severity          | Beschreibung                                       | Response Time           | Resolution Time |
| ----------------- | -------------------------------------------------- | ----------------------- | --------------- |
| **S1 — Critical** | Service vollständig nicht verfügbar; Datenverlust  | 15 min (24/7)           | 2 h             |
| **S2 — High**     | Kernfunktion nicht verfügbar; Workaround existiert | 30 min (Business Hours) | 4 h             |
| **S3 — Medium**   | Teileinschränkung; Workaround verfügbar            | 2 h (Business Hours)    | 1 Business Day  |
| **S4 — Low**      | Kosmetisch; keine funktionale Einschränkung        | 4 h (Business Hours)    | 5 Business Days |

### 4.2 Escalation

| Stufe | Ansprechpartner  | Erreichbarkeit       |
| ----- | ---------------- | -------------------- |
| 1     | Support-Team     | support@subsum.io    |
| 2     | Engineering Lead | escalation@subsum.io |
| 3     | CTO              | cto@subsum.io        |

### 4.3 Communication

- **S1:** Status-Update alle 30 min bis zur Behebung
- **S2:** Status-Update alle 2 h bis zur Behebung
- **S3/S4:** Status-Update bei Eskalation oder Behebung
- **Kanal:** E-Mail + Status-Page (`status.subsum.eu`)
- **Enterprise-Kunden:** Zusätzlich WhatsApp-Notification an designierten Kontakt

---

## 5. Maintenance Windows

### 5.1 Geplante Wartung

- **Zeitfenster:** Samstag 02:00–06:00 CET/CEST
- **Ankündigungsfrist:** Mindestens 72 Stunden per E-Mail
- **Dauer:** Maximal 4 Stunden pro Wartungsfenster
- **Häufigkeit:** Maximal 2× pro Monat

### 5.2 Notfall-Wartung

- Bei kritischen Security-Fixes (S1)
- Ankündigung sofern möglich, mindestens 1 Stunde vorher
- Post-Incident-Report innerhalb 48 h

---

## 6. Data Backup & Recovery

### 6.1 Backup-Schedule

| System                  | Frequenz              | Retention | Storage                            |
| ----------------------- | --------------------- | --------- | ---------------------------------- |
| PostgreSQL (Production) | Stündlich (WAL)       | 30 Tage   | Hetzner Storage Box, Falkenstein   |
| PostgreSQL (Full Dump)  | Täglich 02:00 CET     | 90 Tage   | Hetzner Storage Box + S3 (offsite) |
| PGLite (Self-hosted)    | Täglich (automated)   | 30 Tage   | Kundenseitig                       |
| Document Vault          | Täglich (incremental) | 90 Tage   | Hetzner Storage Box                |
| Configuration & Secrets | Bei Änderung          | 365 Tage  | Versioniert (git-crypt)            |

### 6.2 Recovery Objectives

| System                  | RTO | RPO    |
| ----------------------- | --- | ------ |
| PostgreSQL (Production) | 2 h | 15 min |
| Web Application         | 4 h | 1 h    |
| Engine API              | 4 h | 1 h    |
| Authentication Service  | 2 h | 15 min |
| WhatsApp Integration    | 8 h | 1 h    |

### 6.3 Backup-Verifikation

- Monatliche Restore-Tests (staging environment)
- Quartalsweise vollständige DR-Übung
- Backup-Integrität wird täglich automatisch geprüft (checksum)

---

## 7. Support

### 7.1 Support-Kanäle

| Kanal                      | Verfügbarkeit     | Response Time |
| -------------------------- | ----------------- | ------------- |
| E-Mail (support@subsum.io) | Mo–Fr 08:00–18:00 | < 4 h (S3)    |
| Status-Page                | 24/7              | Echtzeit      |
| WhatsApp (Enterprise)      | Mo–Fr 08:00–18:00 | < 2 h (S2)    |
| Telefon (Enterprise)       | Mo–Fr 09:00–17:00 | < 30 min (S1) |

### 7.2 Support-Level je Plan

| Feature             | Pro | Enterprise      |
| ------------------- | --- | --------------- |
| E-Mail-Support      | ✅  | ✅              |
| Status-Page         | ✅  | ✅              |
| WhatsApp-Support    | ❌  | ✅              |
| Telefon-Support     | ❌  | ✅              |
| Dedicated CSM       | ❌  | ✅              |
| Onboarding-Training | ❌  | ✅ (2 Sessions) |
| Custom Integrations | ❌  | ✅              |
| SLA-Reporting       | ❌  | ✅ (Monatlich)  |

---

## 8. Security & Compliance

### 8.1 Encryption

- **In Transit:** TLS 1.3 (mindestens TLS 1.2)
- **At Rest:** AES-256-GCM
- **Password Hashing:** scrypt (N=2¹⁵, r=8, p=1)

### 8.2 Compliance

- DSGVO / GDPR-konform
- BDSG (DE), DSG (CH), DSG (AT) konform
- AI Act: Transparente Kennzeichnung von KI-Output
- Berufsrecht: RAO (AT), BRAO (DE), BRAG (AT), BGFA (CH)
- SOC 2 Type II: Vorbereitung abgeschlossen, externer Audit geplant Q3 2026

### 8.3 Data Processing

- Hosting: Hetzner Online GmbH, Falkenstein (DE)
- Datenverarbeitung ausschließlich in der EU
- Keine Datenübertragung an Drittländer (kein SCC, kein Privacy Shield nötig)
- Sub-Auftragsverarbeiter: Siehe Anhang A

---

## 9. Exclusions

Folgende Ereignisse gelten nicht als Downtime im Sinne dieses SLA:

- Force Majeure (Naturkatastrophen, Krieg, Terrorismus)
- Ausfälle verursacht durch den Kunden (Fehlkonfiguration, Missbrauch)
- Ausfälle von Drittanbietern (WhatsApp API, DocuSign, beA) außerhalb der Subsumio-Infrastruktur
- Geplante Wartung innerhalb des angekündigten Zeitfensters
- Netzwerkprobleme außerhalb der Subsumio-Infrastruktur

---

## 10. Term & Termination

- Dieses SLA gilt für die Laufzeit des Hauptvertrags
- Bei wiederholter Unterschreitung der Uptime-Garantie (3 aufeinanderfolgende Monate) kann der Kunde den Vertrag ohne Frist kündigen
- Service Credits stellen die einzige vertragliche Remedie dar

---

## Anhang A: Sub-Auftragsverarbeiter

| Anbieter            | Zweck                   | Standort        | DPA |
| ------------------- | ----------------------- | --------------- | --- |
| Hetzner Online GmbH | Hosting & Storage       | Falkenstein, DE | ✅  |
| Cloudflare, Inc.    | CDN & DDoS-Schutz       | EU-Edge         | ✅  |
| OpenAI / Anthropic  | KI-Inference (optional) | EU (Azure)      | ✅  |
| Meta (WhatsApp)     | WhatsApp Business API   | EU              | ✅  |
| DocuSign            | E-Signature             | EU (Frankfurt)  | ✅  |

---

## Anhang B: Kontakt

| Rolle              | E-Mail               | Telefon |
| ------------------ | -------------------- | ------- |
| General Support    | support@subsum.io    | —       |
| Enterprise Support | enterprise@subsum.io | +43 XXX |
| Security Incidents | security@subsum.io   | +43 XXX |
| Account Management | accounts@subsum.io   | —       |
| CTO                | cto@subsum.io        | —       |

---

**Document Owner:** CTO, Sigmacode AT GmbH  
**Last Updated:** 27. Juni 2026  
**Next Review:** 27. Dezember 2026
