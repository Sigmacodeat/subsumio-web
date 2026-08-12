# Subsumio — Projekt-Regeln

Diese Datei ist der dünne, immer-geladene Subsumio-Router. Tiefe
Engine-Referenz in `CLAUDE.md`. Skills unter `.devin/skills/` sind on-demand.

---

## Server-Regel

Dev-Server läuft auf Port **3000** und muss nicht neu gestartet werden.
Starte niemals `npm run dev` / `next dev` ohne ausdrückliche Anweisung.

---

## ⛔ Harter Workflow (nicht verhandelbar)

1. **🔬 Recherche:** `/research-best-practices` aufrufen — recherchiere
   den aktuellen State-of-the-Art für die Aufgabe.
2. **Vor Blueprint:** `/subsumio-context-loader` aufrufen — lädt die
   relevanten Dateien für den Task-Typ.
3. **Blueprint:** `/fullstack-blueprint` (globaler Skill, inkl. Recherche +
   Frontend-Qualitätsbar).
4. **Breakdown:** `/task-breakdown` (globaler Skill).
5. **Bei Frontend/UI-Arbeit:** `/frontend-craft` 🎨 aufrufen — Agentur-
   Qualitätsbar einhalten.
6. **Nach jedem Paket:** `/self-audit` (globaler Skill, inkl. Agentur-
   Qualität + proaktive Vorschläge).
7. **Edge-Case:** `/edge-case-stress` (globaler Skill).
8. **Vor "fertig":** `/dod-gate` (global, inkl. Frontend-Items + proaktive
   Vorschläge) → ruft `/subsumio-dod-layer` auf.
9. **Bei API/lib/types/engine-Änderung:** `/subsumio-connections` aufrufen
   und abhängige Dateien prüfen.

Maschinell: ein Stop-Hook (`.devin/hooks.v1.json`) blockiert den Turn-Ende,
wenn seit dem letzten `/dod-gate`-Pass Code editiert wurde.

---

## 🎨 Subsumio Design-System (Frontend-Qualitätsbar)

Frontend-Arbeit auf Agentur-Niveau. KEINE generische Programmierung.
Nutze das bestehende Design-System:

### Design-Tokens (in `src/app/globals.css`)
- **Brand-Farben:** `--brand-primary` (hsl 230 60% 52%), `--brand-primary-hover`,
  animierbar via `@property`. Nutze `var(--brand-*)`, nie hardcodiert.
- **Dark-Mode:** `data-theme="dark"` auf `<html>`, `dark:`-Varianten.
  `@custom-variant dark` ist definiert. KEINE `prefers-color-scheme`.
- **Fonts:** Inter (Body), Grotesk (Display), JetBrains (Mono) — via
  `next/font` self-hosted (GDPR). Variablen `--font-inter`, `--font-grotesk`,
  `--font-jetbrains`. KEINE Google-Fonts-Runtime-Requests.
- **Signal-Farben:** success/warning/danger über shadcn-Variants.

### UI-Primitives (`src/components/ui/`)
- shadcn/ui-Pattern: `Button`, `Card`, `Dialog`, `Badge`, `Input`,
  `Select`, `Dropdown`, `Accordion`, `Avatar`, `Checkbox`, etc.
- **IMMER diese Primitives nutzen** — keine eigenen Buttons/Inputs/Dialogs
  daneben. Falls ein Primitive fehlt → in `src/components/ui/` anlegen
  im shadcn-Stil (mit `.stories.tsx` + `.test.tsx`).
- Jede Komponente hat `.stories.tsx` (Storybook) — nutze Storybook zum
  Visuellen Prüfen.

### Modern Patterns (Subsumio-spezifisch)
- **Next.js App Router** — Server Components default, `"use client"` nur
  bei Interaktion.
- **React Query** — `useQuery`/`useMutation`, `queryClient.invalidateQueries`
  nach Mutation, Query-Keys mit Namespace (z.B. `["corpus-files-list"]`).
- **Optimistic Updates** — `onMutate` für sofortige UI bei Mutationen.
- **URL-State** — Filter/Pagination/Sortierung in `useSearchParams`.
- **Suspense + Streaming** — Server-Komponenten streamen, Skeletons.
- **Toast** — `useToast` → `addToast({ title, description, type })` bei
  JEDEM Mutation-Erfolg UND -Fehler.
- **Motion** — `src/components/dashboard/motion.tsx` für Entrance-Animations.

### Accessibility (Subsumio = DACH-Rechtsprodukt — hohe Bar)
- WCAG 2.1 AA Minimum, bei Anwalts-Kanzleien oft gefordert.
- Semantisches HTML, ARIA, Tastatur, Kontrast ≥4.5:1.
- `prefers-reduced-motion` respektieren (Rechtsanwälte arbeiten lang).
- DACH-Texte: de-AT/de-DE, verständliche Fachsprache, keine englischen
  UI-Labels außer etablierte Begriffe (Login, etc.).

---

## 💡 Proaktive Vorschläge (Subsumio-spezifisch)

Du MUSST proaktiv vorschlagen, nicht nur ausführen. Beispiele für Subsumio:
- "Dieser Dialog wird auf Mobile als Bottom-Sheet besser, weil Anwälte
  oft auf dem Tablet arbeiten."
