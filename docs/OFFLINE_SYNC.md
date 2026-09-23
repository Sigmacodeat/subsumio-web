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

## Queue-Abdeckung

Alle Domain-Objekte (Akten, Fristen, Aufgaben, Kontakte, Notizen) sind
Brain-Pages — `createPage`/`updatePage`/`deletePage` decken die gesamte
Offline-Queue ab. **Bewusst NICHT queuebar:** Mutations-Routen mit
serverseitiger Live-Validierung (z. B. `PATCH /api/invoices/[slug]` mit
GoBD/§ 132 BAO-Immutability-Check) — ein offline gequeueter Statuswechsel
würde ein falsches „gebucht"-Versprechen erzeugen, die Prüfung braucht
Live-Server-State.

## Dedizierte Konflikt-Ansicht

`/dashboard/sync` listet ALLE Konflikte (Banner/Sidebar kappen bei 3)
mit Feld-Diff pro Konflikt: lokaler Payload vs. Server-Version
(`diffConflictFields` in `src/lib/conflict-diff.ts`) — title, content
(Zeichenzahl) und pro-Key Frontmatter-Vergleich. Auflösung wie im
Banner: Meine senden / Kopie (createPage) / Verwerfen.

## SWR in useOfflineSync

`useOfflineSync` zeigt den Cache sofort (`isStale: true`), lädt dann
fresh nach — schneller erster Paint auch online. Fetch-Fehler behält
Cache + `isStale`; ohne Cache wie bisher `error`.
