# Sigmabrain — Status-Report: Was ist echt, was ist Platzhalter, was fehlt

> Stand: 11. Juni 2026, **aktualisiert nach SaaS-Schicht-Build** (Auth, Billing,
> Referral, Admin, Features-Seite). Ehrliche Bestandsaufnahme — keine Schönfärberei.
> Ergänzt `SIGMABRAIN_STRATEGIE.md` (Pre-Mortem, Pricing, Partnerprogramm, 90-Tage-Plan).

## 🆕 Seit dem ersten Report gebaut (alles funktionsfähig, getestet)

- **Auth komplett**: Signup/Login/Logout/Session (EN+DE-Seiten, `/login`, `/signup`,
  `/de/...`). HMAC-signierte Sessions (Edge-kompatibel), scrypt-Passwort-Hashing,
  httpOnly-Cookies, kein Account-Enumeration-Leak. 8/8 Kern-Tests PASS
  (Session-Roundtrip, Tamper-Rejection, Passwort-Verify, Store, Admin-Bootstrap,
  Referral-Code, kein Hash-Leak).
- **Middleware**: `/dashboard` und `/admin` sind geschützt (Redirect zu `/login?next=…`),
  `/admin` zusätzlich rollenbasiert. Erster Signup wird automatisch Admin.
- **Referral-Tracking echt**: `?ref=CODE` wird als 90-Tage-Cookie erfasst (passend zum
  Partnerprogramm), bei Signup validiert und attribuiert (Selbst-Empfehlung blockiert).
  Settings zeigen den echten persönlichen Link + Zähler; Admin sieht die Attribution.
- **Billing-Skeleton, Stripe-ready**: Checkout-Route (Stripe REST, ohne SDK) + Webhook
  mit Signatur-Verifikation (Upgrade/Downgrade). Env-gated: ohne `STRIPE_SECRET_KEY`
  zeigt die UI einen ehrlichen "noch nicht verbunden"-Zustand statt zu so-tun-als-ob.
  `/dashboard/billing` mit Plan-Verwaltung, Logout + Abrechnung im Dashboard-Nav.
- **SaaS-Admin** (`/admin`): Kunden, Pläne, MRR, Empfehlungs-Statistik.
- **Features-Seite** (`/features`, `/de/features`): 6 Capability-Bereiche interaktiv
  (animierte Tabs, Terminal-Demos, framer-motion) — jede Engine-Funktion erklärt.
- **User-Store mit Adapter-Interface**: Datei-basiert (`.data/`, gitignored) für
  Self-Hosted/Dev; für Serverless-Produktion dasselbe Interface gegen Postgres
  implementieren (eine Datei austauschen). `.env.example` dokumentiert alle Variablen.

## ✅ Echt und funktionsfähig

**Marketing-Site (13 Routen, EN + DE), Typecheck + Lint sauber:**
`/`, `/de`, `/pricing`, `/de/pricing`, `/partners`, `/de/partners`,
`/solutions/{vc,legal,consulting}` × EN/DE, `/imprint`, `/privacy`.
Ein Content-System (`web/src/content/`) — beide Sprachen aus einer Quelle, kein doppeltes Layout.

**Dashboard (7 Seiten):** Query, Brain, Graph, Upload, Settings, Übersicht. Verbunden mit dem
gbrain-Backend über echte API-Proxies (`/api/think`, `/api/search`, `/api/stats`) — funktioniert,
sobald lokal `gbrain serve` läuft (Port 3001). Das Backend selbst (gbrain v0.42.38.0) ist
produktionsreif: Tausende Tests, Multi-Tenant-Scoping fuzz-getestet, Engine-Parität CI-gesichert.

**PWA (Schritt 2, Stufe 1):** App ist installierbar auf iOS, iPadOS und Android
("Zum Home-Bildschirm" / Chrome-Install-Prompt). Manifest, Icons (Σ-Glyphe), Standalone-Modus,
Theme-Color — fertig.

**Barrierefreiheit:** `prefers-reduced-motion` respektiert (alle Deko-Animationen stoppen),
sichtbare Fokus-Ringe, WCAG-konforme Kontraste im Design-System, semantische Struktur,
`aria-label` auf Icon-Buttons.

## ⚠️ Verbleibende Platzhalter (vor Launch ersetzen)

| Platzhalter | Was fehlt |
|---|---|
| Stripe-Env-Variablen leer | Checkout-Code ist fertig; es fehlen `STRIPE_SECRET_KEY` + Preis-IDs aus deinem Stripe-Konto. |
| API-Keys in Settings | Werden nicht persistiert (nur UI-State) — bei gehostetem Betrieb ohnehin serverseitig. |
| `hello@` / `partners@sigmabrain.com` | Domain ist noch nicht registriert! Zuerst sichern. |
| Impressum / Datenschutz | Rechtlich erforderliche Inhalte fehlen — anwaltlich erstellen lassen. |
| Brain-Provisioning | Signup legt `brainId` an, aber verbindet noch keinen gehosteten gbrain-Server pro Kunde. |
| Gratismonats-Gutschrift | Referral-Attribution ist erfasst; die automatische Rabatt-Anwendung passiert in Stripe (Coupon), sobald Billing live ist. |

## 🔧 Was zu "komplett online ready" fehlt (Reihenfolge = 90-Tage-Plan, Tage 1–30)

1. **Domain + E-Mail**: sigmabrain.com (+ .de/.ai) registrieren, hello@/partners@ einrichten.
2. **Hosting**: Web-App (z. B. Vercel/EU-VPS) + gbrain-Server deployen; `AUTH_SECRET` setzen;
   bei Serverless den User-Store-Adapter auf Postgres umstellen (Interface existiert).
3. **Stripe-Konto**: Produkte/Preise anlegen, 3 Env-Variablen setzen, Webhook registrieren —
   der Code dafür ist fertig und getestet.
4. **Multi-Tenant-Provisioning**: Signup → gbrain-Source/Brain anlegen → Dashboard-Proxies
   pro User routen. Die schwere Arbeit (Scoping, Isolation, fuzz-getestet) liefert gbrain bereits.
5. **Rewardful** für Affiliate-Auszahlungen (produktinterne Kunden-Referrals laufen schon).
6. **Rechtstexte**: Impressum, Datenschutz, AVV — anwaltlich.

