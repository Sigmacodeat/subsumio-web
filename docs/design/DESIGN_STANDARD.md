# Subsumio Dashboard — Gestaltungsstandard (Stand 2026-09-16)

Verbindlich für jede Seite, jeden Abschnitt und jeden Text im Anwalts-Dashboard. Ziel: ein
ruhiges, dichtes Arbeitswerkzeug für österreichische Kanzleien — nicht die Optik eines
generischen KI-Chatprodukts.

## 1. Anrede und Ton

- **Sie-Form, durchgängig.** Keine Du-Form, auch nicht im Assistenten, in Toasts, in leeren
  Zuständen oder in Fehlermeldungen. Kein „Womit kann ich dir helfen?".
- Ton: sachlich, knapp, präzise. Verben statt Nominalstil, kein Marketing im Produkt, keine
  Ausrufezeichen, keine Emojis in Produkt-Copy.
- Fachsprache der Kanzlei, nicht der Technik. Verboten in Anwaltsflächen: _Brain, Engine,
  Dream Cycle, Embedding, Token, Prompt, Slug, Frontmatter, Pipeline, RAG, LLM, Agent,
  Session, Minion_. Ersetzungen: Brain → _Kanzleiwissen_ / _Wissensdatenbank_; Dream Cycle →
  _nächtliche Konsolidierung_; Slug → _Kennung_; Session → _Gespräch_; Agent → _Assistent_
  bzw. konkret (_Fristen-Erkennung_, _Dokumentanalyse_). Technische Begriffe bleiben nur in
  Betreiber-/Admin-Flächen (`/ops`, Verbindungseinstellungen).
- Ein Name pro Ding: Navigation, Seitentitel, Brotkrume und Panel nennen dieselbe Sache
  gleich. Festlegung: **Übersicht** (nicht Cockpit/Dashboard), **Assistent** (nicht Copilot),
  **Akten / Akte**, **Fristen**, **Mandanten & Beteiligte**.

## 2. Seitenstruktur

- Jede Seite: `PageHeader` mit Brotkrume, `h1` (Display-Schrift), ein Satz Beschreibung,
  Aktionen rechts (max. 1 primär + 2 sekundär, Rest im Menü). Keine Seite ohne `h1`.
- Inhaltsbreite: Listen und Tabellen volle Breite (max. 1440 px); Formulare und Lesetexte
  zentriert (max. 720 px). Keine dritten Breiten.
- Abschnitte: Versal-Label (`text-xs tracking-wide`) + optionaler Beschreibungssatz; Karten
  nur, wenn Inhalt gruppiert wird — keine Karte in Karte.
- Kennzahlenkacheln: 3–4 pro Reihe, Label oben, Zahl tabellarisch, keine Farbe bei 0.

## 3. Zustände

- **Laden:** Skeleton in der Form des Inhalts (Zeilen, Kacheln). Spinner nur an Aktionen
  (Buttons) — nie als Seitenzustand. Kein Text wie „Lade Status…".
- **Leer:** `EmptyState` mit Überschrift, einem Satz und genau einer primären Aktion.
- **Fehler:** Klartext, was passiert ist und was der Nutzer tun kann; nie JSON, nie
  Fehlercodes ohne Erklärung.
- **KI-Ausgaben:** Hinweis „KI-Entwurf — anwaltlich zu prüfen" einmal pro Ausgabe, nicht
  mehrfach gestapelt; Belege als eigene Zeile.

## 4. Typografie und Formatierung

- Schrift (seit 19.09.2026, nach Marktanalyse Harvey/Mercury/Attio): **Newsreader** (Serif, `font-display`)
  nur für Seitentitel h1, Website-Headlines h1/h2 und große Grüße; **Inter** mit optischer Größe für
  alles andere inkl. h2–h6 im Produkt und alle Zahlen; Space Grotesk ist gestrichen (gilt als
  „KI-generisch“). Auch die Wortmarke steht in Newsreader: eine Serifenfamilie für alles.
  Ziffern sind standardmäßig proportional (`tnum` verbreitert in Inter auch den Bindestrich);
  tabellarische Ziffern nur in Tabellen, `time`, Code und über `tabular-nums`.
- Website-Kennzahlen in Newsreader (groß, Gewicht 400), Abschnitts-Dachzeilen als Kapitälchen
  mit Haarlinie (`EYEBROW_CLASS`), keine Pillen-Badges; Symbolkacheln einfarbig Sapphire.
