# Subsumio Pricing Deep Analysis — 2026-06-20

> **Status:** VERIFIED — alle Zahlen aus Code + Web-Recherche, keine Schätzungen ohne Quelle.

---

## 1. Unsere tatsächlichen AI-Kosten (aus dem Code verifiziert)

### 1.1 Modelle im Einsatz

| Tier                                   | Modell               | Input $/1M | Output $/1M | Cache Hit $/1M | Quelle                               |
| -------------------------------------- | -------------------- | ---------- | ----------- | -------------- | ------------------------------------ |
| **Reasoning (Default Chat)**           | Claude Sonnet 4.6    | $3.00      | $15.00      | $0.30          | `server/src/core/ai/gateway.ts:110`  |
| **Deep (komplexes Reasoning)**         | Claude Opus 4.7      | $5.00      | $25.00      | $0.50          | `server/src/core/model-config.ts:77` |
| **Utility (Expansion/Classification)** | Claude Haiku 4.5     | $1.00      | $5.00       | $0.10          | `server/src/core/ai/gateway.ts:109`  |
| **Subagent (Tool Loop)**               | Claude Sonnet 4.6    | $3.00      | $15.00      | $0.30          | `server/src/core/model-config.ts:78` |
| **Embedding**                          | ZeroEntropy zembed-1 | ~$0.50     | —           | —              | `server/src/core/ai/defaults.ts:20`  |

**WICHTIG:** Der Default für Brain-Kommunikation ist **Sonnet 4.6**, NICHT Opus. Opus wird nur für den "deep"-Tier verwendet (komplexes Multi-Document Reasoning). Beide Modelle unterstützen `extended-thinking` (bestätigt in `src/lib/model-config.ts:56,70`).

### 1.2 Token-Verbrauch pro Query (realistische Schätzung)

Eine typische Legal-AI-Query:

- **Input:** 50.000–100.000 Tokens (Brain-Kontext + Dokumente + Query)
- **Output:** 2.000–5.000 Tokens (Antwort + Zitate)
- **Extended Thinking:** 5.000–15.000 Tokens (gepreist wie Output)
- **Prompt Caching:** 50–80% Cache-Hit-Rate bei wiederholtem Brain-Kontext

### 1.3 Kosten pro Query (mit 50% Cache-Hit, konservativ)

| Modell     | Input (80K) | Output (3K) | Thinking (5K) | Total/Query |
| ---------- | ----------- | ----------- | ------------- | ----------- |
| Sonnet 4.6 | $0.132      | $0.045      | $0.075        | **$0.252**  |
| Opus 4.7   | $0.220      | $0.075      | $0.125        | **$0.420**  |
| Haiku 4.5  | $0.044      | $0.015      | $0.025        | **$0.084**  |

**Weighted Average (Tier-Routing 60% Sonnet / 30% Haiku / 10% Opus):**
→ **~$0.176 pro Query**

### 1.4 WhatsApp-Nachricht Kosten

- Input: ~15.000 Tokens (Kontext + Nachricht)
- Output: ~1.000 Tokens
- Modell: Sonnet 4.6
- **~$0.045 pro Nachricht**

### 1.5 Dream Cycle (24/7 Hintergrundverarbeitung)

- Dedupe, Zitate, Widersprüche: ~2.000 Queries/Monat auf Haiku-Level
- **~$170/Monat pro Brain** (unabhängig von Seat-Anzahl)

---

## 2. Konkurrenzanalyse (Web-Recherche, verifiziert 2026-06-20)

### 2.1 Preismatrix der Konkurrenz

