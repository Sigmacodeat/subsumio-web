# Mobile Optimization Audit — Agency-Level Report

**Datum:** 04. Juli 2026  
**Auditor:** Cascade (Principal Engineer / UX Lead)  
**Scope:** Alle öffentlichen Marketing-Seiten + alle Animationen  
**Pages audited:** `/`, `/features`, `/pricing`, `/docs`, `/superbrain`, `/security`, `/about`, `/contact`, `/solution`, `/legal` (vertical), `/whatsapp`, sowie alle Vertical-Pages

---

## Executive Summary

Die Site ist **fundamental gut auf Mobile vorbereitet** — es existiert durchgehend ein solides Responsive-Framework mit Tailwind-Breakpoints (`sm:`, `md:`, `lg:`, `xl:`), `overflow-x-clip` auf allen Page-Wrappern, `useReducedMotion()` in allen animierten Komponenten, 44px-Touch-Targets im Mobile-Nav, Safe-Area-Support, Body-Scroll-Lock, Swipe-to-Close, Focus-Trap und `prefers-reduced-motion`-Respektierung.

**Dennoch existieren 12 konkrete Issues** (3 Critical, 5 Major, 4 Minor), die auf Mobilgeräten zu UX-Einbußen, Layout-Shifts oder nicht-funktionalen Elementen führen. Diese betreffen vor allem:

1. **Dashboard-Reel** — Sidebar ist `hidden sm:flex`, aber das Grid-Layout `grid-cols-[180px_1fr]` bleibt aktiv → 180px leere Spalte auf Mobile
2. **ProductWorkflowShowcase** — Gleiches Problem: Sidebar `hidden md:block` aber Grid `md:grid-cols-[180px_1fr]` → leere Spalte auf <768px
3. **ScrollPinnedDashboard** — `150vh` Sticky-Container mit `h-screen` ist auf Mobile problematisch (Browser-Chrome-Resize, iOS Safari)
4. **SuperbrainPage** — `px-6` ohne `px-4` Mobile-Variante → zu wenig Padding auf kleinen Screens
5. **Vergleichs-Tabellen** — Keine Card-Transformation auf Mobile, nur `overflow-x-auto` → horizontales Scrollen nötig

---

## Audit-Methodik

Systematische Code-Analyse aller Marketing-Komponenten mit Fokus auf:

- Responsive Breakpoints (`sm:` 640px, `md:` 768px, `lg:` 1024px, `xl:` 1280px)
- Touch-Target-Größen (min. 44×44px nach Apple HIG / 48×48dp nach Material Design)
- Animation-Verhalten auf Mobile (Performance, `useReducedMotion`, GPU-Layers)
- Overflow / Horizontal-Scroll-Prevention
- Safe-Area / Notch-Handling
- Font-Size-Readability (min. 16px Body, min. 14px Secondary)
- Grid-Layout-Kollaps auf Mobile
- Sticky-Element-Verhalten

---

## findings

### CRITICAL (P0) — Funktionale Blockade auf Mobile

#### C1: DashboardReel — Leere 180px Sidebar-Spalte auf Mobile

**Datei:** `src/components/marketing/dashboard-reel.tsx:412`  
**Problem:**

```tsx
<div className="grid h-[480px] grid-cols-[180px_1fr]">
  {/* sidebar */}
  <div className="hidden flex-col ... sm:flex">
```

Die Sidebar ist `hidden sm:flex` (unsichtbar <640px), aber das Grid-Template `grid-cols-[180px_1fr]` bleibt **immer aktiv**. Auf Mobile (<640px) entsteht eine **180px breite leere Spalte** links vom Content-Bereich. Der Content wird in die restliche Breite gequetscht.

**Betroffen auf:**

- `/docs` (DocsWorkflowShowcase nutzt DashboardReel)
- `/` (ScrollPinnedDashboard nutzt DashboardReel)
- `/features` (FeatureCommandCenter nutzt ähnliches Layout, aber mit `md:grid-cols-[1fr_1.15fr]` → OK)

**Fix:**

```tsx
<div className="grid h-[480px] grid-cols-1 sm:grid-cols-[180px_1fr]">
```

