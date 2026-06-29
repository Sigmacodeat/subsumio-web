# Hero-Bereich & Startseite — Vollständiges Agentur-Audit

**Datum:** 29. Juni 2026  
**Scope:** Hero-Section, gesamte Startseite (`/`), alle Texte, Animationen, Loading-Verhalten, UX  
**Standard:** Agency-Level für AI-Kanzleisoftware (DACH-Markt)  
**Status:** Pre-Optimierung — Issues identifiziert, Fixes priorisiert

---

## 1. EXECUTIVE SUMMARY

Die Startseite ist architektonisch auf hohem Niveau: Motion-System mit `SplitTextReveal`, `GlowCard`, `MagneticButton`, `GradientMesh`, `ScrollProgress` — das ist State-of-the-Art. Dennoch gibt es **15 signifikante Issues** im Hero-Bereich und **8 im übrigen Seitenverlauf**, die den Agentur-Level-Standard nicht voll erreichen.

### Kernprobleme (kritisch):

1. **Hero H1 zeigt nicht den SEO-Slogan** — `"Subsumio\nDas Kanzlei-Brain."` hardcoded, aber `h1a`/`h1b` in site.ts definiert `"Jede Akte, eine belegte Antwort."` — **SEO-Killer**
2. **Hero-Subtext (t.sub) lädt mit 0.8s Delay** — zu spät für First Contentful Paint
3. **CTA-Buttons erscheinen mit 0.95s Delay** — Conversion-killer auf Mobile
4. **`SplitTextReveal` nutzt `whileInView` statt `animate`** — Hero-Text erscheint erst beim Scrollen, nicht beim Load

### Score-Übersicht:

| Kategorie                | Score | Status                   |
| ------------------------ | ----- | ------------------------ |
| Hero-Animation & Loading | 6/10  | ⚠️ Needs work            |
| Hero-Texte & Messaging   | 5/10  | 🔴 Critical issues       |
| Visuelle Hierarchie      | 8/10  | ✅ Gut                   |
| Motion-System Qualität   | 9/10  | ✅ Exzellent             |
| Section-Rhythm & Tone    | 8/10  | ✅ Gut                   |
| Text-Quality (DE)        | 7/10  | ⚠️ Inkonsistenzen        |
| Text-Quality (EN)        | 8/10  | ✅ Gut                   |
| Accessibility            | 7/10  | ⚠️ Lücken                |
| Performance              | 6/10  | ⚠️ Animation-Overhead    |
| Mobile UX                | 7/10  | ⚠️ Hero-Demo-Platzierung |

---

## 2. HERO-BEREICH — DETAILED AUDIT

### 2.1 H1 Headline — KRITISCH

**File:** `src/components/marketing/landing.tsx:100-113`

```tsx
<SplitTextReveal
  stagger={0.14}
  delay={0.25}
  as="span"
  className="block"
  itemClassName="gradient-text-animated"
>
  {lang !== "en" ? "Subsumio\nDas Kanzlei-Brain." : "Subsumio\nThe firm brain."}
</SplitTextReveal>
```

#### Issues:

**🔴 Issue H1-1: Hardcoded H1 ignoriert site.ts-Content**

- `site.ts` definiert `h1a: "Jede Akte,"`, `h1b: "eine belegte Antwort."` und `h1Keyword: "KI-Kanzleisoftware & Anwaltssoftware mit belegten Antworten"`
- Landing.tsx **ignoriert diese komplett** und zeigt `"Subsumio\nDas Kanzlei-Brain."` hardcoded
- **Auswirkung:** SEO-H1 enthält nicht den primären Keyword-Cluster. Google sieht "Subsumio Das Kanzlei-Brain" statt "Jede Akte, eine belegte Antwort" — der Meta-Title und H1 mismatchen
- **Fix:** H1 sollte `t.h1a` + `t.h1b` verwenden, mit "Subsumio" als visuellem Präfix

**🔴 Issue H1-2: `SplitTextReveal` nutzt `whileInView` statt `animate`**

- `SplitTextReveal` in `motion-system.tsx:643-648` nutzt `whileInView` mit `viewport={VIEWPORT.hero}` (margin: "0px")
- Bei einem Hero above-the-fold bedeutet `whileInView`: es triggert sofort wenn im Viewport — **aber** Framer Motion's `whileInView` hat einen Frame Delay gegenüber `animate`
- Bei schnellen Loads kann der Hero-Text leer erscheinen für 1-2 Frames
- **Fix:** Für Hero-Content `initial="hidden" animate="visible"` verwenden statt `whileInView`

**🟡 Issue H1-3: `gradient-text-animated` auf slate-Tone**