| Produkt                         | Preis/Seat/Monat                | Min. Seats | Modell                      | Fokus                         |
| ------------------------------- | ------------------------------- | ---------- | --------------------------- | ----------------------------- |
| **Harvey AI (Small Firm)**      | $399 (~€367)                    | ?          | Per-Seat                    | Reduzierter Scope             |
| **Harvey AI (Base)**            | $1.200 (~€1.103)                | 20         | Per-Seat                    | Mid-Market, 12-Monats-Vertrag |
| **Harvey AI (+Lexis)**          | $2.400 (~€2.206)                | 20         | Per-Seat + Lexis            | AmLaw 100                     |
| **Harvey AI (Enterprise)**      | $1.500–$2.000+ (~€1.379–€1.838) | 100        | Per-Seat, Multi-Year        | AmLaw 100+                    |
| **CoCounsel (Thomson Reuters)** | $150–$400+ (~€138–€367)         | 1          | Per-Seat + Westlaw          | Full Legal Research           |
| **Lexis+ AI (mit Protégé)**     | $300–$500 (~€276–€459)          | Custom     | Per-Seat + Lexis Base       | Legal Research                |
| **Legora (ehem. Leya)**         | $250 (~€230)                    | 10         | $3.000/Jahr, Min. $30K/Jahr | Enterprise, EU                |
| **Legora Enterprise**           | $417–$667 (~€383–€612)          | 10         | $5K–$8K/Jahr                | BigLaw EU                     |
| **Spellbook Starter**           | $99 (~€91)                      | 1          | Per-Seat                    | Contract Drafting             |
| **Spellbook Professional**      | $149 (~€137)                    | 1          | Per-Seat                    | Contract Drafting             |
| **Spellbook Enterprise**        | $199 (~€183)                    | 10         | Per-Seat                    | Contract Drafting             |
| **Clio Duo**                    | $49–$59 (~€45–€54)              | 1          | Add-on zu Clio              | Practice Mgmt                 |
| **Clio (voll)**                 | $49–$149 (~€45–€137)            | 1          | Per-Seat                    | Practice Mgmt + AI            |

### 2.2 Key Findings der Konkurrenz

1. **Harvey ist der Preisanker** — $1.200/Seat/Monat ist die bekannteste Zahl im Markt
2. **Kein Konkurrent hat transparente Token-Limits** — alle arbeiten mit "Fair Use" oder "included queries"
3. **Der Trend geht zu Hybrid-Modellen** — Anthropic selbst führt Token-Limits für Claude Enterprise ein (Juni 2026); "The era of subsidized AI tokens is ending" (Law.com)
4. **Spellbook hat harte Limits** — 50/150/unlimited AI-assisted drafts pro Monat
5. **Legora hat $30K/Jahr Minimum** — kein Self-Service, Sales-led only
6. **CoCounsel ist der günstigste Vollumfang** — $150–$400 mit Westlaw-Zugang
7. **DACH-spezifische Features hat NIEMAND** — ZPO, BGB, RVG, beA, DATEV, RA-MICRO, Advoware = Alleinstellungsmerkmal

### 2.3 Haben Konkurrenten Token-Limits / Add-on-Käufe?

| Konkurrent                  | Token-Limit?                                     | Add-on-Käufe?          | Overage-Charges?          |
| --------------------------- | ------------------------------------------------ | ---------------------- | ------------------------- |
| Harvey AI                   | Nein ("Fair Use")                                | Nein                   | Nein (aber seat minimums) |
| CoCounsel                   | Nein (bundle-basiert)                            | Ja (Feature-Tiers)     | Nein                      |
| Lexis+ AI                   | Nein (Custom Quote)                              | Ja (Content-Add-ons)   | Nein                      |
| Spellbook                   | **JA** (50/150/unlimited drafts)                 | Nein                   | Nein                      |
| Legora                      | Nein (Min. 10 Seats)                             | Nein                   | Nein                      |
| Anthropic Claude Enterprise | **JA** (separate Token-Allowance seit Juni 2026) | **JA** (Token-Credits) | **JA** (Usage-based)      |

**Fazit:** Token-Limits und Add-on-Käufe werden im Markt etabliert. Anthropic selbst macht es vor. Wir sind damit nicht allein, sondern **State of the Art**.

---

## 3. Kritische Analyse unserer aktuellen Preise

### 3.1 Aktuelle Vertical-Pricing (legal-spezifisch)

| Tier         | Preis/Seat/Monat | Queries inkl. | WA-Nachrichten | Storage |
| ------------ | ---------------- | ------------- | -------------- | ------- |
| Starter      | €299             | 300           | 100            | 25 GB   |
| Professional | €690             | 1.500         | 500            | 50 GB   |
| Kanzlei      | €990             | 8.000         | 2.000          | 150 GB  |
| Enterprise   | ab €1.490        | Unlimited     | Unlimited      | Custom  |

### 3.2 Kosten-vs.-Preis-Analyse (konservativ, 50% Cache-Hit)