## 🆕 Gap-Check-Runde (App-Download + Frontend-Vollständigkeit) — alles geschlossen

| Lücke | Status |
|---|---|
| Download-Seite mit Install-Anleitungen | ✅ `/download` + `/de/download` — iOS/iPadOS, Android, Desktop Schritt für Schritt; echter One-Click-Install-Button (beforeinstallprompt); Store-Badges als gekennzeichnete "Coming soon"-Platzhalter |
| SEO: robots.txt + sitemap.xml | ✅ `robots.ts` (Dashboard/Admin/API gesperrt), `sitemap.ts` (alle 22 Routen EN+DE mit hreflang) |
| Social-Sharing-Bild (OG/Twitter) | ✅ `og-image.png` (1200×630) generiert + in Metadata verdrahtet |
| Favicon | ✅ Σ-Icon als Multi-Size .ico (war Next-Default) |
| Offline-Verhalten | ✅ Service Worker (nur Navigation, bewusst kein aggressives Caching) + gestaltete Offline-Seite (zweisprachig) |
| 404-Seite | ✅ `not-found.tsx` im Design-System |
| Native Apps (iOS/Android) | ✅ Capacitor-Scaffold: `capacitor.config.ts`, npm-Scripts, Pakete in package.json, kompletter Build-/Store-Guide in `mobile/README.md`. Die nativen Projekte (`ios/`, `android/`) generiert `npx cap add` auf einem Mac — Xcode/Signing gibt es nur dort. |
| Footer-Verlinkung Download | ✅ EN + DE |

**Was bei den nativen Apps prinzipbedingt offen bleibt** (geht nur auf deinem Rechner /
mit deinen Konten): `npm install` + `npx cap add ios/android` ausführen, Apple Developer
(99 $/Jahr) + Play Console (25 $), Push-Zertifikate, Store-Listings. Schritt-für-Schritt
inkl. Ablehnungs-Fallen in `mobile/README.md`.

## 🆕 Branding-Runde: eigenes Markenzeichen + vierte Vertikale

- **Sigma-Synapse-Logo**: Eigenes SVG-Mark (`web/src/components/brand/logo.tsx`) — ein Σ,
  dessen Strichzug aus fünf Graph-Knoten und vier Kanten besteht. Liest sich als Buchstabe
  UND als Produkt (typisierte Knoten + Kanten). Ersetzt das generische Lucide-Brain-Icon
  überall: Nav, Footer, Dashboard-Sidebar, Auth-Seiten, CTA-Kacheln, Demo-Avatare, 404.
  Alle Assets regeneriert mit dem Mark: PWA-Icons, Favicon, Apple-Touch, OG-Image.
- **Brand-Typografie**: Space Grotesk trägt jetzt jede Headline (geometrisch, leicht
  technisch — die Stimme des Marks); Inter bleibt Fließtext, JetBrains Mono bleibt Code.
  Wordmark-Detail: „Sigma**brain**" mit violettem Akzent.
- **Vierte Vertikale: Executive Search & Recruiting** (`/solutions/recruiting`, EN+DE).
  Marktcheck-Befund: Die Search-Branche selbst benennt proprietäres Beziehungswissen als
  DEN entscheidenden Vorteil — exakt unser Graph (works_at, worked_with, referred_by).
  Komplett verdrahtet: Nav-Dropdown, Footer, Landing-Karten (jetzt 4er-Grid), Sitemap.

## 🆕 Vertikal-Runde 2: Steuerberater + Rebranding-Sweep (11. Juni 2026)

- **Fünfte Vertikale: Steuerberater & Wirtschaftsprüfer** (`/solutions/tax`, EN+DE).
  Research-fundiert: § 203 Abs. 4 StGB (AVV allein reicht NICHT — Verschwiegenheits-
  verpflichtung des Anbieters nötig; BStBK-FAQ Jan. 2026, DStV-Richtlinie) macht
  Self-Hosted zum strukturellen Burggraben; 72,7 % Fachkräftemangel als Schmerz;
  Positionierung „DATEV kennt die Zahlen. Sigmabrain kennt das Warum." (Komplement
  zu DATEV Copilot, keine Konkurrenz). Demo: E-Rechnungs-Betroffenheit über alle
  Mandanten. Komplett verdrahtet: Nav, Footer, Landing-Karten (jetzt 5er → 3-Spalten-
  Grid), Sitemap (auto via `VERTICAL_SLUGS`).
- **Legal-Vertikale geschärft:** Neue kompetitive FAQ (EN+DE) gegen Harvey/Legora/
  Noxtua — Big-Law-Budgets vs. unsere Mid-Market-Position ab 79 €, „eigene Akten
  statt Rechtsrecherche".
- **Rebranding-Sweep gbrain → Sigmabrain (nutzergerichtete Flächen):** Footer-Note,
  Stats-Note, Footer-Link („Sigmabrain Engine"), alle Dashboard-Texte (Settings,
  Query, Upload, Brain, Getting-Started), API-Fehlermeldungen. Neue Env-Variablen
  `SIGMABRAIN_API_URL` / `NEXT_PUBLIC_SIGMABRAIN_API_URL` mit Legacy-Fallback auf
  `GBRAIN_API_URL`; `.env.example`-Drift gefixt (dokumentierte `GBRAIN_URL`, gelesen
  wurde `GBRAIN_API_URL`). **Bewusst NICHT umbenannt** (Strategie K5, Upstream-Nähe):
  Engine-Core in `src/`, CLI-Befehle (`gbrain init/serve` — so heißt das Binary),
  GitHub-URLs. Strategie-Doku um Markt-Update Juni '26 (Runde 2) + Quellen ergänzt.

## 🆕 Ingestion-Runde: Dokument-Pipeline (11. Juni 2026, nach Subsumio-Scan)

Auslöser: Subsumio-Analyse zeigte, dass `media-ingest` eine Spezifikation ohne
Implementierung war — die Engine konnte real nur Markdown/Code/Bilder. Für
Kanzlei-/Steuerberater-Workflows (Akten = PDF/DOCX/E-Mail) war das DIE Lücke.

