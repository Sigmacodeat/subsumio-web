# Frontend Design Audit — Farben, Typografie & Designsystem

**Datum:** 2026-06-20  
**Scope:** Gesamte Frontend-Seite (Marketing + Dashboard + Portal + Auth + Legal Components)  
**Standard:** Agency-Level / State-of-the-Art SaaS Design System  
**Status:** ⚠️ **60% Agenturniveau — 40% Feinschliff benötigt**

---

## Executive Summary

Das Design-System hat eine **solide Token-Architektur** (`--ds-*`, `--mk-*`, `--brand-*` mit Tone-Scoping) und WCAG-AA ist für die Token-Werte verifiziert. Doch **~15 Komponenten umgehen das Token-System** mit hardcoded Hex-Werten, die **3 verschiedenen "Primärblau"-Werte** im Code erzeugen Inkonsistenz, und **Typografie/Spacing/Radius haben keine systematischen Tokens** — alles ist ad-hoc Tailwind-Utilities.

### Kritische Zahlen

| Metrik                            | Wert                                       |
| --------------------------------- | ------------------------------------------ |
| Token-basierte Komponenten        | ~70%                                       |
| Hardcoded Hex-Verstöße            | 87 Vorkommen in 15+ Dateien                |
| Verschiedene "primary blue" Werte | 4                                          |
| Verschiedene "subtle text" Werte  | 8                                          |
| Sub-12px Text-Instanzen           | 12+                                        |
| Font-weight-Inkonsistenzen        | 3 Skalen (black/bold/semibold ohne System) |
| Spacing-Tokens                    | 0                                          |
| Radius-Tokens                     | 0                                          |
| Typo-Scale-Tokens                 | 0                                          |

---

## 1. Farben — Token-System vs Hardcoded

### 1.1 Was gut ist ✅

- **Drei-ebiges Token-System**: `--ds-*` (Dashboard/App-Shell), `--mk-*` (Marketing/Public), `--brand-*` (Brand-Akzente)
- **Tone-Scoping** für Marketing: `data-tone="light|slate|dark"` mit eigenen `--mk-*` Werten pro Tone
- **Dashboard-Themes**: `data-app="dashboard"` + `data-theme="light|dark"` mit eigenen `--ds-*` Werten
- **WCAG-AA verifiziert** für alle Token-Werte (mit Kontrast-Ratios dokumentiert in `globals.css`)
- **`accentTile()` Helper** in `chrome.tsx` für tone-aware Icon-Tiles — single source
- **Brand-Utility-Klassen** (`brand-bg`, `brand-text`, `brand-soft`, `brand-border`, etc.) als Abstraktion

### 1.2 Kritische Verstöße ❌

#### A. Hardcoded Dark Palette in Dashboard-Komponenten

**`components/admin/audit-trail.tsx`** — 28+ hardcoded Hex-Werte, komplett ohne Tokens:

```
bg-[#0a0a18]  →  sollte var(--ds-surface-2)
border-[#1e1e3a]  →  sollte var(--ds-border)
text-[#e8e8f0]  →  sollte var(--ds-text)
text-[#8888aa]  →  sollte var(--ds-text-muted)
text-[#8a8aa8]  →  sollte var(--ds-text-subtle)
text-[#7878a0]  →  sollte var(--ds-text-subtle)
bg-[#0d0d1a]  →  sollte var(--ds-surface)
bg-[#12122a]/50  →  sollte var(--ds-surface-2) mit opacity
border-[#3a3a6a]  →  sollte var(--ds-border-strong)
text-[#1e1e3a]  →  sollte var(--ds-border) (decorative icon)
```

**Betroffen:** Komponente funktioniert nur im Dark-Theme. Im Light-Theme des Dashboards ist sie unlesbar.

**`components/error-boundary/error-boundary.tsx`** — gleiche Situation:

```
text-[#e8e8f0]  →  var(--ds-text)
text-[#8888aa]  →  var(--ds-text-muted)
bg-[#0d0d1a]  →  var(--ds-surface)
border-[#1e1e3a]  →  var(--ds-border)
```

**`app/portal/[token]/page.tsx`** — 15+ hardcoded Werte:

```
bg-[#0a0a18], text-[#e8e8f0], text-[#8888aa], text-[#8a8aa8],
border-[#1e1e3a], bg-[#0d0d1a]
```

#### B. Hardcoded Werte in Marketing-Komponenten

**`components/marketing/subsumio-showcase.tsx`** — 11 einzigartige Hex-Werte, die nirgendwo im Token-System existieren:

```
border-[#23233f], bg-[#0a0a14], border-[#1a1a30], bg-[#0b0f1a],
border-[#15233a], bg-[#13351f], text-[#d6f5e1],
border-[#1d3354], bg-[#13213a], text-[#cfe0f5], text-[#8fa6c5]
```

**Problem:** Diese Komponente baut ein "WhatsApp-Preview" mit eigenem Mini-Design-System, das nicht in den Token-Flow integriert ist.

**`components/marketing/branch-pricing.tsx`**:

```
text-[#a8a8be]  →  sollte var(--mk-text-muted)
```

**`components/marketing/download-page.tsx`**:

