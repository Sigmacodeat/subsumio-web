# Subsumio Frontend Audit Report

**Datum:** 19. Juni 2026  
**Auditor:** Principal Engineer / UX Lead  
**Standard:** Agency-Level (Stripe, Linear, Vercel)  
**Gesamtbewertung:** 🔴 **NICHT PRODUKTIONSREIF** — 3 Critical, 8 High, 11 Medium, 8 Low

---

## Zusammenfassung

Das Frontend hat eine solide architektonische Basis: sauberes Design-Token-System (`--ds-*` / `--mk-*`), framer-motion mit `prefers-reduced-motion`, Tone-scoped sections, shadcn/ui-Komponenten, offline-first Dashboard-Seiten. Die Marketing-Pages sind auf hohem Niveau.

**Aber:** Es gibt blockierende Fehler (404-Routen, UX-Bugs in Dropdowns), eine inkonsistente i18n-Strategie (Dashboard ist 100% Deutsch, Marketing ist bilingual), Dead Code, und mehrere fehlende UX-Patterns die auf Agenturniveau Standard sind.

---

## 🔴 CRITICAL (Blockierend)

### C1 — 7 leere Dashboard-Routen → 404
**Datei:** `src/app/dashboard/{consulting,insurance,medical,realestate,recruiting,tax,vc}/`  
**Problem:** Alle 7 Branchen-Ordner sind **leer** (kein `page.tsx`). Die Sidebar (`src/components/dashboard/sidebar.tsx:124-130`) linkt sie mit `comingSoon: true` — aber der Link ist trotzdem klickbar und führt zu **404**.  
**Lösung:** Entweder `comingSoon`-Links als `<button disabled>` rendern (nicht als `<Link>`), oder Placeholder-Seiten mit "Coming Soon" erstellen.  
**Priorität:** Sofort — ein Klick auf einen Sidebar-Link darf nie 404 ergeben.

### C2 — MarketingNav: Solutions/Pricing/Compare sind unsichtbar (Dead Code)
**Datei:** `src/components/marketing/chrome.tsx:209`  
**Problem:** `const isStandalone = true;` ist hard-coded. Dadurch werden Solutions-Dropdown, Pricing-Link und Compare-Link im Desktop-Nav **vollständig ausgeblendet** (`{!isStandalone && ...}`). Die Seiten existieren und sind über Footer/ direkte URL erreichbar, aber nicht über die Hauptnavigation.  
**Lösung:** `isStandalone` entfernen oder auf `false` setzen. Solutions-Dropdown, Pricing und Compare müssen im Nav sichtbar sein.  
**Priorität:** Sofort — primäre Navigation ist broken.

### C3 — Topbar Dropdowns: Kein Click-Outside-to-Close
**Datei:** `src/components/dashboard/topbar.tsx:137-171` (Notifications), `:176-213` (User Menu)  
**Problem:** Weder das Notifications-Dropdown noch das User-Menü haben einen Click-Outside-Handler oder Escape-Taste-Support. Einmal geöffnet, bleiben sie offen — der User muss explizit auf den Toggle-Button klicken. Das ist ein grundlegender UX-Bug, der auf keinem Agenturniveau akzeptabel ist.  
**Lösung:** `useRef` + `useEffect` mit `document.addEventListener("mousedown", ...)` für Click-Outside. Escape-Taste-Handler hinzufügen.  
**Priorität:** Sofort.

---

## 🟠 HIGH (Signifikant)

### H1 — Dashboard ist 100% Deutsch, kein i18n
**Dateien:** Alle `src/app/dashboard/*/page.tsx`, `src/components/dashboard/sidebar.tsx`, `src/components/dashboard/topbar.tsx`  
**Problem:** Das gesamte Dashboard (Sidebar-Labels, Page-Header, Empty States, Error Messages, `timeAgo()`, Quick Actions, Tooltips) ist **nur auf Deutsch**. Die Marketing-Site ist bilingual (EN/DE). Ein englischsprachiger Nutzer kann das Produkt nicht bedienen.  
**Lösung:** i18n-Layer für Dashboard einführen (entweder `next-intl` oder ein `t()`-Dictionary wie bei Marketing). Zumindest Sidebar + Topbar + Hauptseiten bilingual machen.  
**Priorität:** Hoch — blockiert internationale Nutzer.

### H2 — Error/Not-Found Pages: Gemischte Sprachen, kein i18n
**Dateien:** `src/app/not-found.tsx`, `src/app/error.tsx`  
**Problem:** Beide Seiten haben englischen Haupttext + deutschen Untertext als "Bonus". Das ist nicht i18n, das ist inkonsistent. Eine 404-Seite sollte entweder lokalisiert sein oder neutral.  
**Lösung:** Sprache aus `lang`-Attribut des `<html>` ableiten oder neutralen Text verwenden.  
**Priorität:** Hoch.

