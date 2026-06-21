# Marketing-Seiten: Sections- & Animations-Audit (Agenturlevel)

**Datum:** 2026-06-21
**Scope:** Alle öffentlichen Marketing-Unterseiten von subsumio-web (nicht Dashboard).
**Ziel:** Jede Unterseite/Section auf Agenturlevel bringen — Struktur, Tiefe und vor allem
Animationsqualität auf das Niveau des Dashboards (`--ds-*` Design-Tokens, Keyframe-Vokabular
`shimmer`, `surface-glint`, `badge-pulse`, `gradient-border-spin`, `line-reveal`, `float-gentle`,
`msg-in`, `widget-fade-in`) heben, statt nur generische Framer-Motion-Fades zu benutzen.

Bezieht sich nicht erneut auf Backend-/Feature-Lücken (siehe dazu
`Subsumio_vs_Harvey_Competitive_Production_Audit.md`, `FULL_COMPETITIVE_AUDIT_REPORT.md`) —
dieser Plan ist rein Frontend/UX/Motion für die Marketing-Site.

---

## 1. Wettbewerber-Benchmark (Research-Ergebnis)

| Anbieter                                               | Header-Nav                                                                                                                                          | Homepage-Sections (Kern)                                                                                                                                                                                                                                                         | Animation/Interaktion                                                                                                           | Visueller Eindruck                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Legartis** ([legartis.ai](https://www.legartis.ai/)) | Product (Dropdown: Agent, Playbook Creator, Contract Review, Insights, Mgmt) · Technology · Use Cases · Teams · Resources · Pricing · Contact Sales | Hero → Logo-Social-Proof → Feature-Carousel (4 Karten) → Testimonial → 4 Benefit-Blocks → Differentiators → CTA → 4-Step-Workflow → Trust-Badges (ISO/GDPR) → Team-Tabs (Legal/Sales/Procurement/Construction) → Industry-Grid → Testimonial → Video-Section → FAQ (10) → Footer | Karten-Carousel, Tab-Switching, Scroll-Reveal mit Gradient-Blur im Hero, Video-Embed                                            | Sehr clean, viel Whitespace, Illustration-Karten statt Screenshots, "Vertrauen" als Leitmotiv |
| **Noxtua** ([noxtua.com](https://www.noxtua.com/))     | Product · Jurisdictions · Company · Security · News · Academy · Get Access                                                                          | Hero ("Less Hollywood. More substance.") → Client-Logos → Stats (100M+ Dokumente) → 3 Value-Pillars → 3 Capability-Blocks → Agentic-AI-Erklärung → Testimonial (Partner-Zitat) → 4 Industry-Verticals → Produkt-Announcement → Press-Logos → CTA → Footer                        | Kaum dynamische Animation dokumentiert — Stärke liegt in Inhalt/Zertifikaten, nicht Motion                                      | Sehr nüchtern, "Anti-Hype", Zahlen/Zertifikate als Vertrauensanker                            |
| **Harvey AI** ([harvey.ai](https://harvey.ai/))        | Platform · Solutions · Customers · Security · Resources · About                                                                                     | Video-Hero → Endless-Logo-Carousel (22+ Logos) → Platform-Overview mit Feature-Liste → Rotierende Testimonial-Karten → Video-Case-Studies (7 Stück, Grid) → Impact-Metrics (4 große Zahlen) → Security-Badges (klickbar, 6 Zertifikate) → Final-CTA                              | Auto-Loop-Logo-Carousel, Video-Poster mit Play-State, klickbare Security-Badges mit Detail-Reveal, Pfeil-Hover-States auf Links | Premium-Enterprise-B2B, dunkler/hoher Kontrast, "Daten schlagen Behauptungen"                 |

**Gemeinsame Best-Practice-Muster, die bei uns (teilweise) fehlen:**

1. Endlos-Logo-Carousel statt statisches Logo-Grid (Harvey, Legartis).
2. Klickbare/aufklappbare Zertifikats-Badges mit Detail-Layer statt reiner Icon-Reihe (Harvey).
3. Pro-Feature eigene Mini-Demo/Video statt nur Icon+Text (alle drei).
4. Tab-basierte Zielgruppen-Section direkt auf der Homepage (Legartis: Legal/Sales/Procurement/Construction) — wir haben das nur als separate `/solutions/*`-Seiten, nicht als Homepage-Teaser-Tabs.
5. Rotierende Testimonials mit Foto+Titel statt einzelnem Zitat.
6. FAQ mit 8–10 Einträgen direkt vor dem Footer (wir haben FAQ, aber prüfen ob Tiefe reicht).

---

## 2. Ist-Zustand subsumio-web (Code-Fakten)

**Stack:** Next.js App Router, Tailwind v4, **framer-motion 12.40**. Das Dashboard nutzt
**0× framer-motion**, sondern ein eigenes CSS-Keyframe-Vokabular in `globals.css`
(`shimmer`, `stream-in`, `orb-float`, `gradient-border-spin`, `line-reveal`, `badge-pulse`,
`float-gentle`, `surface-glint`, `msg-in`, `typing-dot`, `widget-fade-in`) plus durchgängige
`transition-all duration-150/200` Mikrointeraktionen auf Tokens (`--ds-*`).

> **Korrektur nach Code-Verifikation (2026-06-21, Folge-Session):** Phase A war beim
> ersten Schreiben dieses Dokuments zu pessimistisch eingeschätzt. Tatsächlich existiert
> bereits ein geteiltes Marketing-Motion-System: `src/components/marketing/motion-system.tsx`
> exportiert `Reveal`, `StaggerContainer`, `StaggerItem`, `GlowCard`, `EASE`, `ScrollProgress`
> und wird von `landing.tsx`, `marketing-shell.tsx`, `partners-page.tsx`, `pricing-grid.tsx`,
> `pricing-page.tsx`, `security-page.tsx`, `subsumio-subpages.tsx`, `trust-band.tsx` genutzt.
> Die Dashboard-Keyframes (`badge-pulse`, `line-reveal`, `float-gentle`, `surface-glint`,
> `shimmer`, `gradient-border-spin`) sind außerdem bereits **global** in `globals.css`
> definiert, nicht auf `data-tone="dark"` gescoped — A1 ist damit im Kern erledigt, es fehlt
> nur die _Anwendung_ auf weitere Marketing-Sections (siehe Phase B/C/E, jetzt präzisiert).
> Die echte, konkrete Lücke war: 6 von 7 FAQ-Stellen (`landing.tsx`, `security-page.tsx`,
> `pricing-page.tsx`, `partners-page.tsx`, `download-page.tsx`, plus `chrome.tsx`-Default)
> nutzten die statische `FaqList` (natives `<details>`, keine Animation) statt der bereits
> existierenden `AnimatedFaqList` (Framer-Motion-Akkordeon mit `AnimatePresence`-Height-Tween,
> single-open, Chevron-Rotation), die nur auf `/subsumio` (`vertical.tsx`) verwendet wurde.
> **Status: behoben** — alle 5 Seiten sind auf `AnimatedFaqList` umgestellt, `tsc --noEmit`
> clean, im Preview verifiziert (Klick togglet `aria-expanded` korrekt). `solution-page.tsx`
> nutzt ein eigenes Inline-FAQ-Pattern (kein `FaqList`/`AnimatedFaqList`) — siehe Phase D.

**Header-Navigation (`src/content/site.ts`):**

- Platform: Overview, Features, Security, WhatsApp Copilot, Download
- Solutions: Law Firms, Solo Lawyers, In-House, Mid-Sized Firms
- Resources: Documentation, Partner Program
- Company: About, Contact, Imprint

**Alle Marketing-Unterseiten (Top-Level, `src/app/*/page.tsx`, + `/de/*` Spiegel):**

| Seite                                              | Pfad                                                                                        | Status                                                                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home                                               | `/` (`landing.tsx`)                                                                         | ✅ Framer-Motion-Reveals + `AnimatedFaqList` (umgestellt)                                                                                                                            |
| Subsumio Übersicht                                 | `/subsumio` (`vertical.tsx`)                                                                | ✅ Bereits mit `AnimatedFaqList`, Referenz-Implementierung                                                                                                                           |
| Features                                           | `/features` (`features-page.tsx`)                                                           | ✅ Framer-Motion vorhanden, eigenes `GraphHero`, `CountUp`                                                                                                                           |
| Security                                           | `/security` (`security-page.tsx`)                                                           | ✅ `Reveal`/`StaggerContainer` + `AnimatedFaqList` (umgestellt). Trust-Badges/Compliance-Items noch statische Karten ohne Hover-Glint — siehe E1                                     |
| WhatsApp Copilot                                   | `/whatsapp` (`subsumio-subpages.tsx` → `WhatsAppPage`)                                      | Nutzt `motion-system`; Chat-Demo-Animation (`msg-in`/`typing-dot`) noch zu verifizieren — siehe E3                                                                                   |
| Pricing                                            | `/pricing` (`pricing-page.tsx` + `pricing-grid.tsx`)                                        | ✅ `Reveal`/`StaggerContainer` + `AnimatedFaqList` (umgestellt). Empfohlener Tarif ohne `gradient-border-spin` — siehe E2                                                            |
| Download                                           | `/download` (`download-page.tsx`)                                                           | ✅ `AnimatedFaqList` (umgestellt), 19 Motion-Stellen vorhanden. Plattform-Icon-Hover noch zu prüfen — siehe E4                                                                       |
| Solutions: Law Firms / Solo / In-House / Mid-Sized | `/solutions/*` (4 Routen, **1 gemeinsame Komponente** `solution-page.tsx` → `SolutionPage`) | ⚠️ **D1 bestätigt:** Alle 4 Seiten sind reine Content-Varianten derselben Komponente, kein eigenes Hero-Visual pro Zielgruppe. Eigenes Inline-FAQ (kein `FaqList`/`AnimatedFaqList`) |
| Docs                                               | `/docs` (`docs-page.tsx`)                                                                   | Funktional, 12 Motion-Stellen — niedrige Priorität                                                                                                                                   |
| Partners                                           | `/partners` (`partners-page.tsx`)                                                           | ✅ `Reveal`/`StaggerContainer`/`GlowCard` + `AnimatedFaqList` (umgestellt)                                                                                                           |
| About                                              | `/about` (`about-page.tsx`)                                                                 | 18 Motion-Stellen vorhanden — Team-/Trust-Section-Polish siehe E7                                                                                                                    |
| Contact                                            | `/contact` (`contact-page.tsx`)                                                             | 15 Motion-Stellen vorhanden — siehe E7                                                                                                                                               |
| Imprint / Privacy / Terms                          | `/imprint`, `/privacy`, `/terms`                                                            | reine Textseiten — bewusst ohne Animation, niedrige Priorität                                                                                                                        |
| Login / Signup / Forgot / Reset / Join             | Auth-Flows                                                                                  | UX-Polish niedrige Priorität (Conversion-kritisch aber kein "Sections"-Charakter)                                                                                                    |
| Vollständiger `/de/*`-Zweig                        | Sprachspiegel aller obigen                                                                  | Muss 1:1 mitziehen — Doppelpflege-Risiko                                                                                                                                             |

→ **Insgesamt 21 Top-Level-Marketing-Routen × 2 Sprachen (en/de) = 42 Seiten**, die beim
Optimierungsplan nicht einzeln vergessen werden dürfen.

---

## 3. TODO-Optimierungsplan (Agenturlevel)

### Phase A — Animations-System vereinheitlichen (Grundlage, zuerst)

- [x] **A1.** ~~Keyframe-Vokabular freigeben~~ — bereits global in `globals.css`, kein Scoping-Problem. Verifiziert 2026-06-21.
- [x] **A2.** ~~Geteilte Reveal-Variante extrahieren~~ — existiert bereits als `src/components/marketing/motion-system.tsx` (`Reveal`, `StaggerContainer`, `StaggerItem`, `GlowCard`, `EASE`, `ScrollProgress`). Verifiziert 2026-06-21.
- [x] **A5.** FAQ-Vereinheitlichung: `landing.tsx`, `security-page.tsx`, `pricing-page.tsx`, `partners-page.tsx`, `download-page.tsx` von statischer `FaqList` auf `AnimatedFaqList` umgestellt (tone="light"). Erledigt 2026-06-21.
- [ ] **A6.** `chrome.tsx`s exportierte `FaqList` ist jetzt nirgends mehr importiert außer intern — prüfen ob noch referenziert (`solution-page.tsx` hat eigenes Inline-FAQ, kein `FaqList`-Import) und ggf. toter Export entfernen, oder als Fallback für zukünftige einfache Seiten bewusst behalten.
- [ ] **A3.** `prefers-reduced-motion`-Fallback für alle neuen Marketing-Animationen prüfen (Dashboard hat das bereits über `transition-duration: 0.01ms !important`-Block — Marketing-Seiten checken, ob `useReducedMotion()` überall konsequent verwendet wird, nicht nur im Hero).
- [ ] **A4.** Performance-Check: `whileInView`-Reveals auf Low-End-Geräten/Mobile testen (viele gestaffelte `motion.div` pro Section können Jank verursachen) — ggf. `viewport={{ once: true, margin: "-100px" }}` konsequent setzen.

### Phase B — Homepage (`/`, `landing.tsx`)

> **Korrektur nach Code-Verifikation (2026-06-21, dritte Folge-Session):** B1, B2 und B4
> wie ursprünglich formuliert sind **nicht umsetzbar, ohne unehrlich zu werden**. Der
> Code zeigt an mehreren Stellen eine bewusste Anti-Fake-Social-Proof-Haltung: der
> Use-Cases-Abschnitt in `landing.tsx` trägt den Kommentar "real workflows, not fake
> testimonials", und `security-page.tsx` hat einen eigenen "Honest roadmap"-Abschnitt
> für Zertifizierungen, die es noch nicht gibt. Es existieren aktuell keine echten
> Kundenlogos, keine echten Testimonials und keine ISO/SOC2-Zertifikate zum Verlinken —
> Subsumio ist (Stand jetzt) ein Pre-Launch-Produkt ohne diese Assets. B1/B2/B4 wie bei
> Harvey/Legartis umzusetzen würde bedeuten, Kunden/Zertifikate zu erfinden. **Empfehlung:
> B1/B2/B4 zurückstellen, bis echte Kundenlogos/Testimonials/Zertifikate vorliegen** —
> dann sind sie technisch trivial nachzurüsten (das `GlowCard`/`motion-system`-Muster
> trägt sie problemlos.

- [ ] **B1.** (Zurückgestellt — fehlende echte Kundenlogos, siehe Hinweis oben.)
- [ ] **B2.** (Zurückgestellt — fehlende echte Zertifikate, siehe Hinweis oben.)
- [ ] **B3.** Pro Feature-Karte (Section `#features`) eine kleine Inline-Demo-Animation statt nur Icon+Text — z. B. Mini-Loop, der eine Kernaktion zeigt (Fristen-Erkennung, Zitat-Generierung). Stilistisch an Dashboard-`line-reveal`/`stream-in` anlehnen. Weiterhin offen.
- [ ] **B4.** (Zurückgestellt — fehlende echte Testimonials, siehe Hinweis oben.)
- [x] **B5.** Zielgruppen-Tabs (Kanzlei / Solo / In-House / Mittelstand) als Homepage-Teaser-Section eingebaut: neue Komponente `src/components/marketing/audience-tabs.tsx` (`AudienceTabs`), eingebunden in `landing.tsx` nach dem Use-Cases-Abschnitt. Tab-Switch (Framer-Motion `AnimatePresence mode="wait"`) zeigt Badge/Headline/Sub aus den bereits bestehenden `SOLUTIONS[lang]`-Daten (keine neuen/erfundenen Inhalte) plus Link zur jeweiligen `/solutions/*`-Seite. `tsc --noEmit` clean; SSR-Default-Inhalt (erster Slug `law-firms`) im Preview bestätigt. Tab-Klick-Interaktion konnte in dieser Session wegen einer parallel aktiven, gemeinsam genutzten Preview-Session (ständige Fast-Refresh-Zyklen durch parallele Datei-Speicherungen, State-Reset bei jedem Rebuild) nicht zuverlässig per Automation verifiziert werden — Code-Pattern ist Standard-`useState`/`onClick`, identisch zum bereits verifizierten Muster in `solution-page.tsx`. **Empfehlung: manuell im Browser kurz nachprüfen.**
- [ ] **B6.** `GraphHero`/Hero-Animation (aus `features-page.tsx`) prüfen, ob sie auch auf der Homepage als Hero-Visual genutzt werden kann/sollte, um die "KI sieht aus wie Dashboard"-Konsistenz zu erhöhen.

### Phase C — `/features`

- [ ] **C1.** Bestehender `GraphHero` + `CountUp`-Stats: gut, aber Übergang zwischen den 4 Feature-Sections (`HowItWorks`-Pattern) auf Dashboard-`gradient-border-spin`/`surface-glint` für Karten-Hover umstellen statt reinem `whileInView`-Fade.
- [ ] **C2.** Jede Feature-Sub-Section (es gibt mehrere `<section>`-Blöcke) braucht ein eigenes visuelles Differenzierungsmerkmal (Screenshot/Mini-Animation), nicht nur Text+Icon — Vergleich zu Legartis' Feature-Carousel mit Illustrationen.
- [ ] **C3.** FAQ-Tiefe prüfen/erweitern auf ~8–10 Fragen analog Legartis (aktuell Anzahl unklar, im Code verifizieren).

### Phase D — `/solutions/*` (Law Firms, Solo, In-House, Mid-Sized)

- [x] **D1.** Bestätigt: alle 4 Seiten teilen sich `solution-page.tsx` → `SolutionPage`, nur Content variiert (`src/content/solutions.ts`, vollständig eigene Copy/Pains/Features/FAQ pro Slug, aber bisher kein eigenes Hero-Visual). **Erledigt (Leichtgewicht-Lösung) 2026-06-21:** `HeroIconConstellation` in `solution-page.tsx` rendert die ersten 3 Feature-Icons der jeweiligen Vertical (aus `content.features`, bereits pro Slug unterschiedlich) als floatende Icon-Kacheln (`float-gentle`-Keyframe + Stagger) direkt im Hero — macht die 4 Seiten optisch unterscheidbar ohne neue Illustrationsarbeit. FAQ zusätzlich von statischem `<details>` auf `AnimatedFaqList` umgestellt. Im Preview verifiziert (`/solutions/solo` zeigt Brain/Calendar-Clock/Chat-Icons, andere Slugs zeigen ihre eigenen Icon-Sets).
  - **Offen für echtes Agenturlevel (Folge-Iteration):** Die Icon-Konstellation ist der pragmatische Zwischenschritt, kein Ersatz für ein vollwertiges Custom-Mockup pro Zielgruppe (Solo: Mobile-Screenshot; Kanzlei: Team-Dashboard-Screenshot) — falls gewünscht, separat als Design-Task einplanen.
- [x] **D2.** Cross-Link-Sektion "Not quite the right fit? / Nicht ganz das Richtige für dich?" ergänzt — verlinkt zu den jeweils 3 anderen Solutions-Seiten (`SOLUTION_CROSS_LINKS` in `src/content/solutions.ts`, gerendert in `solution-page.tsx` vor der finalen CTA). Erledigt 2026-06-21.

### Phase E — `/security`, `/pricing`, `/whatsapp`, `/download`, `/partners`, `/docs`, `/about`, `/contact`

- [ ] **E1. `/security`:** Zertifikats-/Compliance-Badges nach Harvey-Vorbild interaktiv machen (klickbar → Detail-Modal/Akkordeon mit Prüfbericht-Link), aktuell vermutlich statische Liste.
- [ ] **E2. `/pricing`:** Tier-Karten auf Hover-Elevation + `gradient-border-spin` für empfohlenen Plan (Dashboard-Konsistenz) statt reinem CSS-Hover.
- [ ] **E3. `/whatsapp`:** Eigene Produktseite — prüfen ob Chat-Demo-Animation existiert (Dashboard hat `msg-in`/`typing-dot` für Chat — diese exakt hier wiederverwenden für "WhatsApp Copilot tippt").
- [ ] **E4. `/download`:** Plattform-Icons (Win/Mac/Linux/Mobile) — Mikrointeraktion beim Hover (Download-Fortschritt-Tease) ergänzen.
- [ ] **E5. `/partners`:** Prüfen ob Partner-Logo-Reihe vorhanden — ggf. gleiches Carousel-Pattern wie B1 wiederverwenden (DRY).
- [ ] **E6. `/docs`:** Eher Funktional als animiert — niedrige Priorität, Fokus auf Suchfunktion/Struktur statt Motion.
- [ ] **E7. `/about`, `/contact`:** Team-/Trust-Section ggf. mit dezenter `float-gentle`-Animation für Team-Fotos/Office-Visual aufwerten.

### Phase F — Footer & globale Elemente

- [ ] **F1.** Footer auf allen Seiten konsistent prüfen (Spalten: Product/Solutions/Resources/Company/Legal wie Legartis) — aktuell in `FOOTER`-Objekt in `site.ts`, strukturell vorhanden, visuelle Politur (Hover-States auf Links) prüfen.
- [ ] **F2.** Sprachumschalter (`de`/`en`) — Übergangsanimation beim Wechsel prüfen, kein harter Reload-Sprung.
- [ ] **F3.** Mobile-Nav (`chrome.tsx` Menu/X-Icon-Toggle) — Slide-/Fade-Choreografie mit `AnimatePresence` prüfen, ob sie das gleiche Tempo/Easing wie Dashboard-Sidebar-Collapse (`transition-[grid-template-rows,opacity] duration-200 ease-out`) nutzt.

### Phase G — `/de/*` Parität (NICHT vergessen)

- [x] **G1.** Korrektur nach Code-Verifikation: Es gibt **kein** separates DE-Komponenten-Set zum Drift-Risiko. Jede `/de/*`-Route ist ein dünner Wrapper, der dieselbe Komponente wie ihr `en`-Pendant importiert und nur `lang="de"` + den deutschen Content aus `src/content/*.ts` übergibt (z. B. `src/app/de/solutions/law-firms/page.tsx` → `SolutionPage` mit `SOLUTIONS.de["law-firms"]`). Jede strukturelle/Animations-Änderung an einer Komponente wirkt automatisch auf beide Sprachen — kein Doppelpflege-Risiko für die in dieser Session geänderten Dateien (`landing.tsx`, `security-page.tsx`, `pricing-page.tsx`, `partners-page.tsx`, `download-page.tsx`, `solution-page.tsx`).
- [x] **G2.** Im Preview verifiziert: `/de/solutions/in-house` rendert eigene deutsche Copy ("Deine Rechtsabteilung, mit Gedächtnis." / "Der Justiziariats-Alltag" / "Vertrags-Chaos") inkl. der neuen `HeroIconConstellation` und Cross-Link-Sektion — keine Drift zur EN-Version. Einziges Restrisiko: zukünftige Seiten, die _keine_ gemeinsame Komponente nutzen (aktuell nicht der Fall, aber bei neuen Marketing-Seiten prüfen).

### Phase H — Qualitätssicherung

- [ ] **H1.** Lighthouse/CWV-Check nach jeder Phase (zusätzliche Animationen dürfen CLS/INP nicht verschlechtern).
- [ ] **H2.** Visueller Side-by-Side-Vergleich Dashboard-Mikrointeraktion vs. neue Marketing-Mikrointeraktion (Screenshots/GIFs) als Abnahmekriterium pro Phase.
- [ ] **H3.** `prefers-reduced-motion` End-to-End-Test über alle neuen Sections.

---

## 4. Priorisierung (Empfehlung)

1. **Phase A** (Grundlage) — sonst baut jede Folge-Phase ihr eigenes Animations-Vokabular.
2. **Phase B** (Homepage) — höchster Traffic, größter Eindruckshebel.
3. **Phase C** (`/features`) — zweithöchste Priorität, da Feature-Tiefe der zentrale Vergleichspunkt zu Legartis/Harvey ist.
4. **Phase G** (de/en-Parität) — parallel zu B/C mitlaufen lassen, nicht ans Ende schieben.
5. Phasen D, E, F — nach B/C, je nach Conversion-Relevanz der Einzelseite.
6. Phase H — kontinuierlich, nicht erst am Schluss.