- Hero ist `tone="slate"` (dunkel). `gradient-text-animated` nutzt `var(--brand-secondary)` → `var(--brand-primary)` → `var(--brand-tertiary)` — auf dunklem Hintergrund kann der Kontrast marginal sein
- **Prüfung:** WCAG AA Kontrast für gradient-text auf `#07091a` Hintergrund — brand-secondary ist violet, könnte unter 4.5:1 fallen
- **Fix:** Hellere Gradient-Stopps für slate/dark tone oder `hero-gradient-text` Klasse verwenden

### 2.2 Hero Badge — Gut, aber Optimierbar

**File:** `landing.tsx:85-99`

```tsx
<motion.div
  initial={reduce ? false : { opacity: 0, y: 12, scale: 0.96 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.dramatic, delay: 0.15 }}
  className="group relative mb-8 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ..."
>
```

**✅ Gut:**

- Spring-in animation mit `EASE.dramatic` — agency-grade
- Badge-Pulse dot — subtil, nicht aufdringlich
- Hover rotating border glow — premium detail

**🟡 Issue B-1: Badge-Text hardcoded statt `t.badge`**

- `landing.tsx:96-98`: `lang !== "en" ? "KI-Kanzleisoftware für AT · DE · CH" : "AI legal software for AT · DE · CH"`
- `site.ts:1652`: `badge: "KI-Kanzleisoftware für AT · DE · CH"` — **identisch**, aber DRY-Verletzung
- AT/CH haben eigene Replacements, aber der Badge-Text wird nicht durch `t.badge` gezogen
- **Fix:** `{t.badge}` verwenden

**🟡 Issue B-2: Badge-Text für IT/ES/PL/FR/NL nicht übersetzt**

- `LANDING.it/es/pl/fr/nl` werden via `applyReplacements` erzeugt, aber der Badge-Text in landing.tsx ist hardcoded `lang !== "en"` → fällt auf DE zurück
- **Fix:** `{t.badge}` verwenden, dann werden die Replacements korrekt angewendet

### 2.3 Hero Subtext — Loading zu spät

**File:** `landing.tsx:114-121`

```tsx
<motion.p
  initial={reduce ? false : { opacity: 0, y: 16, filter: "blur(6px)" }}
  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
  transition={reduce ? { duration: 0 } : { duration: 0.7, ease: EASE.dramatic, delay: 0.8 }}
>
  {t.sub}
</motion.p>
```

**🔴 Issue S-1: 0.8s Delay für Subtext**

- Der Subtext ist der wichtigste SEO-Text nach H1 — er enthält "KI-Kanzleisoftware für Rechtsanwälte in Österreich, Deutschland und der Schweiz"
- Bei 0.8s Delay ist dieser Text **0.8 Sekunden unsichtbar** nach Page-Load
- Google's CWV (LCP) misst den größten Text-Block — das könnte der Subtext sein
- **Fix:** Delay auf 0.4s reduzieren, Duration auf 0.5s

**🟡 Issue S-2: `filter: "blur(6px)"` Animation**

- Blur-Filter-Animationen sind GPU-intensiv und können auf Low-End-Devices ruckeln
- Auf Safari (iOS) kann `filter: blur()` während Animation zu Performance-Issues führen
- **Fix:** Blur auf 3px reduzieren oder durch `opacity`-only ersetzen

### 2.4 CTA-Buttons — Conversion-Killer Delay

**File:** `landing.tsx:122-140`

```tsx
<motion.div
  initial={reduce ? false : { opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.dramatic, delay: 0.95 }}
>
```

**🔴 Issue C-1: 0.95s Delay für CTAs**

- Die primären CTAs ("14 Tage kostenlos testen" und "Preise ansehen") erscheinen erst nach **fast 1 Sekunde**
- Auf Mobile (wo ~60% der Kanzlei-Entscheider browsen) ist das eine Ewigkeit
- Conversion-Forschung: CTAs sollten innerhalb 500ms sichtbar sein
- **Fix:** Delay auf 0.55s reduzieren

**🟡 Issue C-2: Secondary CTA ist `variant="ghost"`**

- "Preise ansehen" als `ghost`-Button ist auf slate-Tone fast unsichtbar
- Auf dunklem Hintergrund sollte mindestens `secondary` oder `outline` verwendet werden
- **Fix:** `variant="secondary"` oder `variant="outline"`

**🟡 Issue C-3: Trust-Zeile mit 1.05s Delay**

- "14 Tage Reverse Trial · 14 Tage Geld-zurück-Garantie · Keine Kreditkarte erforderlich" — wichtige Trust-Signals
- 1.05s Delay ist zu spät
- **Fix:** Mit CTA-Buttons zusammen bei 0.55s laden

