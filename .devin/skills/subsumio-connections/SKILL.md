---
name: subsumio-connections
description: Subsumio Connection-Map — weiss welche Dateien zusammengehören. Sagt pro geänderter Datei, was sonst zu prüfen ist (API→lib→Hook→Komponente→Types→Migration→Test).
argument-hint: "[geänderte-datei]"
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# Subsumio Connections

Connection-Map für Subsumio. Weiß pro Datei-Typ, welche anderen Dateien
zusammengören und bei einer Änderung geprüft werden müssen.

## Ablauf

1. Identifiziere die geänderte Datei (vom User genannt oder aus dem
   Verlauf).
2. Bestimme den Datei-Typ (API-Route / lib / Frontend / Types / Engine /
  AI-Output).
3. Gehe die zugehörige Tabelle durch und liste alle zu prüfenden Dateien.
4. Prüfe jede via grep/read — sind sie noch kompatibel?
5. Liste gefundene Inkonsistenzen mit Fix-Vorschlag.

## Mapping-Tabellen

### Wenn API-Route geändert (`src/app/api/**/route.ts`)
Prüfe:
- **lib-Funktion** die in der Route aufgerufen wird (grep nach Funktionsname
  in `src/lib/`).
- **Frontend-Hook/Komponente** die diese Route konsumiert (grep nach dem
  Route-Pfad, z.B. `/api/admin/corpus-files/create`).
- **Types** des Request-Body und Response (in `src/lib/types.ts` oder lokal
  in der Route definiert).
- **Test** `*.test.ts` neben der Datei oder in `src/lib/`.
- **createHandler-Config**: `action` (RBAC), `rateTier`, `audit`,
  `body` (Zod-Schema) — alle korrekt gesetzt?
- **CSRF/Rate-Limit/Audit** via `createHandler` (nicht handgerollt).

### Wenn lib-Funktion geändert (`src/lib/*.ts`)
Prüfe:
- **Alle API-Routes** die sie aufrufen (grep nach Funktionsname in
  `src/app/api/`).
- **Alle Frontend-Hooks** die sie (indirekt) verwenden.
- **Types** der Parameter und Rückgabe.
- **Test** `*.test.ts` neben der Datei.
- Falls Engine-Funktion: pglite + postgres Parität (siehe unten).

### Wenn Frontend-Komponente geändert (`src/components/**/*.tsx`)
Prüfe:
- **API-Route** die sie konsumiert (grep nach `API_BASE`/`/api/`).
- **Types** des API-Response (in `src/lib/types.ts` oder lokal).
- **useQuery/useMutation**: Query-Key korrekt? Invalidation nach Mutation
  für ALLE betroffenen Keys? (grep nach `queryClient.invalidateQueries`).
- **Toast**: `addToast` bei Erfolg UND Fehler in JEDEM `onSuccess`/`onError`?
- **Loading**: `isLoading`/`isPending` + Skeleton/Spinner?
- **Empty**: `data?.length === 0`-Branch?
- **Disabled-State**: Buttons während `isPending` disabled?

### Wenn Types geändert (`src/lib/types.ts`)
Prüfe:
- **Alle Konsumenten** via grep nach Typname (in `src/`).
- **API-Serialisierung**: wird der Typ an einer API-Grenze serialisiert?
  Response-Shape passt noch?
- **Frontend-Deserialisierung**: `fetchJSON<T>`-Aufrufe mit dem Typ —
  passen die Felder noch?

### Wenn Engine-Schema geändert (`server/src/core/migrate.ts`)
Prüfe:
- **MIGRATIONS-Array**: neuer Eintrag mit Versionsnummer?
- **`CREATE INDEX CONCURRENTLY`**: braucht `transaction: false` (Postgres);
  plain `CREATE INDEX` auf PGLite via `sqlFor.pglite`.
- **pglite + postgres Engine**: neue Methode/SQL in BEIDEN
  (`server/src/core/pglite-engine.ts` + `server/src/core/postgres-engine.ts`).
- **engine-parity.test.ts**: aktualisiert?
- **schema-bootstrap-coverage.test.ts**: forward-referenzierte Spalten/Indexe
  im Bootstrap-Probe-Set?
- **operations.ts**: falls neue op — `scope` + optional `localOnly`.

### Wenn AI-Output-Fläche erstellt/geändert (UI die KI-Text zeigt)
Prüfe:
- **`useGroundedAnswer`** (in `src/lib/use-grounded-answer.ts`) aufgerufen?
- **`CitationPanel`** gerendert?
- **"anwaltlich zu prüfen"-Badge** vorhanden?
- **chat-grounding.test.tsx + use-grounded-answer.test.ts** noch grün?
- KEINE Ausnahme — das ist eine Cross-cutting Invariant.

## Output

```
## Subsumio Connections (für: <datei>)

Datei-Typ: <API/lib/Frontend/Types/Engine/AI-Output>

Zu prüfen:
1. <datei> — <grund> → OK / INKONSISTENT: <beschreibung> → Fix: <vorschlag>
2. …

Gefundene Inkonsistenzen: <anzahl>
```

Inkonsistenzen VOR der finalen `/dod-gate` fixen.
