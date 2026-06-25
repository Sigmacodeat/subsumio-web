# Subsumio — Zertifizierungs-Roadmap

> **Status:** Stand Juni 2026. Täglich updatebar — dieser Plan ist der
> einzige öffentlich sichtbare Beweis unseres Commitment zu Sicherheit
> und Compliance. Jede Enterprise-Kanzlei, die Subsumio evaluiert,
> wird danach fragen.

---

## Warum Zertifizierungen jetzt P0 sind

Legora (€5,1B, Stockholm) expandiert 2026 in DE/AT mit ISO 27001, SOC 2
und BSI-Zertifizierung bereits in der Tasche. Ohne Zertifizierungen verliert
Subsumio jede Enterprise-Kanzlei ab ~10 Anwälten an der Compliance-Frage —
oft noch vor der Demo. Das ist kein Feature-Problem; es ist ein Trust-Problem.

**Zertifizierungspfad (Zeitachse realistisch für Startups):**

| Zertifizierung   | Warum                                  | Aufwand | Zeit bis Zertifikat |
| ---------------- | -------------------------------------- | ------- | ------------------- |
| SOC 2 Type I     | US/EU Enterprise Gate, SaaS-Standard   | Mittel  | 2–3 Monate          |
| ISO 27001:2022   | EU Enterprise, Behörden, Kanzleien     | Hoch    | 4–8 Monate          |
| ISO 42001:2023   | AI Governance, EU AI Act Ready         | Mittel  | 3–5 Monate          |
| SOC 2 Type II    | Beweis laufender Kontrolle (Follow-up) | Laufend | +6 Monate nach I    |
| BSI C5           | Deutsche Behörden, öffentl. Stellen    | Hoch    | 6–12 Monate         |
| TISAX (optional) | Automotive-Kanzleien (DE)              | Mittel  | 3–6 Monate          |

---

## Phase 1 — SOC 2 Type I (Monat 1–3)

**Ziel:** Vertrauensbasis für US-Kunden und internationale Enterprise-Kanzleien.
**Empfohlener Partner:** [Vanta](https://vanta.com) (automatisiertes Compliance-Monitoring,
Integration mit GitHub/AWS/Postgres), alternativ Drata oder Secureframe.

### Schritt-für-Schritt

**1. Vanta onboarden (Woche 1)**

```
Account anlegen: https://vanta.com
AWS / Hetzner / Neon.tech Connector aktivieren
GitHub Repository verbinden (automated security checks)
Kosten: ~$750/mo (Startup-Programm verfügbar: vanta.com/startup-program)
```

**2. Trust Service Criteria auswählen (Woche 1–2)**
Für Subsumio relevant:

- **CC** (Common Criteria) — Pflicht
- **A** (Availability) — relevant für SLA-Zusagen
- **C** (Confidentiality) — relevant für Kanzleidaten

**3. Policies dokumentieren (Woche 2–4)**
Folgende Policies müssen schriftlich existieren (Vanta liefert Templates):

- [ ] Information Security Policy
- [ ] Access Control Policy
- [ ] Incident Response Plan
- [ ] Vendor Management Policy
- [ ] Data Retention & Deletion Policy
- [ ] Acceptable Use Policy
- [ ] Business Continuity Plan
- [ ] Vulnerability Management Policy

**4. Technische Controls implementieren (Woche 2–8)**
Lücken die Vanta typisch findet und die bei Subsumio wahrscheinlich offen sind:

| Control                           | Umsetzung                                              |
| --------------------------------- | ------------------------------------------------------ |
| MFA für alle Admin-Accounts       | Enforce in Auth-Provider (Clerk/NextAuth)              |
| Audit Logging (alle User-Actions) | `src/lib/audit.ts` → bereits teilw. implementiert      |
| Encryption at rest                | Neon.tech/Hetzner: Standard, dokumentieren             |
| Encryption in transit             | TLS 1.2+, HSTS Header (bereits in next.config.ts)      |
| Secrets Management                | `.env` → wechseln zu Doppler oder AWS Secrets Manager  |
| Vulnerability Scanning            | `npm audit` im CI, Dependabot aktivieren               |
| Penetration Test (jährlich)       | Synack, HackerOne oder Cobalt.io (~$5K–20K)            |
| Employee Security Training        | KnowBe4 oder Vanta-eigenes Training-Modul              |
| Background Checks (Mitarbeiter)   | Für AT: Strafregisterbescheinigung, für DE: äquivalent |