### H3 — Auth Forms: Kein Password-Visibility-Toggle
**Dateien:** `src/components/auth/auth-form.tsx:200-214`, `src/components/auth/recovery-form.tsx:176-206`  
**Problem:** Passwort-Felder haben `type="password"` ohne Toggle. Standard auf Agenturniveau (Stripe, Linear, Vercel) ist ein Eye/EyeOff-Button.  
**Lösung:** `useState` für `showPassword` + Toggle-Button im `relative`-Container.  
**Priorität:** Hoch.

### H4 — TypewriterText ignoriert `prefers-reduced-motion`
**Datei:** `src/components/marketing/chrome.tsx:546-569`  
**Problem:** `TypewriterText` animiert immer, auch wenn `prefers-reduced-motion: reduce` aktiv ist. Die umgebende `MotionConfig` steuert nur framer-motion-Komponenten, nicht diesen manuellen `setTimeout`-Effekt.  
**Lösung:** `useReducedMotion()` aus framer-motion importieren; bei `true` den Text sofort vollständig anzeigen.  
**Priorität:** Hoch — Accessibility-Verletzung.

### H5 — Dashboard Sidebar: 50+ Nav-Items ohne Suche/Filter
**Datei:** `src/components/dashboard/sidebar.tsx:56-133`  
**Problem:** 6 Sektionen mit insgesamt ~40 Navigationseinträgen. Keine Suche, kein Filter, keine Favouriten. Das ist cognitiv überladend, besonders für Erstnutzer.  
**Lösung:** Sidebar-Suche (Filter der Items nach Label), "Zuletzt besucht"-Sektion, oder einklappbare Sektionen mit `localStorage`-Persistenz.  
**Priorität:** Hoch — UX-Issue bei skalierendem Produkt.

### H6 — Keine Breadcrumbs im Dashboard
**Dateien:** Alle Dashboard-Pages  
**Problem:** Es gibt eine `breadcrumb.tsx` UI-Komponente, aber sie wird auf **keiner** Dashboard-Seite verwendet. Bei 50+ Seiten ist Breadcrumb-Navigation Standard.  
**Lösung:** `PageHeader`-Komponente um Breadcrumb-Slot erweitern oder eigenes Breadcrumb-Element in `dashboard/layout.tsx`.  
**Priorität:** Hoch.

### H7 — Auth Pages: Fehlende `description` in Metadata
**Dateien:** `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/app/reset/page.tsx`  
**Problem:** Nur `title` gesetzt, keine `description`. Login/Signup sollten `noindex` haben (sie sind nicht für SEO gedacht), aber eine Description für Social-Sharing und Screen-Reader ist trotzdem Standard.  
**Lösung:** `robots: { index: false }` für Login/Signup hinzufügen, `description` ergänzen.  
**Priorität:** Mittel-Hoch.

### H8 — Dashboard Loading: `template.tsx` will-change nie entfernt
**Datei:** `src/app/template.tsx:22`  
**Problem:** `style={{ willChange: "opacity, transform" }}` ist permanent aktiv. Das zwingt den Browser, eine GPU-Schicht aufrechtzuerhalten, auch nach Abschluss der Animation. Bei 50+ Seiten-Navigation summiert sich das.  
**Lösung:** `willChange` nach Animation-Complete auf `auto` setzen, oder über `onAnimationComplete`-Callback entfernen.  
**Priorität:** Mittel-Hoch — Performance.

---

## 🟡 MEDIUM

### M1 — Pricing Page: Identischer Badge-Text EN/DE
**Datei:** `src/components/marketing/pricing-page.tsx:65`  
**Problem:** `{lang === "de" ? "Transparent & fair" : "Transparent & fair"}` — beide Sprachen identisch.  
**Lösung:** DE: "Transparent & fair" → OK, aber EN sollte "Transparent & fair" sein (ist korrekt, aber ternary ist unnötig). Minor, aber zeigt Copy-Paste-Pattern.

### M2 — Auth Form: `industry` hard-coded auf `"legal"`
**Datei:** `src/components/auth/auth-form.tsx:96`  
**Problem:** `const industry = "legal";` — kein Branchen-Selector bei Signup. Das Produkt unterstützt 7 Branchen (Sidebar), aber alle Neuanmeldungen sind "legal".  
**Lösung:** Branchen-Select-Dropdown im Signup-Formular oder Post-Signup-Onboarding-Step.

