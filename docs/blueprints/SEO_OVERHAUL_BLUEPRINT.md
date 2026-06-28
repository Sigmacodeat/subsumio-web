# SEO Overhaul Blueprint — Subsumio Web 2026

> **Status:** Alle code-fixable Items implementiert und code-verifiziert am 2026-06-28.
> Verbleibende Items sind extern (Domain-Migration, Google Business Profile, Backlinks, Gastbeiträge).

---

## ✅ IMPLEMENTIERT (Code-verifiziert)

Alle folgenden Items wurden im Code implementiert, verifiziert und aus dem Blueprint entfernt:

- **14 JSON-LD Schema-Typen:** Organization, SoftwareApplication, Service, LocalBusiness, Product, BreadcrumbList, FAQPage, HowTo, Dataset, APIReference, Review, AggregateRating, VideoObject, Blog — in `src/components/seo/jsonld.tsx`
- **Structured Data auf allen Seitentypen:** Landing (4 Locales), Features (4), Security (4), Partners (4), About (4), Contact (4), Pricing, Blog Overview, Blog Articles, Solutions (4), Cities (3), Benchmark, Docs
- **Blog-System:** 3 Artikel in `src/content/blog.ts`, `/blog` + `/blog/[slug]` mit Article JSON-LD
- **Sitemap:** Alle öffentlichen Routes inkl. Blog, Cities, Benchmark, Docs in `src/app/sitemap.ts`
- **DE als SEO-Primärfassung:** Root `/` = DE, Middleware leitet non-German Browser → `/en`
- **`/de/` Duplicate Content aufgelöst:** 301 Redirect `/de/*` → `/*` in `src/middleware.ts`
- **Kanonische Domain:** `NEXT_PUBLIC_SITE_URL=https://subsum.eu` in `.env.example`, Codebase-Fallback `subsum.eu`
- **Alle Titles ≤ 60 Zeichen:** 14 Titles gekürzt
- **H1 Suchintention-Optimierung:** h1Keyword + A/B-Test (`src/lib/ab-test.ts`)
- **Heading-Dual-Strategie:** Claim + Keyword-Anker in allen H2/H3
- **Pain-Zahlen + Agitation:** 4 KPIs + Pain-Point-Agitation auf Landing-Page
- **Feature-Text-Formel:** Transformation pro Feature (DE+EN)
- **Buzzword-Elimination:** Keine Buzzwords in User-facing Content
- **Einwandbehandlung:** 3 Objection-Handling FAQs (DE+EN)
- **CTA als Story-Abschluss:** Problem + Lösung + Risiko-Umkehr
- **Social Proof:** TrustBand mit 4 Zertifizierungs-Badges + 3 Testimonials + AggregateRating
- **Per-Page OG-Images:** 15 Seiten mit dynamischen OG-Images
- **Internal Linking:** 5 relatedLinks auf Landing, 3 Cross-Links auf Benchmark
- **City/Landing Pages:** `/cities` + 3 City-Pages (Wien, Berlin, Zürich) mit LocalBusiness Schema
- **Benchmark-Methodik-Seite:** `/benchmark-methodology` mit Dataset JSON-LD
- **API-Docs als SEO-Asset:** `/docs` mit APIReference Schema + Sitemap
- **AI-Search Readiness:** Zitierbare Entity-Blöcke, 14 Schema-Typen
- **Demo-Video Schema:** `videoObjectLd()` + VideoObject JSON-LD auf Root-Landing-Page
- **Core Web Vitals:** Lighthouse CI mit CWV Assertions (`lighthouserc.json`)
- **Crawl-Audit-Tooling:** `scripts/validate-jsonld.sh` + Lighthouse CI SEO minScore 0.95
- **CI/CD Template-Leck-Check:** `scripts/check-template-leaks.sh` + pre-push hook
- **Content-Language Meta:** `<meta http-equiv="content-language">` in Root Layout
- **noindex auf Legal-Pages:** 12 Legal-Pages (imprint/terms/privacy × de/en/at/ch)
- **noindex auf Auth-Pages:** login/signup/reset/forgot/join
- **FAQ serverseitig im HTML:** Antworten immer im DOM, CSS-Animation statt conditional render
- **KPI-Counter Trust-Fix:** "0" → "Zero" in DE+EN
- **WhatsApp als optionaler Komfort-Kanal:** Eyebrows + Security-FAQ zu §203 StGB
- **Trial-Dauer vereinheitlicht:** "14 Tage" / "14 days" konsistent
- **CTA-Mismatch behoben:** "Start free trial" / "14 Tage kostenlos testen"
- **Keyword-Konsistenz:** DE "Kanzlei-Brain", EN "firm brain" — vereinheitlicht in 6 Dateien
- **Sumsub Brand-Differenzierung:** organizationLd mit alternateName, sameAs, LinkedIn
- **Mobile Apps Beta-Kennzeichnung:** "App Store & Google Play (Beta)" + Beta-Hinweis
- **Mikro-Texte optimiert:** Action-orientierte Button-Labels, spezifische Platzhalter
- **Bilder-SEO:** SVG-Components mit aria-hidden, OG-Images mit alt-Text — keine Action nötig
- **Guided Tour:** `src/components/dashboard/guided-tour.tsx` (569 lines, 9 steps, 7 tests)
- **Onboarding Wizard:** `/dashboard/onboarding` (8 steps)
- **TypeScript:** 0 Errors | **Tests:** 4072/4072 passed | **Build:** erfolgreich

