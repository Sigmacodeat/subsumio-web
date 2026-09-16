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

- Überschriften: Space Grotesk (`font-display`); Fließtext Inter; Kennungen, Aktenzeichen,
  Beträge und Datumsangaben mit `tnum` (tabellarische Ziffern).
- Datum: `TT.MM.JJJJ`; relative Angabe daneben („in 28 Tagen") nur bei Fristen.
- Beträge: `1.234,50 €` (de-AT), immer mit Nachkommastellen.
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
- Assistenten-Panel: standardmäßig eingeklappt auf Seiten, die selbst ein Gespräch zeigen
  (Assistent), und auf schmalen Viewports; keine zwei identischen Gesprächsflächen
  nebeneinander.
- Dark Mode: jede Fläche über Tokens, keine festen Farben.

## 7. Abnahme

Jede Seite gilt als fertig, wenn: `h1` vorhanden, Sie-Form, kein Jargon, Skeleton + Empty

- Error definiert, Aktionen ≤ 3, Screenshot Desktop hell / Mobil dunkel abgelegt und der
  Konsolen-Sweep sauber ist. Protokoll: `docs/design/DESIGN_AUDIT_2026-09.md`.