```
border-[#2a2a52]  →  sollte var(--mk-border-strong) oder Token
bg-[#2a2a52]  →  dekorativ, aber sollte Token haben
```

#### C. Auth-Komponenten mit Dark-Only Palette

**`components/auth/join-form.tsx`** und **`components/auth/recovery-form.tsx`**:

```
bg-[#06060f]  →  sollte var(--mk-bg)
text-[#e8e8f0]  →  sollte var(--mk-text)
text-[#8888aa]  →  sollte var(--mk-text-muted)
text-[#a8a8be]  →  sollte var(--mk-text-muted)
border-[#1e1e3a]  →  sollte var(--mk-border)
bg-[#0a0a18]  →  sollte var(--mk-surface-2)
```

**Problem:** `data-tone="dark"` ist gesetzt, aber die Komponenten nutzen nicht die Tone-Tokens.

#### D. Legal-Komponenten

**`components/legal/CommentThread.tsx`** — `text-[#8a8aa8]` 5× verwendet:

```
text-[#8a8aa8]  →  sollte var(--mk-text-subtle)
```

**`components/legal/RvgDialog.tsx`** — gleicher Verstoß.

#### E. Terminal-Window-Dots — 4× dupliziert

```css
bg-[#ff5f57]  /* rot */
bg-[#febc2e]  /* gelb */
bg-[#28c840]  /* grün */
```

**Betroffen:** `chrome.tsx`, `live-demo.tsx`, `dashboard-reel.tsx`, `product-workflow-showcase.tsx`

**Lösung:** Shared `.terminal-dots` CSS-Klasse oder `<TerminalDots>` Komponente.

#### F. Logo mit hardcoded Gradient

**`components/brand/subsumio-logo.tsx`**:

```tsx
background: "linear-gradient(150deg, #1e3a8a 0%, #1d4ed8 52%, #0ea5e9 100%)"
text-[#3b82f6]  // tile=false mode
```

**Problem:** Logo-Gradient ist nicht mit `--brand-gradient-*` Tokens verbunden. Bei Brand-Wechsel aktualisiert sich das Logo nicht.

### 1.3 Token-System-Inkonsistenzen ⚠️

#### A. `@theme inline` vs `:root` Duplikation

`globals.css` definiert dieselben Werte zweimal:

```css
@theme inline {
  --color-bg-base: #06060f;     /* Tailwind Utility-Generator */
  --color-text-primary: #e8e8f0;
  ...
}
:root {
  --ds-bg: #06060f;              /* CSS Custom Property */
  --ds-text: #e8e8f0;
  ...
}
```

**Risk:** Werte können driften. `--color-text-muted: #4a4a6a` in `@theme` vs `--ds-text-subtle: #6a6a85` in `:root` — **sind bereits unterschiedlich**.

#### B. Vier verschiedene "Primary Blue"

| Scope                            | Wert      | Verwendung                          |
| -------------------------------- | --------- | ----------------------------------- |
| `:root` (Marketing default)      | `#2f6bff` | Marketing-Seiten                    |
| `industry-pack.ts` SubsumioTheme | `#1d4ed8` | Subsumio-Domains (Runtime-Override) |
| Dashboard light                  | `#1e3a5f` | Dashboard Light-Theme               |
| Dashboard dark                   | `#3b82f6` | Dashboard Dark-Theme                |

**Problem:** Das ist nicht per se falsch (verschiedene Kontexte), aber **die Marketing-Site hat zwei verschiedene Blues** (`#2f6bff` default vs `#1d4ed8` Subsumio-Override), die beim Seitenwechsel zu einem Color-Flash führen.

#### C. Acht verschiedene "subtle text" Werte

| Token-Scope                              | Wert      | Kontrast |
| ---------------------------------------- | --------- | -------- |
| `:root` `--ds-text-subtle`               | `#6a6a85` | 3.8:1 ⚠️ |
| `[data-tone="light"]` `--mk-text-subtle` | `#636572` | 4.6:1 ✅ |
| `[data-tone="slate"]` `--mk-text-subtle` | `#7a8ca6` | 5.8:1 ✅ |
| `[data-tone="dark"]` `--mk-text-subtle`  | `#8282a6` | 4.6:1 ✅ |
| Dashboard light `--ds-text-subtle`       | `#576072` | 5.6:1 ✅ |
| Dashboard dark `--ds-text-subtle`        | `#64748b` | 4.6:1 ✅ |
| Hardcoded `#8a8aa8`                      | `#8a8aa8` | 4.0:1 ⚠️ |
| Hardcoded `#7878a0`                      | `#7878a0` | 3.8:1 ⚠️ |

**Problem:** `:root` `--ds-text-subtle: #6a6a85` hat nur 3.8:1 auf `#06060f` — **failt WCAG-AA**. Die Tone-Overrides korrigieren dies, aber ungetonte Bereiche (z.B. `join-form.tsx` mit `data-tone="dark"`) nutzen den `:root`-Wert.

#### D. `--brand-secondary` Bedeutungsverschiebung