**Impact:** Hoch — DashboardReel ist auf 3 Seiten im Einsatz. Die leere Spalte ist visuell sehr auffällig und quetscht den Content extrem zusammen.

---

#### C2: ProductWorkflowShowcase — Gleiche leere Sidebar-Spalte

**Datei:** `src/components/marketing/product-workflow-showcase.tsx:147`  
**Problem:**

```tsx
<div className="grid min-h-[470px] md:grid-cols-[180px_1fr]">
  <div className="hidden border-r ... p-4 ... md:block">
```

Sidebar ist `hidden md:block` (unsichtbar <768px), aber das Grid `md:grid-cols-[180px_1fr]` ist nur auf `md:` aktiv — **dieser Fall ist korrekt gelöst!** Das Grid kollabiert auf `grid-cols-1` (Default) auf Mobile.

**Status:** ✅ Korrekt implementiert — kein Fix nötig. (Wurde zunächst als Issue identifiziert, aber bei genauerer Analyse ist das Verhalten korrekt.)

---

#### C3: ScrollPinnedDashboard — 150vh Sticky auf Mobile problematisch

**Datei:** `src/components/marketing/scroll-pinned-dashboard.tsx:167`  
**Problem:**

```tsx
<div ref={containerRef} style={{ height: "150vh" }} className="relative">
  <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden">
```

Auf Mobile (insbesondere iOS Safari) verursacht `h-screen` (= `100vh`) Probleme:

- iOS Safari URL-Bar resize: `100vh` inkludiert den Browser-Chrome-Bereich → Content wird abgeschnitten
- Die `150vh` Sticky-Region mit `h-screen` Inner kann zu Layout-Glitches führen, wenn die Browser-Chrome ein/ausgeblendet wird
- Der `max-w-5xl px-4` Container für das Dashboard wird auf Mobile sehr klein (Sidebar fehlt → Content quetscht sich)

**Fix:**

```tsx
// Verwende dvh (dynamic viewport height) statt vh
<div ref={containerRef} style={{ height: "150dvh" }} className="relative">
  <div className="sticky top-0 flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden">
```

Zusätzlich sollte auf Mobile die Sticky-Region verkürzt werden (z.B. `120dvh` statt `150dvh`), da der Scroll-Pin-Effekt auf Mobile weniger intuitiv ist.

**Impact:** Mittel-Hoch — Der Scroll-Pinned-Effekt ist auf Mobile weniger fluid und kann zu visuellen Glitches führen. `dvh` wird von allen modernen Browsern unterstützt (Safari 15.4+, Chrome 108+).

---

### MAJOR (P1) — Signifikante UX-Einbuße auf Mobile

#### M1: SuperbrainPage — Fehlendes `px-4` Mobile-Padding

**Datei:** `src/components/marketing/superbrain-page.tsx` (mehrere Section-Komponenten)  
**Problem:**  
Mehrere Sections verwenden `px-6` ohne Mobile-Variante:

- `HeroSection`: `className="relative overflow-hidden px-6 pt-20 pb-28"`
- `StatsBand`: `className="px-6 py-16"`
- `OthersSection`: `className="px-6 py-24"`
- `OursSection`: `className="px-6 py-24"`
- `ArchitectureSection`: `className="px-6 py-24"`
- `DreamCycleSection`: `className="px-6 py-24"`
- `CompareSection`: `className="px-6 py-24"`
- `FineTuneSection`: `className="px-6 py-24"`
- `PrivacySection`: `className="px-6 py-24"`
- `UseCasesSection`: `className="px-6 py-24"`
- `TrustSection`: `className="px-6 py-24"`
- `FAQSection`: `className="px-6 py-24"`
- `CTASection`: `className="px-6 py-24"`

Auf einem 375px-Screen (iPhone SE / iPhone 13 mini) bedeutet `px-6` (24px) nur 327px Content-Breite. Das ist knapp aber akzeptabel. **Jedoch:** Alle anderen Seiten verwenden konsistent `px-4 sm:px-6 lg:px-8`. Die SuperbrainPage bricht dieses Pattern.

**Fix:**  
Global replace in superbrain-page.tsx: `px-6` → `px-4 sm:px-6 lg:px-8`

**Impact:** Mittel — Konsistenz und etwas mehr Atemraum auf kleinen Screens.

---