**5. Auditor engagieren (Woche 6)**
Empfohlene Auditoren für Startups:

- **Prescient Security** (startup-freundlich, $8K–15K für Type I)
- **A-LIGN** (international anerkannt)
- **Johanson Group** (kosteneffizient)

**6. Audit-Fenster (Woche 8–12)**
SOC 2 Type I: Point-in-time Audit (kein Beobachtungszeitraum).
Report wird innerhalb 4–6 Wochen nach Audit geliefert.

**Kosten gesamt:** ~€20.000–40.000 (Vanta + Auditor + Pentest + Berater)

---

## Phase 2 — ISO 27001:2022 (Monat 2–8)

**Ziel:** EU-Enterprise Gate, DACH-Kanzleien (Pflicht ab ~20 Anwälten),
öffentliche Stellen, Behördenkanzleien.

**Empfohlener Zertifizierer (DACH):**

- **TÜV Rheinland** — https://www.tuv.com/iso-27001 | Tel: +49 221 806-0
- **TÜV SÜD** — https://www.tuvsud.com/de-de/dienstleistungen/managementsysteme/iso-iec-27001
- **Bureau Veritas Austria** — https://www.bureauveritas.at
- Für AT: **Austrian Standards** — https://www.austrian-standards.at/zertifizierung

**ISO 27001 Scoping für Subsumio:**
Scope: "Betrieb und Entwicklung der Subsumio Legal AI Platform,
inklusive Cloud-Infrastruktur, KI-Verarbeitung von Kanzleidaten,
und Kundensupport."

### Aufgaben-Checkliste

**ISMS-Dokumentation (Monat 1–2)**

- [ ] Informationssicherheits-Leitlinie (Statement of Applicability — SoA)
- [ ] Risikobewertung (Risk Assessment) nach ISO 27001 Annex A
- [ ] Risikobehandlungsplan
- [ ] Asset-Inventar (alle Systeme, Daten, Drittanbieter)
- [ ] Supplier-Agreements mit KI-Providern (Anthropic DPA, OpenAI DPA)

**Technische Controls (Annex A, für Subsumio relevant)**

- [ ] A.5 — Informationssicherheitsrichtlinien
- [ ] A.6 — Organisation der Informationssicherheit (CISO benennen)
- [ ] A.8 — Asset Management (Brain-Daten klassifizieren)
- [ ] A.9 — Zugriffskontrolle (RBAC bereits implementiert ✓)
- [ ] A.10 — Kryptografie (Dokumentieren was wo verschlüsselt ist)
- [ ] A.12 — Betriebssicherheit (Monitoring, Logging, Backups)
- [ ] A.13 — Kommunikationssicherheit (TLS, API-Sicherheit)
- [ ] A.14 — Systementwicklung (SDLC, Code Reviews, Tests)
- [ ] A.16 — Umgang mit Informationssicherheitsvorfällen (Incident Response)
- [ ] A.17 — Business Continuity
- [ ] A.18 — Compliance (DSGVO-Integration)

**Audit-Phasen**

1. Stage 1 Audit (Dokumentenprüfung, ~1 Tag, ~€3K)
2. Stage 2 Audit (Vor-Ort / Remote, ~2–3 Tage, ~€6K–12K)
3. Zertifikat gültig 3 Jahre, jährliche Überwachungsaudits

**Kosten gesamt:** ~€15.000–30.000 (TÜV + Berater + interne Aufwände)

**Beratungspartner (optional):**

- **datenschutz nord** (Hamburg/Bremen, IT-Sicherheit + ISO 27001)
- **HiSolutions** (Berlin, ISO 27001 für SaaS)
- **8com** (Neustadt, ISO/SOC Kombipakete)