| Scope              | Wert      | Bedeutung                |
| ------------------ | --------- | ------------------------ |
| Marketing          | `#20d3c2` | Teal (Akzentfarbe)       |
| `industry-pack.ts` | `#14b8a6` | Teal-500 (anderer Teal!) |
| Dashboard light    | `#475569` | Slate (Neutral!)         |
| Dashboard dark     | `#94a3b8` | Light Slate (Neutral!)   |

**Problem:** Im Marketing ist `--brand-secondary` eine Akzentfarbe (Teal), im Dashboard ist es ein Neutral (Slate). Komponenten, die `brand-text` oder `--brand-secondary` verwenden, sehen im Dashboard völlig anders aus als im Marketing.

### 1.4 Empfehlungen — Farben

| #   | Priorität   | Maßnahme                                                                              | Aufwand |
| --- | ----------- | ------------------------------------------------------------------------------------- | ------- |
| F1  | 🔴 Kritisch | `audit-trail.tsx` — alle 28 hardcoded Hex → `--ds-*` Tokens                           | 1h      |
| F2  | 🔴 Kritisch | `error-boundary.tsx` — alle Hex → `--ds-*` Tokens                                     | 15min   |
| F3  | 🔴 Kritisch | `portal/[token]/page.tsx` — alle 15 Hex → `--mk-*` Tokens                             | 45min   |
| F4  | 🔴 Kritisch | `join-form.tsx` + `recovery-form.tsx` — alle Hex → `--mk-*` Tokens                    | 30min   |
| F5  | 🟡 Hoch     | `CommentThread.tsx` + `RvgDialog.tsx` — `#8a8aa8` → `--mk-text-subtle`                | 15min   |
| F6  | 🟡 Hoch     | `branch-pricing.tsx` — `#a8a8be` → `--mk-text-muted`                                  | 5min    |
| F7  | 🟡 Hoch     | `subsumio-showcase.tsx` — 11 Hex-Werte → Token-Set für "Demo-Preview"                 | 1h      |
| F8  | 🟡 Hoch     | Terminal-Dots → shared `.terminal-dots` CSS-Klasse                                    | 15min   |
| F9  | 🟡 Hoch     | `subsumio-logo.tsx` — Gradient → `--brand-gradient-*` Tokens                          | 15min   |
| F10 | 🟡 Hoch     | `:root` `--ds-text-subtle: #6a6a85` → auf `#8282a6` anheben (AA-konform)              | 5min    |
| F11 | 🟢 Mittel   | `@theme inline` Werte mit `:root` synchronisieren oder `var()` referenzieren          | 30min   |
| F12 | 🟢 Mittel   | `--brand-secondary` im Dashboard → eindeutigen Neutral-Token `--ds-neutral` einführen | 1h      |
| F13 | 🟢 Niedrig  | `download-page.tsx` — `#2a2a52` → Token                                               | 10min   |

---

## 2. Typografie

### 2.1 Was gut ist ✅

- **Self-hosted Fonts** via `next/font` (GDPR-konform, kein Google-Request)
- **Drei-Schrift-System**: Inter (Body), Space Grotesk (Display/Headlines), JetBrains Mono (Code)
- **Font-Variables** auf `<html>`: `--font-inter`, `--font-grotesk`, `--font-jetbrains`
- **`@theme inline`** registriert `--font-sans`, `--font-display`, `--font-mono` für Tailwind v4
- **Global heading rule**: `h1, h2, h3, .font-display` → Space Grotesk mit `letter-spacing: -0.025em`

### 2.2 Kritische Issues ❌

#### A. Keine Type-Scale-Tokens

Es gibt **keine systematische Typo-Skala**. Jede Komponente wählt ad-hoc:

| Klasse             | Verwendung                       | Häufigkeit |
| ------------------ | -------------------------------- | ---------- |
| `text-[10px]`      | CommentThread, subsumio-showcase | 3×         |
| `text-[11px]`      | subsumio-showcase                | 2×         |
| `text-xs` (12px)   | Badges, Labels, Meta             | ~50×       |
| `text-sm` (14px)   | Body, Inputs, Buttons            | ~80×       |
| `text-base` (16px) | Marketing Body                   | ~20×       |
| `text-lg` (18px)   | Subheadings, Dialog Titles       | ~15×       |
| `text-xl` (20px)   | Card Titles, Section Headers     | ~10×       |
| `text-2xl` (24px)  | Section Headings                 | ~8×        |
| `text-3xl` (30px)  | Feature Headings                 | ~5×        |
| `text-4xl` (36px)  | Stat Numbers                     | ~3×        |
| `text-5xl` (48px)  | Hero                             | 1×         |
| `text-7xl` (72px)  | Hero (md:)                       | 1×         |
| `text-[19px]`      | Logo Wordmark                    | 1×         |
| `text-[1.5rem]`    | PageHeader h1                    | 1×         |

**Problem:** Kein System, keine Konsistenz. `text-[1.5rem]` (24px) in `page-header.tsx` vs `text-2xl` (24px) anderswo — gleiche Größe, unterschiedliche Schreibweise.

#### B. Sub-12px Text

`text-[10px]` und `text-[11px]` in:

- `CommentThread.tsx` — Kommentar-Zähler und Timestamps
- `subsumio-showcase.tsx` — WhatsApp-Preview-Nachrichten