### M3 — Social Links: `rel="noreferrer"` ohne `noopener`
**Datei:** `src/components/marketing/chrome.tsx:429-437`  
**Problem:** `rel="noreferrer"` ohne `noopener`. Moderne Browser behandeln `noreferrer` implizit als `noopener`, aber für explizite Sicherheit sollte `rel="noopener noreferrer"` stehen.  
**Lösung:** `rel="noopener noreferrer"` auf allen Social-Links.

### M4 — Dashboard `timeAgo()`: Nur Deutsch
**Datei:** `src/app/dashboard/page.tsx:40-49`  
**Problem:** "gerade eben", "vor X Min", "vor X Std" — hard-coded Deutsch.  
**Lösung:** Mit i18n-Layer (siehe H1) lokalisieren.

### M5 — MarketingNav Mobile: Keine Escape-Taste
**Datei:** `src/components/marketing/chrome.tsx:338-383`  
**Problem:** Mobile Menu hat keinen Escape-Handler.  
**Lösung:** `useEffect` mit `keydown`-Listener für `Escape`.

### M6 — Download Page: Store Badges ohne `aria-label`
**Datei:** `src/components/marketing/download-page.tsx:283-298`  
**Problem:** Die Platzhalter-Divs für App Store/Google Play haben `aria-disabled="true"` aber kein `aria-label`. Screen-Reader-Nutzer hören nur "Coming soon to App Store".  
**Lösung:** `aria-label` mit beschreibendem Text ergänzen.

### M7 — `useSiteBrand()` ist Dead Code
**Datei:** `src/components/marketing/features-page.tsx:36-38`, `src/components/marketing/chrome.tsx:48-50`  
**Problem:** `function useSiteBrand(): SiteBrand { return "subsumio"; }` — immer "subsumio". Der `isSubsumio`-Check in Features-Page ist immer `true`. Dead Code-Pfad.  
**Lösung:** Entfernen oder durch echte Brand-Logik ersetzen.

### M8 — Compare Page: Mobile View — Subsumio-Spalte nicht hervorgehoben
**Datei:** `src/components/marketing/compare-page.tsx:129-165`  
**Problem:** In der Mobile-Card-View ist die Subsumio-Spalte (`i === 0`) leicht getönt, aber das Label ist nicht prominent. Auf Desktop ist die Subsumio-Spalte farbig hervorgehoben — auf Mobile geht das verloren.  
**Lösung:** Subsumio-Spalte in Mobile-View mit Brand-Farbe + Icon hervorheben.

### M9 — Sitemap: Login/Signup sollten `noindex` sein
**Datei:** `src/app/sitemap.ts:43`  
**Problem:** `/login` und `/signup` sind in der Sitemap. Auth-Seiten sollten nicht indexiert werden.  
**Lösung:** Aus Sitemap entfernen oder `robots: { index: false }` in den Page-Metadaten setzen (dann entfernt Next.js sie automatisch).

### M10 — Dashboard: Keine globalen Error-Boundaries pro Route
**Datei:** `src/app/dashboard/error.tsx`  
**Problem:** Es gibt eine `error.tsx` im Dashboard-Ordner, aber sie ist generisch. Bei 50+ Seiten wäre ein Route-spezifisches Error-Boundary für kritische Seiten (Query, Brain, Settings) besser.  
**Lösung:** Error-Boundaries für Query/Brain/Settings mit spezifischen Recovery-Actions.

### M11 — Keine Keyboard-Shortcuts im Dashboard (außer Cmd+K)
**Datei:** `src/app/dashboard/layout.tsx:50-58`  
**Problem:** Nur `Cmd+K` für Command Palette. Keine Shortcuts für häufige Aktionen (Upload, Query, Brain-Suche).  
**Lösung:** Shortcuts wie `U` für Upload, `Q` für Query, `/` für Suche — in Command Palette dokumentieren.

---

## 🟢 LOW (Polish)

### L1 — `FaqList` verwendet `<details>` ohne Animation
**Datei:** `src/components/marketing/chrome.tsx:572-586`  
**Problem:** Native `<details>`/`<summary>` — kein Height-Animation beim Aufklappen.  
**Lösung:** framer-motion `AnimatePresence` oder CSS `grid-template-rows: 0fr → 1fr` Transition.

### L2 — Landing Page: JSON-LD nur auf Root-Route
**Datei:** `src/app/page.tsx:3`  
**Problem:** `JsonLd` wird nur auf der Landing Page gerendert. Features, Pricing, Security etc. haben kein Structured Data.  
**Lösung:** `softwareApplicationLd` auch auf Features/Security, `faqPageLd` auf allen Seiten mit FAQ.

### L3 — Dashboard: `PageSkeleton` ist generisch
**Datei:** `src/components/dashboard/skeleton.tsx`  
**Problem:** Ein generischer Skeleton für alle Seiten. Besser wären Page-spezifische Skeletons (z.B. Table-Skeleton für Cases, Chat-Skeleton für Query).  
**Lösung:** Spezialisierte Skeletons für Table/Chat/Form/Graph.

