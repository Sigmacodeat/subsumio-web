# Subsumio Landing-Page — Audit & Feinschliff (2026-07)

State-of-the-art / Agenturlevel-Review der öffentlichen Startseite
(`src/app/page.tsx` → `src/components/marketing/landing.tsx`).
Bewertet gegen aktuelle B2B-SaaS-Best-Practices 2026 (Quellen unten).

---

## 0. Executive Summary

Die Startseite ist bereits **überdurchschnittlich stark**: ein durchdachtes
Token-System (`--mk-*` tonaware Surfaces, alle WCAG-AA-verifiziert), ein
research-basiertes Motion-System (Spring-geglättete scroll-linked Values nach
Motion.dev, `prefers-reduced-motion` überall respektiert), sauberes
self-hosted Font-Setup (GDPR) und ein klarer P-A-S-Narrativbogen.

Der Feinschliff in diesem Durchgang schließt die **eine echte
Hierarchie-Lücke** (Section-Headings zu klein/inkonsistent), fixt einen
**Umbruch-Bug** in den Pain-Cards und härtet die **Scroll-Performance** des
Sticky-CTA. Verbleibende Punkte sind überwiegend brand-/inhaltliche
Entscheidungen (Tonrhythmus, Narrativreihenfolge) und als TODO-Backlog
priorisiert.

---

## 1. Was bereits State-of-the-Art ist (bewusst NICHT anfassen)

- **Farbkontraste:** `globals.css` dokumentiert jeden Ton-Scope mit gemessenen
  Ratios (light 17.5:1 / slate 15.6:1 / dark 15.6:1, subtle-Werte auf ≥4.6:1
  nachjustiert). AA flächendeckend erfüllt. **Kein Handlungsbedarf.**
- **Motion:** `useSpring` auf allen scroll-linked Werten
  (`stiffness 100 / damping 30`), Scale 0.88→1, Blur ≤4px — exakt die
  Motion.dev-Empfehlung. `EASE`-Kurven spiegeln die CSS-`--ds-ease-*`-Tokens.
- **Reduced Motion:** Hero, Scroll-Pinned-Dashboard und Reel haben echte
  statische Fallbacks, nicht nur „duration 0".
- **Fonts:** `next/font` self-hosted (Inter, Space Grotesk, JetBrains Mono),
  `display: optional` → kein Render-Blocking, kein Google-Request (DSGVO).
- **SEO/Schema:** JSON-LD (Organization, LocalBusiness, SoftwareApplication,
  FAQ, HowTo), Review-Schema nur bei echten Testimonials (UWG-sauber).

---

## 2. Behoben in diesem Durchgang ✅

