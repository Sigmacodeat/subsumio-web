# Subsumio Global Expansion Playbook — Juni 2026

> **Zweck:** Dieses Dokument ist der permanente Leitfaden fuer die globale Expansion von Subsumio. Es wird gespeichert, damit wir nicht vergessen, welche Maerkte wir targetieren wollen, in welcher Reihenfolge, und was dafuer noetig ist.

---

## 1. Expansion-Philosophie: Pipeline-First

Subsumios Architektur ist **jurisdiktions-agnostisch** gebaut:

```
law-corpus/{land}/{gesetz}.md  →  GBrain Engine  →  AI Pipeline  →  Dashboard (i18n)
```

**Neuer Markt = 3 Schritte:**

1. **Gesetzes-Corpus einpflegen** — `law-corpus/{land}/` Verzeichnis mit Gesetzen als Markdown
2. **Sprache hinzufuegen** — i18n Keys + AI Modelle in Zielsprache
3. **Lokalen Partner finden** — Kanzlei fuer Validation + Go-to-Market + Revenue Share

**Das ist der Competitive Advantage.** Kein Legacy-Player (LexisNexis, Thomson Reuters) und kein AI-Player (Harvey, Legora) hat diese Architektur. Die meisten haben hartkodierte jurisdiktionsspezifische Logik.

---

## 2. Phasen-Roadmap

### PHASE 0 — DACH (Current) ✅

- **Maerkte:** Deutschland, Oesterreich, Schweiz
- **Anwaelte:** ~193.000
- **TAM:** $2-3B
- **Status:** Produktionsreif. GoBD, RVG, BRAO, beA, DSGVO alle implementiert.
- **Naechstes:** Marktdurchdringung erhoehen, Reference Customers gewinnen.

### PHASE 1 — Europaische Quick Wins (0-6 Monate)

| Markt       | Anwaelte | Dichte    | Aufwand | Warum?                                                                                               |
| ----------- | -------- | --------- | ------- | ---------------------------------------------------------------------------------------------------- |
| **Italien** | ~240.000 | 403/100k  | Mittel  | Groesster unversorgte EU-Markt. Romanistik-Recht aehnlich DACH. Italienisch als Sprache hinzufuegen. |
| **Spanien** | ~55.000  | 325/100k  | Mittel  | Tuer zu LATAM. Spanisch = 2. groesste Sprache weltweit.                                              |
| **Polen**   | ~40.000  | ~100/100k | Niedrig | EU-Mitglied, aehnliche Struktur. Polnisch. Warschau = booming legal market.                          |

**Aufwand pro Markt:**

- law-corpus: ~20-40 Gesetze als Markdown (2-3 Wochen pro Land)
- i18n: ~200-400 neue Keys (1-2 Wochen)
- Partner: 1-2 Referenzkanzleien fuer Validation (parallel)
- Compliance: EU-DSGVO bereits abgedeckt, lokale Kanzleiregeln anpassen

### PHASE 2 — MENA Expansion (6-18 Monate)

| Markt             | Anwaelte | Aufwand | Warum?                                                                     |
| ----------------- | -------- | ------- | -------------------------------------------------------------------------- |
| **Tuerkei**       | ~50.000  | Mittel  | Nur 1 AI-Player (LexVira). Zivilrecht aehnlich DACH. Tuerkisch + Englisch. |
| **Aegypten**      | ~30.000+ | Hoch    | Groesste MENA-Bevoelkerung (110M). Arabisch + Sharia.                      |
| **UAE**           | ~8.000+  | Niedrig | DIFC = Common Law (Englisch!). Gateway zu GCC.                             |
| **Saudi-Arabien** | ~10.000+ | Hoch    | Vision 2030. In-Kingdom hosting Pflicht. Arabic-first.                     |

**Aufwand pro MENA-Markt:**

- law-corpus: Arabisch/Tuerkisch + Sharia-Recht (komplexer, 4-6 Wochen)
- i18n: RTL-Support fuer Arabisch noetig (2 Wochen)
- Data Sovereignty: Lokale Hosting-Option (AWS Bahrain/Riyadh)
- Partner: Lokale Kanzlei + Government Relations

### PHASE 3 — Lateinamerika (12-24 Monate)

| Markt             | Anwaelte  | Aufwand      | Warum?                                                  |
| ----------------- | --------- | ------------ | ------------------------------------------------------- |
| **Argentinien**   | ~50.000+  | Niedrig      | Spanisch aus Phase 1. 3.-hoechste Anwaltsdichte in LA.  |
| **Dom. Republik** | ~30.000+  | Sehr niedrig | 565/100k = 2. weltweit! Spanisch. Fast null Konkurrenz. |
| **Peru**          | ~20.000+  | Niedrig      | Spanisch. Fast unversorgt.                              |
| **Mexiko**        | ~100.000+ | Mittel       | Spanisch. Grosser Markt, moderate Konkurrenz.           |

