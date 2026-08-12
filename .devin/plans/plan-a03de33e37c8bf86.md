# Plan: Admin-Route-Konsolidierung

## Status: NICHT UMGESETZT — wartet auf Freigabe

## Problem
Admin-Tools sind verstreut zwischen `/dashboard/admin/*` (geschützt durch
Middleware + Layout-Guard) und `/dashboard/*` (nur Sidebar-Tier-Filter).

## Betroffene Routes (verschieben nach `/dashboard/admin/*`)

| Aktuell | Ziel | Tier |
|---|---|---|
| `/dashboard/api-keys` | `/dashboard/admin/api-keys` | admin |
| `/dashboard/settings/kanzlei` | `/dashboard/admin/kanzlei` | admin |
| `/dashboard/settings/ai-model` | `/dashboard/admin/ai-model` | admin |
| `/dashboard/ai-quality` | `/dashboard/admin/ai-quality` | admin |
| `/dashboard/deep-analysis` | `/dashboard/admin/deep-analysis` | admin |
| `/dashboard/translate` | `/dashboard/admin/translate` | admin |
| `/dashboard/anonymize` | `/dashboard/admin/anonymize` | admin |
| `/dashboard/autonomous` | `/dashboard/admin/autonomous` | admin |
| `/dashboard/rag-eval` | `/dashboard/admin/rag-eval` | admin |
| `/dashboard/monitoring` | `/dashboard/admin/monitoring` | admin |
| `/dashboard/judgements-sync` | `/dashboard/admin/judgements-sync` | admin |

## Risiko
- **Bookmarks/Links brechen** — externe Links, Browser-Bookmarks, E-Mails
- **Tests brechen** — E2E-Tests die die alten URLs verwenden
- **Sidebar-Pfade** — alle `href` Werte in sidebar.tsx müssen aktualisiert werden
- **Badges-Route** — Badge-Pfade in `src/app/api/dashboard/badges/route.ts`
- **Redirects** — alte URLs müssen auf neue weiterleiten (Next.js `redirect()`)

## Sichere Umsetzung (3 Phasen)

### Phase 1: Redirect-Layer (sicher, nicht-destruktiv)
- In jeder alten Route einen `redirect()` zur neuen Route einfügen
- Alte Routes bleiben funktional (leiten nur weiter)
- Keine Bookmarks brechen

### Phase 2: Routes physisch verschieben
- `src/app/dashboard/api-keys/` → `src/app/dashboard/admin/api-keys/`
- Sidebar `href` Werte aktualisieren
- Badge-Pfade aktualisieren
- E2E-Test-Pfade aktualisieren

### Phase 3: Redirects entfernen (nach 30 Tagen)
- Alte Redirect-Routes löschen
- Cleanup

## Aufwand
- Phase 1: ~30 Min (11 Redirects)
- Phase 2: ~2 Std (11 Verschiebungen + Sidebar + Badges + Tests)
- Phase 3: ~15 Min (Cleanup)

## Empfehlung
NUR Phase 1 jetzt machen — Redirects sind sicher und nicht-destruktiv.
Phase 2 erst wenn bestätigt ist dass keine externen Links mehr auf die
alten URLs zeigen.
