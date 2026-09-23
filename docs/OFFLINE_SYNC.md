# Offline-Sync — Konflikt- und Retry-Policy

Status: implementiert · Quelle: `src/lib/offline-store.ts`, `src/lib/use-mutation.ts`, `src/lib/use-offline-sync.ts`

## Architektur

| Ebene             | Mechanismus                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Reads**         | `useOfflineSync` — fetch → IndexedDB-Cache; bei Netzfehler Cache-Fallback (`isOffline: true`) |
| **Writes**        | `useMutationQueue.mutate` — online: direkt; offline: `enqueueMutation` in IndexedDB           |
| **Replay**        | `syncPending` beim `online`-Event + manuell aus dem Sync-Banner                               |
| **Datei-Uploads** | eigene Queue (`getPendingFileUploads`), gleiches Retry-Regime                                 |

## Konflikt-Policy: Last-Write-Wins

Queud Mutations werden **in `createdAt`-Reihenfolge** replayed und
überschreiben den Server-Stand ohne Versionsprüfung:

- `updatePage` → `api.brain.updatePage` — kein `If-Match`/ETag, kein Merge.
  Gewinnt die zuletzt replayed Mutation (spätestes `createdAt`).
- `deletePage` → 404 wird als **Tombstone** behandelt (Erfolg, kein Retry).
- `createPage` → bei Slug-Kollision entscheidet der Server (bestehendes
  Dedup/Conflict-Verhalten der Brain-API).

**Bewusste Entscheidung:** juristische Kurz-Edits sind idempotent genug
für LWW; echte Kollisionserkennung (ETag, 3-way-merge) wäre der nächste
Schritt, wenn Multi-Gerät-Edit auf derselben Akte häufig wird.

## Retry & Drop

- `MAX_RETRIES = 5` pro Mutation/Upload.
- Bei Überschreiten wird der Eintrag **verworfen** — aber **nicht
  still**: `syncPending` setzt `lastError`, der `mobile-sync-banner`
  zeigt „N Offline-Änderung(en) konnten nicht synchronisiert werden".
- Einzelne Fehlversuche: `retries++`, Eintrag bleibt in der Queue.

## Fehler-Transparenz

- IndexedDB-Fehler laufen über `setOfflineErrorReporter` → `lastError`.
- Banner (`src/components/mobile/mobile-sync-banner.tsx`): pendingCount,
  syncing-Spinner, danger-Banner bei `lastError`, Dismiss nur ohne Fehler.
