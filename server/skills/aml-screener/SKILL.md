---
name: aml-screener
version: 1.0.0
description: |
  AML/KYC compliance screening for law firms, banks, and insurance companies.
  Screens entities (persons, companies) against: brain-indexed sanction lists
  (OFAC, EU, UN, HM Treasury), PEP categories, adverse media patterns,
  and internal risk criteria. Outputs a structured compliance report with
  risk rating and required due diligence steps per GwG (DE), FM-GwG (AT),
  GwG (CH), and AMLD6 (EU). For live sanctions data, calls the external
  sanctions API if configured (SANCTIONS_API_URL env var).
triggers:
  - "AML-Prüfung"
  - "KYC-Check"
  - "Sanktionslistenprüfung"
  - "PEP-Prüfung"
  - "Geldwäscheprüfung"
  - "aml screening"
  - "kyc check"
  - "sanction screening"
  - "screen this entity"
  - "Mandantenprüfung GwG"
  - "Sorgfaltspflichten"
  - "due diligence"
  - "Compliance-Check"
  - "politically exposed person"
priority: 75
tools:
  - search
  - query
  - get_page
  - put_page
  - extract_facts
  - add_timeline_entry
mutating: true
---

# AML Screener Skill

> **Compliance note:** This skill supports, but does NOT replace, required human AML officer review.
> **Regulatory basis:** § 10 GwG (DE), § 6 FM-GwG (AT), Art. 13 AMLD6 (EU).
> **Data:** Brain-indexed data only + optional external sanctions API.

## Contract

1. Every hit is evidence-based — no false positives without source
2. Risk rating follows standardized 4-tier scale: Low / Medium / High / Prohibited
3. Required CDD/EDD steps are listed per regulatory framework
4. Screening timestamp and version are recorded for audit trail

## Protocol

### Step 1 — Collect Entity Data

Required:

- **Name** (full legal name, incl. aliases / maiden names)
- **Entity type**: Natürliche Person / Juristische Person / Personengesellschaft
- **Jurisdiction**: where incorporated/resident
- **Nationality** (persons)
- **Date of birth / incorporation date**
- **Beneficial owners** (for companies: UBO ≥ 25% per § 19 GwG)

Optional (increases accuracy):

- Passport / ID number
- Tax ID (Steuer-ID, UID-Nummer, USt-IdNr.)
- Known associates

### Step 2 — Brain Sanctions Search

```
gbrain search "[name] Sanktion OFAC EU SDN" --mode balanced
gbrain search "[name] PEP politisch exponiert" --mode balanced
gbrain search "[company] Beneficial Owner Struktur" --mode balanced
```

### Step 3 — Risk Factor Assessment

Score each factor:

| Factor                       | Weight   | Indicators                                           |
| ---------------------------- | -------- | ---------------------------------------------------- |
| Sanctions list hit           | CRITICAL | OFAC SDN, EU Art. 6(2) AMLD, UN Security Council     |
| PEP status                   | HIGH     | Government official, senior executive, family member |
| High-risk country            | HIGH     | FATF grey/black list, EU high-risk third countries   |
| Complex ownership            | MEDIUM   | >3 layers, offshore UBO, nominee structures          |
| Adverse media                | MEDIUM   | Financial crime, fraud, corruption allegations       |
| Cash-intensive business      | MEDIUM   | Casinos, car dealerships, real estate                |
| Unusual transaction patterns | HIGH     | Structuring, round amounts, no economic purpose      |

### Step 4 — Output Report