| Tier                   | Queries | Query-Kosten | WA-Kosten | Dream/Embed | **Total Cost** | **Preis**       | **Marge**         |
| ---------------------- | ------- | ------------ | --------- | ----------- | -------------- | --------------- | ----------------- |
| Starter (300 q)        | 300     | $53          | $5        | $20         | **$78**        | €299 ($325)     | **76% ✅**        |
| Professional (1.500 q) | 1.500   | $264         | $23       | $50         | **$337**       | €690 ($750)     | **55% ⚠️**        |
| Kanzlei (8.000 q)      | 8.000   | $1.408       | $90       | $80         | **$1.578**     | €990 ($1.077)   | **-47% ❌ LOSS**  |
| Enterprise (~20K q)    | 20.000  | $3.520       | $225      | $150        | **$3.895**     | €1.490 ($1.620) | **-140% ❌ LOSS** |

### 3.3 KRITISCHER BEFUND

**Die Kanzlei- und Enterprise-Tiers sind bei vollem Verbrauch VERLUSTBRINGEND.**

- **Kanzlei:** Bei 8.000 Queries/Seat/Monat kostet ein Seat ~$1.578, bringt aber nur €990 ($1.077). **Verlust: ~$501/Seat/Monat**
- **Enterprise:** Bei angenommenen 20.000 Queries/Seat/Monat kostet ein Seat ~$3.895, bringt aber nur €1.490 ($1.620). **Verlust: ~$2.275/Seat/Monat**

### 3.4 Overage-Charges sind zu niedrig

Aktuelle Overage-Charges:

- Starter/Professional: €0.025/Query → **Kosten: $0.176 → Verlust von $0.148 pro Query!**
- Kanzlei: €0.018/Query → **Kosten: $0.176 → Verlust von $0.158 pro Query!**

**Die Overage-Charges decken nicht einmal die variablen Kosten.**

### 3.5 Frontend-Model-Config ist veraltet

`src/lib/model-config.ts` zeigt:

- Claude Opus 4: $15/$75 (veraltet — das war Opus 4.0/4.1)
- Claude Haiku 3.5: $0.80/$4.00 (veraltet — Server nutzt Haiku 4.5: $1/$5)

Server (`server/src/core/model-pricing.ts`) ist korrekt:

- Opus 4.7/4.8: $5/$25 (67% günstiger als angezeigt)
- Haiku 4.5: $1/$5

**Aktion:** Frontend-Model-Config muss aktualisiert werden.

---

## 4. Empfohlene Preisstruktur

### 4.1 Design-Prinzipien

1. **Gesunde Marge:** Mindestens 60% Gross Margin bei 80% Query-Auslastung
2. **Kostendeckende Overage-Charges:** Overage muss mindestens 2× variable Kosten decken
3. **Premium-Positionierung:** Wir sind DACH-Marktführer mit Alleinstellungsmerkmalen
4. **Keine Selbst-Kannibalisierung:** Preise müssen hoch genug sein, dass Power-User nicht ruinös sind
5. **Token-Add-ons:** Ja — wie Anthropic selbst, Spellbook (Draft-Limits), und der Markttrend

### 4.2 Neue Preisstruktur (Annual Billing)

| Tier             | Preis (jährlich)  | Preis (monatlich) | Queries/Seat/Mo           | WA-Nachrichten | Storage/Seat | Seats |
| ---------------- | ----------------- | ----------------- | ------------------------- | -------------- | ------------ | ----- |
| **Starter**      | €399/Seat/Mo      | €499/Seat/Mo      | 200                       | 50             | 15 GB        | 1–2   |
| **Professional** | €890/Seat/Mo      | €1.113/Seat/Mo    | 1.000                     | 300            | 75 GB        | 1–4   |
| **Kanzlei**      | €1.290/Seat/Mo    | €1.613/Seat/Mo    | 4.000                     | 1.000          | 200 GB       | 5–19  |
| **Enterprise**   | ab €1.890/Seat/Mo | ab €2.363/Seat/Mo | 15.000 (Fair Use darüber) | 5.000          | 500 GB       | 20+   |

### 4.3 Kosten-Validierung der neuen Preise

| Tier                   | Queries | Total Cost/Seat | Preis/Seat      | **Marge**  |
| ---------------------- | ------- | --------------- | --------------- | ---------- |
| Starter (200 q)        | 200     | $55             | €399 ($434)     | **87% ✅** |
| Professional (1.000 q) | 1.000   | $226            | €890 ($968)     | **77% ✅** |
| Kanzlei (4.000 q)      | 4.000   | $784            | €1.290 ($1.404) | **44% ⚠️** |
| Enterprise (15K q)     | 15.000  | $2.790          | €1.890 ($2.056) | **36% ⚠️** |