### 2.5 Hero Live-Demo — Placement

**File:** `landing.tsx:151-158`

```tsx
<div
  id="demo"
  data-tone="dashboard"
  className="mx-auto max-w-3xl scroll-mt-24 rounded-2xl shadow-[0_0_60px_rgba(56,189,248,0.12)] ring-1 ring-white/[0.08]"
>
  <LiveDemo lang={lang} {...t.demo} />
</div>
```

**✅ Gut:**

- Live-Demo im Hero = exzellenter "Show, don't tell" Ansatz
- `data-tone="dashboard"` für korrekte Theme-Auflösung
- Shadow und Ring für Tiefe

**🟡 Issue D-1: Demo lädt ohne Animation**

- Die Live-Demo hat keine `motion.div` Wrapper — sie erscheint sofort
- Das bricht den kaskadierenden Animation-Flow (Logo → Badge → H1 → Subtext → CTA → Demo)
- **Fix:** `motion.div` mit `initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.6 }}`

**🟡 Issue D-2: Demo auf Mobile zu breit**

- `max-w-3xl` (768px) auf Mobile mit `px-6` Padding des Hero-Sections → kann horizontal scrollen
- **Fix:** `max-w-3xl` ist ok, aber Hero-Section sollte `overflow-hidden` haben (ist bereits auf parent `div` gesetzt)

### 2.6 IndustryHeroMotif — Gut

**File:** `landing.tsx:68-71` + `industry-hero-motif.tsx`

**✅ Gut:**

- 6 Legal-Icons (Scale, Landmark, FileText, Gavel, Stamp, CalendarClock) als Konstellation
- SVG-Edges mit `pathLength`-Animation — agency-grade
- `opacity-[0.10]` — subtil, nicht aufdringlich
- `hidden md:block` — auf Mobile ausgeblendet (gut für Performance)

**🟡 Issue M-1: Motif nutzt `whileInView` statt `animate`**

- Gleiche Issue wie H1: `whileInView` im Hero-Bereich → Frame-Delay
- **Fix:** `initial="hidden" animate="visible"` für Hero-Kontext

### 2.7 SubsumioMark (Logo) — Gut

**File:** `landing.tsx:73-84`

**✅ Gut:**

- Spring-in mit `type: "spring", stiffness: 200, damping: 22` — snappy, nicht träg
- Pulse-glow-ring hinter dem Logo — premium Detail
- `float-gentle` CSS-Animation — subtile Lebendigkeit
- `aria-hidden` auf dekorativen Elementen

**🟡 Issue L-1: Logo-Size 48px**

- 48px ist klein für einen Hero-Logo. Linear/Vercel/Stripe nutzen 56-64px
- **Fix:** `size={56}` für mehr visuelle Präsenz

---

## 3. GESAMTE STARTSEITE — SECTION-BY-SECTION

### 3.1 Stats-Band

**File:** `landing.tsx:163-196`

**✅ Gut:**

- `AnimatedCounter` mit `easeOutQuart` — snappy counting
- 4 Stats: 97,9% Recall, 3 Jurisdiktionen, Zero Leaks, 14 Tage Trial
- `statsNote` als Kontext: "Kein Chat-Wrapper. Engine-Klasse Retrieval"

**🟡 Issue ST-1: "Zero" als Stat-Wert**

- `stat.value: "Zero"` → `parseFloat("Zero".replace(/[^0-9.]/g, ""))` = `NaN` → `isNumeric = false` → zeigt "Zero" als Text
- Das funktioniert, aber "Zero" ist kein starkes Stat-Value für eine Kanzleisoftware
- **Fix:** "0" mit AnimatedCounter (zeigt "0" — wirkt aber auch nicht stark). Alternative: "100 %" mit Label "Mandantendaten-Kontrolle bei dir"

**🟡 Issue ST-2: Stats-Band direkt nach Hero ohne Übergang**

- Hero ist `tone="slate"`, Stats ist `tone="light"` mit `border-y` — das ist ein harter Cut
- Kein Gradient-Übergang zwischen dark Hero und light Stats
- **Fix:** Akzeptabel für Agency-Level (Stripe macht ähnlich), aber ein subtiler Gradient-Übergang wäre premium

### 3.2 Pain-Section

**File:** `landing.tsx:198-223`

**✅ Gut:**

- Problem-before-Solution Pattern — bewährte Copywriting-Strategie
- 4 Pain-Points mit konkreten Zahlen (40%, Notfrist, 3+ Std., Wochen)
- `painSub` disclaimt: "Branchenschätzungen, keine Laborwerte" — vertrauenswürdig

**🟡 Issue P-1: Pain-Cards sind visuell schwach**

