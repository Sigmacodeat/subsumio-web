# Subsum.io — Hero & Logo Animation Audit 2026

> **Datum:** 21. Juni 2026  
> **Scope:** Startseite (`/`), Hero-Section, `SubsumioMark` / `SubsumioLogo` Brand-Komponenten, Motion-System  
> **Ziel:** State-of-the-Art Audit + Agentur-Feinschliffplan für moderne Hero- & Logo-Animation

---

## 1. Ist-Zustand Analyse

### 1.1 Logo-Komponente (`subsumio-logo.tsx`)

**Aktuelle Implementierung:**

- `SubsumioMark`: Statisches SVG-Icon (Lucide `Scale`) in einem Gradient-Tile (teal → blue → violet)
- `SubsumioLogo`: Wordmark "Subsum**•**io" mit blauem Dot (`brand-text`) + Subtitle "LEGAL INTELLIGENCE"
- Der Dot (`•`) ist ein statisches Zeichen ohne jedliche Animation
- Kein SVG-Path-Animation, kein Draw-Effekt, kein Pulse

**Probleme:**

- Der blaue Dot als Markenkern (domain dot von subsum.io) ist komplett statisch — er ist das visuell markanteste Element und tut nichts
- Das `Scale`-Icon ist ein generisches Lucide-Icon, kein eigenes SVG — keine Brand-Identität
- Kein Hover-State auf dem Logo
- Kein Load-In-Animation auf dem Logo beim Seitenaufruf
- Das Gradient-Tile hat einen `blur-md` Halo, aber keine Bewegung

### 1.2 Hero-Section (`landing.tsx`)

**Aktuelle Implementierung:**

- Zentriertes Layout: Badge → H1 → Subhead → CTAs → Trust-Signals → LiveDemo
- Framer Motion `heroStagger` mit `staggerChildren: 0.08` und `delayChildren: 0.1`
- `heroItem`: fade-up 18px, 0.55s, `[0.22, 1, 0.36, 1]` easing
- Badge-Dot: `animate-pulse` (Tailwind default — grob, nicht fein abgestimmt)
- H1: Zweizeilig, zweite Zeile in `--brand-primary` Farbe
- LiveDemo: fade-up + scale 0.98→1, 0.6s, 0.15s delay

**Probleme:**

- Hero ist **zentriert** — 2026 Trend geht zu asymmetrischen 2-Spalten-Layouts (Quelle: Conductor AEO Benchmark, +18% time-on-page)
- H1-Animation ist ein simpler Block-Fade — kein Word-by-Word-Stagger, obwohl das Motion-System `TextReveal` dafür bereits vorbereitet hätte
- Badge-Dot nutzt `animate-pulse` (Tailwind default) statt einer feinen Custom-Animation
- Kein Scroll-Linked-Animation im Hero (Parallax-Orbs sind global, nicht Hero-spezifisch)
- Kein Gradient-Text auf dem H1 — `--brand-primary` ist flach, kein animierter Gradient
- Kein Aurora/Mesh-Gradient im Hero-Hintergrund — nur globale Orbs
- CTA-Button hat kein Magnetic/Spring-Hover (obwohl `MagneticCard` im Motion-System existiert)
- Kein Scroll-Progress-Indicator (obwohl `ScrollProgress` im Motion-System existiert)
- `prefers-reduced-motion` wird respektiert (gut!)

### 1.3 Motion-System (`motion-system.tsx`)

**Vorhanden aber ungenutzt im Hero:**

- `TextReveal` — Word-by-Word stagger (cinematic headline)
- `ClipReveal` — Clip-Path wipe (premium 2025 pattern)
- `MagneticCard` — Spring-based hover lift + tilt
- `ScrollProgress` — Thin branded bar
- `AnimatedCounter` — GPU-optimized counter

**Bewertung:** Das Motion-System ist exzellent gebaut, aber der Hero nutzt nur ~30% davon.

### 1.4 CSS-Animationen (`globals.css`)

**Vorhanden:**

