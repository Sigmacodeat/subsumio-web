# Korpus-Integritäts-Report — Live-Engine vs. Repo

Stand: 2026-06-30 · Methode: Live-Stichproben gegen `api.subsum.io` (`/api/pages/...`,
read-only) je Gesetz (2. / mittlere / vorletzte Paragraphennummer aus den Repo-Splits),
abgeglichen mit der Ground-Truth in `law-corpus-split/`. Klassifikation über
`word_count`: ≤12 Wörter = nur Überschrift, sonst Volltext.

## Kernbefund

Der Engine-Korpus ist **überwiegend Volltext**, aber **mehrere zentrale Gesetze sind
nur als Paragraphen-Überschriften geladen** — obwohl der Volltext im Repo vorliegt.
Das ist ein **Ingestion-/Daten-Defekt**, kein fehlendes Quellmaterial. Für ein
„belegte-Antworten"-Produkt ist das gravierend: Die KI nennt die richtige Norm, kann
aber den Inhalt (Fristen, Tatbestände) nicht wiedergeben.

## AT (21 Gesetze) — mehrere kaputt, inkl. Flaggschiffe

| Gesetz                                                                      | §§   | Engine                      | Bewertung                                           |
| --------------------------------------------------------------------------- | ---- | --------------------------- | --------------------------------------------------- |
| **ABGB**                                                                    | 1267 | nur Überschrift (avg wc 11) | 🔴 **kritisch** — Österreichs Zivil-Kerngesetz      |
| **AktG**                                                                    | 250  | nur Überschrift (wc 9)      | 🔴 kaputt                                           |
| **EStG (AT)**                                                               | 134  | nur Überschrift (wc 8)      | 🔴 kaputt — **Tax-kritisch**                        |
| **UStG (AT)**                                                               | 31   | nur Überschrift (wc 9)      | 🔴 kaputt — **Tax-kritisch** (Repo-Body §18: ~7 KB) |
| **StVO (AT)**                                                               | 105  | nur Überschrift (wc 7)      | 🔴 kaputt                                           |
| **KStG (AT)**                                                               | 27   | teils Überschrift (wc 18)   | ⚠️ partiell — **Tax-kritisch**                      |
| **ASVG**                                                                    | 708  | teils Überschrift (wc 12)   | ⚠️ partiell                                         |
| UGB, EO, StPO, StGB, IO, BAO, ArbVG, ZPO, GmbHG, AVG, MRG, KSchG, AngG, AHG | —    | Volltext                    | ✅                                                  |

## DE (12 Gesetze) — fast vollständig

| Gesetz                                                         | Engine            | Bewertung                                          |
| -------------------------------------------------------------- | ----------------- | -------------------------------------------------- |
| **AO**                                                         | teils Überschrift | ⚠️ partiell — **Tax-kritisch** (DE Abgabenordnung) |
| BGB, ZPO, StPO, HGB, StGB, FamFG, InsO, EStG, GmbHG, UStG, UwG | Volltext          | ✅                                                 |

## CH (3 Gesetze) — Volltext, aber dramatisch schmale Abdeckung

- ZGB, OR, StGB: **Volltext vorhanden** (Slug-Schema `art-N`, nicht `p-N`), korrekt indexiert.
- **Aber nur 3 Gesetze** — und im Repo (`law-corpus-split/ch/`) liegen sie nicht einmal
  paragraphenweise gesplittet vor (nur `zgb.md`, `or.md`, `stgb.md`). Es fehlen u.a.
  **ZPO, StPO, SchKG, DSG, BV, VwVG** und das gesamte Steuerrecht (DBG, MWStG). Für ein
  „AT·DE·CH"-Produkt ist CH stark untererfasst.

## Ursache & Fix

Stichprobe bestätigt: Die Repo-Splits enthalten den Volltext (z.B. `abgb-par-933.md`
mit „…innerhalb von zwei Jahren, bei einer unbeweglichen Sache innerhalb von drei
Jahren…"), die Engine-Pages dagegen nur die Überschrift. Die kaputten Gesetze wurden
offenbar aus einer älteren, überschriften-only Quelle befüllt.

**Re-Ingest der betroffenen Gesetze (engine-seitig, braucht `DATABASE_URL` der Box):**

```bash
# Voll neu (alle Statutes neu ingestieren):
DATABASE_URL=<engine-pg-url> bun run server/scripts/import-statutes-split.ts

# Danach verifizieren (Beispiel):
curl -s https://api.subsum.io  # bzw. /api/pages/legal%2Fstatutes%2Fat%2Fabgb%2Fp-933
# erwartet: word_count > 12 und Normtext im content
```

**Priorität:** AT-ABGB + AT-EStG/UStG/KStG (Tax) + DE-AO zuerst — das sind die
schmerzhaftesten Lücken für Legal- bzw. Tax-Mandate.

## Folge-Empfehlung

1. Nach dem Re-Ingest diesen Report-Check als **CI-/Smoke-Test** automatisieren
   (Stichprobe je Gesetz, `word_count`-Schwelle), damit ein heading-only-Regress
   nie wieder unbemerkt live geht.
2. CH-Korpus inhaltlich ausbauen (mindestens Prozessrecht + Steuerrecht), sonst die
   CH-Vermarktung entsprechend einschränken.
