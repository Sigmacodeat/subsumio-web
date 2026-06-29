# Subsumio — Marketing-Site Audit, Blueprint & Todo-Liste

> Stand: 2026-06-28 · Ziel: öffentliche Seiten auf **Agenturqualität**, SEO-/LLM-optimiert,
> design- & kontrast-geprüft, vollständig & korrekt — online-ready.
> Arbeitsprinzip: **kein Raten, kein Erfinden, 100 % belegbar.**

---

## ✅ Umsetzungsstatus (2026-06-28)

**Erledigt & verifiziert (Typecheck grün, SEO-/JSON-LD-Tests grün, live im Dev-Server geprüft):**

- 🔴 **P0 — Fake-Schema entfernt:** erfundene Testimonials geleert, `aggregateRating`/`review` length-guarded, Fake-`videoObject` entfernt. Live bestätigt: keine erfundenen Namen, kein Review-/Video-Schema im HTML. Verbleibende JSON-LD: Organization, LegalService, SoftwareApplication, FAQPage, HowTo (alle legitim).
- **Anrede „Du" überall (öffentlich):** AT/CH-Du→Sie-Maps entfernt; alle Sie-Reste in `site.ts`, `features.ts`, `security.ts`, `download.ts`, `blog.ts`, `city-pages.ts`, `vertical-pricing.ts` grammatik-korrekt auf Du. Live bestätigt (Demo-Card „Du").
- **Title ≤60 / Default-Description ~155 / Pains relativiert (Branchenschätzungen) / h1Keyword-Stuffing entfernt.**
- **Home (root+de): Description getrimmt + vollständiges hreflang** (de-DE/at/ch/en/x-default).
- **Cities-Sitemap dynamisch** aus `getAllCitySlugs()` + Phantom-Locale-URLs (`/en/cities/...`) entfernt.
- **Design-Check live:** Kontraste AA bestätigt (Subline ~6,5:1), Konsole fehlerfrei. **2 echte Bugs gefixt:** (1) H1-Wortabstand „JedeAkte"→„Jede Akte" (kollabierender inline-block-Space → margin), (2) Mobile-Header-Crowding (Tagline überlappte CTA → unter 420px ausgeblendet).
- **Meta-Descriptions auf ~150–160 gekürzt:** alle Content-`metaDesc` (features, security, products×4, verticals, solutions×5, city-pages×3) + Home + kanonische Subseiten (partners/pricing/about). OpenGraph-Descriptions bewusst länger belassen (kein SERP-Limit).
- **Core Web Vitals gemessen (Dev):** CLS **0** (perfekt), LCP ~2,4 s (Prod schneller). Keine Konsolenfehler.

**Verbleibend (dokumentiert, mechanisch / messend):**

- Inline-Description-Locale-Duplikate (de/at/ch/en von partners/pricing/about, 170–190 Zeichen) — trivialer Konsistenz-Sweep.
- Seiten-`<head>`-hreflang-Reziprozität über alle at/ch/en `page.tsx` (aktuell durch Sitemap-hreflang abgedeckt → unkritisch).
- Hero-LCP-Optimierung (Hero animiert aus verborgen → LCP-Tradeoff; bewusste Brand-Animation, reduced-motion respektiert).
- Per-Page OG-Images (dynamische `opengraph-image.tsx`), vollständiger Lighthouse-Prod-Lauf, Kontrast-Vollmatrix je Tone.
- `dashboard.ts` (App hinter Login) noch „Sie" — bewusst außerhalb „öffentliche Seiten"; separate Entscheidung nötig.

---

## 0. Ist-Zustand (was bereits stark ist)

Das Fundament ist überdurchschnittlich reif — kein Greenfield, sondern Feinschliff:

- **Architektur sauber & zentral:** Texte in `src/content/*.ts` (Single Source), Komponenten in
  `src/components/marketing/`, persistente Shell (`marketing-shell.tsx` → `chrome.tsx`).
- **Multi-Locale:** `de` (Basis), `at`/`ch` (Replacements), `en`. Konsistente Nav über alle Sprachen.
- **Technisches SEO weitgehend vorhanden:** `robots.ts`, `sitemap.ts` (inkl. Blogposts, Legal-Pages,
  hreflang), `manifest.ts`, `metadataBase`, OpenGraph + Twitter-Card, umfangreiches JSON-LD
  (Organization, LocalBusiness, SoftwareApplication, FAQPage, HowTo, VideoObject, Service, Breadcrumb).
