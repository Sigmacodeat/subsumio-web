---
description: Optimiere Dashboard / Kanzlei-OS UI nach Agency-Level Standards
---

# Dashboard / Kanzlei-OS Optimization

## Scope

- `src/app/dashboard/` — 51 Dashboard-Seiten (Akten, Fristen, Brain, Graph, etc.)
- `src/app/dashboard/layout.tsx` — Sidebar Navigation, Brain Status, Theme
- `src/components/dashboard/` — Dashboard-spezifische Komponenten (command-palette, etc.)
- `src/components/ui/` — shadcn/ui Komponenten (Button, Card, Dialog, etc.)
- `src/components/gobd-integrity-panel.tsx` — GoBD Compliance Panel
- `src/components/legal/` — Legal-spezifische UI-Komponenten

## Navigation-Sektionen (aus layout.tsx)

1. **Gehirn**: Übersicht, Assistant, Query, Agenten, Freigaben, Brain, Graph, Upload, RAG-Eval
2. **Akten & Fristen**: Akten, Kontakte, Verträge, Vault, Fristen, Gegner, Mandanten-Portal
3. **Recherche**: Legal Research, Rechtsprechung, Normen, Urteile-Sync, Kollisionsprüfung, Massen-Review, Monitoring
4. **Schriftsätze & Abrechnung**: Schriftsatz, Kostenrechner, Rechnungen, DATEV, e-Signatur
5. **Daten & Integration**: Konnektoren, WhatsApp, Kanzlei-Import, beA, E-Mail, Kalender, Compliance, etc.

## Kontext laden

1. Lese `src/app/dashboard/layout.tsx` für Navigation & State
2. Lese `src/app/dashboard/page.tsx` für Dashboard-Übersicht
3. Lese `src/components/ui/` für verfügbare UI-Komponenten
4. Lese `src/lib/use-mutation.ts` für Mutation Queue Pattern
5. Lese `src/lib/use-brain-selector.ts` für Brain-Switching
6. Lese `src/lib/use-offline-sync.ts` für Offline-Support
7. Lese `src/lib/realtime.ts` für WebSocket-Realtime
8. Lese `src/lib/industry-theme.ts` für Industry-spezifische Themes

## Optimierungs-Checkliste

- [ ] **UX-Flow**: Jede Seite hat klaren Purpose, Empty State, Loading State, Error State
- [ ] **CRUD komplett**: Create, Read, Update, Delete für jede Entität
- [ ] **Data Tables**: Sortierung, Filterung, Pagination, Bulk-Actions
- [ ] **Forms**: Validation (Zod), Inline-Errors, Submit-Loading, Success/Error Toast
- [ ] **Keyboard**: Tab-Navigation, Shortcuts (Command Palette), Escape-to-close
- [ ] **Responsive**: Sidebar collapsible, Table → Cards on mobile
- [ ] **Realtime**: WebSocket-Updates wo sinnvoll (Brain Status, Approvals)
- [ ] **Offline**: Mutation Queue, Offline-Store, Sync-Indikator
- [ ] **Accessibility**: ARIA, Focus-Trap in Modals, Screen-Reader-Labels
- [ ] **Performance**: Lazy-Loading von Seiten, Code-Splitting, Suspense
- [ ] **Dark Mode**: Konsistente Dark-Mode-Styles (layout.tsx hat Sun/Moon Toggle)
- [ ] **GoBD**: Verfahrensdoku-Panel, Audit-Trail, Integritäts-Checks

## Test-Befehle

```bash
# Playwright E2E
npx playwright test tests/e2e-playwright/

# Accessibility Test
npx playwright test tests/e2e-playwright/a11y.spec.ts

# Build Check
npm run build

# TypeScript Check
npx tsc --noEmit
```

## Agency-Level Standards

- **Sidebar**: Gruppierte Navigation (wie vorhanden), Collapsible, Active-Indicator, Badge-Counts
- **Command Palette**: Cmd+K, fuzzy search, alle Seiten erreichbar
- **Data Tables**: Virtualized bei >100 Rows, Column-Resize, Export-Button
- **Detail Views**: Slide-over Panel (nicht neue Seite), Breadcrumb, Back-Button
- **Bulk Actions**: Checkbox-Select, Action-Bar erscheint, Confirm-Dialog
- **Empty States**: Illustration + CTA + Hilfetext
- **Loading States**: Skeleton-Screens (nicht Spinner), Progressive Loading
- **Error States**: Retry-Button, Error-Details, Support-Contact
- **Toasts**: Undo/Redo für destruktive Actions, Auto-dismiss nach 5s
