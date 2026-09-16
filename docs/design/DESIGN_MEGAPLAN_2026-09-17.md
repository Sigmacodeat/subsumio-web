# Design-Megaplan „Sapphire & Signet" (17.09.2026)

Ziel: das gesamte Seitensystem (Dashboard, Portal, Website, Auth) auf Industrieniveau — eine
Farbwelt, die Vertrauen und Präzision ausstrahlt, spürbare Tiefe ohne Spielerei, saubere
Typografie, verlässliche Bewegung, mobil bis Desktop. Basis bleibt das Token-System in
`src/app/globals.css`; nichts wird seitenweise hart gefärbt.

## 1. Farbwelt — Entscheidung

**Warum nicht Lila:** Hue 230 (Periwinkle) wirkt generisch-„KI" und hat wenig Autorität.
Kanzleien verbinden Recht mit Tinte, Siegel, Papier: dunkles Blau + Gold.

| Rolle                 | Farbe                                                                                                  | Herleitung                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primär „Sapphire"** | Hue 222, `--brand-500 #2a60df`, `--brand-600 #1f50c1` (Hauptaktion hell), `--brand-800 #1a3470` (Navy) | Reines Blau ohne Violett-Anteil: Vertrauen, Ruhe, Präzision. Kontrast Weiß auf 600 = 7,1:1, 600 auf Papier = 6,8:1 (AAA).                                                    |
| **Signet „Gold"**     | Hue 42, gesättigt gedämpft, `--accent-500 #b68f35`                                                     | Komplementär zu Blau (Farbkreis 222 ↔ 42). Nur für Marke, Premium, Hervorhebung — nie für Text unter 4,5:1, nie als Warnfarbe (Warnung bleibt kräftiges Amber, Hue 40/90 %). |
| **Sekundär „Teal"**   | Hue 188, `--secondary-500 #2794a5`                                                                     | Split-Komplementär: zweite Datenfarbe für Diagramme, KI-Belege, sekundäre Chips. Text nur ab 700.                                                                            |
| **Neutrale hell**     | warmes Papier (Hue 40, wie bisher)                                                                     | „Tinte auf Papier": Blau liest sich auf warmem Off-White edler als auf kaltem Grau.                                                                                          |
| **Neutrale dunkel**   | Navy-getönt (Hue 222, 26–30 % Sättigung)                                                               | Dark Mode wird zur Fortsetzung der Marke statt zu neutralem Schwarz.                                                                                                         |
| Semantik              | Erfolg Hue 158, Warnung Hue 40, Gefahr Hue 0, Info = Sapphire 400                                      | unverändert, nur Info an die Marke angeglichen.                                                                                                                              |

Regeln: Primärfarbe nur für die eine Hauptaktion pro Ansicht; Gold höchstens einmal pro
Bildschirm (Signet, Premium-Badge, Fokus-Highlight im Onboarding); Teal nie für Aktionen.

## 2. Tiefe und Effekte

- Drei Schattenstufen als Tokens (`--ds-shadow-1/2/3`, blau-getönt statt grau) und ein
  Marken-Glow (`--ds-glow-brand`) für Hauptaktionen im Hover/Fokus. Karten: Stufe 1, erhöhte
  Karten und Menüs: Stufe 2/3. Dark Mode: tiefere Schatten plus 1-px-Innenlicht oben.
- Primär-Button mit feinem Verlauf (hell → Primär), Innenlicht, Glow im Hover. Kein
  Regenbogen, keine animierten Verläufe im Dashboard.
- Fokusring: 2 px Sapphire mit 2 px Versatz, überall gleich.
- Website-Hero: Marken-Verlauf Navy → Sapphire → Gold-Schimmer (einziger Ort für Gold-Verlauf).

## 3. Typografie

Inter (UI, 14/15 px, tabellarische Ziffern in Tabellen) und Space Grotesk (Display) bleiben —
sie sind selbst gehostet, lesbar und unterscheidbar. Feinschliff: Überschriften 600 statt 700,
Tracking −0,01 em, Display nur für `h1`/Hero, Kennungen in JetBrains Mono. Keine dritte
Schrift im Dashboard.

## 4. Layout und Responsive

- Zwei Inhaltsbreiten (1 440 px Listen, 720 px Formulare), 16-px-Gutter auf dem Handy.
- Seitenkopf-Aktionen: 1 primär + 2 sekundär, Rest im Menü; auf dem Handy ein
  horizontal scrollbarer Aktionsstreifen statt Zeilenumbruch.
- Kennzahlen 2×2 auf dem Handy, 4 nebeneinander ab 1 024 px; Tabellen mit sticky Kopfzeile
  und dichter Zeile (40 px) für Akten und Fristen.
- Prüfung auf 390 / 768 / 1 024 / 1 440 px, hell und dunkel.

## 5. Bewegung

Nur `--ds-duration-*` und `--ds-ease-*`; Seiteneinstieg 200 ms/6 px; Panels 280 ms; kein
`transition-all`, kein Puls außerhalb von Skeletons; `prefers-reduced-motion` respektiert.

## 6. Leerzustände und Texte

Gemeinsamer `EmptyState` (eine Aktion) in allen Anwaltsmodulen; Website- und Rechtstexte
auf Sie-Form (Website-Marketing behält seinen wärmeren Ton, aber siezt).

## 7. Marke

Signet (Waage in Navy/Gold) bleibt; Favicon und Mark auf die neuen Werte, Wortmarke in
Space Grotesk 600.

## Phasen

| Phase                  | Inhalt                                                                                   | Nachweis                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| P1 Farbsystem          | Brand-/Akzent-/Sekundär-Skalen, Dark-Navy, Info-Anpassung, Runtime-Theme, Rest-Hardcodes | Kontrast-Script (hell/dunkel), Screenshots |
| P2 Tiefe & Effekte     | Schatten-/Glow-Tokens, Buttons, Karten, Fokus                                            | Screenshots, Storybook-Tokens              |
| P3 Typografie          | Gewichte, Tracking, Ziffern                                                              | Screenshots                                |
| P4 Layout & Responsive | Aktionsstreifen, Kacheln, Tabellen, 4 Breiten                                            | Sweep-Script 4 Breiten × 2 Modi            |
| P5 Bewegung            | Token-Audit, `transition-all` entfernen                                                  | grep = 0                                   |
| P6 Leerzustände        | EmptyState in Nebenmodulen                                                               | Audit `empty_state`                        |
| P7 Website/Recht       | Sie-Form                                                                                 | grep = 0                                   |
| P8 Marke               | Favicon, Mark, Snapshots erneuern                                                        | Playwright-Snapshots                       |

Abnahme gesamt: Audit-Script über alle Routen sauber, E2E-Mock-Suite grün, visuelle Snapshots
erneuert, Screenshots in `docs/design/screenshots/` (hell/dunkel, Desktop/Handy).