**Problem:** Unter 12px ist Text auf Mobile schwer lesbar. WCAG empfiehlt minimum 12px für Body-Text.

#### C. Font-Weight ohne System

| Weight | Klasse          | Verwendung                                                  |
| ------ | --------------- | ----------------------------------------------------------- |
| 900    | `font-black`    | Marketing Headlines (hero, section titles, stat numbers)    |
| 700    | `font-bold`     | Card titles, page headers, nav items                        |
| 600    | `font-semibold` | Card titles (Card primitive), section labels, dialog titles |
| 500    | `font-medium`   | Body text, buttons, badges, nav links                       |

**Problem:** `font-black` (900) für Marketing-Headlines vs `font-bold` (700) für Dashboard-Headlines — die Hierarchie ist nicht konsistent zwischen Marketing und Dashboard. `CardTitle` verwendet `font-semibold` (600), aber manuelle Cards verwenden oft `font-bold` (700).

#### D. Heading-Hierarchie-Lücke

```css
h1,
h2,
h3,
.font-display {
  font-family: var(--font-grotesk), ...;
  letter-spacing: -0.025em;
}
```

**Problem:** `h4`, `h5`, `h6` fallen durch zu Inter ohne `letter-spacing`. In `CommentThread.tsx` wird `h4` verwendet — sieht anders aus als `h3`.

#### E. `letter-spacing: -0.025em` global für alle h1-h3

**Problem:** Bei `text-2xl` (24px) ist `-0.025em` = `-0.6px` — subtil, gut. Bei `text-5xl` (48px) ist es `-1.2px` — gut für Display. Aber bei `text-sm` Headings (die es gibt, z.B. `h3` mit `text-sm`) ist es `-0.35px` — kaum merklich, aber inkonsistent mit dem Display-Charakter.

#### F. Keine Line-Height-Tokens

| Klasse            | Verwendung               |
| ----------------- | ------------------------ |
| `leading-none`    | DialogTitle              |
| `leading-tight`   | PageHeader h1, CardTitle |
| `leading-snug`    | Stat labels, badge text  |
| `leading-relaxed` | Body text, descriptions  |
| `leading-normal`  | Hero subtitle            |
| `leading-[1.05]`  | Hero h1                  |

**Problem:** Kein System. `leading-[1.05]` ist hardcoded für den Hero, aber andere große Headlines verwenden `leading-tight` (1.25).

### 2.3 Empfehlungen — Typografie

| #   | Priorität   | Maßnahme                                                                                | Aufwand |
| --- | ----------- | --------------------------------------------------------------------------------------- | ------- |
| T1  | 🔴 Kritisch | Type-Scale-Tokens einführen: `--ds-text-xs` bis `--ds-text-display`                     | 2h      |
| T2  | 🔴 Kritisch | `text-[10px]` und `text-[11px]` → minimum `text-xs` (12px)                              | 30min   |
| T3  | 🟡 Hoch     | Font-Weight-Hierarchie definieren: Display=700, H1=700, H2=600, H3=600, Body=400/500    | 1h      |
| T4  | 🟡 Hoch     | `h4`-`h6` in globale Heading-Rule aufnehmen oder durch `.font-display` ersetzen         | 15min   |
| T5  | 🟡 Hoch     | Line-Height-Tokens: `--ds-leading-tight`, `--ds-leading-normal`, `--ds-leading-relaxed` | 30min   |
| T6  | 🟢 Mittel   | `text-[1.5rem]` → `text-2xl` in `page-header.tsx`                                       | 5min    |
| T7  | 🟢 Mittel   | `text-[19px]` → Token in Logo                                                           | 5min    |
| T8  | 🟢 Niedrig  | `letter-spacing` responsive: `-0.04em` für Display, `-0.02em` für H2-H3                 | 30min   |

---

## 3. Spacing & Layout

### 3.1 Keine Spacing-Tokens ❌

Das gesamte Spacing basiert auf rohen Tailwind-Utilities ohne `--ds-space-*` Tokens:

| Muster  | Verwendung                     | Häufigkeit |
| ------- | ------------------------------ | ---------- |
| `p-4`   | Cards, inputs                  | ~40×       |
| `p-6`   | Cards (Card primitive), panels | ~30×       |
| `p-8`   | Large cards, auth panels       | ~10×       |
| `gap-2` | Tight groups                   | ~20×       |
| `gap-3` | Standard groups                | ~25×       |
| `gap-4` | Section gaps                   | ~20×       |
| `mb-3`  | Heading → body                 | ~15×       |
| `mb-8`  | Section → next                 | ~10×       |
| `mb-14` | Section heading → content      | 2×         |

**Problem:** Card-Padding ist `p-6` in der `Card`-Primitive, aber manuelle Cards verwenden `p-4`, `p-5`, `p-8` — keine Konsistenz.

### 3.2 Section-Spacing ohne Rhythmus

| Section                | Padding                             |
| ---------------------- | ----------------------------------- |
| Hero                   | `pt-28 pb-24` / `md:pt-36 md:pb-28` |
| Feature section        | `pb-16`                             |
| Stats band             | `pb-20`                             |
| How it works           | (eigene Komponente)                 |
| Security cross-link    | `pb-24`                             |
| Everything at a glance | `pb-24`                             |
| CTA section            | (variiert)                          |
| Footer                 | `py-14`                             |