- "Hier fehlt ein Empty-State mit 'Erste Norm einpflegen'-CTA, weil ein
  leerer Corpus verwirrend ist."
- "Dieser Hover-State ist zu dezent für eine Agentur-Qualität — modern
  wäre active:scale-[0.98] + Shadow."
- "Hier würde ich URL-State statt useState für den Filter nehmen, damit
  der Link teilbar ist."
- "Diese Liste würde ich virtualisieren, weil 713K Dateien sonst die
  Performance killen."

---

## Subsumio Fullstack-Verbindungs-Logik (statische Referenz)

Immer wenn du eine Datei änderst, prüfe die verbundenen Dateien:

- **API-Route** (`src/app/api/**/route.ts`)
  → verwendet `createHandler` + Zod-Schema
  → ruft lib-Funktion in `src/lib/*.ts`
  → Frontend-Komponente konsumiert via `fetchJSON`/`postJSON`/`putJSON`
  → Types in `src/lib/types.ts` (shared)
  → Test `*.test.ts` neben der Datei
  → CSRF/Rate-Limit/Audit via `createHandler`-Config (`action`, `rateTier`, `audit`)

- **lib** (`src/lib/*.ts`)
  → reine Geschäftslogik
  → wird von API-Route UND ggf. Server-Komponente verwendet
  → alle Konsumenten via grep nach Funktionsname prüfen

- **Frontend** (`src/components/**/*.tsx`)
  → `useQuery`/`useMutation` (React Query)
  → `fetchJSON`/`postJSON`/`putJSON` (lokal definiert oder importiert)
  → `useToast` → `addToast({ title, description, type })` bei Erfolg UND Fehler
  → `queryClient.invalidateQueries({ queryKey: [...] })` nach Mutation
  → Loading: `isLoading`/`isPending` + Skeleton
  → Empty: `data?.length === 0`-Branch mit Icon/Text

- **Types** (`src/lib/types.ts`)
  → shared zwischen API und Frontend
  → alle Konsumenten via grep nach Typname prüfen

- **Engine-Schema** (`server/src/core/migrate.ts`)
  → MIGRATIONS-Array (nicht freies DDL)
  → `CREATE INDEX CONCURRENTLY` braucht `transaction: false`
  → pglite + postgres Engine in Lockstep
  → `test/e2e/engine-parity.test.ts` + `test/schema-bootstrap-coverage.test.ts`

- **AI-Output-Fläche** (jede UI die KI-generierten Text zeigt)
  → `useGroundedAnswer` (in `src/lib/use-grounded-answer.ts`)
  → `CitationPanel` (Standard-Trust-Panel)
  → "anwaltlich zu prüfen"-Badge
  → KEINE Ausnahme — Cross-cutting Invariant.

---

## Cross-cutting Invariants (Kurzfassung, Detail in CLAUDE.md)

- **Trust fail-closed:** `ctx.remote === false` für trusted-only; alles andere
  ist untrusted. Nie `remote` falsy defaulten.
- **Source-Isolation:** jede read-side op via `sourceScopeOpts(ctx)`; nie
  hand-rollen. Vermisste Thread = Cross-Source-Datenleck.
- **JSONB:** nie `JSON.stringify` in `::jsonb`-Cast. Rohe Objekte an
  `engine.executeRaw` oder `executeRawJsonb`. Guarded by
  `scripts/check-jsonb-pattern.sh`.
- **Engine-Parity:** pglite + postgres in Lockstep. Neue Methode/SQL in
  BEIDEN. Pinned by `test/e2e/engine-parity.test.ts`.
- **Contract-first:** `src/core/operations.ts` ist die Single Source; CLI +
  MCP generiert daraus. Jede op hat `scope` + optional `localOnly`.
- **CitationPanel + useGroundedAnswer:** Jede AI-Output-Fläche MUSS beide
  haben. Pinned by `src/components/chat/chat-grounding.test.tsx` +
  `src/lib/use-grounded-answer.test.ts`.
- **Eine kanonische Pricing-Tabelle:** `src/core/model-pricing.ts`. Keine
  Duplikation in abgeleiteten Views. Pinned by `test/model-pricing.test.ts`.
- **Migrationen:** in `MIGRATIONS`-Array (`server/src/core/migrate.ts`).

---

## Skill-Routing für Subsumio

| Moment | Skill |
|---|---|
| 🔬 Vor Recherche | `/research-best-practices` |
| Vor Blueprint (Dateien laden) | `/subsumio-context-loader` |
| 🎨 Bei Frontend/UI-Arbeit | `/frontend-craft` |
| API/lib/types/engine-Änderung | `/subsumio-connections` |
| Vor "fertig" (Subsumio-Layer) | `/subsumio-dod-layer` (via `/dod-gate`) |

---

## Stil (Subsumio-spezifisch)

- DACH-first: de-AT/de-DE in UI-Texten, Rechtschreibung konsistent.
- Toast bei JEDEM Mutation-Erfolg UND -Fehler (`addToast`).
- `queryClient.invalidateQueries` für alle betroffenen Query-Keys.
- Buttons während `isPending` disabled.
- Keine `any` in neuem Code — Types aus `src/lib/types.ts` erweitern.
- Frontend-Helfer (`fetchJSON`/`postJSON`/`putJSON`) lokal in der
  Komponente definiert, wenn nicht schon geteilt — prüfen per grep.
