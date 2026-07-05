# Go-Live-Gesamtaudit — Frontend, Dashboard, Docs, WhatsApp/Ingestion, Wettbewerb

> **Datum:** 2026-07-05
> **Scope:** Vollständiger Augenturlevel-Audit des Marketing-/Public-Frontends (Typografie,
> Kontraste, Abstände, Responsive), Code-Darstellung im Frontend, Dashboard-Funktionen,
> DOCS-Vollständigkeit, WhatsApp-Kommunikation, AT-Ingestion, Ladegeschwindigkeit,
> plus Feature-Gap-Vergleich mit Harvey & Co.
> **Methodik:** Live-Preview (Chrome/Preview-MCP) mit WCAG-Kontrastmessung im DOM,
> Heading-/Overflow-/A11y-Scan pro Seite (Desktop + Mobile 375px), statischer Code-Trace,
> Verifikation der offenen Befunde aus den Vorgänger-Audits. `tsc --noEmit` = 0 Fehler.

---

## 1. Executive Summary

**Gesamturteil: Launch-fähig nach Behebung von 1 P0 + 3 P1. Die Substanz ist außergewöhnlich; die Lücken sind Feinschliff und Ehrlichkeit, nicht Architektur.**

Das Fundament ist stark: Token-Disziplin im Marketing-Frontend ist **perfekt** (0 hartkodierte
Hex-Werte in den echten Komponenten — nur bewusste Mockup-Paletten), die Typo-/Spacing-/Radius-
Skala ist systematisch als CSS-Variablen definiert, die Sicherheitsarchitektur ist solide
(per-Request-CSP-Nonce, HSTS, COOP/COEP, CSRF-Double-Submit, HMAC-Sessions), und die
Ingestion-Pipeline-Befunde vom 2026-07-04 sind **größtenteils behoben**. Aber: Die Startseite
bewirbt Zertifizierungen, die es nicht gibt (P0), enthält drei sichtbare Tippfehler im Hero, und
der Root-Layout erzwingt `force-dynamic` für die gesamte SEO-Site.

| Bereich                 | Score  | Kernbefund                                                                  |
| ----------------------- | ------ | --------------------------------------------------------------------------- |
| Frontend-Code-Qualität  | 95/100 | 0 hartkodierte Hex, systematische Design-Tokens, 0 TS-Fehler                |
| Typografie & Hierarchie | 88/100 | Saubere Skala; 1 Heading-Skip, 3 Hero-Tippfehler                            |
| Farbkontraste (WCAG)    | 85/100 | Public-Seiten AA-sauber; Login-Links + Slate-Cards knapp unter AA           |
| Abstände & Responsive   | 96/100 | Kein H-Scroll auf Mobile, konsistente Section-Rhythmik                      |
| Ladegeschwindigkeit     | 72/100 | `force-dynamic` blockiert Static/ISR; kein `optimizePackageImports`         |
| Marketing-Ehrlichkeit   | 40/100 | **Unqualifizierte SOC-2-/ISO-27001-Badges (UWG-Risiko)**                    |
| Dashboard-Funktionen    | 92/100 | 135 Pages, auth-gated, wenige TODO-Stubs                                    |
| WhatsApp-Kommunikation  | 94/100 | Vollständige Kette, signatur-verifiziert, marktweit einzigartig             |
| AT-Ingestion            | 88/100 | GZ-Validator jetzt verdrahtet, HITL erreichbar; Prod-Korpus operativ prüfen |
| Docs-Vollständigkeit    | 90/100 | Umfangreich & aktuell; Product-Capabilities Rev. 3                          |

---

## 2. TODO-Liste nach Priorität

### 🔴 P0 — Muss vor Go-Live behoben werden (Rechts-/Vertrauensrisiko)

- [ ] **P0-1 · Falsche Zertifizierungs-Claims auf der Startseite.**
      `src/components/marketing/logo-marquee.tsx:39,40,48,49` und
      `src/content/site.ts:1880-1881,2154-2155` zeigen **bare** „SOC 2 Type II" und
      „ISO 27001" mit Verified-Checkmark-Icon in der Trust-Marquee bzw. den Hero-Trust-Items.
      Das Unternehmen hält **keine** dieser Zertifizierungen (bestätigt durch
      `trust-band.tsx:55-56` „SOC 2 Type II — Q4 2026" / „ISO 27001 — geplant 2026",
      `content/security.ts:139` „Audit-Roadmap für SOC 2 / ISO 27001" und den internen
      Competitive-Audit §7.1). Unqualifizierte Werbung mit nicht gehaltenen Zertifikaten
      ist in DACH **abmahnfähig (UWG § 5 irreführende geschäftliche Handlung)** und ein
      Vertrauens-GAU, sobald das IT-/Security-Team eines Interessenten den SOC-2-Report
      anfragt. **Fix (trivial):** Die Marquee- und site.ts-Labels an trust-band.tsx angleichen
      („— geplant 2026" / „in Vorbereitung") oder aus der Marquee entfernen. Dieselbe Ehrlichkeit,
      die die Security-Seite bereits zeigt, auf ALLE Oberflächen ziehen.

