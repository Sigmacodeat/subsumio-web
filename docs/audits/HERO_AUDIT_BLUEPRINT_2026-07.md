# Subsumio Hero-Bereich — Agenturlevel-Audit & Modernisierungs-Blueprint (Juli 2026)

**Scope:** Hero-Sektion der Startseite (`src/components/marketing/landing.tsx:90-190`)
**Benchmark:** B2B-SaaS Best Practices 2026 (SaaSHero, Genesys Growth, Motion.dev, Linear, Notion, Framer)
**Branche:** Legal Tech DACH (Anwaltssoftware / Kanzleisoftware)

---

## 1. Ist-Zustand — Strukturelle Analyse

### 1.1 Aktueller Aufbau (Top-to-Bottom)

| #   | Element                                            | Code-Zeile | Typ              | Sichtbar above-the-fold (1440×900)? |
| --- | -------------------------------------------------- | ---------- | ---------------- | ----------------------------------- |
| 1   | `SubsumioMark` (56px)                              | 111        | Brand-Logo       | ✅ Ja                               |
| 2   | Badge-Pill ("KI-Kanzleisoftware für AT · DE · CH") | 119        | Eyebrow          | ✅ Ja                               |
| 3   | H1: "Deine Kanzlei vergisst. / Subsumio nicht."    | 124-131    | Headline         | ✅ Ja                               |
| 4   | Sub-Paragraph (2 Sätze, ~280 Zeichen)              | 132-141    | Subhead          | ✅ Ja (teilweise)                   |
| 5   | 2 CTAs (Primary + Secondary)                       | 142-162    | CTA-Group        | ✅ Ja (knapp)                       |
| 6   | Trust-Line ("14 Tage Reverse Trial · …")           | 163-174    | Micro-Trust      | ⚠️ Grenzbereich                     |
| 7   | `LiveDemo` Widget (max-w-3xl)                      | 175-187    | Interactive Demo | ❌ Nein — erst beim Scrollen        |
| 8   | `IndustryHeroMotif` (Hintergrund-Konstellation)    | 97-103     | Decorative BG    | ✅ Sehr subtil (6% Opacity)         |

### 1.2 Content-Strings (DE)

```
badge:  "KI-Kanzleisoftware für AT · DE · CH"
h1a:    "Deine Kanzlei vergisst."
h1b:    "Subsumio nicht."
sub:    "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in
         Österreich, Deutschland und der Schweiz. Akten, Fristen, Mails
         und Dokumente werden zu belegten Antworten — mit Fundstellen,
         nicht mit Halluzinationen."
```

### 1.3 Technische Infrastruktur (bereits State-of-the-Art)

- ✅ `SplitTextReveal` für H1 (Character-Stagger)
- ✅ `MagneticButton` für Primary CTA (Magnetic Hover)
- ✅ Spring-smoothed Parallax auf Motif (`useTransform` + `useScroll`)
- ✅ `prefers-reduced-motion` vollständig respektiert
- ✅ `overflow-x-clip` (nicht `-hidden`) — sticky-kompatibel
- ✅ `useMotionValueEvent` für Sticky-CTA (INP-optimiert, max. 2 Re-renders)
- ✅ Token-basiertes Design-System (`--mk-*`, `--brand-*`)
- ✅ Self-hosted Fonts (Inter, Space Grotesk, JetBrains Mono) — DSGVO-sauber
- ✅ `text-balance` / `text-pretty` auf Headlines und Sub-Text

---

## 2. Agenturlevel-Audit — 7-Achsen-Bewertung

### Achse 1: Messaging & Value Proposition — 🟡 **7/10**

**Stärke:** Der H1 "Deine Kanzlei vergisst. Subsumio nicht." ist ein emotionaler Hook
mit hohem Memorabilitäts-Wert. Die Kontrast-Struktur (vergisst/nicht) ist stark.

**Schwächen:**

