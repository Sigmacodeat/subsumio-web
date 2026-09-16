# Design-Audit Dashboard — Protokoll (Start 16.09.2026)

Grundlage: `docs/design/DESIGN_STANDARD.md`. Methode: Screenshots (Desktop hell, Mobil dunkel)
und ein automatischer Audit über alle 115 Dashboard-Routen (`h1`, Brotkrume, Ladetexte,
Seiten-Spinner, Leerzustand, Anrede, Jargon, Fehler-Overlay).

## Ausgangsbefund (vor Welle 1)

| Kriterium                | Befund                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Anrede                   | 78 Copy-Strings in Du-Form, 49 in Sie-Form; Assistent duzte („Womit kann ich dir helfen?"), Einstellungen siezten                            |
| Jargon in Anwaltsflächen | Brain 55×, Agent 35×, Token 19×, Slug 17×, Engine 20×, Dream Cycle 11×                                                                       |
| Benennung                | „Kanzlei-Cockpit" (Titel, Brotkrume) vs. „Übersicht" (Navigation) vs. „Dashboard" (Tab); „Copilot" (Panel) vs. „Assistent" (Navigation)      |
| Sichtbare Defekte        | „AKTSDETAILS", Kachel „Sicherheit" doppelt, Seitenleiste zeigte Slug-Segment „legal"/„new" statt Aktentitel, „Lade Status…" als Seiteninhalt |
| Struktur                 | 6 Seiten ohne `h1` (Agenten, Kanzleiwissen, Assistent, Graph, Portfolio, Ablauf-Editor)                                                      |
| Zustände                 | Route-Ladezustand = zentrierter Spinner (99 Seiten); Seiten-Spinner auf Kanzleiwissen und Quellen                                            |
| Farbe                    | Grüner Primär-Button „Rechnung erstellen" neben blauer Primärfarbe                                                                           |
| Formatierung             | 24 Datumsausgaben ohne führende Null („7.10.2026"); Beträge ohne Nachkommastellen („0 €")                                                    |

## Welle 1 — Sprache und Benennung (erledigt)

Sie-Form durchgängig (Copy, Assistent, Auth-Formulare, Cockpit-Untertitel); Jargon ersetzt
(Kanzleiwissen, Nächtliche Konsolidierung, Kennung, Gespräch, Subsumio-Dienst,
Dokumentablage, Fristenrechner); „Übersicht" und „Assistent" als einzige Namen; Tippfehler,
doppelte Kachel, Seitenleisten-Titel, Einstellungs-Stufen („Grundeinrichtung / Erweiterte
Funktionen / Integrationen (AT / DE / CH) / System"); technische Kacheln nur für Admins.

## Welle 2 — Struktur und Zustände (erledigt)

- `PageSkeleton` (Kopf + Zeilen) ersetzt den Route-Spinner auf allen Seiten und den
  „Status wird geladen"-Text der Shell; Kanzleiwissen und Quellen laden als Skeleton.
- `h1` auf allen Seiten (Explorer-/Canvas-Seiten mit unsichtbarer Überschrift).
- Assistenten-Panel wird auf der Assistent-Seite nicht mehr doppelt gezeigt.
- Datum immer `TT.MM.JJJJ` (de-AT), Beträge über `formatEur` („1.234,50 €").
- Primärfarbe nur für Hauptaktionen; Rechnungs-Button folgt der Brand-Farbe.

## Offen (nächste Wellen)

- Welle 3: Leerzustände mit genau einer Aktion auf allen Listen (Rechnungen, Aufgaben,
  Kontakte, Verträge), Kennzahlenkacheln vereinheitlichen, Badge-Doppelungen
  („Review offen" + „Ungeprüft").
- Welle 4: Bewegung (nur Tokens, kein Puls auf Inhalten), Mobil-Durchgang aller Kernseiten
  im Dark Mode, Tabellen-Dichte für Fristen und Akten.
- Marketing- und Rechtstexte (`legal-content.tsx`) bleiben in der Du-Form der Website; nicht
  Teil des Dashboards.