**Problem:** Kein konsistenter vertikaler Rhythmus. `pb-16`, `pb-20`, `pb-24` wechseln ohne System.

### 3.3 Keine Radius-Tokens ❌

| Klasse                      | Verwendung                               |
| --------------------------- | ---------------------------------------- |
| `rounded-lg` (8px)          | Inputs, buttons, small elements          |
| `rounded-xl` (12px)         | Cards, panels                            |
| `rounded-2xl` (16px)        | Large cards, mega-dropdown, glass panels |
| `rounded-3xl` (24px)        | Feature cards, CTA panels                |
| `rounded-[2rem]` (32px)     | Subsumio showcase phone frame            |
| `rounded-[2.5rem]` (40px)   | Subsumio showcase outer frame            |
| `rounded-[2.6rem]` (41.6px) | Download phone frame                     |
| `rounded-full`              | Badges, pills, dots                      |

**Problem:** 7 verschiedene Radius-Werte ohne Token-System. `rounded-[2.6rem]` vs `rounded-[2.5rem]` ist ein 1.6px-Unterschied, der nicht absichtlich ist.

### 3.4 Empfehlungen — Spacing & Layout

| #   | Priorität  | Maßnahme                                                                                                               | Aufwand |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| S1  | 🟡 Hoch    | Spacing-Scale-Tokens: `--ds-space-1` (4px) bis `--ds-space-16` (64px)                                                  | 1h      |
| S2  | 🟡 Hoch    | Card-Padding-Standard definieren: `--ds-card-padding: 1.5rem`                                                          | 15min   |
| S3  | 🟡 Hoch    | Section-Rhythmus-Token: `--ds-section-py: 6rem` (96px)                                                                 | 15min   |
| S4  | 🟡 Hoch    | Radius-Scale-Tokens: `--ds-radius-sm` (8px), `--ds-radius-md` (12px), `--ds-radius-lg` (16px), `--ds-radius-xl` (24px) | 30min   |
| S5  | 🟢 Mittel  | `rounded-[2.6rem]` → `rounded-[2.5rem]` in `download-page.tsx` (Konsistenz)                                            | 2min    |
| S6  | 🟢 Niedrig | Spacing-Tokens in Komponenten migrieren                                                                                | 4h      |

---

## 4. Shadow-System

### 4.1 Dashboard — gut strukturiert ✅

```css
--card-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 8px rgba(15, 23, 42, 0.03);
--card-shadow-hover: 0 2px 4px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.06);
--card-shadow-elevated: 0 4px 6px rgba(15, 23, 42, 0.05), 0 12px 36px rgba(15, 23, 42, 0.08);
--sidebar-shadow: 1px 0 0 var(--ds-border), 4px 0 24px rgba(15, 23, 42, 0.03);
```

Über `.card-shadow`, `.card-shadow-hover`, `.card-shadow-elevated` Klassen verfügbar.

### 4.2 Marketing — unstrukturiert ❌

Nur `--mk-card-shadow` definiert, aber Komponenten verwenden:

```
shadow-2xl shadow-black/40    →  live-demo.tsx, features-page.tsx
shadow-2xl shadow-black/50    →  chrome.tsx (TerminalWindow)
shadow-2xl shadow-black/60    →  subsumio-showcase.tsx, download-page.tsx
shadow-2xl shadow-black/20    →  dashboard-reel.tsx, product-workflow-showcase.tsx
shadow-lg                     →  Card primitive (glow mode)
shadow-sm                     →  Button primary
```

**Problem:** 5 verschiedene "shadow-2xl shadow-black/X" Werte ohne System. `shadow-black/60` auf Light-Tone ist zu hart.

### 4.3 Empfehlungen — Shadows

| #   | Priorität | Maßnahme                                                                                        | Aufwand |
| --- | --------- | ----------------------------------------------------------------------------------------------- | ------- |
| SH1 | 🟡 Hoch   | Marketing Shadow-Tokens: `--mk-shadow-sm`, `--mk-shadow-md`, `--mk-shadow-lg`, `--mk-shadow-xl` | 30min   |
| SH2 | 🟡 Hoch   | `shadow-2xl shadow-black/60` → `--mk-shadow-xl` in subsumio-showcase + download-page            | 15min   |
| SH3 | 🟢 Mittel | Tone-aware shadow opacity (light: 0.07, dark: 0.4)                                              | 30min   |

---

## 5. Animation & Motion

### 5.1 Was gut ist ✅

- `prefers-reduced-motion` global respektiert (alle Animations auf 0.01ms)
- Framer Motion `MotionConfig reducedMotion="user"` auf Marketing-Seiten
- Keyframe-Animationen gut definiert: `pulse-ring`, `shimmer`, `stream-in`, `orb-float`, `gradient-border-spin`, `msg-in`, `typing-dot`, `widget-fade-in`
- Easing-Konsistenz: `cubic-bezier(0.4, 0, 0.2, 1)` für Transitions, `cubic-bezier(0.22, 1, 0.36, 1)` für Reveals

### 5.2 Issues ⚠️