### L4 — Auth Form: Kein Rate-Limit-Feedback
**Datei:** `src/components/auth/auth-form.tsx:127-153`  
**Problem:** Keine visuelle Anzeige bei Rate-Limiting. Die API gibt `rate_limited` zurück, aber es gibt keinen Countdown oder "Bitte warte X Sekunden".  
**Lösung:** Countdown-Timer bei Rate-Limit-Error.

### L5 — Dashboard Pages: Inkonsistente Loading-Patterns
**Dateien:** Verschiedene Dashboard-Pages  
**Problem:** Manche Seiten nutzen `PageSkeleton` (Dashboard-Main), andere nutzen manuelle `loading`-State mit `Loader2`-Spinner (Connectors, WhatsApp). Inkonsistent.  
**Lösung:** Einheitliches Loading-Pattern via `loading.tsx` pro Route oder `PageSkeleton`.

### L6 — `accentTile()` hat `dark` und `slate` mit identischen Werten
**Datei:** `src/components/marketing/chrome.tsx:76-91`  
**Problem:** Die `slate` und `dark` Tone-Maps in `ACCENT_TILE` sind identisch. Redundant.  
**Lösung:** Zusammenfassen oder `slate` als Alias für `dark` dokumentieren.

### L7 — Footer: Kein Newsletter-Signup
**Datei:** `src/components/marketing/chrome.tsx:414-468`  
**Problem:** Footer hat Social Links aber kein Newsletter-Input. Standard auf B2B-SaaS-Sites.  
**Lösung:** Newsletter-Input im Footer (col-span-2 Bereich).

### L8 — Dashboard Stats Cards: Keine Trend-Indikatoren
**Datei:** `src/app/dashboard/page.tsx:103-109`  
**Problem:** Stats zeigen nur absolute Werte, keine Trends (↑12% vs. letzte Woche).  
**Lösung:** Trend-Pfeile mit Delta-Werten (wenn historische Daten verfügbar).

---

## Architektur-Positivliste (Was gut ist)

- **Design-Token-System:** `--ds-*` und `--mk-*` mit `data-tone`-Scoping ist exzellent
- **Motion:** `MotionConfig reducedMotion="user"` auf allen Marketing-Pages
- **Offline-First:** `OFFLINE_KEYS`, `getCache`/`setCache`, `useNetworkStatus` im Dashboard
- **Security:** CSRF-Fetch, Sentry-Integration in Error-Boundary, `noindex` auf Forgot/Reset
- **SEO:** Sitemap mit hreflang, `robots.ts`, `manifest.ts`, JSON-LD auf Landing
- **Content-Architektur:** Content in `src/content/*.ts` getrennt von Komponenten
- **Component Library:** shadcn/ui mit CVA-Variants, `forwardRef`, `cn()`
- **Dashboard Layout:** Sidebar (collapsible), Topbar (search, notifications, brain-selector), Command Palette (Cmd+K)
- **Auth:** SSO-Ready (WorkOS), Suspense-Boundary für `useSearchParams`, Glass-Card-Pattern
- **Compare Page:** Mobile Card-View + Desktop Table-View — responsive

---

## Priorisierter Action-Plan

| # | Issue | Severity | Aufwand | Sprint |
|---|-------|----------|---------|--------|
| C1 | 7 leere Branchen-Routen → 404 | Critical | 2h | S1 |
| C2 | Nav: isStandalone dead code | Critical | 1h | S1 |
| C3 | Topbar: Click-Outside fehlt | Critical | 2h | S1 |
| H1 | Dashboard i18n | High | 3-5d | S2 |
| H2 | Error/404 i18n | High | 2h | S1 |
| H3 | Password-Visibility-Toggle | High | 1h | S1 |
| H4 | TypewriterText reduced-motion | High | 30min | S1 |
| H5 | Sidebar: Suche/Filter | High | 4h | S2 |
| H6 | Breadcrumbs im Dashboard | High | 4h | S2 |
| H7 | Auth Meta-Tags | High | 30min | S1 |
| H8 | template.tsx willChange | High | 30min | S1 |
| M1-M11 | Medium Issues | Medium | 1-2d | S2-S3 |
| L1-L8 | Low Issues | Low | 2-3d | S3+ |

**Sprint 1 (Quick Wins — 1 Tag):** C1, C2, C3, H2, H3, H4, H7, H8  
**Sprint 2 (i18n + UX — 1 Woche):** H1, H5, H6, M2, M5, M9  
**Sprint 3 (Polish — 1 Woche):** M1, M3, M4, M6, M7, M8, M10, M11, L1-L8