| #   | Fund                                                                                                                                                                        | Severity | Fix                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | **Section-Headings zu klein & inkonsistent.** H1 = 60px, aber fast alle H2 = 30px (2:1-Sprung), mit einer 36px-Ausnahme (WhatsApp). Für 1280px+ Premium-Layouts zu zaghaft. | P0       | `SectionHeading` + die 3 Sektions-H2 (Superbrain, Workflow, Trust) + finale CTA auf einheitliche Skala **28px mobil / 36px Desktop**, `tracking-[-0.02em]`, `leading-[1.12]`, `text-balance`. Verhältnis jetzt 60→36 (1,67:1). |
| F2  | **Pain-Card Umbruch-Bug.** Werte-Spalte ohne Breite → „bis zu 40 %" brach dreizeilig („bis / zu 40 / %").                                                                   | P0       | Feste `w-[88px] shrink-0` Werte-Spalte + `leading-[1.1] text-balance` → saubere, bündige Zwei-Spalten-Karte.                                                                                                                   |
| F3  | **Sticky-CTA Scroll-Perf.** `window.addEventListener('scroll')` + `setState` pro Frame → unnötige Re-Renders, INP-Risiko.                                                   | P1       | Ersetzt durch `useMotionValueEvent` mit Threshold-Crossing-Guard → max. 2 Re-Renders (show/hide) statt pro Frame.                                                                                                              |
| F4  | **Hero-/Body-Textwrapping.** Ungleichmäßige Zeilenlängen bei Sub-Texten.                                                                                                    | P1       | `text-pretty` auf Hero-Sub & SectionHeading-Sub, `text-balance` auf allen Headings → gleichmäßige, ruhigere Zeilenumbrüche.                                                                                                    |
| F5  | **Narrativreihenfolge invertiert.** Stats (Proof) stand vor Pain (Agitation).                                                                                               | P1       | Reihenfolge getauscht → Hero → Trust-Strip → **Pain** → **Stats** → Superbrain. Sauberer P-A-S-P-Bogen, im Browser verifiziert.                                                                                                |
| F6  | **Tonrhythmus (2. Light-Lauf).** 6 aufeinanderfolgende `light`-Sektionen wirkten flach.                                                                                     | P1       | Comparison-Tabelle auf **`dark` Spotlight** gehoben (+ Gradient-Übergänge). `dark`-Scope trägt AA-helle Signal-Akzente (Check #34d399 verifiziert), anders als `slate`. Bricht den Lauf, rahmt den Differenzierungs-Moment.    |
| F7  | **`<Section>` verwarf `aria-label`.** Die Primitive reichte native Attribute nicht durch → 8 Marketing-Landmarks ohne Label im DOM.                                         | P2       | `...rest`-Spread (`& React.HTMLAttributes<HTMLElement>`) auf das `<section>`. Labels jetzt im DOM verifiziert.                                                                                                                 |

Alle Änderungen im Browser verifiziert (Desktop + Mobile), keine
Konsolen-Fehler im finalen Render, `prefers-reduced-motion`-Pfade unberührt.

---

## 3. TODO-Backlog (priorisiert, zur Freigabe)

Diese Punkte sind **Marken-/Inhaltsentscheidungen** oder größere strukturelle
Eingriffe — bewusst nicht ohne Freigabe umgesetzt.

### P1 — Struktur & Narrativ

- [x] ~~**Narrativreihenfolge P-A-S-P.**~~ **Erledigt (F5):** Pain steht jetzt
      vor Stats.
- [x] ~~**Tonrhythmus, 2. Light-Lauf.**~~ **Erledigt (F6):** Comparison als
      `dark`-Spotlight.
- [x] ~~**Tonrhythmus, 1. Light-Lauf.**~~ **Geprüft & bewusst verworfen:**
      Scroll-Pinned-Dashboard als slate/dark Spotlight getestet — der 200vh-Sticky-
      Viewport ist höher als das Reel, wodurch ein dunkler Slate als großer leerer
      Void unter dem gepinnten Dashboard sichtbar wird (auf Light füllt ihn die
      Parallax-Textur unauffällig). Zudem schließt Run 1 ohnehin auf dem
      **WhatsApp-Dark-Spotlight** — der Ton-Anker existiert also bereits. Change
      wieder revertiert; kein Netto-Gewinn ohne vorherige vertikale
      Zentrierungs-Korrektur des Sticky-Inhalts (eigener größerer Task, falls je
      gewünscht).
- [ ] **Spacing-Rhythmus.** Nahezu alle Sektionen `py-24` (96px) — uniform =
      monoton. Bewusste Variation (Hero groß, dichte Grids enger, Spotlights
      luftiger) erzeugt Pacing. Vorschlag: `py-20`/`py-28`/`py-32` gezielt
      gestaffelt.

### P2 — Konsistenz & Repräsentation

- [ ] **`font-black` (900) rendert real 700.** Space Grotesk lädt max. 700 —
      `font-black` ist damit ein No-op-Versprechen. Entweder eine 900-fähige
      Display-Schrift laden **oder** `font-black`→`font-bold` (ehrlich, ohne
      optische Änderung). Rein kosmetisch/technisch.
- [~] **Dashboard-Abgleich: Wissensgraph-View (gebaut, revertiert — QA-Bedarf).**
  Das Produkt hat **~81 Dashboard-Routen**; die Landing zeigt im Reel 3 Views +
  6 Feature-Cards — der **Wissensgraph** (North-Star-Differenzierung) ist visuell
  unterrepräsentiert. Ein 4. Reel-View „Graph" (Entitäten-/Kanten-Visual auf der
  vorhandenen `--graph-*`-Palette) wurde vollständig implementiert (Daten de/en,
  SVG-Render, Sidebar, 4-View-Scroll-Retune auf 260vh). **Dabei aufgedeckt:** die
  ganze Scroll-Pinned-Sektion pinnte nie (siehe Sticky-Bug unten). Der Fix + die
  4-View-Integration ließen sich in der (sehr langsamen, gestaffelt hydrierenden)
  Dev-Preview **nicht zuverlässig verifizieren** — beobachtet wurde ein
  eingefrorener `useScroll`-Progress. Um keine Regression auf dem Homepage-
  Showcase zu riskieren, **sauber auf HEAD revertiert.** Erneut angehen mit
  verlässlicher QA (Staging-Build) — Code-Muster steht.