- `pulse-ring` — Pulse-Ring für Badges
- `float-gentle` — Sanftes Schweben
- `gradient-border-spin` — Animierter Gradient-Border
- `gradient-text-animated` — Animierter Gradient-Text
- `surface-glint` — Glint-Effekt auf Karten
- `orb-float` — Schwebende Gradient-Orbs
- `shimmer` — Loading-Shimmer

**Ungenutzt im Hero:** `gradient-text-animated`, `float-gentle`, `pulse-ring`, `surface-glint`

---

## 2. State-of-the-Art Recherche 2026

### 2.1 Hero-Section Trends (Quellen: Landdding, SocialAnimal, Mockflow, Sailop, PravinKumar)

| Trend                                                  | Quelle                                                                 | Relevanz für Subsumio                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Asymmetric 2-column hero**                           | PravinKumar: +31% demo bookings, +18% time-on-page                     | Mittel — Subsumio ist B2B SaaS, aber zentriert funktioniert auch 2026 wenn Execution stimmt |
| **Product-led hero (interactive demo)**                | Mockflow, SocialAnimal: "static screenshots are behind-the-curve"      | **Hoch** — LiveDemo ist bereits vorhanden, sollte aber stärker im Hero platziert werden     |
| **Surgical motion (1-2 tuned reveals)**                | Landdding: "animating everything on scroll gave way to surgical style" | **Hoch** — weniger ist mehr, aber die 1-2 Animationen müssen premium sein                   |
| **Scroll-triggered storytelling**                      | SocialAnimal: Linear, Vercel, Supabase nutzen dies                     | Mittel — für später, nicht in diesem Sprint                                                 |
| **Animated gradient text on hero**                     | Landdding: "gradients returned as surgical tool for hero element"      | **Hoch** — H1 zweite Zeile sollte animierten Gradient bekommen                              |
| **Bold typography + custom graphics**                  | Mockflow: "bold typography and custom product graphics"                | **Hoch** — Space Grotesk ist gut, aber H1 braucht mehr Weight/Presence                      |
| **Anti-slop: avoid centered-pill-gradient-button-row** | Sailop: 60% of AI-generated sites use this pattern                     | **Kritisch** — Subsumio Hero ist genau dieses Pattern. Unterscheidung nötig                 |

### 2.2 Logo Animation Trends 2026 (Quellen: Renderforest, SVGator, SVGAnimate, Motn)

| Trend                           | Quelle                                                           | Relevanz für Subsumio                                                      |
| ------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **One memorable gesture**       | Renderforest: "animate one memorable gesture, not every element" | **Hoch** — der blaue Dot ist THE gesture                                   |
| **Pulse/Breathe on brand mark** | SVGator: soft pulse/breathe on key element                       | **Hoch** — Dot sollte atmen/pulsieren                                      |
| **Draw-on SVG path**            | SVGAnimate: stroke-dasharray draw effect                         | Mittel — Scale-Icon könnte draw-on haben                                   |
| **Spring-in entrance**          | Motn, SVGAnimate: spring physics on logo load                    | **Hoch** — Logo sollte beim Load springen                                  |
| **Hover-ready states**          | SVGAnimate: hover states for nav bars                            | **Hoch** — Logo im Nav sollte auf Hover reagieren                          |
| **Wordmark letter stagger**     | Renderforest: kinetic typography, letter-by-letter               | **Hoch** — "Subsum•io" sollte beim Load Buchstabe-für-Buchstabe erscheinen |

### 2.3 Framer Motion Best Practices 2026 (Quellen: ogblocks, FramerWebsites, Medium)

| Pattern                                     | Quelle                                                        | Relevanz                                                 |
| ------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| **Word-by-word stagger with clip-mask**     | ogblocks: "cinematic masked slide-up per word"                | **Hoch** — H1 sollte Word-stagger mit clip-path bekommen |
| **Spring physics for interactive elements** | ogblocks: "spring physics mimics real-world momentum"         | **Hoch** — CTA-Buttons sollten spring-hover haben        |
| **Scroll-linked transforms**                | FramerWebsites: scroll-based effects                          | Mittel — für später                                      |
| **Stagger order = reading order**           | Medium: "make sure stagger matches how visitors process info" | **Hoch** — Reihenfolge: Logo → Badge → H1 → Sub → CTAs   |

---