- **`src/core/extract-document.ts` (neu):** PDF (Text-Layer via unpdf; Scanned-PDF →
  OCR-Fallback via pdf2pic + Vision-Modell, sonst ehrlicher Skip mit Warnung),
  DOCX (mammoth), EML (postal-mime; Subject→Titel, Date→Datum, Anhänge als Warnung),
  CSV/TSV, XLSX (SheetJS-CDN-Tarball — npm-Version hat CVEs, Pin nicht ändern!),
  Audio (.mp3/.wav/.m4a/.ogg/.flac → Transkription via transcription.ts).
- **Verdrahtung:** `importFromFile` extrahiert vor dem UTF-8-Read und schickt das
  Ergebnis durch den normalen Markdown-Pfad (gleiche Slugs, Chunker, Guards).
  `gbrain import <dir>` nimmt Dokumente default an (explizite Absicht);
  `gbrain sync` nur mit `GBRAIN_INGEST_DOCUMENTS=true` (Gate wie bei Multimodal).
  `file_upload`-MIME-Tabelle erweitert. 50MB-Rohdatei-Limit (extrahierter Text
  unterliegt weiter dem 5MB-Cap).
- **Verifiziert:** 15/15 Tests (`test/extract-document.test.ts`), Regressionen
  import-file/sync grün, Typecheck grün, Parser laufen im kompilierten Binary
  (`bun build --compile`-Smoke bestanden).
- **Subsumio-Fazit** (Details in `external-skill-research.md`): 1 echte Lücke
  (geschlossen), 2 Teil-Lücken als Kandidaten (deadline-extract-Skill,
  Entity-Audit-Trail fürs Enterprise-Tier), 3 vermeintliche Lücken waren keine
  (Entity-Extraktion, Hybrid-RAG, ReAct-Agent — hat die Engine längst).

## 🆕 Konkurrenz-Runde: /compare-Seite + Adoptions-Roadmap (11. Juni 2026)

- **`/compare` + `/de/compare` (neu):** Ehrlicher Marktvergleich gegen Harvey, Legora,
  CoCounsel, Beck-Noxtua, Luminance (Legal) und Glean, Notion AI (Knowledge Layer).
  Hero sagt es offen: „Wir verlieren mehrere Zeilen dieser Tabelle. Deshalb kannst du
  dem Rest vertrauen." Verlorene Zeilen explizit: Rechtsrecherche, Drafting,
  Legal-Benchmark (Vals), Konnektoren-Katalog. Gewonnene: Open Source, 0-€-Self-Host,
  kein Seat-Minimum, Cross-Domain-Graph, Gap-Analyse, Preis (79 € vs. ~639–1.200 $/Seat).
  UWG-Disziplin: jede Drittanbieter-Angabe aus verlinkter öffentlicher Quelle,
  Unbekanntes als „k. A." statt geraten, Stand-Datum + Korrektur-Kanal auf der Seite.
  Verdrahtet: Footer (EN+DE), Sitemap. Inhalte: `web/src/content/compare.ts`.
- **Wichtige Ehrlichkeits-Korrektur:** Luminance bietet On-Premise — Self-Hosting
  allein ist KEIN Unikat mehr in unserer Story. Unikat ist die Kombination
  Open Source + kostenlos self-hosted + kein Minimum + Cross-Domain.
- **`skills/deadline-extract/` (neu):** Die eine sofort kopierbare Konkurrenz-Idee
  (Subsumio/Legal-Workflows): Fristen-/Termin-Extraktion aus ingestierten Dokumenten
  in Timeline-Einträge, mit hartem Sicherheitsprinzip — gesetzliche Fristen werden
  NIE berechnet, nur verbatim erfasst und zur professionellen Prüfung geflaggt.
  In manifest.json + RESOLVER.md verdrahtet (chained nach document-ingest).
- **Adoptions-Roadmap** in `SIGMABRAIN_STRATEGIE.md` §4b: was wir kopieren
  (Zitat-Sprung im Dashboard), was bewusst nicht (Word-Add-in, eigenes Legal-LLM),
  was nach Traktion (Konnektoren, Audit-Hash-Kette).

## 🆕 Gap-Analyse-Runde (11. Juni 2026)

Vollständiger Repo-Scan + Markt-Gap-Matrix in **`SIGMABRAIN_GAP_ANALYSIS.md`**:
Inventar (91 Ops, 58 Skills, 9 neue Konnektoren, Dokument-Pipeline, Legal-Brain-
Subsystem in Arbeit), Gap-Matrix mit Prioritäten (P0 bleibt: Hosted Provisioning),
USP-Bewertung des „Subgehirns" (Cross-Kanzlei-Pool: nein; Compounding-Brain pro
Kanzlei + Public-Law-Brain via mounts: ja) und 6 Risiko-Flags an die parallel
arbeitenden Agenten (u. a. ACL-Vererbung bei Konnektoren, HMAC ≠ Anonymisierung,
Source-Isolation im legal-brain).

## 🆕 Feinschliff-Runde: SEO + /security (11. Juni 2026)

- **JSON-LD strukturierte Daten (neu, vorher null):** Organization +
  SoftwareApplication (mit Preis-Offers) auf der Landing, FAQPage-Schema auf
  Landing, allen 5 Vertikalen, /compare und /security — jeweils EN+DE
  (`web/src/components/seo/jsonld.tsx`). Google kann FAQs jetzt als Rich
  Results ausspielen.
- **/security + /de/security (neu):** Die für Kanzlei-/StB-Vertrieb kritischste
  Unterseite — 4 Säulen (Self-Host, fuzz-getestete Isolation, kein Training,
  auditierbar), Hosting-Vergleich (self-hosted vs. EU-Cloud mit AVV +
  § 203-Verschwiegenheitsverpflichtung), ehrliche Roadmap-Box (SOC 2/ISO
  NOCH NICHT vorhanden — steht so drauf), Responsible-Disclosure-Kontakt,
  FAQ. Footer-Link (Rechtliches), Sitemap.
- **Nav:** /compare jetzt in Desktop- + Mobile-Navigation (vorher nur Footer).
- **Audit-Befunde ohne Handlungsbedarf:** Footer-Lokalisierung korrekt
  (privacy/imprint bewusst unprefixed — keine 404s), Metadata auf allen
  Seiten vorhanden, robots/sitemap/OG sauber, Mobile-Menü existiert.