```markdown
## AML/KYC Screening Report

**Entity:** [Name]
**Type:** [Natürliche Person / Juristische Person]
**Screening Date:** [Datum]
**Screened By:** AML-Screener Skill v1.0.0
**Regulatory Framework:** GwG (DE) / FM-GwG (AT) / AMLD6

---

### 🎯 Overall Risk Rating: 🟢 Low / 🟡 Medium / 🔴 High / 🚫 Prohibited

**Basis:** [1 sentence justification]

---

### Sanctions Check

- OFAC SDN: ✅ No match / 🚫 MATCH — [Details]
- EU Consolidated List: ✅ No match / 🚫 MATCH
- UN Security Council: ✅ No match / 🚫 MATCH
- HM Treasury: ✅ No match / 🚫 MATCH
- National lists (BaFin, FMA): ✅ No match / 🚫 MATCH

### PEP Assessment

- PEP Status: ✅ Not a PEP / ⚠️ PEP — [Category, Country, Function]
- Family/Close Associates: ✅ None identified / ⚠️ [Details]

### Country Risk

- Jurisdiction: [Country] — [FATF status: Compliant / Grey List / Black List]
- Business countries: [List]

### Beneficial Ownership (Juristische Personen)

- UBO identified: ✅ / ⚠️ Not fully identified
- UBO 1: [Name, %, nationality]
- Complex structure: ✅ No / ⚠️ Yes — [Details]

### Adverse Media

- Financial crime: ✅ None / ⚠️ [Source, date, allegation]
- Regulatory sanctions: ✅ None / ⚠️ [Details]

---

### Required Due Diligence Steps

#### Simplified CDD (§ 14 GwG) — only if Low risk:

- [ ] Identity document verification
- [ ] Business relationship purpose

#### Standard CDD (§ 10 GwG):

- [ ] Identity document + verification
- [ ] UBO identification (§ 11 GwG)
- [ ] Purpose of business relationship
- [ ] Ongoing monitoring

#### Enhanced CDD (§ 15 GwG) — required for High/PEP:

- [ ] Senior management approval
- [ ] Source of funds verification
- [ ] Source of wealth verification
- [ ] Enhanced ongoing monitoring (quarterly)
- [ ] Annual review

#### Prohibited — DO NOT ONBOARD:

- [ ] Report suspicious activity (§ 43 GwG, § 16 FM-GwG)
- [ ] Do not tip off (§ 47 GwG)

---

### Audit Trail

- Screening ID: [UUID]
- Next review due: [Date — 12 months]
- Screened against: Brain corpus [date indexed]
```

### Step 5 — File and Set Review Reminder

```
gbrain put_page \
  --slug "legal/aml/screening-[entity-slug]-[date]" \
  --type "legal_document" \
  --metadata '{"document_type": "aml_screening", "risk_level": "[low|medium|high|prohibited]", "next_review": "[date]"}'

gbrain add_timeline_entry \
  --date "[next_review_date]" \
  --text "AML Annual Review due for [entity_name]" \
  --tags ["aml", "review", "compliance"]
```

## Prohibited Activities (GwG § 43)

If a sanctions hit is confirmed OR the risk is PROHIBITED:

1. **Do NOT complete the transaction** (§ 46 GwG)
2. **File Suspicious Activity Report (SAR)** with FIU within 3 business days (§ 43 GwG)
3. **Do NOT inform the customer** (§ 47 GwG Tipping-off prohibition)
4. **Document everything** including timing and decision chain

## Anti-Patterns

- ❌ Auto-onboarding on a confirmed sanctions hit, or proceeding without an AML-officer decision.
- ❌ Tipping off the subject (§ 47 GwG) — never disclose that screening/SAR is underway.
- ❌ Treating "no match" as cleared without checking name variants, aliases and beneficial owners (UBO ≥ 25 %).
- ❌ Skipping enhanced due diligence (§ 15 GwG) for PEPs or high-risk jurisdictions.

## Output Format

A structured AML/KYC screening report: entity + type, overall risk rating
(Low / Medium / High / Prohibited), sanctions / PEP / country-risk / beneficial-
ownership / adverse-media sections, the required CDD/EDD steps per framework, and
an audit-trail stamp (screening id, next review date). See "Step 4 — Output Report".
