---
description: Vollständiger Agentur-Audit aller öffentlichen Seiten — Farbkontraste, Spacing, Texte, Link-Integrität, Redundanzen, Site-Brand-Konsistenz
---

# Full Public Site Audit — Agency-Level Feinschliff

## Kontext

Subsumio ist eine B2B SaaS Legal-Intelligence-Plattform für österreichische Kanzleien. Die Website hat **21 öffentliche Seiten** (de-AT, kanonisch unter `/at`), erreichbar über ein Mega-Dropdown-Nav und einen Footer. Dieser Audit prüft jede Seite auf Agentur-Level-Qualität. Alte `/de/*`, `/ch/*`, `/en/*` und ungeprefixte Marketing-URLs sind 308-Redirects auf `/at/*`.

## Alle öffentlichen Seiten (21 Routen, alle unter `/at`)

1. `/at` — Landing/Home
2. `/at/kanzlei` — Kanzlei-Übersicht
3. `/at/features` — Features
4. `/at/security` — Security
5. `/at/whatsapp` — WhatsApp Copilot
6. `/at/download` — Download
7. `/at/pricing` — Pricing
8. `/at/solutions/law-firms` — Solution: Law Firms
9. `/at/solutions/solo` — Solution: Solo
10. `/at/solutions/in-house` — Solution: In-House
11. `/at/solutions/mid-sized` — Solution: Mid-Sized
12. `/at/docs` — Documentation
13. `/at/partners` — Partner Program
14. `/at/about` — About
15. `/at/contact` — Contact
16. `/at/imprint` — Imprint
17. `/at/terms` — Terms
18. `/at/privacy` — Privacy
19. `/at/join` — Join (Signup)
20. `/at/login` — Login (nicht in Marketing-Shell)
21. `/at/signup` — Signup (nicht in Marketing-Shell)

## Nav-Struktur (Mega-Dropdown)

**AT (de-AT, einzige aktive Locale):**

- **Platform:** Overview (/at), Features (/at/features), Security (/at/security), WhatsApp Copilot (/at/whatsapp), Download (/at/download)
- **Solutions:** For Law Firms, For Solo Lawyers, For In-House, For Mid-Sized Firms
- **Resources:** Documentation (/at/docs), Partner Program (/at/partners), Download (/at/download) ← **Redundanz: Download erscheint in Platform UND Resources**
- **Company:** About (/at/about), Security (/at/security) ← **Redundanz: Security erscheint in Platform UND Company**, Contact (/at/contact), Imprint (/at/imprint)
- **Standalone:** Pricing (/at/pricing)

## Footer-Struktur (5 Spalten)