#### A. Globaler `*` Transition-Override

```css
* {
  transition-property: color, background-color, border-color;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}
```

**Problem:** Appliziert auf JEDES Element — auch auf Container, die keine Color-Transitions brauchen. Auf großen Seiten (Landing Page mit 100+ Elementen) kann das Performance-Issues verursachen.

#### B. Dashboard `*` Transition ohne Duration

```css
[data-app="dashboard"],
[data-app="dashboard"] * {
  transition-property: color, background-color, border-color, fill, stroke;
}
```

**Problem:** Keine `transition-duration` — erbt die globale `150ms`. Aber `fill` und `stroke` werden hier hinzugefügt, was im globalen `*` fehlt. Inkonsistent.

#### C. Keine Motion-Tokens

Durations sind hardcoded: `150ms`, `200ms`, `300ms`, `500ms`, `600ms`. Easings sind hardcoded: `ease`, `easeOut`, `easeInOut`, `cubic-bezier(...)`. Keine `--ds-duration-*` oder `--ds-ease-*` Tokens.

### 5.3 Empfehlungen — Motion

| #   | Priorität  | Maßnahme                                                                                               | Aufwand |
| --- | ---------- | ------------------------------------------------------------------------------------------------------ | ------- |
| M1  | 🟡 Hoch    | Globalen `*` Transition-Selector einschränken auf `body *` oder spezifische Properties                 | 15min   |
| M2  | 🟡 Hoch    | Dashboard `*` Transition mit `transition-duration: 150ms` ergänzen                                     | 5min    |
| M3  | 🟢 Mittel  | Motion-Tokens: `--ds-duration-fast: 150ms`, `--ds-duration-normal: 250ms`, `--ds-duration-slow: 400ms` | 30min   |
| M4  | 🟢 Niedrig | Easing-Tokens: `--ds-ease-out: cubic-bezier(0.22, 1, 0.36, 1)`                                         | 15min   |

---

## 6. Komponenten-spezifische Issues

### 6.1 Button (`ui/button.tsx`)

| Issue                        | Detail                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `variant="success"`          | `bg-emerald-600` hardcoded — kein Token                                          |
| `variant="danger"`           | `bg-red-500/10 text-red-400 border-red-500/20` — hardcoded Tailwind palette      |
| `variant="primary"`          | `text-white` — sollte `text-[color:var(--ds-on-primary)]` sein für Theme-Support |
| Kein `loading` Spinner-Color | `border-current` funktioniert, aber kein Token                                   |

### 6.2 Badge (`ui/badge.tsx`)

| Issue                  | Detail                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Alle semantic variants | Hardcoded Tailwind palette (`emerald-500/10`, `amber-500/10`, etc.) — `--signal-*` Tokens existieren, werden nicht genutzt |
| `dark:` prefix         | `dark:text-emerald-400` — funktioniert nur mit Tailwind `dark:` class, nicht mit `data-theme="dark"`                       |

### 6.3 Card (`ui/card.tsx`)

| Issue        | Detail                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Gut          | Nutzt `--ds-*` Tokens konsistent                                                                                |
| `glass` mode | `bg-[color:var(--ds-surface)]/80` — opacity-Syntax mit CSS var funktioniert nicht zuverlässig in allen Browsern |

### 6.4 Input (`ui/input.tsx`)

| Issue   | Detail                                                                       |
| ------- | ---------------------------------------------------------------------------- |
| Gut     | Nutzt `--ds-*` Tokens                                                        |
| Padding | `py-2.5` (10px) — kein Token, aber konsistent innerhalb der Input-Komponente |

### 6.5 SubsumioLogo (`brand/subsumio-logo.tsx`)

| Issue              | Detail                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Gradient hardcoded | `linear-gradient(150deg, #1e3a8a 0%, #1d4ed8 52%, #0ea5e9 100%)` — nicht mit `--brand-gradient-*` verbunden |
| `text-[#3b82f6]`   | Hardcoded Blau für `tile=false` mode                                                                        |
| Halo               | `rgba(37,99,235,0.55)` — hardcoded                                                                          |

### 6.6 Empfehlungen — Komponenten

| #   | Priorität | Maßnahme                                                                     | Aufwand |
| --- | --------- | ---------------------------------------------------------------------------- | ------- |
| C1  | 🟡 Hoch   | `Button` success/danger → Signal-Tokens (`--signal-green`, `--signal-rose`)  | 30min   |
| C2  | 🟡 Hoch   | `Badge` semantic variants → `--signal-*` Tokens                              | 30min   |
| C3  | 🟡 Hoch   | `Badge` `dark:` prefix → `[data-theme="dark"]` selector                      | 30min   |
| C4  | 🟡 Hoch   | `SubsumioLogo` Gradient → `--brand-gradient-*` Tokens                        | 15min   |
| C5  | 🟢 Mittel | `Card` glass mode → `color-mix(in srgb, var(--ds-surface) 80%, transparent)` | 10min   |
| C6  | 🟢 Mittel | `Button` primary `text-white` → `--ds-on-primary` Token                      | 30min   |

---

## 7. Accessibility — Detail-Befunde

### 7.1 Was gut ist ✅