- **Verifiziert:** Web-Typecheck 0, Build grün (31 Routen inkl. /security
  EN+DE), Engine-Typecheck 0, neue Module grün (26 Tests nl-console +
  extract-document). Bekannt offen: 4 Lint-Fehler in dashboard/brain+graph
  aus der Parallel-Arbeit (setState-in-Effect) — gehören den dortigen Agenten.

## 🆕 Struktur-Vertrieb-Runde: Zwei-Ebenen-Partnerprogramm (11. Juni 2026)

- **Entscheidung:** 2-Tier-Affiliate JA (25 % Ebene 1 + 5 % Override Ebene 2 =
  30 % Gesamt, 12 Monate, hart bei 2 Ebenen gedeckelt — § 16 Abs. 2 UWG +
  Marken-Schutz). Ebene 3+: bewusst nie. **Gebietsexklusivität: vorerst NEIN** —
  stattdessen „Regional Launch Partner" (leistungsgebundener Vorrang + Right of
  First Refusal); Re-Evaluation ab ≥ 25 zahlenden Kunden je Region, nur mit
  anwaltlichem Vertriebspartnervertrag. Begründungen in STRATEGIE.md §6.
- **/partners (EN+DE):** Neue Sektion „Zwei Ebenen. Nie mehr." mit beiden
  Provisions-Ebenen als Karten, grüner Compliance-Box (Provision nur auf echten
  Umsatz, keine Anwerbeprämien, keine Einstiegsgebühren) und amber
  Gebietsexklusivitäts-Box mit der ehrlichen Antwort + Launch-Partner-Alternative.
  Affiliate-Track-Punkte + 2 neue FAQ-Einträge in beiden Sprachen.
- **Admin:** Ebene-2-Attribution implementiert — aus der bestehenden
  referredBy-Kette berechnet (kein Schema-Change): neue Stat-Karte „davon
  Ebene 2" + Tabellen-Spalte je Nutzer.
- **Tooling-Korrektur:** Rewardful kann kein natives 2-Tier → FirstPromoter
  (oder PartnerStack) für die Auszahlungs-Automation, im Admin-Hinweis +
  Strategie notiert.
- **Verifiziert:** Web-Typecheck 0, Build grün, keine neuen Lint-Findings.

## 🆕 Go-Live-Audit + Lücken-Runde (11. Juni 2026) — DIE MASSGEBLICHE CHECKLISTE

### In dieser Runde gebaut (Code fertig, getestet, Build grün)

- **Rate-Limiting** auf Login (20/min/IP + 5/15min/E-Mail) und Signup (5/h/IP) —
  Brute-Force-Schutz war komplett offen. In-Memory-Sliding-Window
  (`web/src/lib/auth/rate-limit.ts`); bei Multi-Instanz-Serverless gegen
  Upstash/Redis tauschen (gleiche Signatur, im Code dokumentiert).
- **§ 25 TTDSG-Fix beim Referral-Cookie:** Die Middleware setzte den 90-Tage-
  Cookie ungefragt — abmahnfähig. Jetzt: Consent-Banner (`ref-consent.tsx`,
  DE/EN, erscheint NUR bei ?ref=-Besuch), Cookie erst nach Einwilligung,
  Ablehnung wird gemerkt. Normale Besucher sehen nie ein Banner.
- **/terms (AGB-Platzhalter):** SaaS ohne AGB = keine Haftungsbegrenzung, keine
  Zahlungsbedingungen. Seite mit 10-Punkte-Gliederung als Anwalts-Briefing
  (inkl. KI-Klauseln, § 203-Absatz, Partnerprogramm-Referenz), noindex,
  Footer EN+DE, Sitemap.

### ✅ Fertig programmiert (alle Ebenen)

| Ebene | Stand |
|---|---|
| Marketing-Site | 33 Routen EN+DE: Landing, Features, Pricing, /compare, /security, 5 Vertikale, Partner, Download, /terms, Imprint, Privacy, 404, Offline. JSON-LD, Sitemap, robots, OG, PWA |
| Kunden-Ebene | Auth (Signup/Login/Logout, Rate-Limits), Dashboard (7 Seiten), Settings mit Referral-Link, Billing-UI |
| Partner-Ebene | 2-Ebenen-Programm (25+5), Attribution beider Ebenen, /partners-Funnel, Compliance-Boxen |
| Admin-Ebene | Kunden, Pläne, MRR, Ebene-1+2-Referrals; separates Engine-Admin (admin/: Agents, Jobs, Logs, Connectors, Legal) |
| Engine/Backend | 91 Ops, Dokument-Pipeline, 9 Konnektoren, Schema-Packs, Web-API — produktionsreif |

### ❌ Geht NUR mit Owner-Accounts (P0, niemand kann das wegprogrammieren)

1. Domain sigmabrain.com (+ .de/.ai) registrieren → vorher sind OG-URLs, Sitemap, Mails fiktiv
2. Stripe-Konto: Produkte + 3 Env-Keys + Webhook → Billing scharf schalten
3. E-Mail-Provider-Konto (Empfehlung: Resend oder Postmark) → Voraussetzung für Punkt 4
4. Hosting (Vercel/EU-VPS) + `AUTH_SECRET` + gbrain-Server-Deployment
5. FirstPromoter-Konto (2-Tier-Auszahlungen)
6. Anwalt: Impressum, Datenschutz, AVV, AGB (Briefing liegt in /terms), Partnerbedingungen

### 🔧 Noch zu programmieren (Reihenfolge, nach E-Mail-Provider-Entscheidung)

1. **Passwort-Reset + E-Mail-Verifikation** — größte verbleibende Code-Lücke.
   Token-Store existiert konzeptionell im User-Store-Adapter; braucht Mailer
   (env-gated wie Stripe), 2 Routen, 2 Seiten ×2 Sprachen. ~1 Session.
2. **Multi-Tenant-Provisioning** (Signup → Source/Brain → Dashboard-Proxys pro
   User) — DER P0-Block aus der Gap-Analyse, Engine-Seite kann alles schon.
3. **Onboarding mit Demo-Brain** (K7: erste Antwort < 3 Min inszenieren).
4. Transaktions-Mails (Welcome, Zahlungsbeleg-Hinweis), Usage-Meter im Dashboard.
5. Team/Enterprise-Waitlist statt mailto (ein Formular + Store).