- Platform: Overview, Features, Security, WhatsApp Copilot, Pricing, Download
- Solutions: Law Firms, Solo, In-House, Mid-Sized
- Resources: Documentation, Partner Program, Refer a customer (→ /partners#affiliate), Dashboard
- Company: About, Contact, Imprint
- Legal: Terms, Privacy

## Bekannte Redundanzen / Probleme (vorab identifiziert)

1. **Download in Nav:** Erscheint in "Platform" UND "Resources" — redundant
2. **Security in Nav:** Erscheint in "Platform" UND "Company" — redundant
3. **Footer "Refer a customer" → `/partners#affiliate`:** Anchor muss auf der Partners-Seite existieren
4. **Footer "Dashboard" Link:** Führt zu `/dashboard` — nicht lokalisiert (korrekt, aber UX-Check nötig)
5. **`/join` Seite:** Im Nav nicht verlinkt — orphan page? Nur über direkte URL erreichbar
6. **`/contact` Seite:** Im Footer verlinkt, im Nav unter "Company" — aber keine Kontakt-Info auf der Seite sichtbar im Nav
7. **Footer Tagline:** "Das Gedächtnis deiner Firma." — sollte "Kanzlei" sein, nicht "Firma" (B2B Legal)

---

## Audit-Checklisten (pro Kategorie)

### A. Farbkontraste & Farbaufteilung

**A1. WCAG-Kontrast prüfen (alle Seiten):**

- [ ] Body-Text auf Background: `--mk-text` auf `--mk-bg` — mindestens 4.5:1 (AA)
- [ ] Muted-Text auf Background: `--mk-text-muted` auf `--mk-bg` — mindestens 4.5:1 (AA)
- [ ] Subtle-Text auf Background: `--mk-text-subtle` auf `--mk-bg` — mindestens 4.5:1 (AA)
- [ ] Subtle-Text auf Surface: `--mk-text-subtle` auf `--mk-surface` — mindestens 4.5:1 (AA)
- [ ] Brand-Text auf Background: `--brand-text` / `--brand-primary` auf `--mk-bg` — mindestens 4.5:1 (AA)
- [ ] Brand-Text auf Surface: `--brand-text` / `--brand-primary` auf `--mk-surface` — mindestens 4.5:1 (AA)
- [ ] Button-Text auf Button-Background: alle Button-Varianten (glow, secondary, ghost)
- [ ] Badge-Text auf Badge-Background: `--signal-blue` auf `brand-soft`
- [ ] Footer-Link-Text: `--mk-text-subtle` auf `--mk-surface` — mindestens 4.5:1 (AA)
- [ ] Nav-Link inaktiv: `--mk-text-muted` auf `--mk-bg` mit/ohne backdrop-blur
- [ ] Dark-Mode Sektionen: `--ds-text` auf `--ds-surface`, `--ds-text-muted` auf `--ds-surface`
- [ ] Gradient-Text (`hero-gradient-text`, `gradient-text-animated`): lesbar auf `--mk-bg`?
- [ ] Alle `--brand-*` Variablen in Light und Dark Tone prüfen
- [ ] Neue Dark-Mode Farben (user hat `--brand-secondary: #5eead4` etc. geändert) auf Kontrast prüfen

**A2. Farbaufteilung / Hierarchie:**

- [ ] Jede Seite hat klare visuelle Hierarchie: H1 > H2 > H3 > Body
- [ ] Brand-Farbe wird konsistent für Akzente verwendet (nicht überladen)
- [ ] Dark Sections (`data-tone="dark"`) haben konsistenten Hintergrund
- [ ] Light Sections (`data-tone="light"`) haben konsistenten Hintergrund
- [ ] Übergänge zwischen Light/Dark Sections sind visuell sauber (Border, Shadow)
- [ ] Keine "Farb-Inkonsistenz" zwischen Seiten (gleiche Section-Typen = gleiche Farben)
- [ ] CTA-Buttons sind visuell dominant (glow variant) auf jeder Seite
- [ ] Badge-Pill-Stil ist identisch auf allen Seiten (brand-soft, brand-border, brand-text)

### B. Abstände (Vertical & Horizontal)

**B1. Vertikale Abstände (Spacing-System):**

- [ ] Section-Padding: alle Sektionen nutzen konsistente `py-16` / `py-20` / `py-24` Werte
- [ ] Keine willkürlichen `mt-*` / `mb-*` Werte, die das Spacing-System brechen
- [ ] Hero-Section: `pt-28 pb-24` (mobile) / `pt-36 pb-28` (desktop) — auf allen Hero-Seiten identisch?
- [ ] Section-Heading zu Content: konsistent `mb-14` (wie in `SectionHeading` definiert)
- [ ] Card-Padding: alle Karten nutzen `p-6` (nicht `p-5` oder `p-4` vermischt)
- [ ] Badge zu H1: `mb-6` auf allen Seiten
- [ ] H1 zu Sub: `mb-8` auf Landing, aber `mt-6` auf About — Inkonsistenz prüfen
- [ ] Sub zu CTAs: `mb-12` auf Landing, variiert auf anderen Seiten — prüfen
- [ ] Footer-Padding: `py-14` — konsistent
- [ ] Zwischen Sektionen: kein doppeltes Padding (Section py-16 + nächste Section py-16 = 128px, ok?)

**B2. Horizontale Abstände (Container & Grid):**

- [ ] Max-Width: `max-w-7xl` für Full-Width, `max-w-4xl` für Text-Heavy, `max-w-3xl` für CTAs — konsistent?
- [ ] Page-Padding: `px-6` auf allen Seiten (mobile: `px-4`?)
- [ ] Grid-Gaps: `gap-4` / `gap-5` / `gap-6` — konsistent innerhalb gleicher Grid-Typen
- [ ] Card-Gap: `gap-4` in Grids — alle Seiten identisch?
- [ ] Button-Gap: `gap-4` in Button-Rows — alle Seiten identisch?
- [ ] Nav-Padding: `px-4 py-4 sm:px-6 lg:px-8` — nur im Nav, Seiten sollen `px-6` nutzen
- [ ] Container-Zentrierung: alle `mx-auto` + `max-w-*` Kombinationen korrekt?

### C. Texte & Content-Qualität

**C1. Roter Faden (Narrative Consistency):**

- [ ] Jede Seite hat einen klaren Zweck, der zum nächsten Schritt führt
- [ ] Hero → Value Prop → Features → Proof → CTA Flow auf jeder Seite vorhanden
- [ ] Übergänge zwischen Sektionen erzählen eine Geschichte (nicht nur Section-Stacks)
- [ ] CTA am Ende jeder Seite führt zur logischen nächsten Seite (nicht immer nur /signup)
- [ ] Landing → Subsumio Overview → Features → Pricing: Funnel ist kohärent
- [ ] Solutions-Seiten führen zu Features oder Pricing, nicht nur zu Signup
- [ ] About → Contact (korrekt), aber Contact → ? (was kommt nach Kontakt?)
- [ ] Docs → Signup oder Dashboard? Logischer Next Step fehlt vielleicht

**C2. Text-Qualität (pro Seite):**

- [ ] H1 ist punchy, spezifisch, kein Generic-Marketing-Speak
- [ ] Subhead ergänzt H1, wiederholt nicht
- [ ] Badge-Text ist kurz und aussagekräftig (≤ 4 Wörter)
- [ ] CTA-Text ist action-orientiert ("Get started" nicht "Learn more")
- [ ] Feature-Beschreibungen sind präzise (kein Floskel-Filler)
- [ ] FAQ-Antworten sind vollständig und hilfreich
- [ ] Keine Copy-Paste-Texte zwischen Seiten
- [ ] Keine TODO/Placeholder-Texte
- [ ] Österreichische Fachsprache ist idiomatisch (kein Denglisch)
- [ ] "du" oder "Sie" konsistent — prüfen welche Form verwendet wird

**C3. Redundanzen prüfen:**

- [ ] Download im Nav: 2× (Platform + Resources) — entfernen aus Resources
- [ ] Security im Nav: 2× (Platform + Company) — entfernen aus Company oder nur in einem behalten
- [ ] Footer "Refer a customer" und "Partner Program" → beide gehen zu /partners — einer reicht
- [ ] Landing-FAQ vs Pricing-FAQ: Überschneidungen?
- [ ] Features-Seite vs Subsumio-Overview: inhaltliche Überschneidung?
- [ ] Solutions-Seiten: 4 Seiten mit ähnlichem Aufbau — sind sie unterschiedlich genug?
- [ ] Footer Tagline "Das Gedächtnis deiner Firma." → "Kanzlei" statt "Firma"

### D. Link-Integrität & Navigation

**D1. Alle Nav-Links führen zu existierenden Seiten:**

- [ ] /at → Seite existiert
- [ ] /at/features → Seite existiert
- [ ] /at/security → Seite existiert
- [ ] /at/whatsapp → Seite existiert
- [ ] /at/download → Seite existiert
- [ ] /at/pricing → Seite existiert
- [ ] /at/solutions/law-firms → Seite existiert
- [ ] /at/solutions/solo → Seite existiert
- [ ] /at/solutions/in-house → Seite existiert
- [ ] /at/solutions/mid-sized → Seite existiert
- [ ] /at/docs → Seite existiert
- [ ] /at/partners → Seite existiert
- [ ] /at/about → Seite existiert
- [ ] /at/contact → Seite existiert
- [ ] /at/imprint → Seite existiert
- [ ] /at/terms → Seite existiert
- [ ] /at/privacy → Seite existiert

**D2. Footer-Links:**

- [ ] /partners#affiliate → Anchor existiert auf Partners-Seite
- [ ] /dashboard → führt zur App (nicht lokalisiert — korrekt)
- [ ] Alle Footer-Links führen zu existierenden Seiten
- [ ] Externe Links (LinkedIn, GitHub, X) haben `target="_blank"` und `rel="noreferrer"`

**D3. Interne Verlinkung (Cross-Linking):**

- [ ] Landing verlinkt zu Features, Pricing, Signup, Demo
- [ ] Subsumio-Overview verlinkt zu Features, Security, Pricing
- [ ] Features verlinkt zu Pricing, Signup
- [ ] Security verlinkt zu Signup, Contact
- [ ] Solutions verlinkt zu Features, Pricing, Signup
- [ ] About verlinkt zu Contact
- [ ] Contact verlinkt zu Signup oder gibt echte Kontakt-Möglichkeit
- [ ] Docs verlinkt zu Signup oder Dashboard
- [ ] Partners verlinkt zu Signup
- [ ] Download verlinkt zu Signup
- [ ] Pricing verlinkt zu Signup, Contact (für Enterprise)
- [ ] WhatsApp verlinkt zu Signup, Features
- [ ] Jede Seite hat mindestens 1 internen Link zu einer anderen Seite (außer Legal pages)

**D4. Redirects:**

- [ ] `/de/*`, `/ch/*`, `/en/*` und ungeprefixte Marketing-URLs liefern 308 auf `/at/*`
- [ ] Query-Parameter (z.B. `?next=`, Reset-Token) bleiben erhalten

**D5. Orphan Pages:**

- [ ] `/join` — im Nav nicht verlinkt. Wird diese Seite benötigt? Wenn ja, verlinken. Wenn nein, entfernen.
- [ ] Alle Seiten sind über Nav oder Footer erreichbar (außer Legal pages, die nur im Footer sind)

### E. Site-Brand-Konsistenz

**E1. Visuelle Konsistenz:**

- [ ] Logo (`SubsumioLogo`) ist auf jeder Seite im Nav identisch
- [ ] Logo im Footer ist identisch (kleinere Größe ok)
- [ ] Badge-Pill-Stil ist identisch auf allen Seiten (border, background, text, padding)
- [ ] Section-Heading-Stil ist identisch (H2 font-black, badge optional, sub muted)
- [ ] Button-Varianten sind konsistent (glow für Primary, secondary für Secondary, ghost für Tertiary)
- [ ] Card-Stil ist konsistent (rounded-2xl, border, surface background)
- [ ] Icon-Stil ist konsistent (Lucide, gleiche Größen in gleichen Kontexten)
- [ ] Dark-Section-Stil ist konsistent (data-tone="dark", ds-\* Variablen)
- [ ] Light-Section-Stil ist konsistent (data-tone="light", mk-\* Variablen)

**E2. Motion-Konsistenz:**

- [ ] Hero-Animation: alle Hero-Sections nutzen das gleiche Pattern (stagger, fade-up)
- [ ] Scroll-Reveal: alle Sektionen nutzen `whileInView` mit `once: true`
- [ ] Badge-Pulse: alle Badges nutzen die gleiche Animation (nicht manche `animate-pulse`, manche Framer Motion)
- [ ] Card-Hover: alle klickbaren Karten haben den gleichen Hover-Effekt
- [ ] `prefers-reduced-motion` wird auf jeder Seite respektiert

**E3. SEO & Meta:**

- [ ] Jede Seite hat ein `<title>` (über Next.js metadata)
- [ ] Jede Seite hat eine `description`
- [ ] OG-Image ist gesetzt (global oder pro Seite)
- [ ] Canonical URL zeigt auf `/at/*`
- [ ] `lang` Attribut ist `de-AT`; hreflang nur `de-AT` + `x-default`
- [ ] JSON-LD ist auf der Landing Page vorhanden

### F. Edge Cases & Stress Test

- [ ] Leere Zustände: Was passiert wenn eine Seite keine FAQ-Einträge hat?
- [ ] Sehr lange Texte: Brechen die Layouts bei extrem langen H1?
- [ ] Mobile Viewport: Alle Seiten auf 375px Breite getestet
- [ ] Tablet Viewport: Alle Seiten auf 768px Breite getestet
- [ ] Desktop Viewport: Alle Seiten auf 1440px Breite getestet
- [ ] Keyboard Navigation: Tab-Reihenfolge ist logisch auf jeder Seite
- [ ] Focus-Styles: sichtbar auf allen interaktiven Elementen
- [ ] 404-Seite: existiert und ist on-brand?

---

## Audit-Ausführung

### Schritt 1: Link-Integrität prüfen

Für jede der 21 URLs:

1. Route existiert in `src/app/at/`?
2. Seite rendert ohne Error?
3. Alle internen Links auf der Seite führen zu existierenden Seiten?

### Schritt 2: Farbkontrast prüfen

Für jede Seite:

1. Lese die `data-tone` Attribute (light/dark)
2. Prüfe alle `--mk-*` und `--ds-*` Variablen-Kombinationen
3. Berechne Kontrastverhältnisse (mindestens AA: 4.5:1)
4. Flagge alle Kombinationen unter 4.5:1

### Schritt 3: Spacing-Audit

Für jede Seite:

1. Liste alle `py-*`, `pt-*`, `pb-*`, `px-*`, `mt-*`, `mb-*` Werte
2. Vergleiche mit dem Spacing-System (4px Base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96)
3. Flagge Ausreißer (z.B. `mt-7`, `pb-14` wenn System `pb-16` vorsieht)

### Schritt 4: Text-Audit

Für jede Seite (de-AT):

1. Lese alle Text-Strings aus den Content-Dateien
2. Prüfe auf Redundanzen mit anderen Seiten
3. Prüfe auf Konsistenz der Tone-of-Voice
4. Prüfe österreichische Fachsprache auf Idiomatik
5. Prüfe "du" vs "Sie" Konsistenz

### Schritt 5: Brand-Konsistenz

Für jede Seite:

1. Vergleiche Badge-Stil, Button-Stil, Card-Stil, Heading-Stil mit Referenz
2. Vergleiche Motion-Pattern mit Referenz
3. Vergleiche Dark/Light Section-Übergänge

### Schritt 6: Redundanz-Cleanup

1. Entferne doppelte Nav-Einträge (Download, Security)
2. Konsolidiere Footer-Links
3. Fixe Tagline-Inkonsistenz ("Firma" → "Kanzlei", "Gedächtnis" → "Brain")
4. Prüfe `/join` — verlinken oder entfernen

### Schritt 7: Interne Verlinkung

1. Stelle sicher, dass jede Seite mindestens 1 internen Link hat
2. CTA am Seitenende führt zur logischen nächsten Seite
3. Solutions → Features/Pricing (nicht nur Signup)
4. About → Contact (bereits ok)
5. Docs → Signup/Dashboard

### Schritt 8: Mobile/Tablet/Desktop Check

1. Alle Viewports visuell prüfen (Browser Preview)
2. Keine horizontalen Scrollbars
3. Keine überlappenden Elemente
4. Touch-Targets mindestens 44×44px

---

## Definition of Done

- [ ] Alle 21 `/at`-URLs rendern ohne Error; alte Locale-URLs liefern 308
- [ ] Alle WCAG-Kontraste ≥ 4.5:1 (AA)
- [ ] Keine Redundanzen im Nav (Download, Security je 1×)
- [ ] Footer-Tagline ist konsistent
- [ ] Jede Seite hat mindestens 1 internen Link
- [ ] Jede Seite hat einen klaren CTA am Ende
- [ ] Spacing ist konsistent (keine Ausreißer)
- [ ] Badge/Button/Card-Stil ist identisch auf allen Seiten
- [ ] Motion-Pattern ist konsistent
- [ ] Österreichische Texte sind idiomatisch und konsistent ("du" oder "Sie", nicht gemischt)
- [ ] `/join` ist verlinkt oder entfernt
- [ ] `/partners#affiliate` Anchor existiert
- [ ] Mobile/Tablet/Desktop sind getestet
- [ ] Status: PRODUKTIONSREIF