- WCAG-AA Kontrast-Ratios für alle Token-Werte dokumentiert und verifiziert
- `prefers-reduced-motion` global respektiert
- `:focus-visible` mit `outline: 2px solid var(--brand-primary)` + `outline-offset: 2px`
- ARIA-Labels auf Icon-Buttons (nav, social links)
- Touch-Targets: Mobile Nav-Links haben `min-h-[44px]`
- Lang-Attribut auf seitenbezogenen Containern

### 7.2 Issues ⚠️

| #   | Issue                                            | Detail                                                                                            | Priorität |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------- |
| A1  | `--ds-text-subtle: #6a6a85` in `:root`           | 3.8:1 auf `#06060f` — **WCAG-AA Fail**                                                            | 🔴        |
| A2  | Hardcoded `#8a8aa8`                              | 4.0:1 auf `#0d0d1a` — borderline AA Fail für normalen Text                                        | 🔴        |
| A3  | `text-[10px]` und `text-[11px]`                  | Unter 12px Minimum für Mobile-Lesbarkeit                                                          | 🟡        |
| A4  | `--color-text-muted: #4a4a6a` in `@theme inline` | 2.6:1 auf `#06060f` — **WCAG-AA Fail**                                                            | 🔴        |
| A5  | Global `* { transition: ... }`                   | Motion ohne `prefers-reduced-motion` Check (nur Keyframes werden gestoppt, nicht CSS-Transitions) | 🟡        |
| A6  | `color-scheme: light` hardcoded auf `<html>`     | Dark-Mode-Preference des Users wird ignoriert                                                     | 🟡        |

### 7.3 Empfehlungen — Accessibility

| #   | Priorität   | Maßnahme                                                                                             | Aufwand |
| --- | ----------- | ---------------------------------------------------------------------------------------------------- | ------- |
| A1  | 🔴 Kritisch | `--ds-text-subtle` in `:root` von `#6a6a85` → `#8282a6` (4.6:1)                                      | 5min    |
| A2  | 🔴 Kritisch | Alle `#8a8aa8` → `var(--mk-text-subtle)` oder `var(--ds-text-subtle)`                                | 30min   |
| A3  | 🟡 Hoch     | `text-[10px]` → `text-xs` (12px)                                                                     | 30min   |
| A4  | 🔴 Kritisch | `--color-text-muted` in `@theme inline` von `#4a4a6a` → `#8888aa` (5.6:1)                            | 5min    |
| A5  | 🟡 Hoch     | `* { transition: ... }` → `@media (prefers-reduced-motion: no-preference) { * { transition: ... } }` | 10min   |
| A6  | 🟡 Hoch     | `color-scheme: light` → `color-scheme: light dark` auf `<html>`                                      | 5min    |

---

## 8. Design-Kohärenz — Marketing vs Dashboard

### 8.1 Visuelle Diskrepanz

| Aspekt              | Marketing                   | Dashboard                                            | Problem                |
| ------------------- | --------------------------- | ---------------------------------------------------- | ---------------------- |
| **Primary Blue**    | `#2f6bff` (bright)          | `#1e3a5f` (navy, light) / `#3b82f6` (blue-500, dark) | 3 verschiedene Blues   |
| **Secondary**       | `#20d3c2` (teal accent)     | `#475569` / `#94a3b8` (slate neutral)                | Verschiedene Bedeutung |
| **Card Radius**     | `rounded-2xl` (16px)        | `rounded-xl` (12px)                                  | Inkonsistent           |
| **Card Shadow**     | `shadow-2xl shadow-black/X` | `--card-shadow` (subtle)                             | Verschiedene Systeme   |
| **Body Font Size**  | `text-base` / `text-lg`     | `text-sm`                                            | Marketing größer       |
| **Heading Weight**  | `font-black` (900)          | `font-bold` (700)                                    | Marketing schwerer     |
| **Section Padding** | `pt-28 pb-24` (variiert)    | `mb-8` (PageHeader)                                  | Verschiedene Rhythmen  |

### 8.2 Empfehlungen — Kohärenz

| #   | Priorität  | Maßnahme                                                                                                   | Aufwand |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| K1  | 🟡 Hoch    | Card-Radius vereinheitlichen: `--ds-radius-card: 12px` für beide                                           | 1h      |
| K2  | 🟡 Hoch    | Heading-Weight-System: Display=700, H1=700, H2=600 — für Marketing UND Dashboard                           | 1h      |
| K3  | 🟢 Mittel  | `--brand-secondary` im Dashboard → `--ds-neutral` (neuer Token), `--brand-secondary` nur für Brand-Akzente | 2h      |
| K4  | 🟢 Niedrig | Marketing Body `text-base` → `text-sm` für Konsistenz mit Dashboard (oder umgekehrt)                       | 2h      |

---

## 9. Priorisierte Aktions-Liste

### Phase 1 — Kritisch (Sofort, ~4h)

1. **F1** — `audit-trail.tsx` Token-Migration (28 Hex → Tokens)
2. **F2** — `error-boundary.tsx` Token-Migration
3. **F3** — `portal/[token]/page.tsx` Token-Migration (15 Hex → Tokens)
4. **F4** — `join-form.tsx` + `recovery-form.tsx` Token-Migration
5. **A1** — `--ds-text-subtle` in `:root` auf AA-konformen Wert anheben
6. **A4** — `--color-text-muted` in `@theme inline` korrigieren
7. **T2** — Sub-12px Text auf minimum 12px anheben