---

## Phase 3 — ISO 42001:2023 (AI Management System) (Monat 3–6)

**Ziel:** EU AI Act Compliance-Nachweis, Differenzierung gegenüber
nicht-zertifizierten Wettbewerbern, Vorbereitung auf AI-Audits ab 2027.

**Was ISO 42001 verlangt (vereinfacht):**
ISO 42001 ist das ISMS-Äquivalent für KI — ein AI Management System (AIMS).
Hauptanforderungen für Subsumio:

**Dokumentation**

- [ ] AI Policy (bereits teilweise in EU-AI-Act-Page)
- [ ] AI Use-Case Register (alle KI-Funktionen: Analyze, Contract Draft, RVG, etc.)
- [ ] AI Risk Assessment per Use-Case
- [ ] Human Oversight Documentation (Art. 14 — bereits UI-seitig implementiert)
- [ ] Training Data Provenance (welche Corpora, Lizenzstatus)
- [ ] Model Cards für verwendete Modelle (Anthropic Claude)

**Technische Anforderungen**

- [ ] Transparenz-Banner (AIActConformityBanner.tsx ✓ implementiert)
- [ ] Feedback-Loop für KI-Outputs (Daumen hoch/runter)
- [ ] Auditlog für KI-Entscheidungen (bereits in `src/lib/audit.ts`)
- [ ] Bias-Monitoring (DACH-Rechtsprechung: keine US-Bias)
- [ ] Modell-Versionsmanagement (welche Claude-Version wann aktiv)

**Zertifizierer ISO 42001:**

- **BSI Group** (britisch, international anerkannt): https://www.bsigroup.com/de-DE/
- **Bureau Veritas**: zertifiziert ISO 42001 seit 2024
- **TÜV Rheinland**: Kombizertifizierung 27001+42001 möglich

**Kosten gesamt:** ~€8.000–18.000

---

## Phase 4 — BSI C5 (Monat 6–12, optional aber strategisch)

**Für:** Bundesbehörden, öffentliche Kanzleien (Insolvenzverwalter, Staatsanwaltschaft-Kanzleien DE), Landesbehörden.

**BSI C5 = Cloud Computing Compliance Criteria Catalogue.**
Praktisch die deutsche staatliche Entsprechung von SOC 2.

**Kontakt:**
Bundesamt für Sicherheit in der Informationstechnik (BSI)
Godesberger Allee 185–189, 53175 Bonn
https://www.bsi.bund.de/c5
c5@bsi.bund.de

**Akkreditierte Auditoren (BSI-Liste):**
https://www.bsi.bund.de/DE/Themen/CloudComputing/Anforderungskatalog/C5-Auditoren/auditoren.html

**Hinweis:** SOC 2 Type II ist eine anerkannte Grundlage für C5 —
Doppelarbeit vermeiden durch sequentielle Zertifizierung.

---

## Rechtsanwalts-Kammern & Datenanforderungen

### Österreich — Rechtsanwaltskammer

**Österreichischer Rechtsanwaltskammertag (ÖRAK)**
Schmerlingplatz 2–4, 1010 Wien
Tel: +43 1 535 12 75
https://www.rechtsanwaelte.at
it@rechtsanwaelte.at

**Anforderungen für KI-Tools in der Anwaltskanzlei (AT):**
Kein förmliches Zulassungsverfahren für KI-Tools (Stand 2026), aber:

- DSGVO-Konformität Pflicht (Auftragsverarbeitungsvertrag mit Subsumio)
- Berufsgeheimnis nach § 9 RAO: Daten dürfen AT nicht verlassen ohne Einwilligung
- Empfehlung: Datenverarbeitung im EU/EWR (Hetzner Helsinki ✓)
- Mitgliedschaft im beA-System (DE) / ERV (AT) für elektronischen Rechtsverkehr

**Empfohlene Schritte:**

1. AV-Vertrag (Auftragsverarbeitungsvertrag) für alle Kunden generieren
   → Route: `/api/billing/dpa` (TODO: implementieren)