- `rounded-xl border p-5` ohne Hover-Effekt, ohne Glow, ohne Shadow
- Im Vergleich zu den Feature-Cards (mit `GlowCard`, `hover:-translate-y-1`, `hover:shadow-xl`) wirken die Pain-Cards wie Drafts
- **Fix:** `GlowCard` mit `glowColor="var(--signal-rose)"` für Pain-Cards

### 3.3 SuperbrainAdvantage

**File:** `superbrain-advantage.tsx`

**✅ Gut:**

- "Not another chatbot" Positionierung — klarer Differentiator
- Orbit-Visualisierung mit Brain im Zentrum
- 4 Proof-Points + 3 Capabilities
- `GradientMesh` für Hintergrund-Tiefe

**🟡 Issue SB-1: Orbit-Labels hardcoded auf Englisch**

- `orbitNodes` in `superbrain-advantage.tsx:118-122`: `label: "Messages"`, `label: "Files"`, `label: "Graph"`, `label: "Access"`
- Nicht übersetzt für DE-Version
- **Fix:** Labels aus `copy[lang]` ziehen

**🟡 Issue SB-2: "Verzinst" als Capability-Title**

- `copy.de.capabilities[0].title: "Verzinst"` — "Verzinst" ist ein Finanz-Begriff, nicht intuitiv für "compounds"
- Besser: "Wächst" oder "Baut auf" oder "Verknüpft sich"
- **Fix:** `"Wächst"` oder `"Kumuliert"`

### 3.4 Features-Section

**File:** `landing.tsx:227-263`

**✅ Gut:**

- 6 Features mit Icons, accent-colors, GlowCards
- `StaggerContainer` mit `stagger={0.07}` — gute Cadence
- Feature-Texte sind spezifisch und DACH-rechtlich korrekt

**🟡 Issue F-1: Feature-Texte teilweise zu lang**

- `features[0].desc`: 3 Sätze, 47 Wörter — für eine Card mit `text-sm` ist das viel
- `features[3].desc` (Kollisionsprüfung): 2 Sätze, 35 Wörter — gut
- **Fix:** Feature-Desc auf max. 25 Wörter / 2 Sätze standardisieren

**🟡 Issue F-2: "Bauchgefuehl" ohne Umlaut**

- `features[0].desc`: "...kein Bauchgefuehl." — sollte "Bauchgefühl" sein
- **Fix:** `"Bauchgefühl"`

**🟡 Issue F-3: "taeglichen" und "faellt" ohne Umlaut**

- `features[1].desc`: "Der taegliche E-Mail-Digest... nichts mehr durchs Raster faellt."
- Sollte: "täglichen" und "fällt"
- **Fix:** Umlaute korrigieren

### 3.5 Dashboard-Reel

**File:** `landing.tsx:265-283` + `dashboard-reel.tsx`

**✅ Gut:**

- 3-View-Cycle (Matters → Brain Q&A → Deadlines) mit 3.2s pro View
- Typing-Animation für Brain-Question
- GuidedCursor für geführte Aufmerksamkeit
- `MagneticCard` mit Tilt — premium Interaktion

**🟡 Issue DR-1: Sidebar-Labels hardcoded "Overview"**

- `dashboard-reel.tsx:152`: `["Overview", "Akten", "Fristen", "Intake", "Chat"]` — "Overview" ist Englisch auch in DE-Version
- **Fix:** "Übersicht" für DE

**🟡 Issue DR-2: "Rechtsanwälte" im Sidebar-Header**

- `dashboard-reel.tsx:297`: Hardcoded "Rechtsanwälte" und "Kanzlei Müller"
- In EN-Version sollte "Law Firm" / "Müller & Partners" stehen
- **Fix:** Lokalisierung

### 3.6 ProductWorkflowShowcase

**File:** `product-workflow-showcase.tsx`

**✅ Gut:**

- Scroll-Parallax mit `useScroll` + `useTransform` — Tiefe
- 3-Step-Flow: "Erfassen → Verbinden → Antworten"
- Graph-Visualisierung mit Nodes
- `GuidedCursor` für Mobile ausgeblendet

**🟡 Issue PW-1: Sidebar-Items hardcoded**

- `product-workflow-showcase.tsx:152`: `["Overview", "Akten", "Fristen", "Intake", "Chat"]` — gleiche Issue wie DR-1
- **Fix:** Lokalisierung

**🟡 Issue PW-2: Graph-Labels hardcoded auf Englisch**

- `product-workflow-showcase.tsx:234-238`: `"Matter"`, `"Person"`, `"Doc"`, `"Risk"`, `"Task"`
- In DE-Version sollte "Akte", "Person", "Dok", "Risiko", "Aufgabe"
- **Fix:** Lokalisierung

