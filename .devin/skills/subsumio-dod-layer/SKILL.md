---
name: subsumio-dod-layer
description: Subsumio-spezifische DoD-Ergänzungen — wird vom generischen /dod-gate am Ende aufgerufen. Prüft Engine-Invariants (Citation, Source-Isolation, JSONB, Engine-Parity, Trust, CSRF, Pricing, Migration, verify, build:llms).
argument-hint: ""
allowed-tools:
  - read
  - grep
  - glob
  - exec
triggers:
  - user
  - model
---

# Subsumio DoD-Layer

Subsumio-spezifische DoD-Ergänzungen. Wird vom generischen `/dod-gate` am
Ende aufgerufen (nach den 15 universellen Items). Jedes Item braucht Beweis.

## Ablauf

1. Für jedes Item: prüfe ob es auf die aktuelle Änderung zutrifft.
2. Falls zutreffend: Beweis sammeln (Datei:Zeile oder Befehl+Output).
3. `✅ BEWEIS: …` oder `❌ NICHT BESTÄTIGT: …` oder `N/A — <grund>`.
4. ❌ → fixen, dann erneut prüfen.
5. Wenn alle zutreffenden Items ✅ → an `/dod-gate` zurückmelden.

## Subsumio-DoD-Items (10)

### 1. CitationPanel + useGroundedAnswer
Nur falls AI-Output-Fläche erstellt/geändert wurde.
- `useGroundedAnswer` aufgerufen? Beweis: grep in der Komponente.
- `CitationPanel` gerendert? Beweis: grep.
- "anwaltlich zu prüfen"-Badge? Beweis.
- Falls N/A: begründen ("keine AI-Output-Fläche").

### 2. Source-Isolation
Nur falls read-side op geändert/erstellt.
- `sourceScopeOpts(ctx)` verwendet? Beweis: Datei:Zeile.
- Kein hand-rolled Source-Filter (`.where("source_id", ...)` ohne
  `sourceScopeOpts`)? Beweis: grep.
- Falls N/A: begründen ("keine read-side op").

### 3. JSONB
Nur falls JSONB-Spalte berührt.
- Rohe Objekte an `engine.executeRaw` oder `executeRawJsonb`? Beweis.
- Kein `JSON.stringify` in `::jsonb`-Cast? Beweis: grep.
- `scripts/check-jsonb-pattern.sh` clean? Beweis: Befehl+Output.
- Falls N/A: begründen ("keine JSONB-Operation").

### 4. Engine-Parity
Nur falls Engine-Methode/SQL geändert.
- In BOTH `pglite-engine.ts` UND `postgres-engine.ts`? Beweis: grep in
  beiden Dateien.
- `test/e2e/engine-parity.test.ts` aktualisiert? Beweis.
- Falls N/A: begründen ("keine Engine-Änderung").

### 5. Trust-Boundary
Nur falls neue op oder op-Signatur geändert.
- `OperationContext.remote` korrekt gesetzt? Beweis.
- `ctx.remote === false` für trusted-only-Sites? Beweis.
- Falls N/A: begründen ("keine neue op").

### 6. CSRF + Rate-Limit + Audit
Nur falls API-Route erstellt/geändert.
- Via `createHandler` mit `action`/`rateTier`/`audit`? Beweis.
- Nicht handgerollt? Beweis.
- Falls N/A: begründen ("keine API-Route").

### 7. Pricing
Nur falls Preis-Logik berührt.
- Nur `src/core/model-pricing.ts` geändert (keine Duplikation)? Beweis.
- Abgeleitete Views nicht hand-kopiert? Beweis: grep nach Preis-Konstanten.
- `test/model-pricing.test.ts` noch grün? Beweis: Befehl+Output.
- Falls N/A: begründen ("keine Preis-Logik").

### 8. Migration
Nur falls Schema-Änderung.
- In `MIGRATIONS`-Array (`server/src/core/migrate.ts`)? Beweis: Datei:Zeile.
- `CREATE INDEX CONCURRENTLY` mit `transaction: false`? Beweis.
- Falls N/A: begründen ("keine Schema-Änderung").

### 9. `bun run verify` (Subsumio-spezifisch)
Falls Code in `src/` oder `server/` geändert.
- Befehl ausführen, Output als Beweis.
- Falls fail: fixen, erneut.

### 10. `bun run build:llms`
Nur falls `CLAUDE.md` oder Reference-Docs geändert.
- Befehl ausführen, Output als Beweis.
- Falls N/A: begründen ("keine Doc-Änderung").

## Output

```
## Subsumio DoD-Layer

1. ✅ Citation — BEWEIS: … / N/A — …
2. ✅ Source-Isolation — BEWEIS: … / N/A — …
…
9. ✅ verify — BEWEIS: `bun run verify` → <output-snippet>
10. N/A build:llms — keine Doc-Änderung
```

Zurück an `/dod-gate`: alle zutreffenden Items ✅ → Subsumio-Layer PASSED.