- **Keyword-Cluster** im Layout-`metadata` (Kanzleisoftware / Fristen / KI-Legal …).
- **Heading-Hierarchie korrekt:** genau **1× H1 pro Seite** (verifiziert über alle Marketing-Komponenten),
  H2 für Sektionen, H3 für Cards.
- **WCAG-Kontrast bereits aktiv getunt:** `globals.css` enthält dokumentierte AA-Korrekturen
  (z. B. `--mk-text-subtle` „→ 4.6:1 (AA ✓)", `brand-text` light „#1e40af → 7.29:1 AA ✓").
- **Motion respektiert `reducedMotion="user"`** (Barrierefreiheit/Performance-Schalter vorhanden).
- **Starke Copy-Substanz:** Pain-Points, Stats, Vergleichstabelle vs. ChatGPT/Glean, FAQ,
  Szenarien — DACH-spezifisch (ZPO/BGB/ABGB, § 203 StGB, § 43a BRAO, DATEV).

**Fazit:** ~80 % Agenturniveau. Dieser Blueprint schließt die letzten 20 % + behebt **einen
kritischen Compliance-Fehler**.

---

## 1. Research-Erkenntnisse (Basis für alle Maßnahmen)

### 1.1 Google / SEO 2026 (YMYL = Legal)

- **E-E-A-T zwingend** (Experience, Expertise, Authoritativeness, Trust) — Google legt bei Rechtsthemen
  (YMYL) die höchsten Qualitätsmaßstäbe an. Expertise muss **sichtbar** sein.
- **AI Overviews** triggern auf bis zu 60 % der Suchen; organische CTR fällt ~61 %, aber **zitierte
  Seiten** gewinnen +35 % organische Klicks → **Answer-Engine-Optimization (AEO)** wird Pflicht.
- **AEO:** Inhalte so strukturieren, dass LLMs sie als direkte Antwort übernehmen
  (klare Frage→Antwort-Blöcke, FAQPage-Schema, prägnante Definitionen).
- **Meta-Title ≤ ~60 Zeichen, Meta-Description ~150–160 Zeichen** (sonst Truncation in SERP).

### 1.2 Wettbewerb (Benchmark — wir müssen mind. gleichziehen)