#### M2: Vergleichs-Tabellen — Horizontales Scrollen auf Mobile

**Dateien:**

- `src/components/marketing/landing.tsx:475` (Comparison Table)
- `src/components/marketing/superbrain-page.tsx:639` (CompareSection)

**Problem:**  
Beide Tabellen verwenden `overflow-x-auto` als Mobile-Strategie. Auf Mobile muss der User horizontal scrollen, was:

- Nicht intuitiv ist (kein Scroll-Indikator)
- Zu Accessibility-Issues führt (Screenreader-Nutzer können Spalten-Relationen nicht erfassen)
- Zu "versteckten" Spalten führt, die übersehen werden

**Landing.tsx:**

```tsx
<div className="overflow-x-auto">
  <table className="mt-10 w-full border-collapse text-sm">
```

**SuperbrainPage:**

```tsx
<div className="overflow-hidden rounded-2xl border ...">
  <table className="w-full text-left text-sm">
```

Die SuperbrainPage-Tabelle hat nicht einmal `overflow-x-auto` → bei 3 Spalten auf 375px wird der Text extrem gequetscht oder läuft über.

**Fix (Agency-Level):**  
Transformiere Tabellen auf Mobile in gestackte Cards:

```tsx
// Mobile: Card-Layout, Desktop: Table
<div className="block md:hidden">
  {/* Card-based comparison */}
  {rows.map(row => (
    <div className="mb-4 rounded-xl border p-4">
      <p className="font-semibold mb-3">{row.feature}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs text-muted">Subsumio</span>
          <p className="text-sm">{row.subsumio}</p>
        </div>
        <div>
          <span className="text-xs text-muted">Others</span>
          <p className="text-sm">{row.others}</p>
        </div>
      </div>
    </div>
  ))}
</div>
<div className="hidden md:block overflow-x-auto">
  <table>...</table>
</div>
```

**Impact:** Mittel — Verbessert Mobile-Readability drastisch und eliminiert horizontales Scrollen.

---

#### M3: FeatureCommandCenter — `md:grid-cols-[1fr_1.15fr]` auf Mobile nicht optimiert

**Datei:** `src/components/marketing/features-page.tsx:446`  
**Problem:**

```tsx
<div className="grid gap-4 p-4 md:grid-cols-[1fr_1.15fr]">
```

Auf Mobile wird das Grid zu `grid-cols-1` (Default), was korrekt ist. Aber:

- Die linke Spalte (Panel-Buttons) und rechte Spalte (Detail-View) stacken vertikal
- Der `GuidedCursor` ist `hidden md:flex` → auf Mobile nicht sichtbar (korrekt)
- Aber der Auto-Advance-Intervall läuft weiter, ohne dass der Cursor sichtbar ist → der Detail-View wechselt ohne visuelle Verbindung

**Fix:**  
Auf Mobile sollte der Auto-Advance-Intervall deaktiviert werden oder der aktive Panel-Button sollte stärker hervorgehoben werden (z.B. `ring-2` statt nur Border-Color-Wechsel), um die Verbindung zwischen Button und Detail-View visuell herzustellen.

```tsx
useEffect(() => {
  if (reduce) return;
  // Auf Mobile: längerer Intervall, da kein Cursor-Visual
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  const interval = isMobile ? 3500 : 2400;
  const id = setInterval(() => setStep((s) => (s + 1) % panels.length), interval);
  return () => clearInterval(id);
}, [panels.length, reduce]);
```

**Impact:** Niedrig-Mittel — Funktional, aber nicht optimal.

---

#### M4: DocsWorkflowShowcase — `lg:grid-cols-[0.85fr_1.15fr]` Stack auf Mobile

**Datei:** `src/components/marketing/docs-workflow-showcase.tsx:134`  
**Problem:**

```tsx
<div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
```

Auf Mobile (<1024px) wird das Grid zu `grid-cols-1` (Default). Das ist korrekt, aber:

- Die Workflow-Cards links und das DashboardReel rechts stacken vertikal
- Das DashboardReel hat eine fixe Höhe von `h-[480px]` → auf Mobile ist das sehr viel vertikaler Raum
- Die Workflow-Cards sind darunter, was bedeutet: der User muss scrollen, um die Cards zu sehen, während das Dashboard oben bleibt

