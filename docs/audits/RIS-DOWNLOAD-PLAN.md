# RIS & EUR-Lex Mass Download Plan

## Current Situation (2026-07-15)

### RIS (ris.bka.gv.at / data.bka.gv.at)

- **API** (`data.bka.gv.at/ris/api/v2.6`): ✅ funktioniert (HTTP 200)
- **Dokumente** (`www.ris.bka.gv.at/Dokumente/...`): ❌ HTTP 503 (MyraCloud Security Check)
- **Ursache**: Zu aggressive Abfragemuster (500ms Pause, 5-10 parallele Connections)
- **BKA-Richtlinie**: 1-2s Pause, Single Connection, 18:00-06:00 oder Wochenende, vorherige Anmeldung

### EUR-Lex (publications.europa.eu / eur-lex.europa.eu)

- **Cellar-URLs**: HTTP 400 (kein HTML-Content für viele IDs)
- **EUR-Lex Direct**: HTTP 202 + AWS WAF Challenge (Bot-Schutz)
- **Lösung**: Cellar-IDs prüfen ob Content existiert, EUR-Lex mit korrekten Headers + Rate Limiting

## Was wurde bereits getan

### Code Fixes

1. `fetch-all-at-judikatur.ts`: Rate Limiting fixiert (2000ms/1000ms), `--off-hours-only` Flag
2. `fetch-all-at-judikatur.ts`: XML-First Text-Extraktion + Identity-Check (wie backfill)
3. `backfill-corpus-text.ts`: Default Concurrency 1 für RIS, Rate Limiting 1500ms, `--off-hours-only` Flag
4. `corpus-pipeline.ts`: Cycle Lock, Layer 5 (Hash), Layer 6 (Fassungs-Sync)

### Was noch fehlt

1. **Email an ris.it@bka.gv.at** — Massendownload anmelden
2. **RIS Backfill** — Nach Email-Bestätigung, mit `--off-hours-only` starten
3. **EUR-Lex Backfill** — Cellar-URL Validierung + EUR-Lex Fallback mit Rate Limiting
4. **EU Regulations Import** — Nach Backfill, in DB importieren

## Step-by-Step Plan

### Step 1: Email an RIS

```
An: ris.it@bka.gv.at
Betreff: Anmeldung Massendownload RIS OGD — Subsumio Legal Tech

Sehr geehrtes RIS-Team,

wir möchten einen Massendownload über die RIS OGD API durchführen:

1. Öffentliche IP: [IHRE IP-ADRESSE]
2. Geplanter Zeitraum: ab sofort, wiederkehrend
3. Betroffene RIS-Anwendungen: Justiz, Vwgh, Vfgh, Bvwg, Lvwg, AsylGH, Uvs, Dsk, Gbk, Pvak, Dok
4. Request-Rate: 1 Request alle 1-2 Sekunden, 1 parallele Verbindung
5. Art: Einmaliger Initialimport + regelmäßige Updates (täglich/wöchentlich)

Zweck: Aufbau einer juristischen Recherchedatenbank für österreichische Rechtsprechung.
Die Daten werden unter CC BY 4.0 verwendet mit korrekter Namensnennung.

Mit freundlichen Grüßen,
[IHR NAME]
Subsumio Legal Tech
```

### Step 2: RIS Backfill starten (nach Bestätigung)

```bash
# Off-hours: wartet automatisch bis 18:00 CET
# Single connection, 1.5s pause, XML-first mit Identity-Check
nohup bun scripts/backfill-corpus-text.ts \
  --dir law-corpus/at-judikatur \
  --concurrency 1 \
  --off-hours-only \
  > /tmp/backfill-ogh.log 2>&1 &
```

Für alle Courts nacheinander (NICHT parallel!):

```bash
for court in at-judikatur at-judikatur-vfgh at-judikatur-vwgh at-judikatur-bvwg at-judikatur-lvwg at-judikatur-asylgh at-judikatur-uvs at-judikatur-dsk at-judikatur-gbk at-judikatur-pvak at-judikatur-dok; do
  bun scripts/backfill-corpus-text.ts --dir "law-corpus/$court" --concurrency 1 --off-hours-only
done
```

### Step 3: EUR-Lex Backfill

EUR-Lex benötigt andere Strategie:

- Cellar-URL mit `Accept: text/html` → wenn 400, try `Accept: application/pdf`
- EUR-Lex Direct als Fallback (mit 3s Pause zwischen Requests)
- CELEX-basierte URL: `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:{celex}`

```bash
# EU Regulations — 129.775 Placeholders
nohup bun scripts/backfill-corpus-text.ts \
  --dir law-corpus/eu/regulations \
  --concurrency 3 \
  > /tmp/backfill-eu-reg.log 2>&1 &

# EU Directives — 2.612 Placeholders
nohup bun scripts/backfill-corpus-text.ts \
  --dir law-corpus/eu/directives \
  --concurrency 3 \
  > /tmp/backfill-eu-dir.log 2>&1 &
```

### Step 4: Fetch fehlender Judikatur (Discovery Gap: 637.923)

Nach RIS-Bestätigung und Off-Hours:

```bash
# VwGH (356k total, 104k lokal) — größte Lücke
nohup bun scripts/fetch-all-at-judikatur.ts \
  --court vwgh --from 1990 --off-hours-only \
  > /tmp/fetch-vwgh.log 2>&1 &

# BVwG (287k total, 32k lokal)
nohup bun scripts/fetch-all-at-judikatur.ts \
  --court bvwg --from 2014 --off-hours-only \
  > /tmp/fetch-bvwg.log 2>&1 &
```

### Step 5: Import in DB

Nach erfolgreichem Backfill:

```bash
# Judikatur import (überspringt Placeholders)
bun scripts/import-judikatur.ts --source ogh --skip-placeholders --no-embed
bun scripts/import-judikatur.ts --source vwgh --skip-placeholders --no-embed
# ... für alle Courts

# EU Regulations import
bun scripts/import-eu-corpus.ts --type regulation --no-embed
```

### Step 6: Embedding

```bash
# Pipeline übernimmt das automatisch (embed stage)
# Oder manuell:
bun scripts/auto-embed-pg.ts
```

## Timing-Schätzung

| Task                       | Files | Rate          | Dauer                                     |
| -------------------------- | ----- | ------------- | ----------------------------------------- |
| RIS Backfill (alle Courts) | ~320k | 1 file / 1.5s | ~133h (nur Off-Hours = ~8h/Tag = 17 Tage) |
| EU Backfill                | ~132k | 1 file / 0.5s | ~18h                                      |
| RIS Fetch (VwGH + BVwG)    | ~500k | 1 file / 2s   | ~278h (nur Off-Hours = 35 Tage)           |
| Import                     | ~450k | ~100/s        | ~1.2h                                     |
| Embedding                  | ~450k | ~10/s         | ~12.5h                                    |

**Realistische Dauer bis kompletter Corpus:**

- Mit RIS-Bestätigung + Off-Hours: ~3-5 Wochen
- Ohne Bestätigung (nur Wochenende): ~8-10 Wochen