## 3. Gap-Analyse: Subsumio vs. State-of-the-Art

### 3.1 Logo Gaps

| #   | Gap                                                           | Severity | Aufwand |
| --- | ------------------------------------------------------------- | -------- | ------- |
| L1  | Blauer Dot (`•`) ist statisch — kein Pulse/Breathe            | **Hoch** | Klein   |
| L2  | Kein Load-In-Animation (spring/fade) auf dem Logo             | **Hoch** | Klein   |
| L3  | Kein Hover-State auf dem Logo im Nav                          | Mittel   | Klein   |
| L4  | Wordmark "Subsum•io" erscheint als Block, kein Letter-Stagger | Mittel   | Mittel  |
| L5  | `Scale`-Icon ist generisch, kein Custom-SVG mit Draw-On       | Niedrig  | Groß    |
| L6  | Tile-Gradient ist statisch, keine subtile Rotation/Shift      | Niedrig  | Klein   |

### 3.2 Hero Gaps

| #   | Gap                                                                            | Severity | Aufwand |
| --- | ------------------------------------------------------------------------------ | -------- | ------- |
| H1  | H1 ist Block-Fade, kein Word-by-Word-Stagger mit clip-mask                     | **Hoch** | Mittel  |
| H2  | Zweite H1-Zeile ist flache Farbe, kein animierter Gradient                     | **Hoch** | Klein   |
| H3  | Badge-Dot nutzt `animate-pulse` (grobschlächtig) statt feiner Custom-Animation | Mittel   | Klein   |
| H4  | Kein Aurora/Mesh-Gradient im Hero-Hintergrund (nur globale Orbs)               | Mittel   | Mittel  |
| H5  | CTA-Buttons haben kein Magnetic/Spring-Hover                                   | Mittel   | Klein   |
| H6  | Kein Scroll-Progress-Indicator auf der Seite                                   | Niedrig  | Klein   |
| H7  | Hero ist zentriertes Pill-Button-Row Pattern (AI-slop fingerprint)             | Mittel   | Groß    |
| H8  | Kein subtiler Glint/Shimmer auf dem Primary-CTA                                | Niedrig  | Klein   |
| H9  | Trust-Signals sind statisch, kein fade-in-stagger                              | Niedrig  | Klein   |

### 3.3 Anti-Slop Check (Sailop 2026)

> "The centered-pill-gradient-button-row hero shows up on 60% of AI-generated landing pages."

Subsumio's aktueller Hero:

- ✅ Zentriert — **ja** (AI-slop signal)
- ✅ Pill-Badge oben — **ja** (AI-slop signal)
- ✅ Gradient-Button-Row — **ja** (glow variant, aber AI-slop signal)
- ✅ Gradient-Text — **nein** (nur flache Farbe, kein Gradient)

**Score: 3/4 AI-slop signals.** Das ist problematisch. Die Animation-Modernisierung muss unterscheiden, nicht nur dekorieren.

**Lösungsansatz:** Nicht das Layout ändern (zentriert funktioniert für B2B Legal), aber die **Ausführung** so premium machen, dass sie nicht mehr wie AI-Default aussieht:

- Word-by-Word clip-mask reveal auf H1 (nicht Block-Fade)
- Animierter Gradient-Text auf H1-Zeile 2 (nicht flache Farbe)
- Custom Dot-Pulse auf Badge (nicht Tailwind `animate-pulse`)
- Magnetic Spring-Hover auf CTAs (nicht Standard-Hover)
- Subtiler Aurora-Wash im Hero-Hintergrund (nur im Hero, nicht global)

---

## 4. Modernisierungsplan — Agentur-Feinschliff

### 4.1 Phase 1: Logo-Animation (Quick Wins, Hoher Impact)

#### P1-L1: Animierter blauer Dot (`•`)

**Konzept:** Der Dot "atmet" — subtile Scale + Glow Pulse, 3s Loop.

