# Offline-Sync — Konflikt- und Retry-Policy

Status: implementiert · Quelle: `src/lib/offline-store.ts`, `src/lib/use-mutation.ts`, `src/lib/use-offline-sync.ts`

## Architektur

| Ebene             | Mechanismus                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Reads**         | `useOfflineSync` — fetch → IndexedDB-Cache; bei Netzfehler Cache-Fallback (`isOffline: true`) |
| **Writes**        | `useMutationQueue.mutate` — online: direkt; offline: `enqueueMutation` in IndexedDB           |
| **Replay**        | `syncPending` beim `online`-Event + manuell aus dem Sync-Banner                               |
| **Datei-Uploads** | eigene Queue (`getPendingFileUploads`), gleiches Retry-Regime                                 |

## Konflikt-Policy: Detect-and-Reject bei `updatePage`

Queud Mutations werden **in `createdAt`-Reihenfolge** replayed:

- `updatePage` → vor dem Replay `getPage`: ist `updated_at` **nach**
  `mut.createdAt` **und vor Sync-Start** geändert worden, hat ein externer
  Edit stattgefunden → die Offline-Änderung wird **verworfen und gemeldet**
  (`lastError` im Sync-Banner, mit Slug). Kein stilles Überschreiben.
  Writes aus dem eigenen Replay (`updated_at > syncStart`) zählen nicht
  als Konflikt — sonst würde ein zweites eigenes Queued-Update auf
  derselben Seite fälschlich verwarfen.
- `deletePage` → 404 wird als **Tombstone** behandelt (Erfolg, kein Retry).
- `createPage` → bei Slug-Kollision entscheidet der Server (bestehendes
  Dedup/Conflict-Verhalten der Brain-API).

**Grenzen:** die Prüfung ist heuristisch (Zeitvergleich, kein ETag) —
eine externe Änderung _während_ des Replays (nach Sync-Start) wird nicht
erkannt. Echte Optimistic Concurrency (Version/If-Match auf `updatePage`)
bleibt der nächste Schritt, wenn Multi-Gerät-Edit häufig wird.

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
