# Subsumio — Externe Launch-Prozesse

> **Diese Datei trackt alle nicht-code-seitigen Launch-Items.**
> Interne Code-Items leben im Codebase-Workflow (Cascade-Sessions).

- **Stand:** 27. Juni 2026
- **Owner:** Geschäftsführung / Operations

---

## P0 — Vor Launch (kritisch)

### 1. SOC 2 Type II Zertifizierung

- **Status:** Nicht gestartet
- **Aufwand:** 4–6 Wochen Vorbereitung + 3–6 Monate Audit-Periode
- **Aktion:**
  - [ ] Auditor beauftragen (Empfehlung: Vanta/Drata für Tooling, EY/PwC für Audit)
  - [ ] Security Policies dokumentieren (Access Control, Change Management, Incident Response)
  - [ ] Evidence Collection starten (Logs, Access Reviews, Change Tickets)
  - [ ] Trust Center Seite auf subsum.io einrichten
- **Blockiert:** Enterprise-Deals (Harvey, Clio haben SOC 2)
- **Budget:** ~€15.000–50.000

### 2. Penetration Testing

- **Status:** Nicht beauftragt
- **Aufwand:** 2–3 Wochen
- **Aktion:**
  - [ ] Pentest-Firma beauftragen (z.B. Cure53, SySS, nGuard)
  - [ ] Scope definieren: Web-App, API, Engine, Infrastruktur
  - [ ] Remediation Track für Fundings einplanen (Code-Session nach Report)
- **Budget:** ~€5.000–15.000

### 3. ISO 27001 Zertifizierung (optional für Early Adopters)

- **Status:** Nicht gestartet
- **Aufwand:** 8–12 Wochen Vorbereitung + Audit
- **Aktion:**
  - [ ] ISMS Framework aufbauen (Risikobewertung, Policies, Controls)
  - [ ] Auditor beauftragen
- **Budget:** ~€10.000–30.000
- **Hinweis:** Kann nach Launch nachgereicht werden

---

## P1 — Kurz nach Launch

### 4. Verlags-Content-Partnerschaft

- **Status:** Keine Kontakte
- **Aktion:**
  - [ ] MANZ Verlag ansprechen (AT — Rechtskommentare)
  - [ ] C.H. Beck Verlag ansprechen (DE — Rechtskommentare)
  - [ ] Verlag Österreich ansprechen
  - [ ] Pitch: Kuratierte Judikatur-/Kommentarquellen als RAG-Source
- **Business Value:** Antwort auf Noxtua+MANZ/Beck-Allianz
- **Budget:** Verhandlungssache

### 5. Security Policies Formalisierung

- **Status:** Teilweise vorhanden (im Code verstreut)
- **Aktion:**
  - [ ] Security Policy Dokument erstellen (Access Control, Encryption, Incident Response)
  - [ ] Data Processing Agreement (DPA) Template
  - [ ] AVV (Auftragsverarbeitungsvertrag) Template
  - [ ] Sub-processor Liste veröffentlichen
- **Budget:** Intern

### 6. SLA Documentation

- **Status:** Fehlt
- **Aktion:**
  - [ ] Uptime SLA definieren (99.5% für Pro, 99.9% für Team/Enterprise)
  - [ ] Response Time SLA definieren
  - [ ] Support-Tier-Struktur (Email, Priority, Enterprise)
  - [ ] Status Page einrichten (status.subsum.io)
- **Budget:** Intern

### 7. Enterprise Support Prozess

- **Status:** Fehlt
- **Aktion:**
  - [ ] Support-Ticket-System auswählen (z.B. Linear, Zendesk, HelpScout)
  - [ ] Onboarding-Playbook für Enterprise-Kunden
  - [ ] Dedicated Account Manager für Team/Enterprise
  - [ ] Escalation Matrix definieren
- **Budget:** Intern + Tool-Kosten

---

## P2 — Mittelfristig

### 8. Brand Awareness

- [ ] Case Studies von Early Adopters erstellen
- [ ] Testimonials sammeln
- [ ] LinkedIn-Präenz aufbauen
- [ ] Legal Tech Konferenzen (LEGAL TECH CON, Advokatentag)
- [ ] Blog/Content-Marketing (SEO)

### 9. Trust Center

- [ ] trust.subsum.io Seite erstellen
- [ ] Security Whitepaper veröffentlichen
- [ ] Sub-processor Liste
- [ ] Compliance-Status Dashboard (SOC 2, ISO 27001, DSGVO)

---

## Budget-Summary

| Item                             | Budget (geschätzt)  |
| -------------------------------- | ------------------- |
| SOC 2 Type II                    | €15.000–50.000      |
| Penetration Testing              | €5.000–15.000       |
| ISO 27001                        | €10.000–30.000      |
| Verlags-Partnerschaft            | Verhandlungssache   |
| SLA/Support Tools                | €200–500/Monat      |
| **Gesamt (exkl. Partnerschaft)** | **~€30.000–95.000** |

---

## Timeline

| Phase       | Dauer      | Items                                                 |
| ----------- | ---------- | ----------------------------------------------------- |
| Pre-Launch  | 4–6 Wochen | SOC 2 Vorbereitung, Pentest, Security Policies        |
| Launch      | Woche 5    | Early Adopters (Solo/Mid-Size DACH)                   |
| Post-Launch | 3–6 Monate | SOC 2 Audit-Periode, ISO 27001, Verlags-Partnerschaft |
| Enterprise  | Monat 4–6  | Enterprise-Deals nach SOC 2                           |