```tsx
// In subsumio-logo.tsx, ersetze:
// <span className="brand-text">•</span>
// durch:
<motion.span
  className="brand-text inline-block"
  animate={{
    scale: [1, 1.15, 1],
    textShadow: [
      "0 0 0px var(--brand-glow)",
      "0 0 12px var(--brand-glow)",
      "0 0 0px var(--brand-glow)",
    ],
  }}
  transition={{
    duration: 3,
    repeat: Infinity,
    ease: "easeInOut",
  }}
>
  •
</motion.span>
```

**Reduced-motion:** `scale: 1, textShadow: none` (statisch).

#### P1-L2: Logo Load-In Animation

**Konzept:** Beim Seitenaufruch: Tile springt rein (scale 0.8→1, spring), dann Wordmark fade-in-left, dann Dot pulse startet.

```tsx
// Tile: spring-in
initial={{ scale: 0.8, opacity: 0 }}
animate={{ scale: 1, opacity: 1 }}
transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}

// Wordmark: fade-in-left
initial={{ opacity: 0, x: -8 }}
animate={{ opacity: 1, x: 0 }}
transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
```

#### P1-L3: Logo Hover-State

**Konzept:** Hover im Nav: Dot scale 1.3 + intensivierter Glow, Tile subtile Rotation (2deg).

#### P1-L4: Wordmark Letter-Stagger (Optional)

**Konzept:** "S-u-b-s-u-m-•-i-o" erscheint Buchstabe-für-Buchstabe mit 30ms stagger.

```tsx
const letters = "Subsum•io".split("");
// Jeder Buchstabe: initial { opacity: 0, y: 4 }, animate { opacity: 1, y: 0 }
// stagger: 0.03, delayChildren: 0.3
```

### 4.2 Phase 2: Hero-Animation (Premium Execution)

#### P2-H1: H1 Word-by-Word Clip-Mask Reveal

**Konzept:** Nutze vorhandenes `TextReveal` oder baue Custom-Variant:

- Jedes Wort erscheint aus einem clip-path mask (inset(100% 0% 0% 0%) → inset(0%))
- stagger: 0.06, duration: 0.6, ease: `[0.16, 1, 0.3, 1]` (dramatic)
- Zweite Zeile ("Legal Intelligence" / "Legal Intelligence") startet nach erster Zeile

**Implementation:**

```tsx
// Ersetze den motion.div Block um den H1 durch:
<motion.h1
  className="..."
  initial="hidden"
  animate="visible"
  variants={{
    hidden: {},
    visible: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } },
  }}
>
  {t.h1a.split(" ").map((word, i) => (
    <motion.span
      key={i}
      className="inline-block"
      variants={{
        hidden: { clipPath: "inset(100% 0% 0% 0%)", opacity: 0 },
        visible: {
          clipPath: "inset(0% 0% 0% 0%)",
          opacity: 1,
          transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
        },
      }}
    >
      {word}{" "}
    </motion.span>
  ))}
  <br />
  <motion.span
    className="gradient-text-animated whitespace-nowrap"
    variants={{
      hidden: { clipPath: "inset(100% 0% 0% 0%)", opacity: 0 },
      visible: {
        clipPath: "inset(0% 0% 0% 0%)",
        opacity: 1,
        transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 },
      },
    }}
  >
    {t.h1b}
  </motion.span>
</motion.h1>
```

#### P2-H2: Animierter Gradient-Text auf H1 Zeile 2

**Konzept:** Nutze vorhandene `.gradient-text-animated` CSS-Klasse auf der zweiten H1-Zeile.

- Gradient: teal → blue → violet (Brand-Gradient)
- Animation: 5s ease infinite shift
- Dadurch wird die zweite Zeile zum visuellen Hingucker, unterscheidet vom AI-slop flachen Blau

**Implementation:** Klasse `gradient-text-animated` auf das `<span>` der zweiten Zeile anwenden (CSS existiert bereits in `globals.css`).

#### P2-H3: Custom Badge-Dot Animation

**Konzept:** Ersetze `animate-pulse` durch eine feinere Custom-Animation:

- Scale: 1 → 1.3 → 1 (2s, easeInOut, infinite)
- Opacity: 0.6 → 1 → 0.6
- Box-Shadow: 0 0 0px → 0 0 8px brand-glow → 0 0 0px