### 3.7 WhatsAppSpotlight

**File:** `subsumio-showcase.tsx`

**✅ Gut:**

- Dark Spotlight mit `GradientMesh` — visuell stark
- Phone-Mockup mit Chat-Verlauf — "Show, don't tell"
- 3 Use-Cases: Zeit buchen, Beleg-Foto, Sprachnotiz
- `badge-pulse` auf Eyebrow

**✅ Gut:** Chat-Content ist DE/EN übersetzt

### 3.8 Use-Cases (Scenarios)

**File:** `landing.tsx:291-315`

**✅ Gut:**

- 3 Praxis-Szenarien: Eingangspost, Verhandlungsvorbereitung, Mitarbeiter-Onboarding
- Konkrete Beispiele mit Aktenzeichen und Fristen

**🟡 Issue UC-1: Scenario-Cards ohne Hover-Effekt**

- `rounded-2xl border p-6` — kein `hover:-translate-y-1`, kein `hover:shadow-lg`
- Im Vergleich zu Feature-Cards (die GlowCard haben) wirken diese Cards flach
- **Fix:** Hover-Effekt hinzufügen

### 3.9 AudienceTabs

**File:** `audience-tabs.tsx`

**✅ Gut:**

- Tab-Switcher für 4 Zielgruppen (Solo, Law Firms, Legal Ops, Enterprise)
- `AnimatePresence mode="wait"` für smooth Tab-Transition
- Content aus `SOLUTIONS[lang]` — Single Source of Truth

### 3.10 TrustBand

**File:** `trust-band.tsx`

**✅ Gut:**

- 4 Trust-Pillars: Self-hosted/EU-Cloud, No Training, Cited Answers, § 203 StGB
- Certification-Badges: SOC 2 (prep), ISO 27001 (planned), DSGVO, EU-Cloud
- `GlowCard` mit signal-colored glow

**🟡 Issue TB-1: "SOC 2 Type II — in Vorbereitung"**

- "In Vorbereitung" schwächt das Trust-Signal. Besser: "SOC 2 Type II — Q4 2026" (konkretes Datum)
- **Fix:** Konkretes Quartal statt "in Vorbereitung"

### 3.11 Testimonials

**File:** `testimonials.tsx` + `testimonials-data.ts`

**✅ Gut:**

- `TESTIMONIALS` ist leer → Section wird nicht gerendert (`if (TESTIMONIALS.length === 0) return null`)
- Sehr verantwortungsvoll — keine gefälschten Reviews (UWG-Risiko)
- Kommentar in `testimonials-data.ts` erklärt warum

### 3.12 Comparison-Table

**File:** `landing.tsx:326-382`

**✅ Gut:**

- 7 Vergleichs-Punkte: Fundstellen, Halluzination-Schutz, Berufsgeheimnis, DACH-Recht, Fristen, Integrationen, Training
- Subsumio vs. "Andere KI-Tools" — klarer Differentiator

**🟡 Issue CT-1: `lang === "en" ? "Feature" : "Feature"`**

- `landing.tsx:335`: Beide Branches returnen "Feature" — redundanter Ternary
- **Fix:** Einfach `"Feature"` oder `{lang === "en" ? "Feature" : "Funktion"}`

### 3.13 Pricing-Section

**File:** `landing.tsx:384-397`

**✅ Gut:**

- `PricingGrid` mit Monthly/Annual-Toggle
- 4 Tiers: Community (0€), Pro (890€), Team (1.290€), Enterprise (ab 1.890€)
- Highlight auf "Pro" mit gradient-border

### 3.14 FAQ-Section

**File:** `landing.tsx:399-405`

**✅ Gut:**

- 9 FAQ-Items — umfassend
- `AnimatedFaqList` mit Tone-Support
- Slate-Tone für visuellen Rhythmus

### 3.15 Final CTA

**File:** `landing.tsx:407-457`

**✅ Gut:**

- `GradientMesh` für Hintergrund
- `TextReveal` für CTA-Title
- Trust-Signals (No Credit Card, GDPR, Professional Secrecy)
- Related-Links für SEO-Internal-Linking

**🟡 Issue FCT-1: CTA-Title "Hör auf zu suchen. Fang an zu fragen."**

- Stark als Copywriting, aber "Hör auf" ist informell (Du-Form). B2B-Kanzleisoftware könnte "Sie" erwarten
- Entscheidung: Die gesamte Seite nutzt "Du" — das ist konsistent und modern (wie Notion, Linear)
- **Status:** Akzeptabel — Du-Form ist bewusste Brand-Entscheidung

---