- [ ] **BUG (real, offen): `overflow-x-hidden` bricht `position: sticky`.** Der
      Landing-Wrapper (`landing.tsx`) nutzt `min-h-screen overflow-x-hidden`. Computed
      ergibt das `overflow-y: auto` → der Wrapper wird zum Scroll-Container →
      **jeder `position: sticky`-Nachfahre pinnt nicht mehr**, insbesondere das
      Scroll-Pinned-Dashboard (es driftet statt zu pinnen). Verifiziert: `hidden/auto`
      computed; `overflow-x: clip` setzt `stickyTop` auf 0. **Aber:** `clip` schien in
      der Preview den `useScroll`-Progress einzufrieren — die beiden hängen zusammen
      und brauchen eine gemeinsame, saubere QA. Nicht blind `clip` setzen, ohne den
      Scroll-Zoom/View-Wechsel auf Staging zu prüfen.
- [ ] **Blur-on-scroll (`scroll-pinned-dashboard`).** `filter: blur()` ist die
      einzige nicht-billig-kompositierbare Eigenschaft im Motion-Stack. Auf 4px
      gekappt (ok), aber auf schwachen Geräten erwägen: nur Opacity/Scale, Blur
      weglassen. Messen via INP auf Low-End.
- [ ] **Logo-Marquee-Integrität.** Sicherstellen, dass nur **echte**
      Zertifikate/Integrationen gezeigt werden (UWG + CLAUDE.md-Privacy-Regel).
- [x] ~~**`<Section>`-Primitive leitet `aria-label` nicht weiter.**~~
      **Erledigt (F7):** `Section` spreadt jetzt `...rest`
      (`& React.HTMLAttributes<HTMLElement>`) auf das echte `<section>`. Verifiziert:
      8 zuvor unbenannte Landmarks („Was es dich kostet", „Key metrics", „Features",
      „Praxis-Workflows", „Vergleich", „Pricing", „FAQ", „Call to action") tragen
      jetzt ihr Label im DOM.

---

## 4. Bewertung nach angefragten Achsen

| Achse                | Status      | Kommentar                                                                                            |
| -------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| Abstände             | 🟡 gut      | Uniform py-24; Rhythmus-Variation als P1 offen.                                                      |
| Typografie / H1 / H2 | 🟢 nach Fix | Hierarchie 60→36 vereinheitlicht; `font-black`→700 als P2.                                           |
| Parallax             | 🟢          | Hero-Motif + BG-Icons transform/opacity-only, `will-change` gesetzt.                                 |
| Sections / Übergänge | 🟢 nach Fix | Dark Comparison-Spotlight + Gradient-Übergänge brechen den 2. Light-Lauf; 1. Lauf als optionaler P1. |
| Farbkontraste        | 🟢          | Flächendeckend AA-verifiziert und dokumentiert.                                                      |
| Texte / roter Faden  | 🟢 nach Fix | P-A-S-P-Bogen jetzt korrekt (Pain vor Stats).                                                        |
| Dashboard-Abgleich   | 🟡          | Kuratiert korrekt; Wissensgraph unterrepräsentiert (P2).                                             |

---

## 5. Recherche-Quellen (2026 Best Practices)

- Genesys Growth — B2B SaaS Landing Pages 2026 (P-A-S-P-Narrativ, 5-Sekunden-Regel)
- Lovable / SaaSHero — Hero-Value-Prop, eine primäre CTA pro Seite
- Motion.dev — _Animation Performance Guide_ & _Web Animation Performance Tier List_ (transform/opacity GPU-composited; `filter: blur` teuer)
- web.dev — _Interaction to Next Paint (INP)_ (Ziel ≤200 ms p75)
- MDN / W3C WCAG 2.2 SC 2.3.3 — `prefers-reduced-motion`, Animation from Interactions