```tsx
<motion.span
  className="brand-bg h-1.5 w-1.5 rounded-full"
  aria-hidden="true"
  animate={{
    scale: [1, 1.3, 1],
    opacity: [0.6, 1, 0.6],
  }}
  transition={{
    duration: 2,
    repeat: Infinity,
    ease: "easeInOut",
  }}
/>
```

#### P2-H4: Aurora/Mesh-Gradient im Hero-Hintergrund

**Konzept:** Ein subtiler, lokaler Aurora-Wash NUR im Hero (nicht global):

- Radial-Gradient von brand-primary (10% opacity) oben-links zu transparent
- Radial-Gradient von brand-secondary (8% opacity) unten-rechts zu transparent
- Sanfte Animation (8s, easeInOut, infinite) — verschiebung der Gradient-Zentren

```tsx
// Im Hero <section>, vor dem content:
<motion.div
  className="pointer-events-none absolute inset-0 overflow-hidden"
  aria-hidden
  animate={{
    background: [
      "radial-gradient(ellipse 80% 50% at 20% 20%, color-mix(in srgb, var(--brand-primary) 8%, transparent), transparent)",
      "radial-gradient(ellipse 80% 50% at 80% 80%, color-mix(in srgb, var(--brand-primary) 8%, transparent), transparent)",
      "radial-gradient(ellipse 80% 50% at 20% 20%, color-mix(in srgb, var(--brand-primary) 8%, transparent), transparent)",
    ],
  }}
  transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
/>
```

#### P2-H5: Magnetic Spring-Hover auf CTA-Buttons

**Konzept:** Primary CTA bekommt Magnetic-Effekt:

- Maus folgt Button-Zentrum mit Spring-Physics
- Subtile Tilt (max 2deg) + Lift (4px)
- Nutze vorhandenes `MagneticCard` oder baue Inline

**Alternative (einfacher):** Button scale 1.02 + shadow-intensivierung auf Hover mit spring transition.

#### P2-H6: Scroll-Progress-Indicator

**Konzept:** Nutze vorhandenes `ScrollProgress` Component — thin branded bar am Top der Seite.

- Einzeiliger Import + Render in `landing.tsx` oder `marketing-shell.tsx`

#### P2-H7: Trust-Signal Stagger

**Konzept:** Trust-Signals unter CTAs bekommen eigenen Sub-Stagger (0.04s zwischen Items).

### 4.3 Phase 3: Premium Finetuning (Optional, niedrigere Priorität)

| #   | Maßnahme                     | Beschreibung                                                                           |
| --- | ---------------------------- | -------------------------------------------------------------------------------------- |
| F1  | CTA Glint/Shimmer            | Subtiler `surface-glint` auf Primary-CTA bei Hover                                     |
| F2  | Hero-Section Scroll-Parallax | H1 bewegt sich leicht nach oben beim Scrollen (0.8x rate)                              |
| F3  | Badge Entrance Spring        | Badge springt rein mit `type: "spring", stiffness: 300, damping: 20` statt linear fade |
| F4  | Demo-Reel Clip-Reveal        | LiveDemo nutzt `ClipReveal` statt simple fade-up                                       |
| F5  | Nav-Logo Hover → Dot Scale   | Beim Hover über Nav-Logo: Dot scale 1.4 + glow intensivierung                          |

---

## 5. Implementierungs-Reihenfolge

### Sprint 1: Quick Wins (Logo + Badge + Gradient-Text)

1. **L1:** Animierter Dot-Pulse in `SubsumioLogo` — 15min
2. **L2:** Logo Load-In Spring-Animation — 20min
3. **H3:** Custom Badge-Dot Animation (ersetzt `animate-pulse`) — 10min
4. **H2:** `gradient-text-animated` Klasse auf H1 Zeile 2 — 5min
5. **H6:** `ScrollProgress` einbinden — 5min

### Sprint 2: Hero Premium Animation

6. **H1:** H1 Word-by-Word Clip-Mask Reveal — 30min
7. **H4:** Aurora/Mesh-Gradient im Hero-Hintergrund — 20min
8. **H5:** Magnetic Spring-Hover auf Primary-CTA — 20min
9. **H9:** Trust-Signal Sub-Stagger — 10min

