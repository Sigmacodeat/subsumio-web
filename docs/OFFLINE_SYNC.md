# Offline-Sync — Konflikt- und Retry-Policy

Status: implementiert · Quelle: `src/lib/offline-store.ts`, `src/lib/use-mutation.ts`, `src/lib/use-offline-sync.ts`

## Architektur

| Ebene             | Mechanismus                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Reads**         | `useOfflineSync` — fetch → IndexedDB-Cache; bei Netzfehler Cache-Fallback (`isOffline: true`) |
| **Writes**        | `useMutationQueue.mutate` — online: direkt; offline: `enqueueMutation` in IndexedDB           |
| **Replay**        | `syncPending` beim `online`-Event + manuell aus dem Sync-Banner                               |
| **Datei-Uploads** | eigene Queue (`getPendingFileUploads`), gleiches Retry-Regime                                 |

## Konflikt-Policy: Detect-and-Resolve

Queud Mutations werden **in `createdAt`-Reihenfolge** replayed:

- `updatePage` → vor dem Replay `getPage`: ist `updated_at` **mehr als
  `SKEW_TOLERANCE_MS` (60 s) nach** `mut.createdAt` **und vor Sync-Start
  (+ Skew-Toleranz)** geändert worden, hat ein externer Edit
  stattgefunden → die Mutation wird als **`conflicted` markiert und
  bleibt in der Queue**. Das Sync-Banner zeigt den Konflikt mit Slug und
  bietet „Meine Version senden" (bewusstes Überschreiben) / „Verwerfen" /
  „Ansehen" (Server-Stand). Bei `createPage`-Kollisionen zusätzlich
  „Als Kopie speichern" (legt unter `<slug>-2` an). Kein stilles
  Überschreiben, kein stiller Datenverlust. Die Konfliktliste ist in
  Mobile-Banner und Desktop-Sidebar (`SyncStatus`) sichtbar.
  Writes aus dem eigenen Replay (`updated_at > syncStart`) zählen nicht
  als Konflikt — sonst würde ein zweites eigenes Queued-Update auf
  derselben Seite fälschlich verwarfen.
- `createPage` → existiert der Slug bereits auf dem Server (`getPage`
  200), wird die Mutation ebenfalls `conflicted` — ein Create würde den
  bestehenden Inhalt überschreiben.
- `deletePage` → 404 wird als **Tombstone** behandelt (Erfolg, kein Retry).

**Grenzen:** die Prüfung ist heuristisch (Zeitvergleich mit 60-s-Skew-
Toleranz, kein ETag) — eine externe Änderung _während_ des Replays
(nach Sync-Start) wird nicht erkannt; bei Server-Uhr weit hinter der
Client-Uhr können externe Edits unterschlagen werden (fail-Richtung wie
bisheriges LWW). Echte Optimistic Concurrency (Version/If-Match auf
`updatePage`) bleibt der nächste Schritt, wenn Multi-Gerät-Edit häufig
wird.

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