- **Harvey** (~$11 Mrd Bewertung, „operating system for legal"): H1 = outcome-/agentenfokussiert,
  „AI tailored for leading law firms … contract analysis, due diligence, compliance, litigation".
  Sehr knapp, enterprise-trust-lastig (Am Law 100, HSBC).
- **Clio** (2026 „Intelligent Legal Work Platform"): H1 = „Run your law firm with Clio, the #1 choice …",
  CTA „Try it for free — no credit card required". Social Proof (#1) + Reibungslos-Trial.
- **Muster, das beide teilen:** (1) outcome-fokussierte H1 < 10 Wörter, (2) sofortiger Social Proof,
  (3) friktionsfreier Trial-CTA, (4) Logos/Zahlen als Trust-Anker.
- **Unser Differenzierer (halten & schärfen):** belegte Antworten (Fundstellen), DACH-Recht nativ,
  DSGVO/§203/On-Prem, kein Halluzinieren (Gap-Analyse). Das ist gegenüber Harvey/Clio ein echter Vorteil.

### 1.3 B2B-SaaS-Design 2026

- **Hero in 5 Sek lesbar**, outcome-Headline < 8 Wörter, starke Trust-Signale „above the fold".
- **Schwere Animationen/Autoplay schaden LCP & Conversion** — schnelle statische Visuals konvertieren oft besser.
- **WCAG:** kein Ghost-Button auf unruhigem Hintergrund; Touch-Targets ≥ 48×48 px; AA-Kontrast.
- **Single-CTA-Seiten** konvertieren ~13,5 % vs. 10,5 % Multi-CTA; CTAs an mehreren Scroll-Punkten.
- **Jede Sekunde Ladeverzögerung = −7 % Conversion** → Core Web Vitals priorisieren.

---

## 2. Audit-Befunde (belegt, mit Datei:Zeile)

### 🔴 P0 — Kritisch (Recht/Google-Penalty/Vertrauen) — VOR Go-Live

1. **Erfundene Testimonials als Review-/AggregateRating-Schema an Google.**
   `src/components/marketing/testimonials-data.ts` enthält 3 frei erfundene Kundenstimmen
   (`Dr. M. Bauer / Kanzlei Bauer & Partner`, `Dr. T. Hoffmann / Hoffmann & Kollegen`, `Dr. S. Klein`) —
   identische Namen wie die Demo-Falldaten. Diese werden in `src/app/page.tsx` (und `de/at/ch`)
   über `aggregateRatingLd` + `reviewLd` als strukturierte Daten ausgeliefert.
   **Risiko:** (a) Google Manual Action für Fake-Review-Markup, (b) UWG-Abmahnung (irreführende
   Werbung, DACH), (c) verletzt das „kein Erfinden"-Prinzip.
   **Fix:** Entweder echte, freigegebene Referenzen einholen — oder Testimonials + Review/AggregateRating-
   JSON-LD entfernen, bis echte vorliegen. Solange keine echten: **kein `aggregateRating`/`review`-Schema.**

2. **Demo-/Stat-Zahlen auf Wahrheitsgehalt prüfen.** Landing nennt harte Zahlen
   („97.9% Recall@5", „40 % billable time lost", „1 in 5 deadlines missed").
   Recall@5 ist via `benchmark-methodology` belegbar (gut) — aber die Pain-%-Zahlen brauchen
   eine zitierbare Quelle, sonst streichen/relativieren (YMYL + UWG).

### 🟠 P1 — Hoch (SEO-Wirkung / Agentur-Feinschliff)

3. **Meta-Descriptions zu lang (Truncation in SERP).** Home-Description ≈ 250 Zeichen
   (`src/app/page.tsx`, `layout.tsx`), Google zeigt ~155–160. → Auf 150–160 Zeichen kürzen,
   Keyword + Nutzen + Region vorne. Gilt für alle Seiten-`metadata`.

4. **hreflang auf Subseiten unvollständig.** Home/`de` listet korrekt
   `de-DE/de-AT/de-CH/en/x-default`. Subseiten (z. B. `src/app/solutions/law-firms/page.tsx`)
   listen nur `{ de, en }` — **AT/CH fehlen**, obwohl `/at/...` & `/ch/...` existieren, und **kein
   `x-default`**. → Einheitliches hreflang-Helper für ALLE Seiten (de-DE/de-AT/de-CH/en/x-default).

5. **Sichtbarer Keyword-String unter H1 wirkt spammy.** `landing.tsx:185-188` rendert
   `h1Keyword` („AI legal software with cited answers for law firms") als sichtbaren `<p>`.
   Für Nutzer liest sich das wie Keyword-Stuffing → entweder in flüssige Subline integrieren
   oder visuell als echtes Element gestalten (nicht als nackte Keyword-Phrase).

6. **Default-Title grenzwertig lang.** `layout.tsx` default
   „Subsumio — KI-Kanzleisoftware für Rechtsanwälte | AT · DE · CH" ≈ 62 Zeichen → auf ≤ 60 trimmen.

7. **Roter Faden / Konsistenz-Pass über alle Texte.** Stichproben sehr gut, aber ein durchgehender
   Lektoratspass fehlt: Ansprache (Sie/Du — DE „Sie", AT-Override „Du" prüfen ob gewollt & konsistent),
   einheitliche Terminologie (Akte/Mandat/Matter), CTA-Wording (Trial-Begriff vereinheitlichen),
   keine Wiederholungen sektionsübergreifend.

8. **Cities-Sitemap nur 3 Slugs hardcodiert.** `sitemap.ts` listet nur `wien/berlin/zuerich`,
   obwohl `cities/[slug]` dynamisch ist → alle City-Slugs aus `content/city-pages.ts` generieren.

### 🟡 P2 — Mittel (Performance / Politur)

9. **Hero-Animation vs. LCP.** Wort-für-Wort-H1-Stagger + Parallax-BG-Icons + Magnetic-Buttons.
   Respektiert reduced-motion (gut), aber LCP-Element (H1) wird animiert → mit Lighthouse messen,
   ggf. H1 sofort sichtbar rendern und nur dekorative Elemente animieren.
10. **Per-Page OG-Images.** Aktuell eine statische `og-image.png` für alles → pro Seitentyp ein
    OG-Bild (dynamisch via `opengraph-image.tsx`) für besseres Social-/SERP-Preview.
11. **Kleinschrift-Kontrast final verifizieren.** `--mk-text-subtle` (text-xs Trust-Signale,
    h1Keyword) muss bei <18px ≥ 4.5:1 erfüllen — Werte sind „AA ✓" kommentiert, aber pro Tone-Surface
    (light/slate/dark/dashboard) mit Tool gegenmessen.
12. **Animationskonsistenz-Pass.** Prüfen, dass jede Animation eine Aussage transportiert
    (zeigt, was das Produkt kann) und keine reine Deko ist; einheitliche EASE/Dauer aus `motion-system.tsx`.

---

## 3. Blueprint — Arbeitsweise (forensisch, pixelgenau)

**Pro Seite ein wiederholbarer Prüf-Pass (Checkliste je Route):**

1. **Inhalt/roter Faden:** Hero-Versprechen → Beleg → Sektionen bauen logisch auf → CTA. Keine Lücke, kein Bruch.
2. **SEO on-page:** 1×H1 (Keyword + Nutzen), H2/H3 logisch, Title ≤60, Desc 150–160, canonical + vollständiges hreflang.
3. **AEO/LLM:** FAQ-Block + FAQPage-Schema, klare Definitions-Sätze, scannbare Listen.
4. **Design:** Kontrast AA je Tone, CTA-Hierarchie, Touch-Targets ≥48px, Whitespace/Rhythmus.
5. **Motion:** zweckgebunden, reduced-motion ok, kein LCP-Schaden.
6. **Verify:** Dev-Server + Lighthouse + visuelle Kontrolle (preview-tools), Screenshot als Beleg.

**Reihenfolge:** P0 → P1 → P2. Pro Workstream erst zentrale `content/*.ts` & `chrome.tsx`/`landing.tsx`
fixen (wirkt über alle Locales), dann seiten­spezifische `page.tsx`-Metadata.

---

## 4. Todo-Liste (abhakbar)

### P0 — vor Go-Live (Recht/Trust)

- [ ] **Testimonials klären:** echte freigegebene Referenzen ODER Testimonials + `aggregateRating`/`review`-JSON-LD entfernen (`testimonials-data.ts`, `app/page.tsx`, `de/at/ch/page.tsx`, `jsonld.tsx`).
- [ ] **Statistik-Claims belegen oder entschärfen** (Landing-Pains, Stats) — Quelle verlinken (`benchmark-methodology`) oder umformulieren.

### P1 — SEO & Agentur-Feinschliff

- [ ] Alle **Meta-Descriptions auf 150–160 Zeichen** kürzen (Home, Features, Pricing, Security, Solutions×4, Subsumio, WhatsApp, Download, Docs, Partners, About, Contact, Blog).
- [ ] **Einheitlicher hreflang-Helper** (de-DE/de-AT/de-CH/en/x-default) für ALLE `page.tsx` (statt `{de,en}`).
- [ ] **Default-Title ≤60 Zeichen** trimmen (`layout.tsx`).
- [ ] **h1Keyword-Zeile** entstuffen — in echte Subline integrieren (`landing.tsx`, `site.ts`).
- [ ] **Roter-Faden-/Lektoratspass** über `site.ts`, `solutions.ts`, `features.ts`, `security.ts`, `products.ts`: Ansprache, Terminologie, CTA-Wording, Dubletten.
- [ ] **Cities-Sitemap dynamisch** aus `content/city-pages.ts`.
- [ ] Pro Seite **FAQ + FAQPage-Schema** sicherstellen (AEO) — prüfen welche Subseiten noch keinen FAQ-Block haben.
- [ ] **Title/Desc-Längen-Test** in `seo-content.test.ts` erweitern (CI-Guard gegen Drift).

### P2 — Performance & Design-Politur

- [ ] **Lighthouse-Audit** (Mobile+Desktop) je Schlüsselseite; LCP/CLS/INP dokumentieren.
- [ ] **Hero-LCP optimieren** (H1 sofort sichtbar, nur Deko animieren).
- [ ] **Per-Page OG-Images** (`opengraph-image.tsx`).
- [ ] **Kontrast-Vollmessung** aller Sections/Cards je Tone (light/slate/dark/dashboard) — AA für Text, 3:1 für UI/Borders.
- [ ] **Animations-Audit:** jede Animation zweckgebunden, einheitliche EASE/Dauer, kein Jank.
- [ ] **Touch-Target-Check** ≥48×48 px (Nav, CTAs, Footer-Links, Sprache-Switcher).
- [ ] **Mobile-Pass** (Nav-Drawer, Mega-Dropdown, Tabellen-Reflow, Pricing-Grid).

### Querschnitt

- [ ] Nach Textänderungen: `seo-content.test.ts` + Build grün.
- [ ] Finaler **Verify-Pass** mit Preview-Server + Screenshots als Belege je Seite.

---

## 5. Offene Entscheidungen für dich (blockieren P0/P1)

1. **Testimonials:** echte Referenzen vorhanden/einholbar — oder vorerst entfernen?
2. **Statistik-Zahlen:** belastbare Quelle vorhanden — oder neutral umformulieren?
3. **Ansprache DE:** „Sie" (aktuell) beibehalten, AT/CH ebenso? (aktuell teils „Du" in AT-Override)
4. **Scope jetzt:** soll ich direkt mit P0 + P1 in Umsetzung gehen, oder erst nur P0?
