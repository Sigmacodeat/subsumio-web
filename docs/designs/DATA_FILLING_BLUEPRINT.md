# Datenbefüllungs-Blueprint — Subsumio Legal Knowledge Graph

## Ziel

Das System ist feature-complete. Jetzt geht es darum, die Brain-Datenbank mit strukturierten Rechtsdaten zu füllen, damit RAG-Anfragen präzise, zitierte Antworten liefern. Je mehr Daten, desto besser die KI.

## Datenquellen (kostenlos & öffentlich)

| Quelle | Jurisdiktion | API | Status |
|--------|-------------|-----|--------|
| **RIS-OGD v2.6** | AT (OGH, OLG, VwGH) | ✅ `data.bka.gv.at/ris/api/v2.6` | Implementiert |
| **OpenLegalData** | DE (BGH, BVerfG, etc.) | ✅ `de.openlegaldata.io/api` | Implementiert |
| **EUR-Lex** | EU (EuGH, EuG) | ✅ `eur-lex.europa.eu` | ❌ Noch nicht |
| **BVerfG** | DE (Bundesverfassungsgericht) | ⚠️ HTML-Scraping | ❌ Noch nicht |
| **Gesetze-AT** | AT (ABGB, StGB, etc.) | ✅ Statisch als Markdown | ✅ Vorhanden |
| **Gesetze-DE** | DE (BGB, StGB, etc.) | ✅ Statisch als Markdown | ✅ Vorhanden |

## Was fehlt noch

### 1. EUR-Lex Konnektor (EuGH, EuG)
EuGH-Urteile sind essentiell für EU-relevante Fälle. EUR-Lex hat eine SOAP/REST API.

### 2. Bulk-Import Script
Ein CLI-Tool, das systematisch alle verfügbaren Urteile importiert (nicht nur Delta).

### 3. Embedding-Pipeline
Nach dem Import müssen alle Urteile embedded werden für RAG.

### 4. Case-Law Watchlist-Automatisierung
Die `monitoring/case-law-watchlist` Seite automatisch befüllen mit relevanten Themen pro Kanzlei.

### 5. Gesetzes-Corpus erweitern
Aktuell nur AT/DE. CH fehlt komplett.

## Implementierungsplan

### Phase A: EUR-Lex Konnektor
- REST-API Wrapper für EUR-Lex
- EuGH- und EuG-Urteile importieren
- Typ: `eu_court_decision`

### Phase B: Bulk-Import Script
- `scripts/bulk-import-judgements.ts`
- Systematischer Import aller historischen Urteile
- Progress-Tracking, Resume-Logik

### Phase C: Auto-Embed nach Import
- Nach jedem Sync: `gbrain consolidate` oder API call
- Scheduled Job für Embedding-Queue

### Phase D: Smart Watchlists
- Auto-generierte Watchlists basierend auf Kanzlei-Spezialisierung
- Keywords aus Akten extrahieren

### Phase E: CH-Gesetze
- Schweizer Gesetze als Markdown hinzufügen
- OR, ZGB, StGB, etc.