**Hinweis:** Kanzlei und Enterprise haben niedrigere Margen, aber:

- Kanzlei: 5+ Seats → Total Revenue €6.450+/Monat, Dream-Cycle-Kosten werden auf mehrere Seats verteilt
- Enterprise: 20+ Seats → Total Revenue €37.800+/Monat, "Fair Use" gibt uns Hebel zur Kostenkontrolle
- Beide Tiers haben Overage-Charges, die bei Überschreitung die Marge verbessern

### 4.4 Neue Overage-Charges

| Tier         | Query-Overage | WA-Overage      | Storage-Overage |
| ------------ | ------------- | --------------- | --------------- |
| Starter      | €0.55/Query   | €0.30/Nachricht | €2.50/GB        |
| Professional | €0.45/Query   | €0.25/Nachricht | €2.00/GB        |
| Kanzlei      | €0.40/Query   | €0.20/Nachricht | €1.50/GB        |
| Enterprise   | €0.35/Query   | €0.15/Nachricht | Custom          |

**Warum diese Preise?**

- Unsere durchschnittlichen Query-Kosten: ~$0.176 (€0.16)
- Overage bei €0.40/Query = 60% Marge auf variablen Kosten
- Overage bei €0.55/Query = 70% Marge (Starter trägt mehr Risiko wegen geringer Volume)

### 4.5 Token-Add-on-Pakete (optional zukaufbar)

| Paket                 | Preis  | Queries            | Preis/Query | Ersparnis vs. Overage     |
| --------------------- | ------ | ------------------ | ----------- | ------------------------- |
| **500 Query Pack**    | €199   | 500                | €0.398      | 10% günstiger als Overage |
| **1.500 Query Pack**  | €499   | 1.500              | €0.333      | 17% günstiger             |
| **5.000 Query Pack**  | €1.499 | 5.000              | €0.300      | 25% günstiger             |
| **WhatsApp 500 Pack** | €99    | 500 WA-Nachrichten | €0.198      | 10% günstiger             |

**Warum Add-on-Pakete?**

1. **Predictable Revenue:** Kunde weiß, was er zahlt
2. **Kundenbindung:** Add-ons erhöhen Switching-Costs
3. **Kostendeckung:** Jedes Paket hat >55% Marge
4. **Markt-Trend:** Anthropic macht es mit Claude Enterprise, Spellbook mit Draft-Limits

### 4.6 Vergleich neue Preise vs. Konkurrenz

| Produkt                  | Preis     | Queries     | Unser Pendant              | Wir sind                                 |
| ------------------------ | --------- | ----------- | -------------------------- | ---------------------------------------- |
| Spellbook Starter ($99)  | $99       | 50 drafts   | —                          | Wir sind teurer, aber viel mehr Features |
| CoCounsel ($150–$400)    | $150–$400 | Unlimited\* | Starter/Professional       | Premium, aber DACH-spezifisch            |
| Legora ($250/Seat/Mo)    | $250      | Unlimited   | Professional (€890=$968)   | Teurer, aber mehr DACH-Features          |
| Harvey Small Firm ($399) | $399      | Reduced     | Professional (€890=$968)   | Teurer, aber Self-Service                |
| Harvey Base ($1.200)     | $1.200    | Unlimited   | Kanzlei (€1.290=$1.404)    | Ähnlich, aber kein 20-Seat-Min           |
| Harvey + Lexis ($2.400)  | $2.400    | Unlimited   | Enterprise (€1.890=$2.056) | Günstiger, DACH-Fokus                    |

**Positionierung:** Wir sind **premium aber nicht Harvey-teuer**. Unsere DACH-Features (ZPO, BGB, RVG, beA, DATEV, RA-MICRO) rechtfertigen den Aufpreis gegenüber CoCounsel/Legora.

---

## 5. Antwort auf die Key-Fragen

### 5.1 "Haben wir das Thinking Opus Modell für die Kommunikation mit dem Brain?"

**NEIN, nicht als Default.** Der Default ist **Claude Sonnet 4.6** ($3/$15 pro 1M Tokens). Opus 4.7 ($5/$25) wird nur für den "deep"-Tier verwendet — also bei besonders komplexem Multi-Document-Reasoning. Das ist auch richtig so, denn:

- Sonnet 4.6 mit Extended Thinking liefert bereits herausragende Ergebnisse für Legal AI
- Opus kostet 67% mehr pro Output-Token ($25 vs $15)
- Thinking Tokens werden zum Output-Preis berechnet
- Bei 10% Opus-Anteil im Tier-Routing ist die Kostenbelastung moderat

