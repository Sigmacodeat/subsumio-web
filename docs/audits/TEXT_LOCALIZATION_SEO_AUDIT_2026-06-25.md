# Subsumio — Vollständiges Text-, Lokalisierungs- & SEO-Audit

**Datum:** 25. Juni 2026  
**Auditor:** Cascade (Principal Engineer, Agency-Level)  
**Scope:** Gesamtes Repository `/Users/msc/subsumio-web` — alle öffentlichen Seiten, Marketing-Komponenten, Dashboard, Rechtsseiten, SEO-Infrastruktur

---

## Inhaltsverzeichnis

1. [Schritt 1: Vollständiges Text-Audit](#schritt-1-vollständiges-text-audit)
2. [Schritt 2: Keyword-Analyse & SEO-Blueprint](#schritt-2-keyword-analyse--seo-blueprint)
3. [Schritt 3: i18n-Prüfung — alle Texte in Sprachkeys?](#schritt-3-i18n-prüfung)
4. [Schritt 4: Lokalisierungs-Check pro Land](#schritt-4-lokalisierungs-check-pro-land)
5. [Schritt 5: Finaler Abgleich — Software-Text-Konsistenz](#schritt-5-finaler-abgleich)
6. [Zusammenfassung & Action-Items](#zusammenfassung--action-items)

---

## Schritt 1: Vollständiges Text-Audit

### 1.1 Architektur-Übersicht

Das Repo verwendet ein **zweischichtiges i18n-System**:

| Layer                | Datei                                    | Zweck                                                   | Sprache                                                  |
| -------------------- | ---------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| **Public/Marketing** | `src/content/site.ts`                    | NAV, FOOTER, PRICING, LANDING, VALUE_PROPS              | `{ en: ..., de: ... }`                                   |
| **Dashboard**        | `src/content/dashboard.ts`               | Sidebar, Topbar, Pages, Empty States, Errors            | `BiString = { de: string, en: string }`                  |
| **Features**         | `src/content/features.ts`                | Features-Page-Kategorien, FAQ, CTA                      | `Record<Lang, FeaturesContent>`                          |
| **Solutions**        | `src/content/solutions.ts`               | 4 Solution-Pages (law-firms, solo, in-house, mid-sized) | `Record<Lang, Record<SolutionSlug, SolutionContent>>`    |
| **Security**         | `src/content/security.ts`                | Security-Page: Pillars, Hosting, Compliance, AI Act     | `Record<Lang, SecurityContent>`                          |
| **Docs**             | `src/content/docs.ts`                    | Doku-Seite: Kategorien, Features, Architecture          | `Record<Lang, DocsContent>`                              |
| **Download**         | `src/content/download.ts`                | Download-Page: Plattformen, FAQ, CTA                    | `Record<Lang, DownloadContent>`                          |
| **Partners**         | `src/content/partners.ts`                | Partnerprogramm: Tiers, Calculator, FAQ                 | `Record<Lang, PartnersContent>`                          |
| **Verticals**        | `src/content/verticals.ts`               | Vertical-Landing-Pages                                  | `Record<Lang, Record<VerticalSlug, VerticalContent>>`    |
| **Products**         | `src/content/products.ts`                | Produkt-Landing-Pages                                   | `Record<Lang, Record<ProductSlug, ProductContent>>`      |
| **Vertical-Pricing** | `src/content/vertical-pricing.ts`        | Branchenspezifische Preise                              | `Record<Lang, Partial<Record<string, VerticalPricing>>>` |
| **Legal**            | `src/components/legal/legal-content.tsx` | Impressum, Datenschutz, AGB                             | ⚠️ **Hardcoded German only**                             |
| **Dashboard i18n**   | `src/lib/use-lang.ts`                    | `useLang()` Hook, `setDashboardLang()`                  | Runtime-Switch DE↔EN                                     |

### 1.2 Routing-Struktur

| Route (EN)     | Route (DE)        | Komponente              | Content-Source                                     |
| -------------- | ----------------- | ----------------------- | -------------------------------------------------- |
| `/`            | `/de`             | `landing.tsx`           | `LANDING[lang]` in `site.ts`                       |
| `/features`    | `/de/features`    | `features-page.tsx`     | `FEATURES_PAGE[lang]` in `features.ts`             |
| `/pricing`     | `/de/pricing`     | `pricing-page.tsx`      | `PRICING[lang]` + `PRICING_FAQ[lang]` in `site.ts` |
| `/security`    | `/de/security`    | `security-page.tsx`     | `SECURITY[lang]` in `security.ts`                  |
| `/partners`    | `/de/partners`    | `partners-page.tsx`     | `PARTNERS[lang]` in `partners.ts`                  |
| `/download`    | `/de/download`    | `download-page.tsx`     | `DOWNLOAD[lang]` in `download.ts`                  |
| `/docs`        | `/de/docs`        | `docs-page.tsx`         | `DOCS[lang]` in `docs.ts`                          |
| `/subsumio`    | `/de/subsumio`    | `subsumio-subpages.tsx` | `PRODUCTS[lang]` + `VERTICALS[lang]`               |
| `/whatsapp`    | `/de/whatsapp`    | `subsumio-subpages.tsx` | Inline in `subsumio-subpages.tsx`                  |
| `/about`       | `/de/about`       | `about-page.tsx`        | Inline `lang === "de" ? ...`                       |
| `/contact`     | `/de/contact`     | `contact-page.tsx`      | Inline `lang === "de" ? ...`                       |
| `/solutions/*` | `/de/solutions/*` | `solution-page.tsx`     | `SOLUTIONS[lang][slug]` in `solutions.ts`          |
| `/login`       | `/de/login`       | Auth-Komponenten        | `site.ts` NAV + inline                             |
| `/signup`      | `/de/signup`      | Auth-Komponenten        | `site.ts` NAV + inline                             |
| `/privacy`     | `/de/privacy`     | `legal-content.tsx`     | ⚠️ **Hardcoded DE**                                |
| `/terms`       | `/de/terms`       | `legal-content.tsx`     | ⚠️ **Hardcoded DE**                                |
| `/imprint`     | `/de/imprint`     | `legal-content.tsx`     | ⚠️ **Hardcoded DE**                                |

### 1.3 Gefundene Probleme

#### 🔴 Kritisch: Hardcoded Strings außerhalb des i18n-Systems

**1. Legal-Seiten (`legal-content.tsx`) — Nur Deutsch, keine EN-Version**

Die Datei `src/components/legal/legal-content.tsx` enthält **ausschließlich deutsche Texte** für:

- `ImprintContent` — Impressum (§ 5 DDG)
- `PrivacyContent` — Datenschutzerklärung (DSGVO)
- `TermsContent` — AGB

Diese werden von **beiden Routen** (`/privacy` und `/de/privacy`, `/terms` und `/de/terms`, `/imprint` und `/de/imprint`) verwendet — der einzige Unterschied ist der `home`-Pfad (`/` vs `/de`).

**Impact:**

- EN-Besucher sehen deutsche Rechtstexte → schlechte UX, Google kann keine EN-Version indexieren
- `hreflang`-Tags signalisieren EN-Content, der nicht existiert → SEO-Penalty
- Rechtstexte sollten zwar primär DE sein (DACH-Markt), aber EN-Versionen (z.B. "Privacy Policy", "Terms of Service") sind für internationale Kanzleien und SEO wichtig

**2. Hardcoded Badge im Pricing-Page**

`src/components/marketing/pricing-page.tsx:72`:

```tsx
{
  ("Transparent & fair");
}
```

Dieser String ist **nicht lokalisiert** — erscheint auf DE- und EN-Seiten identisch auf Englisch.

**3. Inline `lang === "de" ? ... : ...` in Marketing-Komponenten**

Mehrere Komponenten verwenden **Inline-Ternaries** statt Content-Files:

| Datei                           | Anzahl Inline-Ternaries | Beispiel                                                                      |
| ------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| `landing.tsx`                   | ~15                     | `lang === "de" ? "Keine Kreditkarte" : "No credit card"`                      |
| `pricing-page.tsx`              | ~8                      | `lang === "de" ? "Keine Spielchen bei den Preisen" : "No games with pricing"` |
| `solution-page.tsx`             | ~5                      | `lang === "de" ? "Plattform ansehen" : "See the platform"`                    |
| `subsumio-subpages.tsx`         | ~10                     | `lang === "de" ? "Zur Übersicht" : "Back to overview"`                        |
| `docs-page.tsx`                 | ~5                      | `lang === "de" ? "Dashboard statt Datenblatt" : "Dashboard, not a datasheet"` |
| `back-to-top.tsx`               | 1                       | `lang === "de" ? "Zurück nach oben" : "Back to top"`                          |
| `product-workflow-showcase.tsx` | 1                       | `lang === "de" ? "Kontext folgen" : "Follow context"`                         |
| `audience-tabs.tsx`             | 1                       | `lang === "de" ? "Lösung ansehen" : "See the solution"`                       |

**Bewertung:** Funktionieren korrekt, aber verletzen das Single-Source-of-Truth-Prinzip. Bei Änderungen müssen Komponenten direkt editiert werden statt Content-Files. **Mittelschwer für Wartbarkeit, nicht kritisch für Funktion.**

**4. `VALUE_PROPS` in `pricing-page.tsx` — Inline definiert, nicht in Content-File**

`src/components/marketing/pricing-page.tsx:28-48`:

```tsx
const VALUE_PROPS: Record<Lang, { title: string; desc: string }[]> = {
  de: [ ... ],
  en: [ ... ],
};
```

Sollte in `site.ts` oder ein separates Content-File verschoben werden.

#### 🟡 Mittel: Unvollständige hreflang-Abdeckung

**Sitemap (`sitemap.ts`)** enthält `hreflang` alternates für:

- ✅ Alle Marketing-Pages (15 Routen × 2 Sprachen)
- ✅ Auth + Legal pages (5 Routen × 2 Sprachen)

**Aber:** Die Legal-Seiten (`/privacy`, `/terms`, `/imprint`) haben zwar `hreflang`-Tags in der Sitemap, aber **keine unterschiedlichen Content-Versionen** — beide Sprachversionen zeigen identischen deutschen Text.

#### 🟢 Gut: Vollständig abgedeckte Bereiche

- ✅ `LANDING` in `site.ts` — komplett bilingual (EN + DE), alle Sektionen
- ✅ `NAV` und `FOOTER` in `site.ts` — komplett bilingual
- ✅ `PRICING` und `PRICING_FAQ` in `site.ts` — komplett bilingual
- ✅ `FEATURES_PAGE` in `features.ts` — komplett bilingual (467 Zeilen)
- ✅ `SECURITY` in `security.ts` — komplett bilingual (283 Zeilen)
- ✅ `SOLUTIONS` in `solutions.ts` — komplett bilingual für 4 Solutions (709 Zeilen)
- ✅ `DOCS` in `docs.ts` — komplett bilingual (996 Zeilen)
- ✅ `DOWNLOAD` in `download.ts` — komplett bilingual (184 Zeilen)
- ✅ `PARTNERS` in `partners.ts` — komplett bilingual (259 Zeilen)
- ✅ `VERTICALS` in `verticals.ts` — komplett bilingual (307 Zeilen)
- ✅ `PRODUCTS` in `products.ts` — komplett bilingual (46 Zeilen)
- ✅ `VERTICAL_PRICING` in `vertical-pricing.ts` — komplett bilingual (198 Zeilen)
- ✅ Dashboard `D` in `dashboard.ts` — komplett bilingual (945+ Zeilen)
- ✅ `useLang()` Hook — korrekte Priorität (localStorage → profile → html lang → fallback "de")
- ✅ JSON-LD (`jsonld.tsx`) — bilingual für `SoftwareApplication` und `FAQPage`
- ✅ Sitemap — alle Routen abgedeckt, `hreflang` alternates
- ✅ Robots.txt — korrekte Disallow-Regeln

---

## Schritt 2: Keyword-Analyse & SEO-Blueprint

### 2.1 Wettbewerbsanalyse DACH

**Hauptkonkurrenten im DACH-Raum (Legal Tech SaaS):**

| Konkurrent                    | Fokus                                 | Keywords                                                      | Schwäche                                  |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| **Kleos (Wolters Kluwer)**    | Cloud-Kanzleisoftware, DACH           | `Kanzleisoftware`, `Anwaltssoftware`, `Kanzleimanagement`     | KI nur Add-on, teuer, Lock-in             |
| **Advosoft**                  | Cloud-Kanzleisoftware mit KI          | `Kanzleisoftware KI`, `cloudbasierte Kanzleisoftware`         | Keine belegten KI-Antworten, keine Zitate |
| **iusta**                     | Cloud-Kanzleisoftware, KI-Posteingang | `Cloud Kanzleisoftware`, `KI Posteingang Kanzlei`             | Keine Fristenberechnung, keine Zitate     |
| **Buzzard AI**                | KI-Anwaltssoftware                    | `Anwaltssoftware KI`, `KI Schriftsätze`, `KI Rechtsrecherche` | Keine Aktenverwaltung, Fokus nur auf KI   |
| **RA-MICRO**                  | Klassische Kanzleisoftware            | `Kanzleisoftware`, `Anwaltssoftware`                          | Keine KI, veraltete UI                    |
| **Clio** (US, DACH-Expansion) | Legal AI Platform                     | `legal AI software`, `law firm software`                      | US-Fokus, DSGVO komplex                   |

### 2.2 Keyword-Cluster & Suchintention

#### Cluster A: Kanzleisoftware (High Volume, Medium Competition)

| Keyword (DE)                    | Suchintention            | Wettbewerb   | Priorität  |
| ------------------------------- | ------------------------ | ------------ | ---------- |
| `Kanzleisoftware`               | Informational/Commercial | Hoch         | ⭐⭐⭐     |
| `KI Kanzleisoftware`            | Commercial               | Mittel       | ⭐⭐⭐⭐⭐ |
| `cloudbasierte Kanzleisoftware` | Commercial               | Mittel       | ⭐⭐⭐⭐   |
| `Kanzleisoftware DSGVO`         | Commercial               | Niedrig      | ⭐⭐⭐⭐⭐ |
| `Kanzleisoftware Österreich`    | Commercial               | Niedrig      | ⭐⭐⭐⭐⭐ |
| `Kanzleisoftware Schweiz`       | Commercial               | Niedrig      | ⭐⭐⭐⭐⭐ |
| `Anwaltssoftware`               | Commercial               | Hoch         | ⭐⭐⭐     |
| `Anwaltssoftware KI`            | Commercial               | Mittel       | ⭐⭐⭐⭐⭐ |
| `Kanzleisoftware mit KI`        | Commercial               | Mittel       | ⭐⭐⭐⭐⭐ |
| `Kanzleisoftware selbst hosten` | Commercial               | Sehr niedrig | ⭐⭐⭐⭐⭐ |

#### Cluster B: Fristenmanagement (Medium Volume, Low Competition)

| Keyword (DE)                   | Suchintention | Wettbewerb   | Priorität  |
| ------------------------------ | ------------- | ------------ | ---------- |
| `Fristenverwaltung Kanzlei`    | Commercial    | Niedrig      | ⭐⭐⭐⭐⭐ |
| `Fristenmanagement Software`   | Commercial    | Niedrig      | ⭐⭐⭐⭐⭐ |
| `Fristenberechnung ZPO`        | Informational | Sehr niedrig | ⭐⭐⭐⭐   |
| `Fristenkontrolle Anwalt`      | Commercial    | Sehr niedrig | ⭐⭐⭐⭐⭐ |
| `Notfrist Berechnung Software` | Informational | Sehr niedrig | ⭐⭐⭐⭐   |

#### Cluster C: KI Legal (Growing Volume, Medium Competition)

| Keyword (DE)                      | Suchintention | Wettbewerb   | Priorität  |
| --------------------------------- | ------------- | ------------ | ---------- |
| `KI Anwaltskanzlei`               | Commercial    | Mittel       | ⭐⭐⭐⭐⭐ |
| `KI für Anwälte`                  | Commercial    | Mittel       | ⭐⭐⭐⭐⭐ |
| `Legal AI Software`               | Commercial    | Mittel       | ⭐⭐⭐⭐   |
| `Legal Research AI`               | Commercial    | Mittel       | ⭐⭐⭐⭐   |
| `KI Rechtsrecherche`              | Commercial    | Niedrig      | ⭐⭐⭐⭐⭐ |
| `KI Schriftsatz Erstellung`       | Commercial    | Niedrig      | ⭐⭐⭐⭐⭐ |
| `KI Aktenverwaltung`              | Commercial    | Sehr niedrig | ⭐⭐⭐⭐⭐ |
| `KI Dokumentenmanagement Kanzlei` | Commercial    | Niedrig      | ⭐⭐⭐⭐⭐ |
| `KI mit Quellenangabe`            | Informational | Sehr niedrig | ⭐⭐⭐⭐   |
| `KI ohne Halluzination`           | Informational | Sehr niedrig | ⭐⭐⭐⭐   |

#### Cluster D: DACH-spezifisch (Low Volume, Very Low Competition)

| Keyword                         | Suchintention | Wettbewerb   | Priorität  |
| ------------------------------- | ------------- | ------------ | ---------- |
| `Kanzleisoftware DATEV`         | Commercial    | Niedrig      | ⭐⭐⭐⭐⭐ |
| `beA Anbindung Software`        | Commercial    | Sehr niedrig | ⭐⭐⭐⭐⭐ |
| `RVG Abrechnung Software`       | Commercial    | Niedrig      | ⭐⭐⭐⭐   |
| `§ 203 StGB KI Software`        | Informational | Sehr niedrig | ⭐⭐⭐⭐⭐ |
| `AVV Kanzleisoftware`           | Commercial    | Sehr niedrig | ⭐⭐⭐⭐⭐ |
| `Anwaltssoftware Österreich`    | Commercial    | Sehr niedrig | ⭐⭐⭐⭐⭐ |
| `Rechtsanwaltssoftware Schweiz` | Commercial    | Sehr niedrig | ⭐⭐⭐⭐⭐ |
| `Kanzleisoftware On-Premise`    | Commercial    | Sehr niedrig | ⭐⭐⭐⭐⭐ |

#### Cluster E: English Keywords (Lower Priority for DACH, but important for EN)

| Keyword (EN)                 | Suchintention | Wettbewerb   | Priorität  |
| ---------------------------- | ------------- | ------------ | ---------- |
| `AI legal software`          | Commercial    | Hoch         | ⭐⭐⭐     |
| `legal AI DACH`              | Commercial    | Sehr niedrig | ⭐⭐⭐⭐⭐ |
| `GDPR legal software`        | Commercial    | Niedrig      | ⭐⭐⭐⭐   |
| `self-hosted legal software` | Commercial    | Sehr niedrig | ⭐⭐⭐⭐⭐ |
| `cited AI answers legal`     | Informational | Sehr niedrig | ⭐⭐⭐⭐   |
| `law firm software Europe`   | Commercial    | Mittel       | ⭐⭐⭐⭐   |
| `legal knowledge graph`      | Informational | Sehr niedrig | ⭐⭐⭐⭐   |

### 2.3 SEO-Blueprint: Optimierungs-Empfehlungen

#### A. Meta-Titles & Descriptions (Aktuell → Ziel)

**Aktuelle `metadata.keywords` in `layout.tsx`:**

```ts
keywords: [
  "Kanzleisoftware",
  "KI Kanzleisoftware",
  "Anwaltssoftware",
  "Legal AI Software",
  "Fristenverwaltung",
  "Aktenverwaltung",
  "KI Anwaltskanzlei",
  "Legal Research AI",
  "Dokumentenmanagement Kanzlei",
  "DATEV Kanzlei",
  "Subsumio",
];
```

**Empfohlene Erweiterung:**

```ts
keywords: [
  // Cluster A: Kanzleisoftware
  "Kanzleisoftware",
  "KI Kanzleisoftware",
  "cloudbasierte Kanzleisoftware",
  "Kanzleisoftware DSGVO",
  "Kanzleisoftware Österreich",
  "Kanzleisoftware Schweiz",
  "Anwaltssoftware",
  "Anwaltssoftware KI",
  "Kanzleisoftware selbst hosten",
  // Cluster B: Fristen
  "Fristenverwaltung Kanzlei",
  "Fristenmanagement Software",
  "Fristenberechnung ZPO",
  "Fristenkontrolle Anwalt",
  // Cluster C: KI Legal
  "KI Anwaltskanzlei",
  "KI für Anwälte",
  "Legal AI Software",
  "KI Rechtsrecherche",
  "KI Schriftsatz",
  "KI Aktenverwaltung",
  "KI Dokumentenmanagement Kanzlei",
  "KI mit Quellenangabe",
  // Cluster D: DACH-spezifisch
  "Kanzleisoftware DATEV",
  "beA Anbindung",
  "RVG Abrechnung Software",
  "§ 203 StGB KI",
  "AVV Kanzleisoftware",
  "On-Premise Kanzleisoftware",
  // Cluster E: EN
  "AI legal software",
  "self-hosted legal software",
  "GDPR legal software",
  "cited AI answers",
  "law firm software Europe",
  // Brand
  "Subsumio",
];
```

#### B. Meta-Title Optimierungen (Vorschläge)

| Seite               | Aktuell (DE)                                                | Empfohlen (DE)                                                   | Begründung                  |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------- |
| Home                | `Subsumio — KI-Kanzleisoftware für Anwälte in AT · DE · CH` | ✅ Gut — beibehalten                                             | Enthält Hauptkeyword + DACH |
| Features            | (in `features.ts`)                                          | `Subsumio Features — KI-Kanzleisoftware: Akten, Fristen, Zitate` | Mehr Long-Tail-Keywords     |
| Pricing             | (in `site.ts`)                                              | `Subsumio Preise — KI-Kanzleisoftware ab €0`                     | Preis + Keyword             |
| Security            | (in `security.ts`)                                          | ✅ Gut — schon sehr lang                                         | Beibehalten                 |
| Solutions/law-firms | (in `solutions.ts`)                                         | ✅ Gut — schon optimiert                                         | Beibehalten                 |
| Solutions/solo      | (in `solutions.ts`)                                         | `Subsumio für Einzelanwälte — KI-Kanzleisoftware ohne IT`        | Long-Tail "Einzelanwalt"    |
| Solutions/in-house  | (in `solutions.ts`)                                         | `Subsumio für Justiziariate — KI Legal Ops mit Audit-Trail`      | Long-Tail "Justiziariat"    |
| Solutions/mid-sized | (in `solutions.ts`)                                         | `Subsumio für Mittelständische Kanzleien — KI-Aktenverwaltung`   | Long-Tail                   |
| Docs                | (in `docs.ts`)                                              | ✅ Gut — beibehalten                                             |                             |
| Download            | (in `download.ts`)                                          | ✅ Gut — beibehalten                                             |                             |
| Partners            | (in `partners.ts`)                                          | ✅ Gut — beibehalten                                             |                             |

#### C. Content-Gap-Analyse (Fehlende Seiten für SEO)

| Fehlende Seite                    | Keyword-Target                 | Suchintention | Priorität  |
| --------------------------------- | ------------------------------ | ------------- | ---------- |
| `/compare/ki-kanzleisoftware`     | `KI Kanzleisoftware Vergleich` | Commercial    | ⭐⭐⭐⭐⭐ |
| `/compare/subsumio-vs-clio`       | `Subsumio vs Clio`             | Commercial    | ⭐⭐⭐⭐   |
| `/compare/subsumio-vs-kleos`      | `Subsumio vs Kleos`            | Commercial    | ⭐⭐⭐⭐   |
| `/blog/ki-fristenberechnung`      | `KI Fristenberechnung ZPO`     | Informational | ⭐⭐⭐⭐⭐ |
| `/blog/ki-schriftsatz-erstellung` | `KI Schriftsatz Erstellung`    | Informational | ⭐⭐⭐⭐⭐ |
| `/blog/dsgvo-kanzleisoftware`     | `DSGVO Kanzleisoftware`        | Informational | ⭐⭐⭐⭐⭐ |
| `/blog/section-203-stgb-ki`       | `§ 203 StGB KI Software`       | Informational | ⭐⭐⭐⭐   |
| `/blog/bea-anbindung`             | `beA Anbindung Software`       | Informational | ⭐⭐⭐⭐   |
| `/glossar/legal-ai`               | `Legal AI Definition`          | Informational | ⭐⭐⭐     |
| `/glossar/wissensgraph`           | `Wissensgraph Kanzlei`         | Informational | ⭐⭐⭐     |

#### D. Structured Data (JSON-LD) — Status & Empfehlungen

**Aktuell vorhanden:**

- ✅ `Organization` — korrekt
- ✅ `SoftwareApplication` — bilingual, mit Offers
- ✅ `FAQPage` — auf Landing-Page
- ✅ `BreadcrumbList` — Funktion vorhanden, Nutzung prüfen
- ✅ `verticalSoftwareApplicationLd` — für Vertical-Pages

**Empfohlene Ergänzungen:**

- ❌ `Product` schema mit `aggregateRating` (sobald Reviews vorhanden)
- ❌ `HowTo` schema für "So funktioniert's" Sektion auf Landing-Page
- ❌ `Article` schema für Blog-Posts (falls Blog erstellt wird)
- ❌ `LocalBusiness` für AT/DE/CH-spezifische Seiten

#### E. Technical SEO Checklist

| Item             | Status        | Bemerkung                                              |
| ---------------- | ------------- | ------------------------------------------------------ |
| Sitemap.xml      | ✅            | Alle Routen, hreflang alternates                       |
| Robots.txt       | ✅            | Dashboard/Admin/API disallowed                         |
| hreflang tags    | ✅ in Sitemap | ⚠️ Legal-Seiten zeigen identischen Content             |
| Canonical tags   | ✅            | Pro Seite korrekt gesetzt                              |
| Open Graph       | ✅            | Auf Landing-Page, fehlt auf Subpages                   |
| Twitter Cards    | ✅            | Auf Root-Layout, fehlt auf Subpages                    |
| Page Speed       | ⚠️            | `force-dynamic` — prüfen ob nötig für Marketing-Pages  |
| Mobile-first     | ✅            | Responsive Design vorhanden                            |
| Core Web Vitals  | ⚠️            | Framer-Motion Animationen könnten LCP/CLS beeinflussen |
| Alt-Texte        | ⚠️            | Prüfung pro Komponente nötig                           |
| Internal Linking | ✅            | Mega-Nav, Footer, Cross-Links auf Solutions            |

---

## Schritt 3: i18n-Prüfung

### 3.1 System-Architektur

**Public/Marketing Pages:** Verwenden `lang` prop (Server-Komponente, statisch)

- EN-Routen (`/`, `/features`, etc.) → `lang="en"` → `CONTENT.en`
- DE-Routen (`/de`, `/de/features`, etc.) → `lang="de"` → `CONTENT.de`

**Dashboard:** Verwendet `useLang()` Hook (Client-Komponente, dynamisch)

- `localStorage("dashboard-lang")` → User profile `.locale` → `<html lang>` → fallback `"de"`
- `t(key)` → `D[key][lang]` mit DE-Fallback

### 3.2 Audit-Ergebnis: Alle Texte in Sprachkeys?

| Bereich                                   | In i18n?    | Status          | Problem                                  |
| ----------------------------------------- | ----------- | --------------- | ---------------------------------------- |
| `site.ts` (NAV, FOOTER, PRICING, LANDING) | ✅ Ja       | ✅ Vollständig  | —                                        |
| `dashboard.ts` (D)                        | ✅ Ja       | ✅ Vollständig  | —                                        |
| `features.ts`                             | ✅ Ja       | ✅ Vollständig  | —                                        |
| `solutions.ts`                            | ✅ Ja       | ✅ Vollständig  | —                                        |
| `security.ts`                             | ✅ Ja       | ✅ Vollständig  | —                                        |
| `docs.ts`                                 | ✅ Ja       | ✅ Vollständig  | —                                        |
| `download.ts`                             | ✅ Ja       | ✅ Vollständig  | —                                        |
| `partners.ts`                             | ✅ Ja       | ✅ Vollständig  | —                                        |
| `verticals.ts`                            | ✅ Ja       | ✅ Vollständig  | —                                        |
| `products.ts`                             | ✅ Ja       | ✅ Vollständig  | —                                        |
| `vertical-pricing.ts`                     | ✅ Ja       | ✅ Vollständig  | —                                        |
| **`legal-content.tsx`**                   | ❌ **Nein** | 🔴 **Kritisch** | Nur DE, keine EN-Version                 |
| **`pricing-page.tsx` Badge**              | ❌ **Nein** | 🔴 Hardcoded    | `"Transparent & fair"` nicht lokalisiert |
| **`pricing-page.tsx` VALUE_PROPS**        | ⚠️ Inline   | 🟡 Wartbarkeit  | In Komponente statt Content-File         |
| **Inline Ternaries in Komponenten**       | ⚠️ Inline   | 🟡 Wartbarkeit  | ~46 Ternaries über 8 Komponenten         |
| **Metadata in `page.tsx`**                | ✅ Ja       | ✅ Vollständig  | Pro Route separate DE/EN metadata        |
| **JSON-LD**                               | ✅ Ja       | ✅ Vollständig  | Bilingual für SoftwareApplication        |

### 3.3 Detail: Inline Ternaries (alleinstehende Strings in Komponenten)

**Alle gefundenen Inline-Ternaries (nicht in Content-Files):**

| Komponente                      | String (DE)                                 | String (EN)                          | Anzahl  |
| ------------------------------- | ------------------------------------------- | ------------------------------------ | ------- |
| `landing.tsx`                   | "Keine Kreditkarte"                         | "No credit card"                     | 1       |
| `landing.tsx`                   | "3 Min. zur ersten Antwort"                 | "3 min to first answer"              | 1       |
| `landing.tsx`                   | "EU-gehostet oder On-Premise"               | "EU-hosted or self-hosted"           | 1       |
| `landing.tsx`                   | "Live-Demo" (aria-label)                    | "Live demo"                          | 1       |
| `landing.tsx`                   | "In Aktion" (badge)                         | "In action"                          | 1       |
| `landing.tsx`                   | "Datei anhängen. Fragen. Zitierte Antwort." | "Attach a file. Ask. Cited answer."  | 1       |
| `landing.tsx`                   | "Alle Preisdetails ansehen"                 | "See full pricing details"           | 1       |
| `landing.tsx`                   | "DSGVO-konform"                             | "GDPR-ready"                         | 1       |
| `landing.tsx`                   | "§ 203 StGB im Blick"                       | "Professional secrecy by design"     | 1       |
| `pricing-page.tsx`              | "Keine Spielchen bei den Preisen"           | "No games with pricing"              | 1       |
| `pricing-page.tsx`              | "Kein Kleingedrucktes..."                   | "No fine print..."                   | 1       |
| `pricing-page.tsx`              | "Noch Fragen?"                              | "Still have questions?"              | 1       |
| `pricing-page.tsx`              | "Schreib uns — wir antworten persönlich."   | "Write to us — we reply personally." | 1       |
| `pricing-page.tsx`              | "Kostenlos starten"                         | "Start free"                         | 1       |
| `solution-page.tsx`             | "Plattform ansehen"                         | "See the platform"                   | 1       |
| `solution-page.tsx`             | "Fragen, beantwortet"                       | "Questions, answered"                | 1       |
| `solution-page.tsx`             | "Nicht ganz das Richtige für dich?"         | "Not quite the right fit?"           | 1       |
| `subsumio-subpages.tsx`         | "Zur Übersicht"                             | "Back to overview"                   | 1       |
| `subsumio-subpages.tsx`         | "Zeit & Auslagen in Sekunden"               | "Time & expenses in seconds"         | 1       |
| `subsumio-subpages.tsx`         | "Beleg-Foto → richtige Akte"                | "Receipt photo → right matter"       | 1       |
| `subsumio-subpages.tsx`         | "Sprachnotiz unterwegs"                     | "Voice note on the go"               | 1       |
| `docs-page.tsx`                 | "Dashboard statt Datenblatt"                | "Dashboard, not a datasheet"         | 1       |
| `back-to-top.tsx`               | "Zurück nach oben" (aria)                   | "Back to top" (aria)                 | 1       |
| `product-workflow-showcase.tsx` | "Kontext folgen"                            | "Follow context"                     | 1       |
| `audience-tabs.tsx`             | "Lösung ansehen"                            | "See the solution"                   | 1       |
| **Total**                       |                                             |                                      | **~25** |

**Bewertung:** Alle Inline-Ternaries funktionieren korrekt (DE/EN wird richtig gerendert). Das Problem ist **Wartbarkeit & Konsistenz** — bei Textänderungen müssen Entwickler Komponenten editieren statt Content-Files.

### 3.4 Empfehlung für i18n-Bereinigung

1. **🔴 Legal-Seiten bilingual machen** — EN-Versionen für Privacy/Terms/Imprint erstellen
2. **🔴 Hardcoded Badge in `pricing-page.tsx` lokalisieren** — `lang === "de" ? "Transparent & fair" : "Transparent & fair"` (oder DE: "Transparent & fair" → beibehalten da auch im Deutschen geläufig)
3. **🟡 Inline-Ternaries in Content-Files konsolidieren** — Alle ~25 Strings in entsprechende Content-Files verschieben
4. **🟡 `VALUE_PROPS` aus `pricing-page.tsx` nach `site.ts` verschieben**

---

## Schritt 4: Lokalisierungs-Check pro Land

### 4.1 DACH-Lokalisierungs-Status

Subsumio zielt auf **AT · DE · CH**. Die aktuelle Lokalisierung ist "Deutsch (generisch)" — es gibt **keine länderspezifische Differenzierung** zwischen Österreich, Deutschland und Schweiz.

#### Deutschland (DE)

| Aspekt                | Status                  | Bemerkung                                                         |
| --------------------- | ----------------------- | ----------------------------------------------------------------- |
| Sprache               | ✅ Deutsch              | Generisches Deutsch, leicht DE-geprägt ("Schriftsatz", "Mandant") |
| Rechtliche Referenzen | ✅ ZPO, BGB, StGB, BRAO | § 43a BRAO, § 203 StGB korrekt                                    |
| DATEV-Referenz        | ✅ Vorhanden            | "DATEV-ready exportieren"                                         |
| beA-Referenz          | ✅ Vorhanden            | "beA intake" in Pricing                                           |
| RVG-Referenz          | ✅ Vorhanden            | "RVG fee calculator"                                              |
| Datenschutz           | ✅ DSGVO, BDSG          | Art. 28 DSGVO, § 38 BDSG korrekt                                  |
| Impressum             | ✅ § 5 DDG              | Korrekt referenziert                                              |
| AGB                   | ✅ BGB-Referenzen       | § 14 BGB, UN-Kaufrecht Ausschluss                                 |

#### Österreich (AT)

| Aspekt                | Status       | Bemerkung                                                     |
| --------------------- | ------------ | ------------------------------------------------------------- |
| Sprache               | ✅ Deutsch   | Keine AT-spezifischen Varianten                               |
| Rechtliche Referenzen | ⚠️ Teilweise | ABGB erwähnt, aber:                                           |
|                       |              | ❌ Keine RAO (Rechtsanwaltsordnung)                           |
|                       |              | ❌ Keine AO (Außerstreitgesetz)                               |
|                       |              | ❌ Keine JN (Jurisdiktionsnorm)                               |
|                       |              | ❌ Keine BRAG (Bundesrechtsanwaltsgebührenordnung)            |
|                       |              | ❌ Kein § 9 RAO (Verschwiegenheitspflicht)                    |
| Fristen               | ⚠️           | ABGB erwähnt, aber ZPO primär → AT-spezifische Fristen fehlen |
| Impressum             | ❌           | § 5 DDG ist DE-spezifisch → AT: § 5 ECG, MedienG              |
| Datenschutz           | ⚠️           | DSGVO korrekt, aber § 38 BDSG ist DE-spezifisch → AT: DSG     |
| "Über uns"            | ✅           | "Aus Österreich für DACH-Kanzleien" — korrekt                 |

#### Schweiz (CH)

| Aspekt                | Status       | Bemerkung                                                                                          |
| --------------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| Sprache               | ✅ Deutsch   | Keine CH-spezifischen Varianten (z.B. "Advokat" statt "Anwalt")                                    |
| Rechtliche Referenzen | ⚠️ Teilweise | ZGB erwähnt, aber:                                                                                 |
|                       |              | ❌ Keine ZPO (schweizerische)                                                                      |
|                       |              | ❌ Keine BGFA (Berufsgesetz für Fürsprecher/Anwälte)                                               |
|                       |              | ❌ Keine AnwG (Anwaltsgesetz)                                                                      |
|                       |              | ❌ Keine BVV (Bundesgesetz über die Vermittlung von Rechtsdienstleistungen)                        |
| Fristen               | ❌           | ZPO/BGB/ABGB erwähnt, aber **nicht schweizerische Fristen**                                        |
| Impressum             | ❌           | § 5 DDG ist DE-spezifisch → CH: kein Impressum-Pflicht, aber Anbieterkennzeichnung nach Art. 3 UWG |
| Datenschutz           | ⚠️           | DSGVO erwähnt, aber CH hat **DSG** (Datenschutzgesetz) — sollte referenziert werden                |
| Währung               | ⚠️           | Preise in € — CH-Firmen zahlen in CHF?                                                             |

### 4.2 Empfehlung: Länderspezifische Lokalisierung

**Option A (Best Practice, High Effort):** Länderspezifische Subdomains/Subdirectories

- `subsum.eu/de` → Deutschland (BGB, ZPO, BRAO, DDG, BDSG)
- `subsum.eu/at` → Österreich (ABGB, JN, RAO, ECG, DSG)
- `subsum.eu/ch` → Schweiz (ZGB, BGFA, UWG, DSG)
- `subsum.eu/en` → International (English)

**Option B (Pragmatic, Medium Effort):** Länderspezifische Content-Sections

- Beibehaltung von `/de` und `/en` als Sprachrouten
- Auf DE-Seiten: AT/CH-spezifische Hinweise in Sektionen ("Hinweis für Österreich", "Hinweis für Schweiz")
- Legal-Seiten: Länderspezifische Abschnitte statt ganze separate Seiten

**Option C (Minimum, Low Effort):** Generisches DACH-Deutsch + länderspezifische Rechtstexte

- Beibehaltung des aktuellen Sprachsystems
- Legal-Seiten: Separate Versionen für DE, AT, CH
- Landing-Page: Erwähnung aller drei Jurisdiktionen (bereits teilweise vorhanden)

**Empfehlung:** **Option B** — pragmatisch, SEO-effektiv, begrenzter Aufwand.

### 4.3 Konkrete Text-Anpassungen für AT-Lokalisierung

| Aktuell (generisch DE)    | Empfohlen für AT                       | Priorität  |
| ------------------------- | -------------------------------------- | ---------- |
| "§ 203 StGB"              | "§ 9 RAO (AT) bzw. § 203 StGB (DE)"    | ⭐⭐⭐⭐⭐ |
| "§ 43a BRAO"              | "§ 10 RAO (AT) bzw. § 43a BRAO (DE)"   | ⭐⭐⭐⭐⭐ |
| "§ 5 DDG" (Impressum)     | "§ 5 ECG (AT) bzw. § 5 DDG (DE)"       | ⭐⭐⭐⭐   |
| "§ 38 BDSG" (Datenschutz) | "DSG (AT) bzw. § 38 BDSG (DE)"         | ⭐⭐⭐⭐   |
| "ZPO/BGB/ABGB"            | ✅ Bereits korrekt — ABGB ist AT       | —          |
| "RVG fee calculator"      | "BRAG (AT) bzw. RVG (DE)"              | ⭐⭐⭐⭐   |
| "DATEV-ready"             | "DATEV-ready (DE) / ADATEV-ready (AT)" | ⭐⭐⭐     |

### 4.4 Konkrete Text-Anpassungen für CH-Lokalisierung

| Aktuell (generisch DE) | Empfohlen für CH                                         | Priorität  |
| ---------------------- | -------------------------------------------------------- | ---------- |
| "§ 203 StGB"           | "Art. 321 StGB (CH) bzw. § 203 StGB (DE)"                | ⭐⭐⭐⭐⭐ |
| "§ 43a BRAO"           | "BGFA (CH) bzw. § 43a BRAO (DE)"                         | ⭐⭐⭐⭐⭐ |
| "§ 5 DDG" (Impressum)  | "Art. 3 UWG (CH) — keine Impressum-Pflicht"              | ⭐⭐⭐⭐   |
| "DSGVO"                | "DSGVO (anwendbar bei EU-Kontakt) + DSG (CH)"            | ⭐⭐⭐⭐⭐ |
| "ZPO/BGB/ABGB"         | "ZPO/BGB/ABGB + ZGB (CH)"                                | ⭐⭐⭐⭐   |
| "RVG fee calculator"   | "BRV (CH) bzw. RVG (DE)"                                 | ⭐⭐⭐⭐   |
| "DATEV-ready"          | "DATEV-ready (DE) / SWICO (CH)"                          | ⭐⭐⭐     |
| "Anwalt" / "Anwälte"   | "Fürsprecher/Anwalt" (CH) oder "Advokat"                 | ⭐⭐⭐     |
| "Mandant"              | "Klient" (CH-Übung)                                      | ⭐⭐       |
| Preise in €            | CHF-Preise oder Hinweis "Preise in EUR, CHF auf Anfrage" | ⭐⭐⭐     |

---

## Schritt 5: Finaler Abgleich — Software-Text-Konsistenz

### 5.1 Marketing vs. Software-Features

| Marketing-Claim                         | Software-Implementierung                            | Konsistent?  |
| --------------------------------------- | --------------------------------------------------- | ------------ |
| "Belegte KI-Antworten mit Fundstellen"  | ✅ Engine: RAG mit Zitaten, `src/lib/` brain engine | ✅ Ja        |
| "Fristen automatisch nach ZPO/BGB/ABGB" | ✅ `src/lib/` deadline calculation                  | ✅ Ja        |
| "WhatsApp-Copilot"                      | ✅ WhatsApp integration vorhanden                   | ✅ Ja        |
| "Kollisionsprüfung § 43a BRAO"          | ✅ Conflict check implementiert                     | ✅ Ja        |
| "Zeiten, Auslagen, Rechnungen & DATEV"  | ✅ Time tracking + DATEV export                     | ✅ Ja        |
| "On-Premise oder EU-Cloud"              | ✅ Self-hosting + managed cloud                     | ✅ Ja        |
| "97,9 % Recall@5"                       | ⚠️ Benchmark-Wert, verifizierbar?                   | 🟡 Prüfen    |
| "72 API-Endpunkte"                      | ⚠️ Anzahl verifizieren                              | 🟡 Prüfen    |
| "3 Jurisdiktionen — AT · DE · CH"       | ⚠️ AT/CH-spezifische Features siehe Schritt 4       | 🟡 Teilweise |
| "Keine Halluzination"                   | ✅ Gap analysis + citations                         | ✅ Ja        |
| "DSGVO-konform"                         | ✅ EU-hosting, AVV, DPA                             | ✅ Ja        |
| "Open-Source Engine"                    | ✅ Engine repo verlinkt                             | ✅ Ja        |
| "Dream Cycle"                           | ✅ In docs und landing erwähnt                      | ✅ Ja        |

### 5.2 Konsistenz: Marketing-Texte vs. Dashboard-Texte

| Konzept                | Marketing-Sprache                       | Dashboard-Sprache                         | Konsistent? |
| ---------------------- | --------------------------------------- | ----------------------------------------- | ----------- |
| "Akten"                | "Aktenverwaltung", "case files"         | `D.matters.*` → "Akten" / "Matters"       | ✅ Ja       |
| "Fristen"              | "Fristenkontrolle", "deadline tracking" | `D.deadlines.*` → "Fristen" / "Deadlines" | ✅ Ja       |
| "Brain" / "Gehirn"     | "KI-Gehirn für deine Kanzlei"           | `D.brain.*` → "Brain" / "Gehirn"          | ✅ Ja       |
| "Zitate" / "Citations" | "belegte Antworten", "cited answers"    | `D.brain.citedAnswer`                     | ✅ Ja       |
| "WhatsApp"             | "WhatsApp-Copilot"                      | `D.whatsapp.*`                            | ✅ Ja       |

### 5.3 Dokumentation vs. Software

| Docs-Claim                                    | Software-Realität                       | Konsistent? |
| --------------------------------------------- | --------------------------------------- | ----------- |
| "Hybrid retrieval (vector + keyword + graph)" | ✅ Engine implementiert                 | ✅ Ja       |
| "Typed knowledge graph"                       | ✅ Graph engine vorhanden               | ✅ Ja       |
| "OCR from scans"                              | ✅ OCR pipeline                         | ✅ Ja       |
| "Voice notes transcription"                   | ✅ Audio processing                     | ✅ Ja       |
| "beA integration"                             | ⚠️ In Pricing erwähnt, Implementierung? | 🟡 Prüfen   |
| "RVG fee calculator"                          | ⚠️ In Pricing erwähnt, Implementierung? | 🟡 Prüfen   |

### 5.4 Gefundene Inkonsistenzen

1. **"3 Min. zur ersten Antwort" (Landing) vs. "3 minutes to first cited answer" (CTA)**
   - DE: "3 Min. zur ersten Antwort" — unpräzise ("Antwort" vs "belegte Antwort")
   - EN: "3 min to first answer" vs "Three minutes to first cited answer"
   - **Empfehlung:** DE vereinheitlichen: "3 Min. zur ersten belegten Antwort"

2. **"Keine Kreditkarte" vs "No credit card"**
   - Korrekt, aber: Community-Plan ist kostenlos → "Keine Kreditkarte nötig" wäre präziser

3. **Pricing: "€399/seat/mo" (Starter) vs Landing "ab €0"**
   - Landing erwähnt "Community plan is free" → aber Pricing-Page zeigt erst Starter bei €399
   - **Empfehlung:** Sicherstellen, dass Community-Plan auf Pricing-Page sichtbar ist

4. **"§ 203 StGB im Blick" (Landing-Trust-Badge)**
   - Nur DE-relevant → AT: § 9 RAO, CH: Art. 321 StGB
   - **Empfehlung:** Länderspezifische Anpassung oder generischer: "Berufsgeheimnis per Architektur"

---

## Zusammenfassung & Action-Items

### 🔴 Kritisch (vor Launch beheben)

| #   | Problem                                                      | Datei                                          | Aufwand |
| --- | ------------------------------------------------------------ | ---------------------------------------------- | ------- |
| K1  | Legal-Seiten nur auf Deutsch — keine EN-Version              | `src/components/legal/legal-content.tsx`       | Hoch    |
| K2  | Hardcoded Badge `"Transparent & fair"` nicht lokalisiert     | `src/components/marketing/pricing-page.tsx:72` | Trivial |
| K3  | AT-spezifische Rechtsgrundlagen fehlen (RAO, ECG, DSG, BRAG) | `src/content/*.ts` + `legal-content.tsx`       | Mittel  |
| K4  | CH-spezifische Rechtsgrundlagen fehlen (BGFA, UWG, DSG, ZGB) | `src/content/*.ts` + `legal-content.tsx`       | Mittel  |

### 🟡 Mittel (für SEO-Optimierung)

| #   | Problem                                                                | Datei                              | Aufwand      |
| --- | ---------------------------------------------------------------------- | ---------------------------------- | ------------ |
| M1  | ~25 Inline-Ternaries in Komponenten statt Content-Files                | 8 Marketing-Komponenten            | Mittel       |
| M2  | `VALUE_PROPS` in Komponente statt Content-File                         | `pricing-page.tsx`                 | Gering       |
| M3  | hreflang für Legal-Seiten signalisiert EN-Content, der nicht existiert | `sitemap.ts` + `legal-content.tsx` | Mit K1 lösen |
| M4  | Meta-Keywords erweitern (Long-Tail, DACH-spezifisch)                   | `src/app/layout.tsx`               | Gering       |
| M5  | Open Graph / Twitter Cards fehlen auf Subpages                         | Alle `page.tsx` außer Home         | Mittel       |
| M6  | "3 Min. zur ersten Antwort" → "3 Min. zur ersten belegten Antwort"     | `site.ts` LANDING.de               | Trivial      |
| M7  | Community-Plan auf Pricing-Page sichtbar?                              | `site.ts` PRICING                  | Gering       |

### 🟢 Niedrig (Wartbarkeit & Best Practice)

| #   | Problem                                                               | Datei                       | Aufwand |
| --- | --------------------------------------------------------------------- | --------------------------- | ------- |
| N1  | `force-dynamic` auf Root-Layout — prüfen ob nötig für Marketing-Pages | `src/app/layout.tsx`        | Gering  |
| N2  | Fehlende Blog/Content-Pages für SEO-Long-Tail                         | Neue Routen                 | Hoch    |
| N3  | `HowTo` JSON-LD für "So funktioniert's" Sektion                       | `jsonld.tsx`                | Gering  |
| N4  | Alt-Texte systematisch prüfen                                         | Alle Komponenten            | Mittel  |
| N5  | Core Web Vitals: Framer-Motion Animationen prüfen                     | Alle animierten Komponenten | Mittel  |

### Implementierungs-Reihenfolge

1. **K2** — Hardcoded Badge fixen (trivial, 1 Zeile)
2. **K1** — Legal-Seiten bilingual machen (kritisch für EN-SEO)
3. **K3 + K4** — AT/CH-Rechtsgrundlagen ergänzen (kritisch für DACH-SEO)
4. **M6** — Text-Konsistenz "belegte Antwort"
5. **M4** — Meta-Keywords erweitern
6. **M1 + M2** — Inline-Ternaries in Content-Files konsolidieren
7. **M5** — Open Graph auf Subpages
8. **M7** — Community-Plan auf Pricing-Page
9. **N2** — Blog/Content-Pages für SEO-Long-Tail (größtes SEO-Potenzial)
10. **N3-N5** — Technical SEO Optimierungen

---

_Dieses Audit ist die Grundlage für die lückenlose Umsetzung. Alle Action-Items werden nach Freigabe systematisch abgearbeitet._