### Sprint 3: Finetuning (Optional)

10. **L3:** Logo Hover-State im Nav — 15min
11. **L4:** Wordmark Letter-Stagger — 20min
12. **F1-F5:** Premium Finetuning — je 10-15min

---

## 6. Technische Anforderungen

### 6.1 Performance

- Alle Animationen nutzen GPU-optimierte Transforms (`transform`, `opacity`, `clip-path`)
- Keine Layout-Thrashing-Properties (`width`, `height`, `top`, `left`)
- `will-change` auf animierten Elementen
- `prefers-reduced-motion` wird für alle Animationen respektiert
- Keine neuen Dependencies — Framer Motion + vorhandene CSS-Animationen reichen

### 6.2 Accessibility

- Alle dekorativen Animationen haben `aria-hidden="true"`
- `prefers-reduced-motion: reduce` → alle Animationen auf `duration: 0.01ms`
- Logo-Animation beeinträchtigt nicht die Lesbarkeit des Wordmarks
- H1-Clip-Reveal: Text ist im DOM sofort verfügbar (nur visuell maskiert)

### 6.3 Browser-Kompatibilität

- `clip-path: inset()` — supported in allen modernen Browsern (caniuse 96%+)
- `background-clip: text` — supported mit `-webkit-` prefix (bereits in globals.css)
- Spring-Physics — Framer Motion internal, keine Browser-API nötig

### 6.4 Reduced-Motion Fallback

```tsx
const reduce = useReducedMotion();
// Alle Animationen:
if (reduce) {
  // Statisch: opacity: 1, scale: 1, clipPath: "inset(0% 0% 0% 0%)"
}
```

---

## 7. Definition of Done

- [ ] Blauer Dot im Logo pulsiert subtil (scale + glow, 3s loop)
- [ ] Logo hat Load-In Spring-Animation beim Seitenaufruf
- [ ] H1 erscheint Word-by-Word mit clip-path mask reveal
- [ ] H1 zweite Zeile hat animierten Gradient-Text (teal→blue→violet)
- [ ] Badge-Dot hat feine Custom-Pulse (nicht Tailwind `animate-pulse`)
- [ ] Hero hat lokalen Aurora-Gradient-Hintergrund
- [ ] Primary-CTA hat Magnetic/Spring-Hover
- [ ] ScrollProgress-Indicator ist sichtbar
- [ ] Trust-Signals haben Sub-Stagger
- [ ] Alle Animationen respektieren `prefers-reduced-motion`
- [ ] Keine neue Dependency hinzugefügt
- [ ] Lighthouse Performance Score bleibt ≥ 90
- [ ] Visuelles Selbst-Audit: Hero sieht nicht aus wie AI-Default-Template

---

## 8. Quellen

- [Landdding — State of Landing Pages 2026](https://landdding.com/state-of-landing-pages-2026)
- [SocialAnimal — SaaS Website Examples 2026](https://socialanimal.dev/blog/saas-website-examples-2026-design-pattern-teardowns/)
- [Mockflow — 8 SaaS Website Design Trends 2026](https://mockflow.com/blog/saas-website-design-trends)
- [Sailop — Hero Section Anti-Slop 2026](https://sailop.com/blog/hero-section-anti-slop-21-compositions-2026)
- [PravinKumar — Asymmetric Two-Column Hero 2026](https://www.pravinkumar.co/blog/asymmetric-two-column-hero-b2b-webflow-2026)
- [Renderforest — Logo Animation Trends 2026](https://www.renderforest.com/blog/logo-animation-trends)
- [SVGator — 30 Animated Logo Examples](https://www.svgator.com/blog/animated-logo-examples/)
- [SVGAnimate — SVG Logo Animation Generator 2026](https://svganimate.ai/en/tools/svg-logo-animation)
- [ogblocks — Framer Motion Text Animation Patterns](https://ogblocks.dev/blog/framer-motion-text-animation)
- [FramerWebsites — Framer Animations Complete Guide 2026](https://framerwebsites.com/blog/framer-animations-complete-guide)
- [Motn — Animated Cursor Logo Reveal Template](https://www.motn.ai/templates/cursor-logo-183)