## 4. TEXT-QUALITÄT — DEEP DIVE

### 4.1 Hero-Texte

| Element              | DE Text                                        | EN Text                                     | Issue                        |
| -------------------- | ---------------------------------------------- | ------------------------------------------- | ---------------------------- |
| H1 (hardcoded)       | Subsumio\nDas Kanzlei-Brain.                   | Subsumio\nThe firm brain.                   | 🔴 Ignoriert site.ts h1a/h1b |
| H1 (site.ts, unused) | Jede Akte, eine belegte Antwort.               | Every matter, one cited answer.             | 🔴 Nicht verwendet           |
| Sub                  | Subsumio ist die KI-Kanzleisoftware...         | Subsumio is AI legal software...            | ✅ Gut, SEO-stark            |
| Badge                | KI-Kanzleisoftware für AT · DE · CH            | AI legal software for AT · DE · CH          | 🟡 Hardcoded, nicht t.badge  |
| CTA Primary          | 14 Tage kostenlos testen                       | Start free trial                            | ✅ Gut                       |
| CTA Secondary        | Preise ansehen                                 | See pricing                                 | ✅ Gut                       |
| Trust Line           | 14 Tage Reverse Trial · 14 Tage Geld-zurück... | 14-day reverse trial · 14-day money-back... | ✅ Gut                       |

### 4.2 Umlaut-Bugs

| File         | Zeile            | Falsch       | Richtig     |
| ------------ | ---------------- | ------------ | ----------- |
| site.ts:1708 | features[0].desc | Bauchgefuehl | Bauchgefühl |
| site.ts:1714 | features[1].desc | taeglichen   | täglichen   |
| site.ts:1714 | features[1].desc | faellt       | fällt       |

### 4.3 Inkonsistente Terminologie

| Begriff           | Verwendung 1                   | Verwendung 2                              | Empfehlung                        |
| ----------------- | ------------------------------ | ----------------------------------------- | --------------------------------- |
| "Brain"           | "Das Kanzlei-Brain" (H1)       | "Deine Kanzlei-Wissensbasis" (Superbrain) | Einheitlich "Brain"               |
| "Fundstellen"     | "belegte Antwort" (H1 site.ts) | "Antworten mit Fundstellen" (Feature)     | "Fundstellen" durchgehend         |
| "Kanzleisoftware" | "KI-Kanzleisoftware" (Badge)   | "Kanzleisoftware mit KI" (Features-Title) | "KI-Kanzleisoftware" als Standard |

### 4.4 SEO-Text-Analyse

**Keyword-Dichte auf Startseite (DE):**

- "KI-Kanzleisoftware": 5× (gut)
- "Anwaltssoftware": 2× (ok)
- "Rechtsanwälte": 3× (gut)
- "Fundstellen": 8× (sehr gut — Differentiator)
- "Berufsgeheimnis": 4× (gut)
- "§ 203 StGB": 3× (gut)
- "DACH" / "AT · DE · CH": 6× (gut)

**Problem:** H1 enthält nicht "KI-Kanzleisoftware" — der wichtigste Keyword-Cluster fehlt im H1.

---

## 5. ANIMATION & LOADING — TIMELINE-ANALYSE

### Aktuelle Hero-Load-Timeline (non-reduced-motion):

```
t=0.00s  Page Load
t=0.00s  SubsumioMark spring-in (delay: 0, spring: 200/22)
t=0.15s  Badge fade-in (delay: 0.15, duration: 0.5)
t=0.25s  H1 SplitTextReveal start (delay: 0.25, stagger: 0.14)
         → Line 1 "Subsumio": 0.25s + 0.14*0 = 0.25s
         → Line 2 "Das Kanzlei-Brain.": 0.25s + 0.14*1 = 0.39s
         → Each word: +0.04s stagger within line
         → "Subsumio" (1 word): 0.25s start, 0.75s complete (0.5s duration)
         → "Das" (1st word): 0.39s start, 0.89s complete
         → "Kanzlei-Brain." (2nd word): 0.43s start, 0.93s complete
t=0.80s  Subtext blur-in (delay: 0.8, duration: 0.7) → complete at 1.5s
t=0.95s  CTA-Buttons fade-in (delay: 0.95, duration: 0.5) → complete at 1.45s
t=1.05s  Trust-line fade-in (delay: 1.05, duration: 0.5) → complete at 1.55s
t=~1.5s  Live-Demo appears (no animation)
```

**Gesamt-Hero-Load:** ~1.55s bis alles sichtbar ist. **Das ist zu langsam.**

### Empfohlene Hero-Load-Timeline:

```
t=0.00s  Page Load
t=0.00s  SubsumioMark spring-in (delay: 0, spring: 200/22)
t=0.10s  Badge fade-in (delay: 0.10, duration: 0.4)
t=0.20s  H1 SplitTextReveal start (delay: 0.20, stagger: 0.10)
         → Line 1 complete: ~0.70s
         → Line 2 complete: ~0.85s
t=0.40s  Subtext fade-in (delay: 0.40, duration: 0.5) → complete at 0.9s
t=0.55s  CTA-Buttons fade-in (delay: 0.55, duration: 0.4) → complete at 0.95s
t=0.65s  Trust-line fade-in (delay: 0.65, duration: 0.4) → complete at 1.05s
t=0.80s  Live-Demo fade-in (delay: 0.80, duration: 0.5) → complete at 1.3s
```

**Neue Gesamt-Hero-Load:** ~1.3s — 20% schneller, spürbar snappier.

---

## 6. ACCESSIBILITY AUDIT

### 6.1 Hero-Accessibility

**✅ Gut:**

- `aria-label` auf SplitTextReveal (motion-system.tsx:649)
- `aria-hidden` auf dekorativen Motif
- `prefers-reduced-motion` wird überall respektiert

**🟡 Issue A-1: SplitTextReveal `aria-hidden="true"` auf inner spans**

- `motion-system.tsx:656`: `aria-hidden="true"` auf der inneren motion.span
- Das bedeutet Screenreader sehen nur den `aria-label` — das ist korrekt, aber der `aria-label` enthält den raw string mit `\n`
- **Fix:** `\n` durch Leerzeichen ersetzen im `aria-label`

**🟡 Issue A-2: CTA-Button hat kein `aria-label`**

- "Preise ansehen" ist ein `<a href="#pricing">` ohne `aria-label`
- Für Screenreader ok (Text ist lesbar), aber der Link-Context ist unklar
- **Fix:** `aria-label="Preise und Pläne ansehen"`

**🟡 Issue A-3: Live-Demo textarea ohne `aria-label`**

- `live-demo.tsx:137`: `aria-label={t.placeholder}` — das ist "Frag das Demo-Brain…"
- Besser: `aria-label="Frage an das Demo-Brain stellen"`
- **Fix:** Aussagekräftiges aria-label

### 6.2 Color-Kontrast

**🟡 Issue K-1: `gradient-text-animated` auf slate-Tone**