### 💡 Ideen-Backlog für Vollständigkeit (bewertet, nicht dringend)

- Status-Page (status.sigmabrain.com, z. B. via Upptime — kostenlos, Vertrauen)
- Privacy-freundliche Analytics (Plausible/EU — ohne Banner-Pflicht)
- Changelog-Seite aus CHANGELOG.md generiert (SEO + „lebendiges Produkt"-Signal)
- 2FA/TOTP fürs Team-Tier (Verkaufsargument an Kanzleien, mittlerer Aufwand)
- beA-/DATEV-Brücken: siehe Gap-Analyse P2

## 🆕 State-of-the-Art-Audit: A11y + Modernität (11. Juni 2026)

**Gefixt in dieser Runde:**
- **Google-Fonts-DSGVO-Fall beseitigt:** `globals.css` lud Fonts zur Laufzeit von
  fonts.googleapis.com (LG-München-Abmahnrisiko + render-blocking). Jetzt
  `next/font` — self-hosted beim Build, null Requests an Google, kein Layout-Shift.
  Variablen `--font-inter/grotesk/jetbrains` in die Tailwind-Theme-Tokens verdrahtet.
- **Solutions-Dropdown war hover-only** (Tastatur-Nutzer ausgesperrt, WCAG 2.1.1):
  jetzt Click-Toggle + `aria-expanded` + `aria-haspopup` + Escape.
- **Compare-Tabellen-Semantik:** `scope="col"/"row"`, Zeilen-Header als `<th>`,
  sr-only-Label für die leere Ecke — Screenreader können die Matrix navigieren.

**Bestand bestätigt (war schon state of the art):** FAQ als natives
`<details>/<summary>`, Auth-Formulare mit Labels + `autoComplete` + aria-hidden-
Icons, Fokus-Ringe, `prefers-reduced-motion`, semantische Struktur, App Router +
Server Components + Tailwind-v4-Theme-Tokens, PWA, JSON-LD, hreflang.

**Bekannte Rest-Lücken (ehrlich, mit Einordnung):**
- `<html lang="en">` global; DE-Seiten setzen `lang="de"` nur auf dem Wrapper —
  akzeptierter Workaround; echte Lösung wäre i18n-Routing-Refactor (nicht vor Launch).
- Kein Skip-to-Content-Link (klein; bräuchte `<main>`-Wrapper in allen Page-Komponenten).
- Keine automatisierte A11y-CI (axe-core/Pa11y) — empfohlen als Guard, sobald CI fürs Web steht.
- 4 setState-in-Effect-Lint-Fehler in dashboard/brain+graph (Parallel-Team).

## 🆕 LAUNCH-RUNDE: Erster-Kunde-Bereitschaft (11. Juni 2026) — Code-seitig KOMPLETT

Alle drei verbliebenen Code-Lücken geschlossen + Härtung. Verifiziert: Web-Typecheck 0,
Lint 0 Fehler (auch Dashboard — die 4 Altfehler gefixt), Build grün, Engine-Typecheck 0,
51 Tests grün, Token-Security-Smoke 5/5 (Roundtrip, Purpose-Trennung, Tamper, Bind, Expiry).

1. **Passwort-Reset + E-Mail-Verifikation (fertig):** Stateless HMAC-Action-Tokens
   (`lib/auth/tokens.ts`) — Reset-Token bindet an den AKTUELLEN Passwort-Hash
   (stirbt bei Änderung = quasi-single-use ohne Server-State), Verify-Token an die
   E-Mail. Mailer env-gated via `RESEND_API_KEY` (`lib/mail.ts`); ohne Key: Mail in
   Server-Konsole + Dev-Direkt-Link im UI (nur non-production) → Erster-Kunde-Test
   funktioniert OHNE Mail-Provider end-to-end. Routen forgot/reset/verify mit
   Rate-Limits, Seiten /forgot + /reset EN+DE, „Passwort vergessen?"-Link im Login,
   Signup verschickt Verifikationsmail (fire-and-forget), `emailVerifiedAt` im Store.
2. **Provisioning V1 — Multi-Tenant-Scoping (fertig):** Engine-`web-api.ts` scoped
   jetzt JEDE Operation per `x-sigmabrain-source`-Header (validiert, Fallback
   'default' = Self-Hosted unverändert): search/think/pages/get_page via ctx,
   graph-SQL + stats-SQL per Source (kein Cross-Tenant-Count-Leak),
   queries/recent für Tenants leer (Log hat keine Source-Spalte — kein Query-Text-
   Leak), Upload mit `ensureSource` (lazy INSERT wegen FK auf sources). Web-Seite:
   `lib/engine.ts` + alle 8 Next-Proxys (stats, search, think, pages×2, graph,
   queries, upload) lösen die Session auf und senden die brainId des Users —
   server-to-server, der Browser kann nie einen Tenant wählen; ohne Session 401.
   Signup→eigenes Brain ist damit funktional: jeder User sieht nur seine Source.
3. **Dashboard-Lint-Altlasten gefixt:** graph (layoutNodes jetzt useMemo statt
   State+Effect, loadGraph deferred), brain (Debounce-Effect restrukturiert,
   Anführungszeichen). Lint projektweit: 0 Fehler.
4. **Security-Headers** (next.config): X-Frame-Options DENY, nosniff,
   Referrer-Policy, Permissions-Policy, HSTS. CSP bewusst vertagt (bräuchte
   Report-Only-Rollout, sonst PWA/Inline-Risiko — Post-Launch-Härtung).

**Erster-Kunde-Testpfad (lokal, heute machbar):** `gbrain serve` (Engine) +
`npm run dev` (web) → Signup (Verifikations-Link erscheint in Server-Konsole) →
Dashboard → Upload (PDF/DOCX/EML landet im EIGENEN Brain) → Query → Antwort mit
Quellen. Passwort-Reset: /forgot → Link aus Konsole/UI → /reset.

**Wichtiger Betriebshinweis:** Engine-Web-API bei Hosted-Betrieb NIE öffentlich
exponieren — nur die Next-App spricht mit ihr (API-Key via `SIGMABRAIN_WEB_API_KEY`
setzen, Engine-Port firewallen). Der Header-Trust setzt genau das voraus.

Offen bleiben ausschließlich die 6 Owner-Punkte (Domain, Stripe, Mail-Provider-Konto,
Hosting, FirstPromoter, Anwalt) + die als Post-Launch markierten Punkte (CSP,
Demo-Brain-Onboarding, Usage-Meter, SSO).

## 🆕 Plattform-Matrix: Wo läuft Sigmabrain? (11. Juni 2026, verifiziert)

| Plattform | Status | Wie |
|---|---|---|
| **iPhone (iOS)** | ✅ Production-ready HEUTE | PWA: Safari → Teilen → „Zum Home-Bildschirm". Vollbild-App mit Σ-Icon, Offline-Fallback. Anleitung auf /download |
| **iPad (iPadOS)** | ✅ Production-ready HEUTE | PWA wie iOS. Orientation-Lock in dieser Runde ENTFERNT (war portrait-only — Querformat mit Tastatur ging nicht; jetzt `any`) |
| **Android (Handy + Tablet)** | ✅ Production-ready HEUTE | PWA: Chrome-Install-Prompt (echter beforeinstallprompt-Button auf /download) |
| **macOS Desktop** | ✅ Production-ready HEUTE | PWA-Install via Chrome/Edge („App installieren") → eigenes Fenster, Dock-Icon. Anleitung auf /download |
| **Windows Desktop** | ✅ Production-ready HEUTE | PWA-Install via Edge/Chrome → Startmenü/Taskbar |
| **Linux Desktop** | ✅ | PWA via Chrome/Chromium |
| **iOS/Android STORE-Apps** | 🟡 Code fertig, Owner-Schritte offen | Capacitor-Shell komplett konfiguriert (`web/capacitor.config.ts`: Remote-URL-Strategie, appId, Navigation-Allowlist; Build-/Review-Guide in `mobile/README.md`). Es fehlen NUR: `npx cap add ios/android` auf deinem Mac, Apple Developer (99 $/J), Play Console (25 $), Signing. WICHTIG: erst NACH SaaS-Launch einreichen (Apple 4.2 lehnt Wrapper ohne Live-Accounts ab — steht in der Roadmap unten) |
| **Native Desktop-App (Mac/Win)** | 📋 Bewusst Post-Launch | Entscheidung: KEIN Electron-Schnellschuss. Die richtige native Desktop-App bündelt das kompilierte gbrain-Binary (`bun build --compile`) in eine Tauri-Shell = lokales Brain ohne Server — DAS Self-Host-Produkt für Kanzleien. Das ist ein eigenes Projekt nach Launch, kein Lücken-Fix; bis dahin deckt die Desktop-PWA + `gbrain serve` lokal alles ab |

**Mobil arbeiten (die eigentliche Anforderung) ist verifiziert gegeben:** Das
Dashboard ist durchgängig responsive (Mobile-Drawer-Sidebar mit Overlay,
Hamburger im Header, md:-Breakpoints auf allen 7 Seiten) — Query, Upload,
Brain, Graph, Settings funktionieren am Handy. Frontend + Backend sind
vollständig: dieselben session-gebundenen, tenant-gescopten API-Proxys
bedienen PWA, Browser und künftige Store-Apps (Capacitor lädt die gehostete
App — eine Codebase, keine zweite API).

## 🆕 Team/Usage/Branchen-Runde (11. Juni 2026) — die zwei Versprechens-Lücken geschlossen

Verifiziert: Typecheck 0, Lint 0 Fehler, Build grün (7 neue Routen).

1. **Usage-Meter (fertig)** — das „Live-Verbrauchsanzeige"-Versprechen der
   Pricing-Seite ist jetzt wahr: `lib/plans.ts` (Limits je Tier, Single Source),
   `lib/usage.ts` (Monatszähler je brainId, atomar, 12-Monats-Rotation),
   Zählung in think/search-Proxys, `/api/usage`, Verbrauchskarte mit
   Fortschrittsbalken (role=progressbar, aria) + Amber-Warnung ab 80 % in
   /dashboard/billing. Team = gemeinsamer Pool (Badge „Team-Pool"). Soft-Gating:
   anzeigen + warnen, nie still drosseln (Pricing-Fußnote bleibt wahr).
   **Dabei Bug gefixt:** Search-Proxy hatte beim Patch-Skript den Tenant-Header
   verloren — Scoping dort war wirkungslos; repariert + verifiziert.
2. **Org/Team + Invites (fertig)** — der verkaufte Team-Plan ist jetzt baubar:
   Org-Entity (orgs.json, eigenes `org_*`-Brain), `User.orgId`, engineContext
   schaltet Brain UND Plan-Pool auf die Org (Owner zahlt → Owner-Plan gilt).
   Invite = statusloser Action-Token (7 Tage), HMAC-gebunden an (Org, E-Mail) —
   Manipulation der Link-Parameter bricht die Bindung. **Mail-Scanner-sicher:**
   /join rendert Bestätigen-Button, Beitritt nur per explizitem POST (Outlook-
   Prefetch kann nie auto-joinen). Nicht-Registrierte: /join → Signup (next-
   Param) → zurück → beitreten. Seat-Gate beim Einladen UND autoritativ beim
   Join (statuslose Invites können nie überbuchen). /dashboard/team-Seite:
   erstellen, Mitglieder, einladen (Dev-Link ohne Mail-Provider), entfernen,
   verlassen. Edge-Cases abgedeckt: Self-Invite, falsches Konto, doppelter
   Join (idempotent), volle Seats, Owner-Leave nur wenn allein (sonst 409 mit
   klarer Meldung), Entfernte fallen automatisch aufs persönliche Brain zurück.
3. **Branchen-Personalisierung (fertig)** — Lösung für „branchenspezifisches
   Frontend": Branche wird BEIM SIGNUP gewählt (optional, 8 Branchen,
   allowlisted) und am Konto gespeichert → gilt automatisch in Web, PWA und
   künftigen Store-Apps (ein Konto, jede Plattform). V1-Personalisierung:
   Query-Seite zeigt branchenspezifische Beispiel-Fragen (legal: Widersprüche/
   Fristen; tax: E-Rechnung/Gestaltungs-Historie; vc/consulting/recruiting/
   insurance/medical). Ausbaupfad: Getting-Started je Branche, Schema-Pack-
   Vorauswahl (gbrain-legal/tax existieren engine-seitig).
4. **„Sigmabrain OS": entschieden NEIN als Hauptbrand** (Begründung in
   STRATEGIE.md §3) — reserviert als Produktname fürs Self-Host-Desktop-Bundle.

Bekannter Hinweis: Next meldet die middleware-Konvention als deprecated
(„proxy" ist der Nachfolger) — Migration ist ein mechanischer Rename, bewusst
nicht mitten im Launch-Block; notiert für die nächste Wartungsrunde.

## 🆕 Gesetzes-Corpus-Runde DE/AT (12. Juni 2026) — Public-Law-Brain V1 ist real

**`server/scripts/ingest-law-corpus.ts` (neu), live verifiziert: 16/16 Gesetze.**

- **Deutschland (10):** GG, BGB, StGB, ZPO, StPO, HGB, UWG, AO, EStG, UStG —
  amtliche XML von gesetze-im-internet.de (§ 5 UrhG, gemeinfrei), pro Gesetz
  eine Markdown-Datei mit ##-Sektion je §, **Versions-Stempel aus dem
  XML-builddate** (z. B. BGB Stand 2026-06-08, StGB Stand 2026-05-31).
- **Österreich (6):** ABGB, StGB-AT, AHG, ZPO-AT, UGB, BAO — Gesetzesnummer
  wird DYNAMISCH über die RIS-OGD-API aufgelöst (Hardcoding erwies sich im
  Test als falsch!), dann das amtliche Gesamt-PDF („…, Fassung vom
  DD.MM.YYYY.pdf") gezogen und mit unserem eigenen PDF-Extraktor verarbeitet.
  **Versions-Stempel = RIS-Fassungsdatum.** OGD-Namensnennung im Frontmatter.
- **Frontmatter je Gesetz:** type: law, jurisdiction, abbreviation,
  version_date, retrieved_at, source_url, license → Antworten des Brains
  zitieren Gesetz + Stand. Import in dedizierte Quellen:
  `gbrain sources add law-de law-corpus/de && gbrain import law-corpus/de --source-id law-de`
  (analog law-at). Output gitignored (regenerierbar). Erweiterung = Eintrag
  in DE_LAWS/AT_LAWS. Aktualisierung = Cron auf das Script (Roadmap).

**Ehrliche Einordnung (deckungsgleich mit /compare):** Das gibt dem Brain
ZITIERFÄHIGEN GESETZESTEXT mit Versionsstand — es ist KEIN beck-online
(keine Kommentare, keine Rechtsprechungsketten, keine redaktionelle
Konsolidierungs-Garantie) und das Brain zieht weiterhin keine
Rechtsschlüsse: Es zitiert §§, die Bewertung bleibt beim Profi.

## 🆕 Dreierblock-Runde (12. Juni 2026): Produktlinien, Legal-Härtung, Corpus-Ausbau

**(a) Subsumio + Taxumio sind live baubar** — `/subsumio`, `/taxumio` (+ /de/…),
Modell „powered by Sigmabrain": Produktmarken-Hero (Name + Claim als Gradient),
darunter der komplette bewährte Vertikal-Funnel (Pains/Demo/Features/FAQ) per
Wiederverwendung (`VerticalPage` mit neuem optionalen `product`-Prop — kein
Markup-Duplikat). Kauf-CTA deep-linkt `/signup?industry=legal|tax`, und das
Signup-Formular **liest den Param und belegt die Branche vor** (validiert gegen
die Allowlist). Footer-Links (EN+DE), Sitemap, FAQ-JSON-LD. Weitere Produkt-
linie = ein Eintrag in `src/content/products.ts` + 2 Thin-Routes.
⚠️ Vor öffentlicher Nutzung: Markenrecherche Subsumio/Taxumio (Nizza 9/42).

**(b) Legal-Brain gehärtet:** Das Parallel-Team hatte bereits 30 Tests
geliefert (alle grün, inkl. Anonymizer + PGLite-Schema-Kompat) — Gap-Flag
„keine Tests" damit erledigt. Von mir ergänzt: (1) Terminologie-Korrektur im
Anonymizer-Header — HMAC = **Pseudonymisierung** (Art. 4 Nr. 5 DSGVO), nicht
Anonymisierung; öffentliche Doku darf nie „anonymisiert" behaupten; (2)
verbindlicher **Leitplanken-Block im LEGAL_BRAIN_BLUEPRINT.md**: Gegner-Analyse
NUR aus öffentlichen Quellen + eigenen Fällen (source_id-gescoped, nie
Cross-Tenant), keine autoritativen Rechtsschlüsse (Verifikations-Standard),
Gesetzes-Zitate immer mit Fassungsdatum.

**(c) Corpus auf 21 Gesetze erweitert + Betriebspfad:** Neu DE: FamFG (Stand
2026-06-11), GmbHG (2024-12-31), InsO (2026-05-06); AT: EO + StPO-AT (Fassung
2026-06-12). Dabei Resolver verbessert: RIS-Titelsuche rankt verwandte Gesetze
vor dem Treffer („Einführungsgesetz zur EO" vor „EO") → Pagination bis zum
exakten Kurztitel. **Aktualisierung:** `cd server && bun run law-corpus`
(npm-Script neu) — als Cron z. B. wöchentlich:
`0 6 * * 1 cd <repo>/server && bun run law-corpus && cd .. && gbrain import law-corpus/de --source-id law-de && gbrain import law-corpus/at --source-id law-at`
(Re-Import ist idempotent: unveränderte Gesetze skippen per content_hash).

## 🆕 Kanzlei-OS Dashboard — Legal-Features komplett (12. Juni 2026)

Vorher: Dashboard hatte Query, Brain, Graph, Upload, Settings — generisch.
Jetzt: Vollständiges Kanzlei-OS mit 14 spezialisierten Seiten, alle mit
**echten Brain-Daten** (keine Mocks mehr), **getypten Frontmatter-Strukturen**
und **serverseitiger Business-Logic**.

### Neue Dashboard-Seiten (alle funktionsfähig)

| Seite | Kern-Funktion | Datenquelle |
|---|---|---|
| `/dashboard/cases` | Aktenliste mit Filter, Stats, Suche | `legal_case` Pages via `api.brain.listPages` |
| `/dashboard/cases/new` | Akte anlegen (12 Felder, Frontmatter) | `api.brain.createPage` |
| `/dashboard/cases/[slug]` | Akten-Detail: Tasks, Zeit, Dokumente, Graph, KI-Query, Timeline, Beweise, Strategie | `api.brain.getPage` + `updatePage({ merge: true })` |
| `/dashboard/deadlines` | Fristen aus Akten + Deadline-Pages, Status-Computing (überfällig/bald/kritisch) | `legal_case` + `legal_deadline` Frontmatter |
| `/dashboard/calendar-export` | Kalender-Export (.ics) aus Fristen | `legal_deadline` + case-deadlines |
| `/dashboard/invoicing` | Rechnungen aus Zeiteinträgen, fortlaufende Nummer (§ 14 UStG), Status-Mgmt | `invoice` Pages |
| `/dashboard/datev-export` | DATEV-Export aus Zeiteinträgen | `legal_case` `time_entries` |
| `/dashboard/opponents` | Gegner-Intelligence: Siegquote, Häufigkeit, bevorzugte Rechtsgebiete | `legal_case` `opponent_name` Aggregation |
| `/dashboard/kollisionspruefung` | Interessenkonflikt nach § 43a BRAO — **serverseitig** über ALLE Akten | `POST /api/legal/conflict-check` |
| `/dashboard/rechtsprechung` | Urteilssuche im Brain (court_decision) + KI-Fallback | Brain-Search + `think` |
| `/dashboard/norms` | Gesetzes-Korpus (BGB, ABGB, etc.) mit Citation-Linking | Brain-Search + `law-corpus/` |
| `/dashboard/judgements-sync` | Rechtsprechungs-Sync (RIS-OGD AT, OpenLegalData DE) | `POST /api/legal/judgements-sync` |
| `/dashboard/compliance` | DSGVO + GwG Selbstauskunft, persistierter Status pro Checkpunkt | `legal/compliance/selbstauskunft` Page |
| `/dashboard/bea` | beA-Entwurfsvorbereitung + Import-Status (kein Versand — ehrlich gekennzeichnet) | `bea_draft` + `bea_message` Pages |
| `/dashboard/drafting` | Schriftsatz-Entwurf mit KI (Anfrage an `/api/think`) | `api.query.think` |
| `/dashboard/client-portal` | Mandanten-Portal **Vorschau** (Anwaltsansicht aller Akten) | `legal_case` Pages |
| `/dashboard/cost-calculator` | RVG § 13 / RATG Gebührenrechner mit Stufenformel | Lokal (formelbasiert, keine Mocks) |

### Technische Fundamente (neu)

- **`src/lib/legal-types.ts`** — Zentrale Typen für CaseFrontmatter, InvoiceFrontmatter,
  DeadlineEntry, TimeEntry, EvidenceEntry, StrategyInfo, etc. Kein `(page as any).frontmatter`
  mehr im Frontend.
- **`src/lib/status-colors.ts`** — Tailwind-v4-kompatible Farb-Mapping (keine interpolierten
  Klassen mehr, die stumm fehlschlagen).
- **`src/lib/api.ts`** — Erweitert um `legal.conflictCheck()` und `legal.judgementsSync()`;
  `updatePage` sendet `merge: true` für partielle Frontmatter-Updates ohne Body-Wipe.
- **Server-Endpunkte in `web-api.ts`:**
  - `POST /api/legal/conflict-check` — SQL-Scan über `legal_case` mit ILIKE-Matching,
    exact/ähnlich-Flag, Severity (critical/low/none) nach § 43a BRAO.
  - `POST /api/legal/judgements-sync` — Inline-Connector mit Cursor-Management,
    Delta-Import, capped detail-fetches (HTTP-responsiv).
- **Connectoren:**
  - `bea-import.ts` — `fast-xml-parser` + `js-yaml` für sichere XML→Frontmatter;
    bounded cursor (5000), slugify für Message-IDs.
  - `legal-judgements.ts` — RIS-OGD v2.6 + OpenLegalData API, YAML-Frontmatter,
    versions-stamped ingestion events.

### UI-Qualität

- **Keine Mock-Daten** in allen 17 Dashboard-Seiten (verifiziert via `grep -r MOCK_ src/app/dashboard` → 0 Treffer).
- **Accessibility:** `aria-label`, `htmlFor`, `role`, `aria-live`, `aria-pressed`,
  `aria-expanded`, `aria-selected` durchgängig.
- **Kontrast:** Alle `#4a4a6a` → `#8a8aa8` für WCAG-konforme Lesbarkeit.
- **Lade-/Fehlerzustände:** Jede Seite hat Loading-Spinner und Error-UI (nicht nur leere Listen).
- **Ehrliche Kommunikation:** beA „versendet keine Nachrichten
, Compliance-Selbstauskunft ersetzt keine Beratung.

## 📱 Schritt 2: iOS / Android / iPadOS — Roadmap

**Stufe 1 — JETZT FERTIG: PWA.** Installierbar auf allen drei Plattformen ohne App-Store,
ohne Review, ohne Gebühren. Vollbild-Standalone-App mit Icon auf dem Home-Screen. Deckt den
Markt sofort ab, während die Store-Apps entstehen.

**Stufe 2 — Native Store-Apps via Capacitor** (gleiche Codebase, WebView + native Shell,
Push-Notifications, Biometrie):
- Voraussetzungen: Apple Developer Program (99 $/Jahr) + macOS/Xcode für Build & Signing,
  Google Play Console (25 $ einmalig).
- **Wichtig (Reihenfolge!):** Apple lehnt Apps ohne echten Account-/Login-Flow und mit
  reinem Web-Wrapper-Charakter ab (Guideline 4.2 "Minimum Functionality"). Die Store-Apps
  ergeben erst Sinn, NACHDEM Auth + Billing live sind. Wer die App-Hülle vor dem SaaS baut,
  baut sie zweimal.
- Aufwand nach SaaS-Launch: ~1–2 Wochen inkl. Store-Review-Schleifen.

**Stufe 3 (optional, später):** Voll-native Features (Share-Extension "an Sigmabrain senden",
Siri/Shortcuts, Widget mit Morning-Brief) — das ist der Punkt, an dem die App mehr kann als
die Web-App und Store-Präsenz echten Mehrwert liefert.