### 🟠 P1 — Vor Launch beheben (Sichtbar / Performance / A11y)

- [ ] **P1-1 · Drei Tippfehler im sichtbaren Landing-Hero.** - „KI-Kanzlei**o**software" → „KI-Kanzleisoftware" (`site.ts:1862`, prominent im Hero-Absatz + Mobile) - „**Aktegedaechtnis**" → „Aktengedächtnis" (`lib/industry-pack.ts:68`, als **H2-Überschrift** gerendert; fehlt das „n" UND nutzt „ae" statt „ä") - „**Plädandum**" → kein deutsches Wort; gemeint ist „Plädoyer" o. ä. (`site.ts:1871,1931`, im Hero-Q&A-Card + Showreel)
- [ ] **P1-2 · Login-Seite: Link-Kontrast unter WCAG AA.**
      „Passwort vergessen?" und der „Kostenlos starten"-Link nutzen `--brand-primary` (#1e40af)
      auf dunklem `--mk-bg` (#06060f) = **2,31:1** (AA fordert 4,5:1). `components/auth/auth-form.tsx:348`.
      **Fix:** Im `data-tone="dark"`-Scope einen helleren Blauton (blue-400 `#60a5fa`, ~6,5:1) für
      Text-Links verwenden — dieselbe Regel wie `--brand-text` im dunklen Tone bereits vorsieht.
- [ ] **P1-3 · `force-dynamic` im Root-Layout verhindert Static/ISR für die gesamte SEO-Site.**
      `src/app/layout.tsx:18` `export const dynamic = "force-dynamic"` erzwingt SSR pro Request
      für **jede** Marketing-/Legal-Seite (Ursache: `headers()`-Lesen für Sprach-Erkennung).
      Folge: kein CDN-HTML-Cache, höhere TTFB, höhere Serverkosten, schlechtere Core-Web-Vitals.
      **Fix:** Sprach-Erkennung über den Pfad (Segment-basiert, statisch bekannt) statt `headers()`
      lösen und `force-dynamic` nur auf `/dashboard` + `/portal` + `/admin` scopen, damit die
      öffentlichen Seiten statisch/ISR ausgeliefert werden.

### 🟡 P2 — Feinschliff & Optimierung

- [ ] **P2-1 · Heading-Hierarchie-Sprung H1→H3 auf der Startseite.**
      `logo-marquee.tsx:176` rendert „Vertrauen, das man belegen kann" als `<h3>` direkt nach
      dem Hero-`<h1>`, bevor ein `<h2>` kommt. **Fix:** auf `<h2>` heben oder (da dekorativer
      Trust-Streifen) in ein `<p role="presentation">` umwandeln.
- [ ] **P2-2 · Slate-Karten im SuperBrain-Abschnitt knapp unter AA.**
      `--mk-text-muted` (#94a3b8) auf verschachteltem `--mk-surface-2` (#334155) = **4,04:1**
      bei 12px-Text (`superbrain-advantage.tsx:177,250`). **Fix:** Muted-Shade auf Slate-
      surface-2 aufhellen oder Textgröße auf ≥14px anheben (dann greift die Large-Text-Schwelle nicht,
      aber der Kontrast steigt trotzdem).
- [ ] **P2-3 · Bundle-Optimierung in `next.config.ts`.**
      Kein `experimental.optimizePackageImports` für `lucide-react` + `framer-motion`
      (in 43 Komponenten importiert). Hinzufügen tree-shaked die Icon-/Motion-Importe und
      senkt das JS-Bundle spürbar.
- [ ] **P2-4 · `images.remotePatterns` mit `hostname: "**"`ist zu offen.**
   `next.config.ts:15` erlaubt Bildoptimierung von **jedem** HTTPS-Host — potenzieller
      Missbrauchs-/SSRF-Vektor über den Next-Image-Optimizer. Auf die tatsächlich benötigten
      Hosts einschränken.
- [ ] **P2-5 · Unfertige Widget-Verdrahtung.**
      `components/dashboard/time-tracking-widget.tsx:21,82` — „TODO: Get actual user ID" und
      „TODO: Open dialog to select activity type". Widget zeigt Platzhalter-Verhalten.
- [ ] **P2-6 · DATEV-Direct- und Microsoft-365-Connectoren „planned".**
      `lib/connector-coverage.ts:764,785` — ehrlich als „noch nicht implementiert (planned)"
      ausgewiesen (gut), aber DATEV-_Export_ existiert, DATEV-_Direct_ nicht. Vor Tax-Vertical-
      Vermarktung schließen.
- [ ] **P2-7 · Grounding-Invariante gegenprüfen.**
      Nur 7 Dateien nutzen `useGroundedAnswer` (CLAUDE.md fordert es für JEDE AI-Output-Surface).
      Wahrscheinlich zentral in Chat-Komponenten gekapselt (Test pinnt es), aber bei 135 Dashboard-
      Pages verifizieren, dass keine AI-Textfläche ohne CitationPanel rendert.

---

## 3. Was bereits stark ist (verifiziert)

**Frontend-Code:**

- **0 hartkodierte Hex-Farben** in den echten Marketing-Komponenten — alles über `--mk-*`/`--ds-*`-Tokens.
- Systematische Design-Tokens: Typo-Skala (`--ds-text-xs..hero`), Weight-Hierarchie, Line-Height-,
  Spacing-, Radius-, Motion-Token — alle als Single-Source-of-Truth in `globals.css`.
- WCAG-Kommentare an jedem Tone-Scope mit gemessenen Ratios (light 17,5:1 / slate 15,6:1 / dark 15,6:1).
- `tsc --noEmit` = **0 Fehler**. Self-hosted Fonts (kein Google-Runtime-Request, DSGVO), Skip-Link,
  `prefers-reduced-motion`-Respekt durchgängig.
- **Public-Seiten (Pricing, Features, WhatsApp, /at):** je genau 1 `<h1>`, 0 Kontrast-Fehler, 0 Overflow.
- **Mobile 375px:** kein horizontaler Scroll (docScrollWidth == Viewport); Hero sauber komponiert.

**Sicherheit:**

- Per-Request-CSP mit kryptografischer Nonce (kein `unsafe-inline`), HSTS+preload, X-Frame-Options DENY,
  COOP/COEP, Permissions-Policy. CSRF-Double-Submit mit Timing-Safe-Vergleich. HMAC-signierte Sessions +
  Portal-Tokens mit Revocation. Webhook-Signaturen (WhatsApp/DocuSign) timing-safe verifiziert.

**AT-Ingestion — Vorgänger-Befunde (2026-07-04) behoben:**

- **H1 (GZ-Validator nicht verdrahtet):** ✅ behoben — `validiereGZ`/`pruefeGZKonsistenz` jetzt in
  `legal-pipeline.ts:499,529` aufgerufen.
- **H3 (StPO-Jurisdiktionsfehler):** ✅ behoben — StPO zählt jetzt für AT **und** DE (`web-api.ts:795,816`).
- **H5 (HITL-Checkpoint unerreichbar):** ✅ behoben — `awaiting_review`/`needs_human_review` jetzt in
  review-queue, upload, mobile/pipeline, PipelinePanel.
- **H6 (Typo „témain"):** ✅ behoben → „témoin". **H7 (toter OcrWarningBanner):** ✅ entfernt.
- AT-Normkorpus **vollständig im Repo**: 7.356 Dateien, ABGB § 933 (Gewährleistung) mit Volltext (199 Wörter).
- **Offen (operativ, nicht Code):** H2 — verifizieren, dass die **Produktions-Engine** den vollständigen
  AT-Korpus ingestiert hat (der 2026-06-30-Live-Audit fand ABGB-Paragraphen mit `word_count: 8`).
  Deckt sich mit der Projektnotiz „Engine ohne LLM-Key, sonst alles real".

**WhatsApp — vollständige, signatur-verifizierte Kette:**
`webhook` (x-hub-signature-256 verifiziert) → `send` (Outbound-Gate) → `inbox` → `document-to-space`
(Ingestion in Akte/Shared-Space) → `identities` (Mandanten-Mapping) → `templates`. Marktweit einzigartig.

---

## 4. Feature-Gap-Vergleich: Subsumio vs. Harvey & Co.

Basierend auf dem verifizierten internen Competitive-Audit (2026-06-30), hier gefiltert auf
funktionale Voraus/Rückstand-Punkte.

### 4.1 Wo Subsumio funktional VORAUS ist

| Fähigkeit                           | Subsumio | Harvey | Legora | CoCounsel | Beck-Noxtua |
| ----------------------------------- | :------: | :----: | :----: | :-------: | :---------: |
| WhatsApp-Legal-Secretary (voll)     |    ✅    |   ❌   |   ❌   |    ❌     |     ❌      |
| Multi-Industry (Legal + Tax)        |    ✅    |   ❌   |   ❌   |    ❌     |     ❌      |
| beA-Integration                     |    ✅    |   ❌   |   ❌   |    ❌     |     ❌      |
| RVG/StBVV-Abrechnung + DATEV-Export |    ✅    |   ❌   |   ❌   |    ❌     |     ❌      |
| GoBD-Verfahrensdoku, § 203 StGB     |    ✅    |   ❌   |   ❌   |    ❌     |     ⚠️      |
| Trust Accounting + Practice Mgmt    |    ✅    |   ❌   |   ❌   |    ❌     |     ❌      |
| Client Portal + Mobile/PWA          |    ✅    |   ⚠️   |   ⚠️   |    ❌     |     ❌      |
| 5-Layer-Quality/Contradiction-Gate  |    ✅    |   ❌   |   ❌   |    ❌     |     ❌      |
| Knowledge Graph (persistent)        |    ✅    |   ❌   |   ❌   |    ❌     |     ❌      |
| EU-Hosting (Hetzner Falkenstein)    |    ✅    |   ❌   |   ❌   |    ❌     |     ✅      |
| 7-Sprachen-UI                       |    ✅    |   ⚠️   |   ⚠️   |    ❌     |     ❌      |

**Fazit Vorsprung:** Subsumio ist die **breiteste Funktionsplattform im Markt** — niemand vereint
Trust Accounting + RVG + beA + WhatsApp + Litigation Flow + Tax in **einer** Anwendung. Die
WhatsApp-Kanzlei-Kommunikation und die DACH-native Compliance sind **echte, funktional überlegene
Alleinstellungsmerkmale**, die kein globaler Konkurrent hat. Die Ingestion für österreichische Akten
(GZ/ON-Validator mit Gattungszeichen-Registry + OCR-Confusable-Erkennung, ERV-Rückverkehr,
§§ 124–126 ZPO Fristen, § 89a GOG Zustellfiktion) ist tiefer als bei jedem US-Anbieter und jetzt
korrekt in die Pipeline verdrahtet.

### 4.2 Wo Subsumio (noch) ZURÜCK liegt — nicht funktional, sondern Vertrauen/Content/Markt

1. **Zertifizierungen (KRITISCH):** Kein reales SOC 2 Type II / ISO 27001 / BSI C5 — Harvey,
   CoCounsel, Lexis, Legora, Beck-Noxtua haben Teile davon. **Das ist genau der Punkt, den P0-1
   NICHT durch Falschwerbung überbrücken darf** — sondern durch das laufende Audit (Q4 2026).
2. **Redaktionelle Content-Tiefe:** Kann Gesetze durchsuchen, aber keine Kommentare/Zeitschriften/
   Urteile mit beck-online-/Lexis-Qualität; keine Shepard's-/KeyCite-Citation-Validierung gegen Autoritäten.
3. **Marktdurchdringung:** Keine sichtbaren Referenzkunden/Case-Studies/Testimonials vs. Harvey
   (60 %+ AmLaw 100) / Legora (Linklaters, White & Case).
4. **Agentic Builder:** Kein No-Code-Agent-Builder wie Harvey Agent Builder / Lexis Protégé / Vincent Studio.

**Netto:** Funktional ist Subsumio Harvey & Co. **voraus** — besonders bei DACH-Workflows, WhatsApp
und Multi-Industry. Der Rückstand ist ausschließlich in Vertrauens-Signalen (Zertifikate, Referenzen)
und redaktionellem Rechts-Content — kein Code-Defizit, sondern Go-to-Market + Compliance-Reife.

---

## 5. Ladegeschwindigkeit — konkrete Hebel

1. **`force-dynamic` entfernen (P1-3)** — größter Einzelhebel: schaltet Static/ISR + CDN-HTML-Cache
   für die gesamte öffentliche Site frei.
2. **`optimizePackageImports` (P2-3)** für lucide-react + framer-motion — kleineres JS-Bundle.
3. Fonts sind bereits self-hosted mit `display: "optional"` (kein CLS, kein FOIT) — gut.
4. `images: avif/webp` aktiv — gut; nur `remotePatterns` einschränken (P2-4).
5. Bundle-Analyzer ist verdrahtet (`ANALYZE=true`) — vor Launch einmal fahren, um die
   größten Client-Komponenten (sidebar 2.350 Z., chat-panel 2.010 Z.) auf Lazy-Loading zu prüfen.

---

## 6. Endurteil

Subsumio ist **technisch launch-fähig**: 0 TS-Fehler, saubere Token-Architektur, solide Security,
funktional dem Wettbewerb voraus. Die **einzige echte Go-Live-Blockade ist P0-1** (Falschwerbung mit
Zertifikaten) — ein 10-Minuten-Fix mit erheblichem Rechtsrisiko, wenn ungefixt. Die drei P1-Punkte
(Tippfehler, Login-Kontrast, force-dynamic) sind vor dem öffentlichen Launch zu schließen; alles
Weitere ist Feinschliff. Nach P0 + P1 ist das „Anwaltskanzlei-OS" auslieferbar.