---

## ❌ NOCH OFFEN (extern, nicht code-fixable)

### 1. subsumio.com Migration

- **Was:** Alte Domain `subsumio.com` Inhalte prüfen vor 301 — Frankenstein-Locales (fr/ko/es/pl) und Preis-Diskrepanzen ausschließen
- **Warum extern:** DNS/Domain-Registrar Aktion, keine Code-Änderung
- **Status:** Im aktuellen Repo nicht vorhanden — bei Migration sicherstellen

### 2. Google Business Profile

- **Was:** Google Business Profile für RCIID GmbH / Subsumio, Wien aktivieren
- **Warum extern:** Google-Konto-Einrichtung, Postkarten-Verifikation
- **Status:** Nicht eingerichtet

### 3. Backlink-Aufbau (Off-Page SEO)

- **Was:** Mindestens 10 qualitative Backlinks in 3 Monaten
- **Warum extern:** Content-Marketing, PR, Gastbeiträge — keine Code-Änderung

### 4. LinkedIn-Content-Strategie

- **Was:** Aktive LinkedIn-Content-Strategie für Brand-Awareness
- **Warum extern:** Social Media Marketing, nicht Code

### 5. Gastbeitrag in Fachzeitschrift

- **Was:** Mindestens 1 Gastbeitrag in BRAK-Magazin oder DAV-Forum
- **Warum extern:** Redaktionelle Einreichung, nicht Code

---

## TECHNISCHE ENTSCHEIDUNGEN (Referenz)

- **Blog-Content:** TS-File `src/content/blog.ts` (kein CMS, git-versioniert)
- **Blog-Routing:** Next.js App Router `/blog/[slug]/page.tsx`
- **OG-Images:** Static für Top-Pages, `opengraph-image.tsx` für Blog
- **Schema-Injection:** Server-Components via `<JsonLd data={...} />`
- **Internal-Links:** `p(lang, path)` aus `site.ts` für locale-aware URLs
- **Sitemap:** Statisch + dynamisch (Blog-Posts zur Build-Zeit)
- **Domain:** Kanonische Domain = `subsum.eu` (App-Domain), Marketing-Domains per 301
- **de-DE:** Root `/` = DE-Content, `/de/` per 301 auf `/` aufgelöst
- **Title-Template:** `{Page-Keyword} | Subsumio` (max 60 Zeichen)
- **H1-Regel:** Primary Keyword + Suchintention, Metapher als H2
- **WhatsApp-Positionierung:** Optionaler Komfort-Kanal, nicht primärer USP
- **Brand-Differenzierung:** "Subsumio Kanzlei-Gehirn" als Brand-Keyword, JSON-LD sameAs gegen Sumsub-Verwechslung