- Datum: `TT.MM.JJJJ`; relative Angabe daneben („in 28 Tagen") nur bei Fristen.
- Beträge: `€ 1.234,50` (österreichische Schreibweise über `formatEur`), immer mit Nachkommastellen.
- Fristabstände: `formatDaysUntil` („heute“, „morgen“, „in 5 Tagen“, „seit 2 Tagen überfällig“) — nie „18T“ oder „in 5“.
- Ungültige Daten zeigen „—“ (`formatDate`), nie „Invalid Date“; Engine-Diagnosen nie roh (`lawyerFacingAnswer`).
- Rechtsquellen: `§ 464 Abs 1 ZPO` (schmales Leerzeichen nach §, kein Punkt nach Abs).
- Kein `ALL CAPS` außer Abschnitts-Labels; keine Versalien-Tippfehler („AKTSDETAILS").

## 5. Bewegung

- Nur zweckgebundene Bewegung: Einblenden neuer Inhalte, Öffnen von Panels, Statuswechsel.
  Dauer/Easing ausschließlich über `--ds-duration-*` / `--ds-ease-*`.
- Seiteneinstieg: einmaliges Einblenden (160–260 ms, 4–8 px Versatz), keine gestaffelten
  Karten-Choreografien, kein Puls auf Inhalten (Puls nur im Skeleton).
- `prefers-reduced-motion`: alle Übergänge auf 0 ms; Komponenten prüfen `useReducedMotion`.

## 6. Farbe und Komponenten

- Primärfarbe (Brand-Blau) nur für die eine Hauptaktion pro Ansicht. Grün/Orange/Rot
  ausschließlich semantisch (Status), nie als zweite Primärfarbe (z. B. grüner
  „Rechnung erstellen").
- Badges: ein Wort, semantische Farbe, keine Doppelungen mit gleicher Aussage
  („Review offen" + „Ungeprüft").
- Assistenten-Panel: standardmäßig eingeklappt (offen erst ab 1680 px Fensterbreite) und nie neben
  der Seite „Assistent“; keine zwei identischen Gesprächsflächen
  nebeneinander.
- Dark Mode: jede Fläche über Tokens, keine festen Farben.
- Farbwelt „Sapphire & Signet" (seit 17.09.2026): Brand-Blau Hue 222 (`--brand-600` hell,
  `--brand-400` dunkel, Navy `--brand-800` für Marke/Hero), Gold `--accent-*` nur für
  Premium-/Hinweis-Akzente, Teal `--secondary-*` nur für Website-Verläufe und Diagramme.
  Kein Lila, keine dritte Primärfarbe.
- Tiefe: Karten `--ds-shadow-1`, schwebende Elemente `--ds-shadow-2`, Overlays `--ds-shadow-3`,
  Hauptaktion mit `--ds-glow-brand` beim Hover. Tailwind-`shadow-*` löst auf diese Tokens auf;
  keine eigenen `rgba(0,0,0,…)`-Schatten.
- Bewegung: Dauern nur `duration-[var(--ds-duration-fast|normal|slow)]`, kein
  `transition-all`, `animate-pulse` nur in Skeletons und Live-Status-Punkten.
- Responsive: Seitenwurzeln sind im Routen-Wrapper auf volle Breite gezwungen; Aktionen im
  Seitenkopf sind auf dem Handy ein Wischstreifen; Kennzahlen 2×2; Register (`DataTable`) für
  Akten und Fristen mit `density="dense"`.

## 7. Abnahme

Jede Seite gilt als fertig, wenn: `h1` vorhanden, Sie-Form, kein Jargon, Skeleton + Empty

- Error definiert, Aktionen ≤ 3, Screenshot Desktop hell / Mobil dunkel abgelegt und der
  Konsolen-Sweep sauber ist. Protokoll: `docs/design/DESIGN_AUDIT_2026-09.md`.

## 8. Premium-System (19.09.2026)

- **Eine Akzentfarbe:** Sapphire für Aktionen und Links; Gold nur als Signet (Wortmarke, 1–2 Stellen je Seite),
  als Text `--accent-premium` (accent-700, ≥ 4.5:1). Navigations-Icons neutral, keine Bereichsfarben.
- **Flächen vs. Text:** `--brand-solid` für gefüllte Flächen mit weißer Schrift (hell brand-600, dunkel
  brand-500), `--brand-primary` für Links/Text (dunkel brand-350). Nie `bg-[--brand-primary]` für Buttons.
- **Kontrast (gemessen im Browser, `qa/contrast.mjs`):** Text ≥ 4.5:1 auf bg/surface/surface-2/hover in
  hell und dunkel; Eingabefeld-Rahmen `--ds-control-border` ≥ 3:1 (WCAG 1.4.11); Haarlinie `--ds-border`
  nur dekorativ. Platzhalter in `--ds-text-subtle`.
- **Tiefe:** Schatten mehrschichtig und navy getönt (Umgebungs- + Führungslicht); Stufe 1 ruhende Karte,
  2 angehoben, 3 Menü/Dialog. Dunkel: feine Lichtkante oben statt harter Schatten.
- **Dunkelmodus:** entsättigtes Navy (Sättigung ≈ 12–16 %), Tiefe über Helligkeit.
- **Bewegung:** Seitenwechsel 120 ms ausblenden, 210 ms mit 6 px einblenden (ease-out); bei reduzierter
  Bewegung nur Deckkraft. Nur `opacity`/`transform` animieren.