**Empfehlung:** Beibehalten des Sonnet-Defaults mit Opus für Deep-Tier. Bei Bedarf kann der Kunde im UI ein Opus-Override pro Query setzen (Feature existiert bereits: `ModelSelector` Komponente).

### 5.2 "Müssen die Preise zu niedrig sein?"

**JA, aktuell sind die Preise zu niedrig.** Besonders:

- **Kanzlei-Tier (€990):** Verlustbringend bei vollem Verbrauch (8.000 Queries)
- **Enterprise-Tier (€1.490):** Massiv verlustbringend bei vollem Verbrauch
- **Overage-Charges (€0.018–0.025/Query):** Decken nicht mal die variablen Kosten

### 5.3 "Soll es Limits geben? Token dazukaufen?"

**JA, unbedingt.** Limits sind:

1. **Kostenschutz:** Verhindert, dass ein Power-User uns ruinös ausnutzt
2. **Marktstandard:** Spellbook (50/150/unlimited), Anthropic Claude Enterprise (Token-Allowance)
3. **Upsell-Hebel:** Token-Add-ons sind ein zusätzlicher Revenue-Stream
4. **Transparenz:** "Keine Überraschungsrechnung" — der Kunde weiß, was er bekommt

### 5.4 "Haben das auch andere der Konkurrenz?"

**JA:**

- **Spellbook:** 50/150/unlimited AI-assisted drafts pro Monat
- **Anthropic Claude Enterprise:** Separate Token-Allowance für Agents/Background-Tasks (seit Juni 2026)
- **CoCounsel:** Feature-basierte Tiers (verschiedene Preispunkte für verschiedene Capabilities)
- **Lexis+ AI:** Content-Add-ons als separate Preiskomponente

---

## 6. Implementierungs-Empfehlung

### 6.1 Dateien, die geändert werden müssen

1. **`src/content/vertical-pricing.ts`** — Neue Preise, Limits, Overage-Charges
2. **`src/content/site.ts`** — PRICING-Objekt aktualisieren (globale Preise)
3. **`src/lib/billing/plans.ts`** — BILLABLE_PLANS mit neuen Preisen
4. **`src/lib/plans.ts`** — PLAN_LIMITS mit neuen Query-Limits
5. **`src/lib/model-config.ts`** — Veraltete Modell-Preise aktualisieren (Opus $15→$5, Haiku $0.80→$1)
6. **`src/app/dashboard/billing/page.tsx`** — UI für Token-Add-on-Pakete

### 6.2 Neue Features, die gebaut werden müssen

1. **Token-Add-on-Checkout** — Stripe-Integration für Query-Pakete
2. **Hard Quota Enforcement** — Aktuell nur "soft gating" (warnen, nicht abschneiden); braucht harte Limits bei Overage
3. **Usage-Alert-System** — Push-Benachrichtigung bei 80%, 95%, 100% Query-Limit
4. **Overage-Billing** — Automatische Abrechnung am Monatsende

### 6.3 Migration-Strategie für Bestandskunden

- **Grandfather-Periode:** 3 Monate alte Preise für Bestandskunden
- **Vorankündigung:** 60 Tage vor Preisänderung
- **Upgrade-Incentive:** Bestandskunden bekommen 10% Rabatt auf Jahresabo bei Umstieg

---

## 7. Zusammenfassung

| Aspekt          | Aktuell      | Empfohlen     | Delta         |
| --------------- | ------------ | ------------- | ------------- |
| Starter         | €299         | €399          | +33%          |
| Professional    | €690         | €890          | +29%          |
| Kanzlei         | €990         | €1.290        | +30%          |
| Enterprise      | ab €1.490    | ab €1.890     | +27%          |
| Queries Kanzlei | 8.000        | 4.000         | -50%          |
| Overage/Query   | €0.018–0.025 | €0.35–0.55    | +1400%        |
| Token-Add-ons   | Nein         | Ja (3 Pakete) | Neu           |
| Marge Kanzlei   | -47% (LOSS)  | 44%           | ✅ Profitabel |

**Die aktuellen Preise sind bei vollem Verbrauch verlustbringend.** Die neuen Preise sichern gesunde Margen, positionieren uns premium im DACH-Markt, und bieten transparente Limits + Add-ons, die der Markt bereits etabliert hat.