**Aufwand pro LATAM-Markt:**

- law-corpus: Spanisch + lokales Zivilrecht (2-3 Wochen, Spanisch bereits aus Phase 1)
- i18n: Minimal (Spanisch bereits vorhanden)
- Compliance: Lokale Datenschutzgesetze (LFPDPPP Mexiko, etc.)
- Partner: Lokale Kanzlei fuer Go-to-Market

### PHASE 4 — Asien-Pazifik (18-36 Monate)

| Markt           | Anwaelte | Aufwand | Warum?                                                   |
| --------------- | -------- | ------- | -------------------------------------------------------- |
| **Philippinen** | ~60.000+ | Niedrig | **Englisch** als Amtssprache! Nur 1 Player (Intellegal). |
| **Vietnam**     | ~10.000+ | Hoch    | 100M Einwohner. Vietnamesisch. 1 Startup (Lawzy).        |
| **Thailand**    | ~20.000+ | Hoch    | 70M Einwohner. Thai. Kaum Player.                        |
| **Indonesien**  | ~30.000+ | Hoch    | 280M Einwohner. Bahasa. TemplarX aber Raum fuer mehr.    |

**Aufwand pro APAC-Markt:**

- law-corpus: Komplex — Common Law (PH) vs Civil Law (VN/TH/ID)
- i18n: Neue Schriftsysteme (Thai, Vietnamese diacritics)
- Partner: Sehr wichtig — kulturelle und regulatorische Besonderheiten

### PHASE 5 — Afrika (24-48 Monate)

| Markt          | Anwaelte | Aufwand | Warum?                                           |
| -------------- | -------- | ------- | ------------------------------------------------ |
| **Nigeria**    | ~80.000+ | Hoch    | Groesster afrikanischer Markt (220M). Englisch.  |
| **Kenia**      | ~5.000+  | Mittel  | 42% AI Adoption. Englisch + Swahili. Tech-affin. |
| **Suedafrika** | ~25.000+ | Niedrig | Reifster Markt. Englisch.                        |

**Aufwand pro Afrika-Markt:**

- law-corpus: Mixed systems (Common Law + customary law + civil law elements)
- Mobile-first zwingend (Afrika = mobile-first)
- Zahlungsinfrastruktur: Mobile Money (M-Pesa, etc.)
- Partner: Sehr lokal — kulturelle Sensitivitaet kritisch

---

## 3. Skip-Liste (vorerst nicht targetieren)

| Markt             | Grund                                                             |
| ----------------- | ----------------------------------------------------------------- |
| **USA**           | Hyper-kompetitiv. Harvey ($11B), Legora, Clio, LexisNexis.        |
| **UK**            | Gesaettigt. Gleiche Player wie USA.                               |
| **China**         | Geschlossener Markt (Great Firewall). Eigene Player (Deli Legal). |
| **Suedkorea**     | SuperLawyer hat 38% aller Anwaelte. Zu dominant.                  |
| **Australien/NZ** | 72+ Plattformen. LEAP/Smokeball/Actionstep Duopol.                |
| **Japan**         | LegalOn + SuperLawyer dringen ein. Geschlossenere Kultur.         |
| **Brasilien**     | 1.1M Anwaelte aber Portugiesisch + extreme Konkurrenz.            |
| **Russland**      | Sanktionen. Isolierter Markt. Eigene Player.                      |

---

## 4. Was pro Markt einpflegt werden muss (Checkliste)

### 4.1 Law Corpus (Gesetze)

```
law-corpus/{land}/
  - {gesetz}.md      # Markdown mit juristischer Struktur
  - {gesetz}.md      # z.B. codice_civile.md fuer Italien
```

- Pro Land: 15-40 Kerngesetze
- Format: Bereits etabliert (siehe law-corpus/de/, law-corpus/at/, law-corpus/ch/)
- Aufwand: 2-6 Wochen pro Land (je nach Komplexitaet)

### 4.2 i18n (Sprache)

- `src/lib/use-lang.ts` — bereits Multi-Language-faehig
- `createT()` Pattern — bereits etabliert
- Neue Sprachen: Italienisch, Spanisch, Polnisch, Tuerkisch, Arabisch (RTL!), etc.
- Aufwand: 1-2 Wochen pro Sprache (UI-Keys)
- AI-Modelle: Muessen in Zielsprache funktionieren (GPT-4/Claude unterstuetzen alle grossen Sprachen)

### 4.3 Compliance (Berufsrecht)