2. Brief an ÖRAK IT-Ausschuss: Subsumio vorstellen, Feedback einholen
3. Partnerschaft mit dem Österreichischen Anwaltstag (OAT) anstreben

### Deutschland — Bundesrechtsanwaltskammer (BRAK)

**Bundesrechtsanwaltskammer**
Littenstraße 9, 10179 Berlin
Tel: +49 30 284939-0
https://www.brak.de
brak@brak.de

**Relevant für Subsumio:**

- beA-Integration: Schnittstelle zur beA-Infrastruktur über EGVP-Gateway
  → Kontakt: Bundesnotarkammer, beA-Support: https://bea-support.de
- Datenschutzhinweis für KI-Tools: BRAK-Hinweise vom März 2024 beachten
  → https://www.brak.de/fuer-anwaelte/berufsrecht/datenschutz/ki-tools/
- Keine Zulassungspflicht für KI-Tools, aber empfohlene Transparenzpflicht
  gegenüber Mandanten (§ 11 BRAO)

**Empfohlene Schritte:**

1. BRAK-Kontakt aufnehmen: Präsentation des Produkts, AV-Vertrag übermitteln
2. Teilnahme am DAV (Deutscher Anwaltverein) Technologieforum
3. Partnerschaft mit BRAK-Mitgliedsorganisationen (RA-MICRO, Wolters Kluwer)

### Schweiz — SAV/FSA

**Schweizerischer Anwaltsverband (SAV/FSA)**
Marktgasse 20, 3011 Bern
Tel: +41 31 313 04 04
https://www.sav-fsa.ch
secretariat@sav-fsa.ch

**Relevant für CH:**

- CH-DSG (Datenschutzgesetz, revidiert Sept. 2023) beachten
- Serverstandort CH oder EU mit CH-Angemessenheitsbeschluss
- Optional: Swiss nLPD Compliance-Zertifikat (analog DSGVO)

---

## Juris / RDB Inhaltslizenzen

### juris GmbH (DE)

**juris GmbH**
Gutenbergstraße 23, 66117 Saarbrücken
Tel: +49 681 5866-0
https://www.juris.de
kontakt@juris.de

**Partnerschaftsmodelle:**

- **API-Schnittstelle:** juris bietet eine Dokumentations-API für Verlage
  und Software-Anbieter an. Anfrage unter: api@juris.de
- **Kooperationsvertrag:** Nutzungsrechte für juris-Datenbank-Inhalte
  in eigener Software — Ansprechpartner: Vertrieb, Tel. +49 681 5866-111
- **Kostenschätzung:** €15.000–60.000/Jahr je nach Nutzungsvolumen und
  Rückgabe-Nutzungsrechten (juris zeigt Subsumio-Ergebnisse an)

**Alternative: OpenJur**
https://openjur.de — kostenlos, volltext, DE-Rechtsprechung
API-Kontakt: info@openjur.de

### RDB Rechtsdatenbank (AT)

**LexisNexis / Manz Verlag (RDB.at)**
https://www.rdb.at
Manzsche Verlags- und Universitätsbuchhandlung GmbH
Kohlmarkt 16, 1014 Wien
Tel: +43 1 531 61-0
verlag@manz.at

**Partnerschaft:**

- Technische Integration via RDB-API (Verfügbarkeit auf Anfrage)
- Kooperationsanfrage: partnerschaft@rdb.at
- Alternativ: OGH-Rechtsdatenbank (kostenlos, AT)
  https://www.ris.bka.gv.at — Rechtsinformationssystem des Bundes

### Weitere DACH-Rechtsquellen (kostenlos / Open Data)