- Hero ist `tone="slate"` → Hintergrund `#07091a` (sehr dunkel)
- `gradient-text-animated` nutzt `var(--brand-secondary)` (violet, ~#a78bfa) → `var(--brand-primary)` (blue, ~#3b82f6) → `var(--brand-tertiary)` (indigo)
- Auf `#07091a`: violet `#a78bfa` hat Kontrast ~6.8:1 (AA ok), blue `#3b82f6` hat ~4.2:1 (AA marginal)
- **Fix:** Hellere Gradient-Stopps für dark/slate tone

**🟡 Issue K-2: `[color:var(--mk-text-subtle)]` für Trust-Line**

- Trust-Line nutzt `text-xs` + `mk-text-subtle` — auf slate-Tone kann das unter 4.5:1 fallen
- **Fix:** `mk-text-muted` statt `mk-text-subtle` für Trust-Line

---

## 7. PERFORMANCE

### 7.1 Animation-Overhead

**🟡 Issue PF-1: Zu viele gleichzeitige Animationen im Hero**

- SubsumioMark: spring + float-gentle CSS + pulse-ring CSS = 3 Animationen
- Badge: framer-motion + badge-pulse CSS + border-spin CSS = 3 Animationen
- H1: SplitTextReveal mit 4 motion.span (word-level) = 4 Animationen
- Subtext: framer-motion + blur-filter = 1 Animation
- CTA: framer-motion = 1 Animation
- IndustryHeroMotif: 7 SVG-lines + 6 nodes + 6 float-animations = 19 Animationen
- **Total im Hero: ~31 gleichzeitige Animationen**
- **Fix:** IndustryHeroMotif auf Mobile ausblenden (bereits done), Blur-Filter reduzieren

### 7.2 Bundle-Size

**✅ Gut:**

- Motion-System ist zentralisiert — keine Duplikation
- `useReducedMotion` überall → Reduced-Motion-Users bekommen keine Animationen
- `GuidedCursor` wird auf Mobile ausgeblendet

---

## 8. MOBILE UX

### 8.1 Hero auf Mobile

**✅ Gut:**

- `IndustryHeroMotif` hidden auf Mobile (`hidden md:block`)
- CTA-Buttons: `flex-col sm:flex-row` — stacked auf Mobile
- `overflow-x-hidden` auf Page-Level

**🟡 Issue MU-1: H1 `text-5xl` auf Mobile**

- `text-5xl` = 48px auf Mobile — das ist groß, aber "Subsumio" als langes Wort kann overflowen
- `lg:text-8xl` = 128px auf Desktop — sehr groß, aber ok für Hero
- **Fix:** `text-4xl` auf Mobile (36px) wäre sicherer

**🟡 Issue MU-2: Live-Demo auf Mobile im Hero**

- Die Live-Demo (`max-w-3xl`) sitzt direkt im Hero — auf Mobile nimmt sie den gesamten Viewport ein
- Das schiebt die CTAs und den Subtext weit nach oben, potenziell above-the-fold
- **Fix:** Auf Mobile könnte die Demo nach dem ersten Scroll erscheinen (aber das wäre eine größere Umstrukturierung)

---

## 9. PRIORISIERTE FIX-LISTE

### 🔴 Kritisch (sofort):

1. **H1 durch `t.h1a` + `t.h1b` ersetzen** — SEO-Killer
2. **Hero-Animation-Delays reduzieren** — Subtext 0.8→0.4, CTA 0.95→0.55, Trust 1.05→0.65
3. **`SplitTextReveal` im Hero auf `animate` statt `whileInView`** — Frame-Delay
4. **Umlaut-Bugs** — Bauchgefühl, täglichen, fällt

### 🟡 Hoch (diese Woche):

5. **Badge-Text aus `t.badge`** — DRY + i18n für IT/ES/PL/FR/NL
6. **Secondary CTA `variant="ghost"` → `variant="outline"`** — Sichtbarkeit auf slate
7. **Live-Demo mit `motion.div` Animation** — kaskadierender Flow
8. **Pain-Cards mit `GlowCard`** — visuelle Konsistenz
9. **Scenario-Cards Hover-Effekt** — visuelle Konsistenz
10. **Sidebar/Graph-Labels lokalisieren** — DR-1, PW-1, PW-2

### 🟡 Mittel (nächste Sprint):

11. **"Verzinst" → "Wächst"** — bessere DE-Copy
12. **Feature-Desc Länge standardisieren** — max 25 Wörter
13. **Trust-Badge "in Vorbereitung" → konkretes Quartal**
14. **Logo-Size 48→56px** — mehr Präsenz
15. **`gradient-text-animated` Kontrast auf slate prüfen**
16. **`Comparison` Tabelle "Feature" Redundanz**

### 🟢 Niedrig (Backlog):

17. **"Zero" Stat durch stärkeren Wert ersetzen**
18. **`aria-label` für CTA-Links**
19. **H1 `text-4xl` auf Mobile**
20. **Blur-Filter in Subtext-Animation reduzieren**

---

## 10. ZIELBILD — AGENCY-LEVEL HERO

```
[Laden bei t=0]
    [SubsumioMark 56px spring-in @ t=0]
        [Badge "KI-Kanzleisoftware für AT · DE · CH" @ t=0.10]
            [H1: "Jede Akte," (line 1, gradient) @ t=0.20]
            [H1: "eine belegte Antwort." (line 2, gradient) @ t=0.30]
                [Subtext: "Subsumio ist die KI-Kanzleisoftware..." @ t=0.40]
                    [CTA: "14 Tage kostenlos testen" + "Preise ansehen" @ t=0.55]
                        [Trust: "14 Tage Reverse Trial..." @ t=0.65]
                            [Live-Demo fade-in @ t=0.80]
```

**Gesamtladezeit:** ~1.3s (vs. aktuelle 1.55s)  
**SEO-H1:** Enthält "Jede Akte, eine belegte Antwort" — primärer Keyword-Cluster  
**Conversion:** CTAs bei 0.55s sichtbar (vs. 0.95s aktuell)  
**Accessibility:** `aria-label` ohne `\n`, Kontrast AA auf slate

---

## 11. FAZIT

Die Startseite hat ein **exzellentes Motion-Fundament** (9/10) und eine **starke visuelle Hierarchie** (8/10). Die Texte sind fachlich kompetent und DACH-spezifisch. Die größten Schwächen sind:

1. **H1 ignoriert site.ts** — SEO-kritisch, muss sofort gefixt werden
2. **Animation-Delays zu lang** — 1.55s bis Hero komplett ist, sollte 1.3s sein
3. **Umlaut-Bugs** — drei Wörter ohne Umlaute in Feature-Descriptions
4. **Lokalisierungs-Lücken** — Sidebar/Graph-Labels hardcoded auf EN

Nach Umsetzung der kritischen und hohen Fixes ist die Startseite auf **Agency-Level für eine AI-Kanzleisoftware im DACH-Markt**.