- **H1 ist produkt-agnostisch.** Ein Besucher versteht nach dem H1 nicht, was
  Subsumio _ist_ — erst der Sub-Paragraph klärt auf. Die 2026-Best-Practice
  (Genesys Growth) fordert: _"Outcome-focused headline addressing the primary
  buyer pain point"_ in **≤8 Wörtern**. Der H1 hat 5 Wörter, aber kein Outcome.
- **Sub-Paragraph ist zu lang** (~280 Zeichen, 2 Sätze). Linear, Notion und
  Framer nutzen 1 Satz mit ≤160 Zeichen. Die zweite Hälfte ("mit Fundstellen,
  nicht mit Halluzinationen") ist ein Feature, kein Benefit.
- **Badge ist generisch.** "KI-Kanzleisoftware für AT · DE · CH" ist eine
  Kategorie-Beschreibung, kein Differentiator. B2B-Buyer scannen Badges nach
  _Relevanz-Signalen_ (z.B. "Neu: 5-Layer-Qualitätsarchitektur" aus dem Nav-
  Announcement wäre stärker).

### Achse 2: Visual Hierarchy & Layout — 🟡 **7/10**

**Stärke:** Zentriertes Layout mit klarer vertikaler Lesereihenfolge (Logo → Badge
→ H1 → Sub → CTA). `SplitTextReveal` sorgt für dramatische H1-Inszenierung.

**Schwächen:**

- **Alles zentriert — kein visueller Anker.** Das Auge hat keinen Ruhepunkt.
  Modernere B2B-Heros (Linear, Vercel, Framer 2026) nutzen asymmetrische Layouts
  oder Split-Screen (Text links, Produkt rechts), um Aufmerksamkeit zu führen.
  Die `LiveDemo` unten ist ein guter Ansatz, aber sie ist _below the fold_ und
  damit im ersten 3-Sekunden-Moment unsichtbar.
- **Logo (56px) ist sehr groß für einen Hero ohne Navigation-Brand.** Das Logo
  wiederholt sich in der Header-Navigation. Im Hero ist es redundante
  Grundfläche, die den Value-Prop nach unten drückt.
- **CTA-Group ist schwach hierarchisiert.** Primary und Secondary sind
  gleichgroß (`size="xl"`), nur die Variante unterscheidet sie. 2026-Best-
  Practice: _eine_ dominante CTA, Secondary als Text-Link oder Ghost-Button
  (SaaSHero: "One main CTA and limit secondary actions").

### Achse 3: Product-Led Storytelling — 🔴 **5/10**

**Stärke:** `LiveDemo` Widget ist interaktiv und zeigt das Produkt in Aktion.

**Schwächen:**

- **`LiveDemo` ist below-the-fold.** Die 2026-Regel (Genesys Growth):
  _"Story-driven hero sections that visually demonstrate product value within
  3-5 seconds."_ Der Besucher sieht beim ersten Render nur Text — das Produkt
  erscheint erst nach 600px Scroll. Das ist der größte Hebel.
- **`IndustryHeroMotif` ist zu subtil (6% Opacity → 0% bei 80% Scroll).** Die
  Konstellation aus 6 Icons (Scale, Landmark, FileText, Gavel, Stamp,
  CalendarClock) ist eine schöne Idee, aber bei 6% Opacity ist sie kaum
  wahrnehmbar — sie wirkt eher wie ein Render-Artefakt denn als visuelle
  Story. Der Differentiator (Legal-Domäne) bleibt unsichtbar.
- **Kein "Transformation-Moment".** Moderne Heros zeigen _vorher→nachher_ oder
  _Frage→Antwort_ in Echtzeit. Subsumio's USP ist _"Frage → belegte Antwort"_
  — genau dieser Flow sollte im Hero visualisiert werden, nicht erst beim
  Scrollen.

### Achse 4: Trust Signals — 🟡 **6/10**

**Stärke:** Trust-Line ("14 Tage Reverse Trial · Geld-zurück-Garantie · Keine
Kreditkarte") ist objection-handling am richtigen Ort (direkt unter CTA).

**Schwächen:**

- **Keine Social Proof im Hero.** Keine Kunden-Logos, keine Nutzerzahlen, keine
  Testimonial-Snippets above-the-fold. SaaSHero 2026: _"Named logos with
  specific results outperform generic trust bars every time."_
- **Trust-Line ist text-only.** Icons (✓) würden die Scanbarkeit erhöhen.
  Aktuell ist es ein Fließtext-Block, der leicht überlesen wird.
- **Logo-Marquee kommt erst nach dem Hero.** Das ist richtig (sie gehört unter
  den Hero), aber ein _kompakter_ Trust-Strip mit 3-4 Schlüssel-Badges direkt
  unter den CTAs würde den Hero abschließen und den Übergang zur Marquee
  vorbereiten.

### Achse 5: Motion & Interaction — 🟢 **8/10**

**Stärke:** Das Motion-System ist herausragend — Spring-geglättete Parallax,
`SplitTextReveal`, `MagneticButton`, `ClipReveal`, GPU-only transforms,
`prefers-reduced-motion` überall. Dies ist Agenturlevel.

**Schwächen:**

- **Hero-Entrance ist rein vertikal (fade-up).** Alle Elemente animieren mit
  `y: 12-16 → 0`. Das ist sicher, aber einförmig. Modernere Heros nutzen
  _gerichtete_ Reveals: H1 von unten, Sub von links, CTA von rechts — das
  erzeugt Richtungs-Dynamik ohne Chaos.
- **Kein Scroll-Driven Hero-Exit.** Beim Scrollen aus dem Hero verschwinden
  alle Elemente gleichzeitig. Ein _parallax-staggered exit_ (Motif scrollt
  schneller, H1 medium, CTA langsam) würde Tiefe erzeugen.
- **`MagneticButton` ist subtil (strength 0.25).** Für einen Hero-CTA könnte
  er etwas stärker sein (0.35-0.4), um die Interaktivität spürbarer zu machen.

### Achse 6: Conversion Architecture — 🟡 **7/10**

**Stärke:** Zwei CTAs mit klarer Hierarchie (Primary: Trial, Secondary: Pricing).
Trust-Line direkt darunter. `#pricing` Anchor-Link funktioniert.

**Schwächen:**

- **Secondary CTA-Label ist generisch.** "Preise ansehen" / "See pricing" ist
  funktional, aber nicht benefit-driven. Besser: "Pläne vergleichen" oder
  "14 Tage kostenlos testen" (falls Primary anders gelabelt wird).
- **Keine Urgency/Scarcity.** B2B-SaaS 2026 nutzt _sanfte_ Urgency
  (SaaSHero: _"Join 5,000+ companies using [Product]"_). Subsumio könnte:
  _"Jetzt in 120+ Kanzleien im Einsatz"_ (falls wahr) oder _"Frühzug für
  DACH-Kanzleien"_.
- **Keine Micro-Conversion.** Neben dem Primary-CTA könnte ein _"Demo
  ansehen"_ -Link (Scroll-to-Demo) den Besuchern eine niedrigere Hürde
  bieten, die noch nicht bereit für einen Trial sind.

### Achse 7: Brand & Industry Fit — 🟢 **8/10**

**Stärke:** Der `slate`-Tone ist seriös und unterscheidet sich von den
`light`-Sektionen darunter. Die `IndustryHeroMotif` mit Legal-Icons ist eine
gute branchenspezifische Signatur. `§ 203 StGB` und `RVG-gebührenfähig` in der
Marquee zeigen Domänen-Verständnis.

**Schwächen:**

- **Slate-Tone ist kühl, aber nicht "Legal-Premium".** High-End-Kanzleien
  assoziieren mit Tiefblau, Gold, Anthrazit — nicht mit einem generischen
  Tech-Slate. Ein _subtiler_ Gold- oder Bronze-Akzent im Hero (z.B. im Badge
  oder als Hairline-Border) würde "Premium Legal" signalisieren.
- **`font-black` (900) rendert als 700.** Bekannter Bug (Space Grotesk lädt
  max. 700). Der H1 sieht nicht so kraftvoll aus wie beabsichtigt. Entweder
  900-fähige Display-Schrift laden oder `font-bold` verwenden.

---

## 3. Gesamtbewertung

| Achse                        | Score | Gewichtung (Legal Tech) | Gewichted  |
| ---------------------------- | ----- | ----------------------- | ---------- |
| 1. Messaging & Value Prop    | 7/10  | 25%                     | 1.75       |
| 2. Visual Hierarchy & Layout | 7/10  | 15%                     | 1.05       |
| 3. Product-Led Storytelling  | 5/10  | 20%                     | 1.00       |
| 4. Trust Signals             | 6/10  | 15%                     | 0.90       |
| 5. Motion & Interaction      | 8/10  | 10%                     | 0.80       |
| 6. Conversion Architecture   | 7/10  | 10%                     | 0.70       |
| 7. Brand & Industry Fit      | 8/10  | 5%                      | 0.40       |
| **Gesamt**                   |       | **100%**                | **6.6/10** |

**Fazit:** Solide 7/10 mit starkem Motion-Fundament, aber **Product-Led
Storytelling** (5/10) ist der größte Hebel — die 3-Sekunden-Regel wird
verfehlt, weil das Produkt below-the-fold liegt.

---

## 4. Modernisierungs-Blueprint — "Subsumio Hero 2.0"

### 4.1 Ziel

> Ein Besucher versteht in **≤3 Sekunden**: Was Subsumio ist, für wen es
> gebaut ist, und sieht das Produkt in Aktion — ohne zu scrollen.

### 4.2 Kern-Userflows

| Flow                 | Beschreibung                                                                   |
| -------------------- | ------------------------------------------------------------------------------ |
| **First Impression** | Besucher landet → sieht H1 + animierte Q→A-Visual + CTA in 3s                  |
| **Quick Evaluator**  | Besucher scannt Badge + Trust-Strip + CTA → klickt Trial in <10s               |
| **Deep Explorer**    | Besucher scrollt → LiveDemo wird sichtbar → interagiert → klickt Trial         |
| **Skeptic**          | Besucher liest Sub-Text → sieht § 203 StGB / DSGVO-Badges → Vertrauen entsteht |

### 4.3 Neues Layout — Split-Hero mit Live-Visual

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Nav: Subsumio · Features · Pricing · Login · Trial-CTA]                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐    │
│  │  LEFT (55%)          │  │  RIGHT (45%)                          │    │
│  │                      │  │                                      │    │
│  │  [Badge: "Neu: 5-    │  │  ┌─────────────────────────────┐     │    │
│  │   Layer-Qualitäts-   │  │  │  Animated Q→A Card           │     │    │
│  │   architektur"]      │  │  │                              │     │    │
│  │                      │  │  │  "Was ist die Frist für      │     │    │
│  │  DEINE KANZLEI       │  │  │   die Berufung?"             │     │    │
│  │  VERGISST.           │  │  │                              │     │    │
│  │  ────                │  │  │  ⚡ Typewriter-Antwort:      │     │    │
│  │  SUBSUMIO NICHT.     │  │  │  "§ 517 ZPO: 1 Monat ab     │     │    │
│  │                      │  │  │   Zustellung…"               │     │    │
│  │  Jede Akte, eine     │  │  │                              │     │    │
│  │  belegte Antwort.    │  │  │  📎 BGB § 194 · ZPO § 517   │     │    │
│  │                      │  │  │  📎 BVerfG 2 BvR 123/24     │     │    │
│  │  [▶ 14 Tage testen]  │  │  └─────────────────────────────┘     │    │
│  │  [Pläne ansehen →]   │  │                                      │    │
│  │                      │  │  [Subtle floating motif behind]      │    │
│  │  ✓ Keine Kreditkarte │  │                                      │    │
│  │  ✓ § 203 StGB        │  │                                      │    │
│  │  ✓ EU-Cloud          │  │                                      │    │
│  └──────────────────────┘  └──────────────────────────────────────┘    │
│                                                                          │
│  ── Trust-Strip: DSGVO · SOC 2 · ISO 27001 · EU-Cloud · On-Premise ──   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.4 UI-Elemente & Interaktionen

#### 4.4.1 Badge-Pill (Eyebrow)

- **Aktuell:** "KI-Kanzleiosoftware für AT · DE · CH" (statisch)
- **Neu:** Dynamisch — rotiert durch 3 Differentiatoren alle 4s:
  1. "Neu: 5-Layer-Qualitätsarchitektur"
  2. "§ 203 StGB-konform"
  3. "EU-Cloud oder On-Premise"
- **Interaktion:** Hover → pausiert Rotation; Click → navigiert zu /superbrain
- **Motion:** Crossfade (opacity + 4px y), nicht Slide — ruhig, nicht nervös
- **Reduced-Motion:** Zeigt statisch den ersten Text

#### 4.4.2 H1 — Headline

- **Beibehalten:** "Deine Kanzlei vergisst. / Subsumio nicht." — stark, behalten
- **Neu darunter:** `heroTagline` als H2-Visual: "Jede Akte, eine belegte
  Antwort." — bereits in den Content-Strings vorhanden, wird aktuell nicht im
  Hero gerendert!
- **Typografie:** `font-bold` (nicht `font-black` — Space Grotesk lädt max. 700)
- **Color-Accent:** `h1b` in `gradient-text` (Brand-Gradient) statt plain white
- **Motion:** `SplitTextReveal` beibehalten, aber `stagger` auf 0.06 (snappier)

#### 4.4.3 Sub-Paragraph

- **Aktuell:** ~280 Zeichen, 2 Sätze
- **Neu:** 1 Satz, ≤160 Zeichen:
  > "KI-Kanzleiosoftware mit belegten Antworten — Fundstellen, nicht
  > Halluzinationen. Für Rechtsanwälte in AT · DE · CH."
- **Motion:** ClipReveal von links (direction="right") — Richtungs-Dynamik

#### 4.4.4 CTA-Group

- **Primary:** "14 Tage kostenlos testen" (beibehalten, `MagneticButton` strength 0.35)
- **Secondary:** Ghost-Button / Text-Link mit Arrow: "Pläne ansehen →"
  (nicht `size="xl"`, sondern `size="lg"` + `variant="ghost"`)
- **Tertiary (neu):** "Demo ansehen" als reiner Text-Link mit Play-Icon →
  smooth-scroll zu `#demo`
- **Motion:** Primary von unten, Secondary von rechts (0.1s Delay)

#### 4.4.5 Trust-Line (unter CTAs)

- **Aktuell:** Fließtext "14 Tage Reverse Trial · Geld-zurück-Garantie · Keine
  Kreditkarte"
- **Neu:** 3 Icon+Text-Pills, horizontal:
  ```
  ✓ Keine Kreditkarte  |  ✓ § 203 StGB  |  ✓ EU-Cloud
  ```
- **Motion:** Stagger fade-in (0.08s zwischen Items)

#### 4.4.6 Animated Q→A Card (NEU — rechte Spalte)

- **Konzept:** Eine schwebende Karte, die den Kern-Value-Prop visualisiert:
  Frage → animierte Typewriter-Antwort → Source-Citations erscheinen
- **Aufbau:**
  1. Question-Header (User-Bubble): "Was ist die Frist für die Berufung?"
  2. Answer-Area (AI-Bubble): `TypewriterText` tippt Antwort Zeichen für Zeichen
  3. Source-Chips: 2-3 Citation-Chips faden nacheinander ein (BGB § 194, ZPO § 517)
  4. Confidence-Badge: "5-Layer verifiziert" mit Checkmark
- **Motion:**
  - Karte: Float-Animation (y: 0 → -8 → 0, 6s loop)
  - Typewriter: Startet nach 1.5s, 12 chars/s
  - Sources: Stagger fade-in nach Typewriter-Ende
  - Confidence-Badge: Scale-in mit Spring (stiffness 200)
- **Interaktion:**
  - Hover auf Source-Chip → Tooltip mit Snippet-Preview
  - Click auf Source-Chip → navigiert zu /superbrain (Proof-Page)
- **Reduced-Motion:** Statische Karte mit vollständiger Antwort (kein Typewriter)
- **Mobile:** Karte rutscht unter den Text (Stack), wird aber above-the-fold
  gehalten durch reduzierte Text-Höhe

#### 4.4.7 Background-Motif (IndustryHeroMotif)

- **Aktuell:** 6% Opacity → unsichtbar
- **Neu:** 12-15% Opacity, etwas größere Icons (56px statt 52px)
- **Positionierung:** Hinter der rechten Spalte (Q→A Card), nicht full-width
- **Zusätzlich:** Subtile Grid-Textur (`grid-bg` Klasse existiert bereits) als
  Hintergrund für den gesamten Hero — erzeugt "Engine"-Feeling

#### 4.4.8 Trust-Strip (unter dem Split-Hero, über Logo-Marquee)

- **Konzept:** Kompakter Streifen mit 5 Schlüssel-Badges:
  ```
  DSGVO-konform  ·  SOC 2 Type II  ·  ISO 27001  ·  EU-Cloud  ·  On-Premise
  ```
- **Stil:** Monochrom Icons + Text, `text-xs`, `--mk-text-muted`
- **Zweck:** Schließt den Hero ab und bereitet die Logo-Marquee vor
- **Motion:** Stagger fade-in, 0.06s zwischen Items

### 4.5 Datenmodell & State

```typescript
// Keine neuen API-Endpunkte nötig — alle Daten sind statisch in site.ts

// Neu in _landingDe / _landingEn:
heroBadges: string[]  // Rotating badges für Eyebrow
heroTagline: string   // "Jede Akte, eine belegte Antwort." (bereits vorhanden!)
heroTrustItems: { icon: string; label: string }[]  // Trust-Pills unter CTA
heroQACard: {
  question: string
  answer: string
  sources: { label: string; href: string }[]
  confidenceLabel: string
}
trustStripItems: { icon: string; label: string }[]  // 5 Badges unten
```

### 4.6 Architektur-Entscheidungen

| Entscheidung                   | Wahl                   | Begründung                                                                                                             |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Split vs. Centered             | **Split (55/45)**      | Product-Led Storytelling braucht visuellen Anker rechts; 2026-Trend (Linear, Vercel, Datadog)                          |
| Q→A Card: Live vs. Scripted    | **Scripted**           | Live-Demo ist bereits unten; Hero-Card ist _Visual_, nicht _Interactive_ — keine API-Last, keine Latenz                |
| Badge: Statisch vs. Rotating   | **Rotating (3 Items)** | Zeigt 3 Differentiatoren ohne zusätzliche Fläche; pausiert auf Hover                                                   |
| Trust-Strip: Neu vs. Entfernen | **Neu, kompakt**       | Schließt Hero ab, bereitet Marquee vor; aktuell fehlt der Hero-Abschluss                                               |
| `font-black` vs. `font-bold`   | **`font-bold`**        | Space Grotesk lädt max. 700 — `font-black` ist ein No-op. Ehrlich > versprochen                                        |
| LiveDemo: Behalten             | **Ja, below-the-fold** | Die LiveDemo bleibt als interaktiver zweiter Schritt — der Hero zeigt das _Konzept_, die LiveDemo bietet _Interaktion_ |

### 4.7 Edge-Cases & Fehlerszenarien

| Szenario                   | Verhalten                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mobile (< 768px)**       | Split → Stack: Text oben, Q→A Card unten. Card height reduziert auf 240px. Badge rotation pausiert (zu klein für Crossfade). Trust-Pills: 2-Spalten Grid. |
| **Tablet (768-1024px)**    | Split bleibt, aber 60/40. Q→A Card etwas kleiner.                                                                                                         |
| **prefers-reduced-motion** | Badge: statisch (Item 1). H1: `SplitTextReveal` → instant. Q→A Card: vollständige Antwort ohne Typewriter. Float: aus. Trust-Pills: instant.              |
| **Langsames Netzwerk**     | Q→A Card hat `min-h-[280px]` — kein Layout-Shift während Font-Load.                                                                                       |
| **Sehr lange Fragen**      | Q→A Card hat `overflow-hidden` + `line-clamp-3` für Question.                                                                                             |
| **Rechts→Links Sprachen**  | Split-Layout: `dir="rtl"` → Spalten tauschen. Trust-Pills: `flex-row-reverse`.                                                                            |

### 4.8 Definition of Done

- [ ] Split-Hero (55/45) ist above-the-fold auf 1440×900 vollständig sichtbar
- [ ] Q→A Card visualisiert Frage→Antwort→Sources in ≤3s ohne Scroll
- [ ] Badge rotiert durch 3 Differentiatoren (pausiert auf Hover)
- [ ] `heroTagline` ("Jede Akte, eine belegte Antwort.") ist im Hero sichtbar
- [ ] Trust-Pills mit Icons unter CTAs (3 Items, staggered)
- [ ] Trust-Strip mit 5 Badges als Hero-Abschluss
- [ ] Secondary CTA ist Ghost-Button (nicht gleichgewichtig mit Primary)
- [ ] `font-bold` statt `font-black` (Space Grotesk 700-max Bug)
- [ ] `MagneticButton` strength 0.35 (spürbarer)
- [ ] IndustryHeroMotif bei 12-15% Opacity (sichtbar, nicht dominant)
- [ ] Mobile: Stack-Layout, Card above-the-fold, Badge statisch
- [ ] `prefers-reduced-motion`: Alle Animationen haben statische Fallbacks
- [ ] Keine neuen API-Abhängigkeiten — rein statisch
- [ ] TypeScript: 0 Errors
- [ ] Lighthouse: Performance ≥90, Accessibility ≥95

---

## 5. Implementierungs-Arbeitspakete

### Paket 1: Content-Strings erweitern

- **Ziel:** `heroBadges[]`, `heroTrustItems[]`, `heroQACard{}`, `trustStripItems[]`
  in `_landingDe` und `_landingEn` hinzufügen
- **Abhängigkeiten:** Keine
- **Betroffene Dateien:** `src/content/site.ts`
- **Akzeptanzkriterien:** Alle neuen Strings sind lokalisiert (de + en), AT/CH
  Ersetzungen funktionieren

### Paket 2: `HeroQACard` Komponente

- **Ziel:** Neue Komponente für die animierte Q→A Visualisierung
- **Abhängigkeiten:** Paket 1
- **Betroffene Dateien:** Neu `src/components/marketing/hero-qa-card.tsx`
- **Wiederverwendung:** `TypewriterText` aus `chrome.tsx`, `GlowCard` aus
  `motion-system.tsx`, `SubsumioMark` für AI-Bubble-Avatar
- **Akzeptanzkriterien:** Karte rendert Question→Typewriter→Sources→Confidence
  in Sequence; Reduced-Motion zeigt statische Vollantwort

### Paket 3: `RotatingBadge` Komponente

- **Ziel:** Crossfade-Rotation durch 3 Badge-Texte
- **Abhängigkeiten:** Paket 1
- **Betroffene Dateien:** Neu `src/components/marketing/rotating-badge.tsx`
- **Akzeptanzkriterien:** 4s Interval, Crossfade, pausiert auf Hover,
  Reduced-Motion = statisch

### Paket 4: Hero-Layout umbauen (Split + Trust-Strip)

- **Ziel:** `landing.tsx` Hero-Sektion von Centered → Split (55/45), Trust-Pills
  unter CTAs, Trust-Strip als Abschluss
- **Abhängigkeiten:** Pakete 1-3
- **Betroffene Dateien:** `src/components/marketing/landing.tsx:90-190`
- **Akzeptanzkriterien:** Split-Layout auf Desktop, Stack auf Mobile, alle
  neuen Elemente sichtbar, `LiveDemo` bleibt below-the-fold

### Paket 5: Motion-Refinement

- **Ziel:** Gerichtete Reveals (H1 von unten, Sub von links, CTA von rechts),
  `MagneticButton` strength 0.35, `font-bold` statt `font-black`
- **Abhängigkeiten:** Paket 4
- **Betroffene Dateien:** `src/components/marketing/landing.tsx`
- **Akzeptanzkriterien:** Motion ist spürbar differenzierter als vorher,
  Reduced-Motion intakt

### Paket 6: Self-Audit & Edge-Case-Test

- **Ziel:** Mobile/Tablet/Desktop verifizieren, Reduced-Motion prüfen,
  Lighthouse-Audit, TypeScript-Check
- **Abhängigkeiten:** Pakete 1-5
- **Akzeptanzkriterien:** DoD-Checkliste vollständig abgehakt

---

## 6. Priorisierung & Aufwand

| Priorität | Maßnahme                          | Aufwand | Hebel                                     |
| --------- | --------------------------------- | ------- | ----------------------------------------- |
| **P0**    | Q→A Card im Hero (above-the-fold) | ~4h     | 🔴 Größter Hebel — 3-Sekunden-Regel       |
| **P0**    | Split-Layout (55/45)              | ~2h     | 🔴 Visueller Anker, Product-Led           |
| **P1**    | `heroTagline` im Hero rendern     | ~15min  | 🟡 Starkes Messaging, bereits vorhanden   |
| **P1**    | `font-bold` statt `font-black`    | ~5min   | 🟡 Ehrliche Typografie                    |
| **P1**    | Secondary CTA → Ghost-Button      | ~10min  | 🟡 CTA-Hierarchie                         |
| **P1**    | Trust-Pills mit Icons             | ~30min  | 🟡 Scanbarkeit                            |
| **P2**    | Rotating Badge                    | ~1h     | 🟡 3 Differentiatoren auf gleicher Fläche |
| **P2**    | Trust-Strip (5 Badges)            | ~30min  | 🟡 Hero-Abschluss                         |
| **P2**    | Motif Opacity 12-15%              | ~5min   | 🟡 Sichtbarkeit                           |
| **P2**    | Gerichtete Reveals                | ~30min  | 🟢 Motion-Differenzierung                 |
| **P3**    | `MagneticButton` 0.35             | ~2min   | 🟢 Feinschliff                            |

**Gesamtaufwand:** ~8-9 Stunden (P0-P3)
**P0+P1 allein:** ~6.5 Stunden (größter ROI)

---

## 7. Quellen

- Genesys Growth — _Best Practices for Designing B2B SaaS Landing Pages 2026_
  (Story-driven hero, ≤8 word H1, trust signals, CTA optimization)
- SaaSHero — _Top Landing Page Design Trends for B2B SaaS in 2026_
  (Product-led storytelling, conversion-focused minimalism, one main CTA)
- Motion.dev — _Animation Performance Guide_ (Spring-smoothed scroll, GPU transforms)
- web.dev — _Interaction to Next Paint (INP)_ (Ziel ≤200ms p75)
- Bestehendes Audit: `docs/marketing/landing-audit-2026-07.md` (Vorarbeit, Token-System)