- DACH: GoBD, BRAO, RVG, beA, DSGVO ✅ (bereits vorhanden)
- Italien: Codice Deontologico Forense, GDPR
- Spanien: Estatuto General de la Abogacia, GDPR
- Polen: Kodeks Etyki Adwokackiej, GDPR
- Tuerkei: Avukatlik Kanunu, KVKK
- UAE: DIFC Legal Ethics, UAE Data Protection Law
- Saudi: Saudi Law of Practicing the Legal Profession, PDPL
- Philippinen: Code of Professional Responsibility, Data Privacy Act
- Nigeria: Legal Practitioners Act, NDPR
- Aufwand: 1-2 Wochen pro Land (Recherche + Implementation)

### 4.4 Lokaler Partner

- 1-2 Referenzkanzleien pro Land
- Validation: Gesetzes-Corpus pruefen, AI-Antworten validieren
- Go-to-Market: Empfehlungen, Co-Marketing
- Revenue Share: 10-20% Revenue Share fuer ersten 2 Jahre
- Aufwand: 2-4 Monate Relationship Building (parallel zu technischer Implementation)

### 4.5 Data Sovereignty

- EU: Bereits abgedeckt (DSGVO, EU-Hosting)
- MENA: Lokale Hosting-Option noetig (AWS Bahrain/Riyadh, on-premise)
- Asien: Lokale Hosting je nach Land (AWS Singapore, Tokyo, etc.)
- Afrika: AWS Cape Town oder lokale Provider
- Aufwand: 1-2 Wochen pro Region (Infrastructure-as-Code)

---

## 5. Technische Readiness Check

| Komponente                       | Multi-Laender-faehig?                 | Status                               |
| -------------------------------- | ------------------------------------- | ------------------------------------ |
| **GBrain Engine**                | ✅ Ja — jurisdiktions-agnostisch      | Bereit                               |
| **Law Corpus**                   | ✅ Ja — `law-corpus/{land}/` Struktur | Bereit (DE/AT/CH/EU vorhanden)       |
| **i18n System**                  | ✅ Ja — `useLang`/`createT` Pattern   | Bereit (DE/EN vorhanden)             |
| **Industry Pack**                | ✅ Ja — Registry Pattern              | Bereit (`legal` + `tax` registriert) |
| **DMS**                          | ✅ Ja — Connector Pattern             | Bereit (DATEV, Box, etc.)            |
| **Audit Trail**                  | ✅ Ja — generisch                     | Bereit                               |
| **Permissions**                  | ✅ Ja — RBAC                          | Bereit                               |
| **Billing**                      | ✅ Ja — Multi-Currency                | Bereit                               |
| **Auth/SSO**                     | ✅ Ja — WorkOS                        | Bereit                               |
| **Realtime/Presence**            | ✅ Ja — WS+SSE                        | Bereit                               |
| **Mobile**                       | ✅ Ja — Capacitor                     | Bereit                               |
| **GoBD**                         | ✅ Ja — bereits steuerlich relevant   | Bereit                               |
| **DATEV Integration**            | ✅ Ja — Export/Import vorhanden       | Bereit                               |
| **RTL Support**                  | ❌ Nicht vorhanden                    | **Noetig fuer Arabisch**             |
| **Multi-Jurisdiction Deadlines** | ⚠️ Teilweise — DE/AT/CH Feiertage     | Erweiterbar                          |
| **Multi-Jurisdiction Fee Calc**  | ⚠️ Nur RVG (DE)                       | Erweiterbar                          |

---

## 6. Revenue-Projektion (Konservativ)

| Phase   | Zeitraum   | Target Maerkte | Anwaelte | 1% Penetration | MRR/Anwalt | MRR gesamt |
| ------- | ---------- | -------------- | -------- | -------------- | ---------- | ---------- |
| Phase 0 | Jetzt      | DACH           | 193k     | 1.930          | €89        | €172k      |
| Phase 1 | +6 Monate  | +IT/ES/PL      | 528k     | 5.280          | €79        | €417k      |
| Phase 2 | +18 Monate | +TR/EG/UAE/SA  | 596k     | 5.960          | €69        | €411k      |
| Phase 3 | +24 Monate | +AR/DO/PE/MX   | 750k     | 7.500          | €49        | €367k      |
| Phase 4 | +36 Monate | +PH/VN/TH/ID   | 870k     | 8.700          | €39        | €339k      |
| Phase 5 | +48 Monate | +NG/KE/ZA      | 980k     | 9.800          | €29        | €284k      |

**Gesamt-Potential bei 1% Penetration: ~€2M MRR (~€24M ARR)**

---

_Playbook erstellt: 28. Juni 2026_
_Quelle: GLOBAL_LEGAL_TECH_MARKET_RESEARCH_2026.md_