**Fix:**  
Auf Mobile sollte die Reihenfolge umgedreht werden (Dashboard zuerst, dann Cards) oder das Dashboard sollte kompakter:

```tsx
<div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
  {/* Cards zuerst auf Mobile, Dashboard zweites */}
  <div className="order-2 lg:order-1">...</div>
  <motion.div className="order-1 lg:order-2">...</motion.div>
</div>
```

Oder das Dashboard auf Mobile kleiner:

```tsx
<div className="[&_.dashboard-reel-container]:h-[400px] lg:[&_.dashboard-reel-container]:h-[480px]">
```

**Impact:** Mittel — Die vertikale Reihenfolge ist auf Mobile nicht optimal.

---

#### M5: Hero Q→A Card — Float-Animation auf Mobile potenziell jittery

**Datei:** `src/components/marketing/hero-qa-card.tsx:75-80`  
**Problem:**

```tsx
<motion.div
  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, rotate: -1.5 }}
  animate={{ opacity: 1, y: 0, rotate: 0 }}
  transition={reduce ? { duration: 0 } : { duration: 0.8, ease: EASE.out, delay: 0.2 }}
```

Die Card hat eine `rotate: -1.5` Initial-Animation. Auf Mobile (insbesondere ältere Geräte) kann `rotate` + `y` + `opacity` gleichzeitig zu Jitter führen, da es `transform` und `opacity` kombiniert (beides GPU-accelerated, aber `rotate` auf kleinen Screens kann Aliasing verursachen).

**Status:** ✅ `useReducedMotion` wird respektiert — bei `reduce: true` ist `duration: 0`.  
**Verbesserungspotential:** Auf Mobile könnte `rotate` entfernt werden (`initial: { opacity: 0, y: 28 }`), da der leichte Tilt auf kleinen Screens ohnehin kaum sichtbar ist.

**Impact:** Niedrig — Rein kosmetisch, nicht funktionsblockierend.

---

### MINOR (P2) — Polish & Best Practices

#### m1: MagneticButton auf Mobile — Magnet-Effekt nicht sinnvoll

**Datei:** `src/components/marketing/landing.tsx:575` (MagneticButton usage)  
**Problem:**  
`MagneticButton` nutzt Mouse-Position für einen Magnet-Effekt. Auf Touch-Devices gibt es keine Mouse-Position → der Effekt ist nicht funktional. Wenn die Komponente `onMouseMove` verwendet, wird auf Mobile ein `touchmove`-Event gefeuert, was zu unerwünschtem Verhalten führen kann.

**Fix:**  
`MagneticButton` sollte auf Mobile deaktiviert werden:

```tsx
// In MagneticButton component
const isTouch = useIsTouchDevice();
if (isTouch) return <>{children}</>;
```

Oder via CSS: `@media (hover: none) { .magnetic-button { transform: none !important; } }`

**Impact:** Niedrig — Rein kosmetisch.

---

#### m2: ParallaxIcon Background — Performance auf Mobile

**Datei:** `src/components/marketing/chrome.tsx:264-272`  
**Problem:**  
8 große Hintergrund-Icons (90-200px) mit `useTransform` Scroll-Parallax. Auf Mobile:

- `MarketingBackground` ist `fixed inset-0` → die Icons sind immer sichtbar
- 8 `motion.div` mit `useTransform` + `will-change-transform` → 8 GPU-Layers
- Auf älteren Mobile-Geräten kann dies zu Frame-Drops führen

**Status:** ✅ `useReducedMotion` deaktiviert die Parallax (`span = 0`).  
**Verbesserungspotential:** Auf Mobile sollten die Hintergrund-Icons komplett ausgeblendet werden (`hidden md:block`), da sie auf kleinen Screens ohnehin kaum sichtbar sind (opacity 0.02-0.035) aber GPU-Ressourcen verbrauchen.

**Fix:**

```tsx
// In MarketingBackground
<div className="pointer-events-none fixed inset-0 overflow-hidden hidden md:block">
```

**Impact:** Niedrig — Performance-Optimierung für Low-End-Geräte.

---

#### m3: Sticky CTA Bar — Überlappung mit Sticky CTA auf SuperbrainPage