### Phase 2 — Hoch (1-2 Tage, ~12h)

8. **F5-F9** — Verbleibende Hex-Werte migrieren (CommentThread, RvgDialog, branch-pricing, subsumio-showcase, Terminal-Dots, Logo)
9. **F10** — `--ds-text-subtle` `:root` Wert korrigieren
10. **T1** — Type-Scale-Tokens einführen
11. **T3** — Font-Weight-Hierarchie definieren
12. **T4** — `h4`-`h6` in Heading-Rule aufnehmen
13. **S1-S4** — Spacing- und Radius-Tokens einführen
14. **SH1-SH2** — Marketing Shadow-Tokens
15. **C1-C4** — Komponenten-Token-Migration (Button, Badge, Logo)
16. **A2, A5, A6** — Accessibility-Fixes

### Phase 3 — Mittel (3-5 Tage, ~20h)

17. **F11-F12** — Token-System-Konsolidierung (`@theme` vs `:root`, `--brand-secondary`)
18. **T5-T8** — Line-Height-Tokens, Responsive Letter-Spacing
19. **S5-S6** — Spacing-Tokens in Komponenten migrieren
20. **SH3** — Tone-aware Shadow-Opacity
21. **C5-C6** — Card glass mode, Button on-primary
22. **K1-K3** — Marketing/Dashboard-Kohärenz
23. **M1-M4** — Motion-System-Refinement

### Phase 4 — Feinschliff (1 Woche, ~15h)

24. **F13** — Verbleibende kleine Hex-Verstöße
25. **K4** — Body Font-Size Konsistenz
26. **T7-T8** — Logo-Typo, Display Letter-Spacing
27. **S6** — Vollständige Spacing-Token-Migration
28. Audit-Wiederholung

---

## 10. Datei-Index — Betroffene Dateien

| Datei                                                    | Hex-Verstöße         | Token-Nutzung | Priorität |
| -------------------------------------------------------- | -------------------- | ------------- | --------- |
| `src/components/admin/audit-trail.tsx`                   | 28+                  | 0%            | 🔴        |
| `src/app/portal/[token]/page.tsx`                        | 15+                  | 10%           | 🔴        |
| `src/components/auth/join-form.tsx`                      | 8+                   | 20%           | 🔴        |
| `src/components/auth/recovery-form.tsx`                  | 3+                   | 20%           | 🔴        |
| `src/components/error-boundary/error-boundary.tsx`       | 5                    | 0%            | 🔴        |
| `src/components/marketing/subsumio-showcase.tsx`         | 11                   | 30%           | 🟡        |
| `src/components/legal/CommentThread.tsx`                 | 5                    | 60%           | 🟡        |
| `src/components/legal/RvgDialog.tsx`                     | 2                    | 70%           | 🟡        |
| `src/components/marketing/branch-pricing.tsx`            | 1                    | 80%           | 🟡        |
| `src/components/marketing/download-page.tsx`             | 2                    | 80%           | 🟡        |
| `src/components/brand/subsumio-logo.tsx`                 | 3                    | 0%            | 🟡        |
| `src/components/marketing/chrome.tsx`                    | 3 (terminal dots)    | 90%           | 🟡        |
| `src/components/marketing/live-demo.tsx`                 | 3 (terminal dots)    | 85%           | 🟡        |
| `src/components/marketing/dashboard-reel.tsx`            | 3 (terminal dots)    | 85%           | 🟡        |
| `src/components/marketing/product-workflow-showcase.tsx` | 3 (terminal dots)    | 80%           | 🟡        |
| `src/app/globals.css`                                    | 0 (Token-Definition) | 100%          | —         |
| `src/components/ui/button.tsx`                           | 0 (Tailwind palette) | 70%           | 🟡        |
| `src/components/ui/badge.tsx`                            | 0 (Tailwind palette) | 40%           | 🟡        |
| `src/components/ui/card.tsx`                             | 0                    | 95%           | ✅        |
| `src/components/ui/input.tsx`                            | 0                    | 95%           | ✅        |
| `src/components/marketing/chrome.tsx` (nav/footer)       | 0                    | 95%           | ✅        |
| `src/components/marketing/landing.tsx`                   | 0                    | 95%           | ✅        |
| `src/components/marketing/features-page.tsx`             | 0                    | 95%           | ✅        |

---

## Fazit

Das Fundament ist stark — das Token-System mit `--ds-*`, `--mk-*`, `--brand-*` und Tone-Scoping ist agenturnah. Die WCAG-AA-Verifikation ist vorbildlich. Doch **~15 Komponenten umgehen das System**, die **Typografie und das Spacing haben keine Tokens**, und die **Marketing-Dashboard-Kohärenz** ist nicht gegeben.

Phase 1 (kritisch) ist in ~4 Stunden erledigt und bringt die größten Verbesserungen. Phase 2 bringt das System auf ~85% Agenturniveau. Phase 3-4 bringen es auf 95%+.
