---
description: Optimiere Frontend / Marketing Pages nach Agency-Level Standards
---

# Frontend / Marketing Optimization

## Scope
- `src/app/` — alle Public Pages (landing, pricing, login, signup, forgot, reset, features, partners, imprint, privacy, terms, security, download, whatsapp, subsumio)
- `src/app/de/` — deutsche Lokalisierung
- `src/components/marketing/` — Marketing-Komponenten
- `src/components/brand/` — Logo & Branding
- `src/components/seo/` — SEO-Komponenten
- `src/content/` — Content-Quellen (compare.ts, competitors.ts, docs.ts, features.ts, faq.ts, pricing.ts, testimonials.ts, usecases.ts)
- `src/app/globals.css` — Globale Styles

## Kontext laden
1. Lese `src/app/layout.tsx` für Root-Layout & Provider
2. Lese `src/app/page.tsx` für Landing Page
3. Lese `src/content/*.ts` für alle Content-Quellen
4. Lese `src/components/marketing/` für bestehende Komponenten
5. Lese `src/app/globals.css` für Design-Tokens

## Optimierungs-Checkliste
- [ ] **Performance**: LCP < 2.5s, CLS < 0.1, INP < 200ms
- [ ] **SEO**: Meta-Tags, OpenGraph, structured data (JSON-LD), sitemap.xml, robots.txt
- [ ] **Accessibility**: WCAG 2.1 AA, ARIA-Labels, Keyboard-Navigation, Focus-States
- [ ] **Responsive**: Mobile-first, Breakpoints konsistent (sm/md/lg/xl)
- [ ] **Design-System**: TailwindCSS Tokens, konsistente Spacing/Typo/Colors
- [ ] **Conversion**: CTA-Hierarchie, A/B-Test-ready, Analytics-Events
- [ ] **i18n**: Deutsche Primärsprache, alle Strings ausgelagert
- [ ] **PWA**: Manifest, Service-Worker, Offline-Fallback
- [ ] **Images**: Next.js Image Component, WebP/AVIF, lazy loading
- [ ] **Fonts**: Next.js Font Optimization, display=swap

## Test-Befehle
```bash
# Lighthouse Audit
npx lighthouse http://localhost:3000 --output html --output-path ./lighthouse-report.html

# Build Check
npm run build

# TypeScript Check
npx tsc --noEmit

# ESLint
npx eslint src/app/ src/components/marketing/ src/content/
```

## Agency-Level Standards
- **Hero Section**: Klare Value Proposition, CTA above the fold, Social Proof
- **Feature Sections**: Benefit-driven Headlines, Icons aus Lucide, konsistente Card-Layouts
- **Social Proof**: Testimonials mit Avatar+Name+Rolle, Logos der Partner
- **Pricing**: 3-Tier Model, Feature-Comparison Table, Monthly/Annual Toggle
- **Footer**: Legal Links, Contact, Social, Newsletter
- **Navigation**: Sticky Header, Mobile Hamburger, Active States