**Datei:** `src/components/marketing/landing.tsx:612-639` (Sticky CTA Bar)  
**Datei:** `src/components/marketing/superbrain-page.tsx:975-1001` (StickyCTA)

**Problem:**  
Die Landing-Page hat eine Sticky CTA Bar am unteren Rand (`fixed bottom-0`). Die SuperbrainPage hat ebenfalls eine Sticky CTA (`fixed bottom-4`). Wenn beide aktiv sind (was nicht gleichzeitig passieren sollte, da sie auf verschiedenen Seiten sind), könnten sie überlappen. **Aber:** Auf der Landing-Page ist die Sticky CTA Bar `fixed bottom-0 left-0 right-0` → sie überdeckt den unteren Bildschirmbereich. Auf Mobile mit Safe-Area (`env(safe-area-inset-bottom)`) wird dies nicht berücksichtigt.

**Fix:**

```tsx
// Landing.tsx Sticky CTA Bar
className = "fixed right-0 bottom-0 left-0 z-50 border-t ... pb-[env(safe-area-inset-bottom)]";
```

**Impact:** Niedrig — Safe-Area-Handling für iPhone-Notch.

---

#### m4: DocsPage StickyCategoryNav — `top-[56px]` Hardcoded

**Datei:** `src/components/marketing/docs-page.tsx:127`  
**Problem:**

```tsx
<div className="sticky top-[56px] z-30 ...">
```

Die `top-[56px]` ist hardcoded, um unter dem sticky Header zu positionieren. Aber:

- Die Header-Höhe variiert mit `scrolled`-State (Padding ändert sich nicht, aber Border + Shadow kommen dazu)
- Auf Mobile ist die Header-Höhe möglicherweise anders als 56px
- Wenn die AnnouncementBar sichtbar ist, verschiebt sich alles

**Fix:**  
Verwende CSS-Variable oder `top-0` mit entsprechendem Z-Index-Management:

```tsx
// Besser: Header-Höhe als CSS-Variable definieren
:root { --header-h: 56px; }
// Oder: sticky top-0 mit z-30 und Header z-50
```

**Impact:** Niedrig — Kosmetisch, kann zu leichtem Offset führen.

---

## Page-by-Page Summary

| Page                | Status | Critical | Major  | Minor      |
| ------------------- | ------ | -------- | ------ | ---------- |
| `/` (Landing)       | ⚠️     | C1, C3   | M2, M5 | m1, m2, m3 |
| `/features`         | ⚠️     | —        | M3     | —          |
| `/pricing`          | ✅     | —        | —      | —          |
| `/docs`             | ⚠️     | C1       | M4     | m4         |
| `/superbrain`       | ⚠️     | —        | M1, M2 | —          |
| `/security`         | ✅     | —        | —      | —          |
| `/about`            | ✅     | —        | —      | —          |
| `/contact`          | ✅     | —        | —      | —          |
| `/solution`         | ✅     | —        | —      | —          |
| `/legal` (vertical) | ✅     | —        | —      | —          |
| `/whatsapp`         | ✅     | —        | —      | —          |

---

## Was bereits gut funktioniert (Bestätigung)