| Quelle              | Land | Inhalt                        | URL                                |
| ------------------- | ---- | ----------------------------- | ---------------------------------- |
| RIS Justiz          | AT   | OGH, OLG, LG Entscheidungen   | https://www.ris.bka.gv.at          |
| openjur.de          | DE   | Gerichte alle Instanzen       | https://openjur.de                 |
| gesetze-im-internet | DE   | Gesetze, Verordnungen         | https://www.gesetze-im-internet.de |
| admin.ch/ch.admin   | CH   | Bundesrecht CH                | https://www.fedlex.admin.ch        |
| EUR-Lex             | EU   | EU-Recht, CJEU Rechtsprechung | https://eur-lex.europa.eu          |
| ECLI-Suche          | EU   | Alle EU-Gerichte via ECLI     | https://e-justice.europa.eu        |

---

## Priorisierung & Quick-Wins (sofort umsetzbar)

Diese Maßnahmen kosten nichts außer Zeit und zahlen sofort auf Trust ein:

1. **Datenschutzerklärung + AV-Vertrag-Generator** (1–2 Tage)
   Route: `/api/billing/dpa` — automatisch personalisierbarer AV-Vertrag als PDF.
   Jeder Neukunde unterschreibt digital bei Onboarding.

2. **Trust Center Page** (1 Tag)
   Öffentliche Seite: `https://subsum.io/trust` mit:
   - Zertifizierungsstatus (Roadmap sichtbar)
   - DPA / Subprocessors Liste
   - Bug Bounty Policy (HackerOne kostenlos starten)
   - Statuspage (Instastatus.co $0 Tier)

3. **DSGVO-Selbst-Assessment veröffentlichen** (2–3 Tage)
   Dokumentieren welche Daten wo gespeichert sind.
   Art-30-DSGVO Verzeichnis der Verarbeitungstätigkeiten als PDF.

4. **Penetration Test (Selbstdurchführung mit Tools)**
   - OWASP ZAP: kostenloser Web-App-Scan
   - `npm audit --production` in CI (täglich)
   - GitHub Advanced Security (kostenlos für public repos)

5. **Security Headers prüfen** (30 Minuten)
   https://securityheaders.com — Subsumio sollte A+ erreichen.
   Fehlende Headers in `next.config.ts` ergänzen (CSP, HSTS, etc.).

---

## Budget-Übersicht

| Maßnahme                       | Kosten (einmalig) | Kosten (jährlich)  | Priorität |
| ------------------------------ | ----------------- | ------------------ | --------- |
| Vanta Compliance Platform      | —                 | ~€9.000            | P0        |
| SOC 2 Type I Audit             | €15.000–25.000    | —                  | P0        |
| SOC 2 Type II (Follow-up)      | €10.000–18.000    | —                  | P1        |
| ISO 27001:2022 Zertifizierung  | €15.000–30.000    | €5.000 (Überwach.) | P0        |
| ISO 42001:2023 Zertifizierung  | €8.000–18.000     | €3.000 (Überwach.) | P1        |
| Penetration Test (jährlich)    | €5.000–15.000     | €5.000–15.000      | P0        |
| Rechtsanwalt (DSGVO/DACH)      | €3.000–8.000      | €2.000–5.000       | P0        |
| juris API-Lizenz               | —                 | €15.000–60.000     | P2        |
| BSI C5 Audit                   | €20.000–40.000    | €8.000 (Überwach.) | P3        |
| **Gesamt Phase 1 (12 Monate)** | **~€80.000**      | **~€30.000/Jahr**  |           |

---

## Verantwortlichkeiten

| Aufgabe                       | Verantwortlich          |
| ----------------------------- | ----------------------- |
| Vanta-Onboarding & Controls   | CTO / Engineering Lead  |
| Policy-Dokumentation          | CEO + Rechtsberater     |
| Auditoren-Koordination        | COO / CEO               |
| Technische Controls-Umsetzung | Engineering             |
| BRAK/ÖRAK Kontaktaufnahme     | CEO / Head of Sales     |
| juris/RDB Lizenzverhandlungen | CEO / CPO               |
| Trust Center Page             | Engineering + Marketing |

---

_Zuletzt aktualisiert: Juni 2026. Dieser Plan ist ein lebendes Dokument —
bei jeder Zertifizierungs-Änderung hier updaten und CHANGELOG.md ergänzen._