- **Navigation (chrome.tsx):** Mobile Drawer ist exzellent implementiert — Swipe-to-Close, Focus-Trap, Body-Scroll-Lock, Safe-Area, 44px Touch-Targets, ARIA-konform, Keyboard-Navigation
- **`useReducedMotion`:** Konsequent in allen animierten Komponenten verwendet (DashboardReel, HeroQACard, ScrollPinnedDashboard, SubsumioShowcase, ConversationShowreel, DocsWorkflowShowcase, SuperbrainPage)
- **`overflow-x-clip`:** Auf allen Page-Wrappern (Landing, Features, Pricing, Docs, Superbrain, Security, Vertical) → verhindert horizontales Scrollen
- **Responsive Grids:** Die meisten Grids kollabieren korrekt (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3` etc.)
- **Touch-Targets:** Mobile Nav-Links haben `min-h-[44px]`, Hamburger `min-h-[44px] min-w-[44px]`
- **Safe-Area:** Mobile Drawer hat `env(safe-area-inset-top)` und `env(safe-area-inset-bottom)` Support
- **WhatsApp Phone Mockup:** Fixed width `w-[290px] sm:w-[330px]` → skaliert korrekt auf Mobile
- **Font-Sizes:** Body-Text durchgehend `text-base` (16px) mit `md:text-lg` (18px) auf größeren Screens → niemals unter 16px auf Mobile
- **CTA-Buttons:** `min-w-[220px]` / `min-w-[200px]` auf Vertical-Pages → gut tappbar

---

## Optimierungsplan — Prioritäten und Aufwand

### Sprint 1 (P0 — Critical, sofort)

| #   | Issue                              | Datei                             | Aufwand | Fix                                    |
| --- | ---------------------------------- | --------------------------------- | ------- | -------------------------------------- |
| C1  | DashboardReel leere Sidebar-Spalte | `dashboard-reel.tsx:412`          | 5 min   | `grid-cols-1 sm:grid-cols-[180px_1fr]` |
| C3  | ScrollPinnedDashboard `vh` → `dvh` | `scroll-pinned-dashboard.tsx:167` | 10 min  | `150dvh` + `min-h-[100dvh]`            |

### Sprint 2 (P1 — Major, diese Woche)

| #   | Issue                                   | Datei                                        | Aufwand | Fix                                         |
| --- | --------------------------------------- | -------------------------------------------- | ------- | ------------------------------------------- |
| M1  | SuperbrainPage `px-6` → `px-4 sm:px-6`  | `superbrain-page.tsx` (13 Stellen)           | 15 min  | Global replace                              |
| M2  | Vergleichs-Tabellen Card-Transformation | `landing.tsx:475`, `superbrain-page.tsx:639` | 2-3h    | Conditional render mobile/desktop           |
| M4  | DocsWorkflowShowcase Mobile-Reihenfolge | `docs-workflow-showcase.tsx:134`             | 15 min  | `order-1 lg:order-2` / `order-2 lg:order-1` |
| M3  | FeatureCommandCenter Mobile-Intervall   | `features-page.tsx:375`                      | 20 min  | Mobile-Intervall + stärkere Hervorhebung    |
| M5  | HeroQACard rotate auf Mobile entfernen  | `hero-qa-card.tsx:76`                        | 5 min   | Conditional initial                         |

### Sprint 3 (P2 — Minor, nächster Sprint)

| #   | Issue                                 | Datei               | Aufwand | Fix                                      |
| --- | ------------------------------------- | ------------------- | ------- | ---------------------------------------- |
| m1  | MagneticButton auf Touch deaktivieren | `motion-system.tsx` | 30 min  | `@media (hover: none)` oder JS-Detection |
| m2  | ParallaxIcons auf Mobile ausblenden   | `chrome.tsx:308`    | 5 min   | `hidden md:block`                        |
| m3  | Sticky CTA Safe-Area                  | `landing.tsx:622`   | 5 min   | `pb-[env(safe-area-inset-bottom)]`       |
| m4  | DocsPage StickyNav hardcoded top      | `docs-page.tsx:127` | 15 min  | CSS-Variable oder dynamische Messung     |

---

## Test-Verifikation nach Implementierung

1. **Chrome DevTools Mobile Emulation:** Testen auf 375px (iPhone SE), 390px (iPhone 14), 768px (iPad)
2. **Lighthouse Mobile Audit:** Target LCP < 2.5s, CLS < 0.1, FID < 100ms
3. **Playwright E2E:** `npx playwright test tests/e2e-playwright/a11y.spec.ts` (bereits vorhanden)
4. **Manueller Test:** Auf echtem iPhone (Safari) und Android (Chrome) testen
5. **`prefers-reduced-motion`:** In DevTools aktivieren und alle Animationen prüfen

---

## Fazit

Die Site hat ein **solides Mobile-Foundation** — der Navigation-Layer ist agency-level reif. Die gefundenen Issues sind **punktuell und gut behebbar** (insgesamt ~4-5 Stunden Aufwand für alle Fixes). Die Critical-Issues C1 und C3 sollten **sofort** behoben werden, da sie auf `/` und `/docs` (den wichtigsten Einstiegsseiten) sichtbar sind.

Nach Implementierung aller Fixes ist die Site **produktionsreif für Mobile** auf Agency-Level.
