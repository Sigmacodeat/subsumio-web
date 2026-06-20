# Fix-Prompt 3: P3-Enhancements — Subsumio SaaS-Applikationsschicht

> **Grundlage:** Audit Report 3 + P0/P1/P2 Fixes alle erledigt
> **Status:** System ist Production-Ready für alle Kern-Flows
> **Ziel:** P3-Enhancements implementieren → Score von ~80% auf >90%
> **Modus:** Code-Änderungen im Editor, jede Änderung mit Code-Beleg, keine Mocks

---

## P3-1: Env-Var-Prefix Migration `SIGMABRAIN_*` → `SUBSUMIO_*`

**Problem:** 12+ Env-Vars verwenden `SIGMABRAIN_*` Prefix — Branding-Inkonsistenz. User-facing UI ist clean, aber Infrastruktur nicht.

**Ansatz:** Backward-compatible Migration — neue `SUBSUMIO_*` Vars als Primary, `SIGMABRAIN_*` als Fallback.

**Betroffene Env-Vars (aus `.env.example`):**

| Aktuell | Neu | Verwendung |
|---------|-----|------------|
| `SIGMABRAIN_API_URL` | `SUBSUMIO_API_URL` | Engine URL |
| `SIGMABRAIN_WEB_API_KEY` | `SUBSUMIO_WEB_API_KEY` | Shared Secret |
| `SIGMABRAIN_INTERNAL_SECRET` | `SUBSUMIO_INTERNAL_SECRET` | Service-to-Service |
| `SIGMABRAIN_AUTH_DATABASE_URL` | `SUBSUMIO_AUTH_DATABASE_URL` | Postgres URL |
| `SIGMABRAIN_ENCRYPTION_KEY` | `SUBSUMIO_ENCRYPTION_KEY` | AES-256-GCM Key |
| `SIGMABRAIN_DATA_DIR` | `SUBSUMIO_DATA_DIR` | File-based storage |
| `SIGMABRAIN_DEMO_BRAIN` | `SUBSUMIO_DEMO_BRAIN` | Demo brain ID |
| `SIGMABRAIN_BRAIN` | `SUBSUMIO_BRAIN` | Default brain (sollte entfernt werden — P2-4 fix) |

**Implementierung:**

1. **Helper-Funktion** in `src/lib/env.ts` (neu):
```ts
// Backward-compatible env var resolution: SUBSUMIO_* first, SIGMABRAIN_* fallback
export function env(key: string): string | undefined {
  const subsumioKey = key.replace("SIGMABRAIN_", "SUBSUMIO_");
  return process.env[subsumioKey] ?? process.env[key];
}
```

2. **Alle Dateien aktualisieren** — ersetze `process.env.SIGMABRAIN_*` mit `env("SIGMABRAIN_*")`:
   - `src/lib/engine.ts` — `SIGMABRAIN_API_URL`, `SIGMABRAIN_WEB_API_KEY`
   - `src/lib/encryption.ts` — `SIGMABRAIN_ENCRYPTION_KEY`
   - `src/lib/auth/store.ts` — `SIGMABRAIN_AUTH_DATABASE_URL`
   - `src/lib/auth/lockout.ts` — `SIGMABRAIN_DATA_DIR`
   - `src/lib/auth/rate-limit.ts` — `SIGMABRAIN_DATA_DIR`
   - `src/app/api/legal/analyze/route.ts` — `SIGMABRAIN_INTERNAL_SECRET`
   - `src/app/api/demo/route.ts` — `SIGMABRAIN_API_URL`, `SIGMABRAIN_DEMO_BRAIN`
   - Alle weiteren Vorkommen (grep nach `SIGMABRAIN_`)

3. **`.env.example` aktualisieren:**
   - Neue `SUBSUMIO_*` Vars als Primary
   - `SIGMABRAIN_*` als "Deprecated — backward compat" kommentiert
   - Migration-Guide in Kommentar

4. **Dokumentation:** Migration-Note in `CHANGELOG.md`

**Akzeptanzkriterien:**
- [ ] `src/lib/env.ts` existiert mit `env()` Helper
- [ ] Alle `process.env.SIGMABRAIN_*` durch `env("SIGMABRAIN_*")` ersetzt
- [ ] `.env.example` zeigt `SUBSUMIO_*` als Primary
- [ ] Bestehende `SIGMABRAIN_*` Env-Vars funktionieren weiterhin (backward compat)
- [ ] `grep -r "SIGMABRAIN_" src/` zeigt nur noch Fallback-Strings in `env.ts`
- [ ] CHANGELOG-Eintrag

---

## P3-2: WS-Backend für Real-time Collaboration

**Problem:** `src/lib/realtime.ts` ist implementiert aber `NEXT_PUBLIC_WS_URL` ist nicht konfiguriert → Real-time deaktiviert.

**Ansatz:**轻量 WS-Server als separate Route oder externer Service.

**Option A: Vercel Serverless WS (begrenzt)**
- Vercel unterstützt keine persistent WS-Connections in Serverless
- Alternative: Pusher, Ably, oder Supabase Realtime

**Option B: Eigener WS-Server (Hetzner/VPS)**
- Node.js WS-Server auf Port 8080
- Redis Pub/Sub für Multi-Instance
- Auth via Session-Cookie

**Option C: Server-Sent Events (SSE) — Vercel-kompatibel**
- Statt WS: SSE für Server→Client (one-way)
- POST für Client→Server (bereits vorhanden via API routes)
- Keine persistent Connection nötig für Serverless

**Empfohlen: Option C (SSE) — Vercel-native, keine externe Infrastruktur**

**Implementierung:**

1. **Neue Datei:** `src/app/api/realtime/sse/route.ts` — SSE Endpoint
```ts
import { createHandler } from "@/lib/api-handler";

export const GET = createHandler(
  { action: "brain.read" },
  async (ctx, _body, _query, req) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Heartbeat every 30s
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }, 30_000);

        // TODO: Subscribe to Redis/Postgres LISTEN for events
        // For now: just heartbeat (connection alive)

        req.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  },
);
```

2. **`src/lib/realtime.ts` erweitern:**
- Fallback: Wenn `NEXT_PUBLIC_WS_URL` nicht gesetzt → nutze SSE via `EventTarget` auf `/api/realtime/sse`
- SSE Events: `case-updated`, `deadline-changed`, `note-added`, `invoice-created`
- Auto-reconnect mit Backoff (wie bisher)

3. **Event-Trigger in API-Routes:**
- Nach jedem `logAudit()` → publish Event an SSE-Channel (brainId-scoped)
- Postgres `LISTEN/NOTIFY` oder Redis `PUBLISH` für Multi-Instance

4. **`.env.example`:**
```
# Real-time: WebSocket URL (optional, für externen WS-Server)
# Wenn nicht gesetzt: SSE wird verwendet (Vercel-native)
NEXT_PUBLIC_WS_URL=
```

**Akzeptanzkriterien:**
- [ ] `GET /api/realtime/sse` returnt SSE-Stream mit Heartbeat
- [ ] `realtime.ts` nutzt SSE als Fallback wenn WS_URL nicht gesetzt
- [ ] Events werden bei Case-Update, Deadline-Change, Note-Add getriggert
- [ ] Auto-Reconnect funktioniert
- [ ] Multi-Tenant: Events sind brainId-scoped (User bekommt nur eigene Events)
- [ ] Graceful Degradation: Wenn weder WS noch SSE → kein Error, nur kein Real-time

---

## P3-3: Comment-Delete + @mention + Reply-Struktur

**Problem:** `src/lib/comments.ts` hat nur `addComment` + `listComments` — keine Delete, keine @mention, keine Reply-Struktur.

**Datei:** `src/lib/comments.ts`

**Implementierung:**

### 1. Comment-Delete
```ts
export async function deleteComment(opts: {
  commentId: string;
  brainId: string;
  userId: string;
  userRole: KanzleiRole;
}): Promise<{ success: boolean }> {
  // Nur Author oder Admin darf löschen
  const comment = await getCommentById(opts.commentId, opts.brainId);
  if (!comment) throw new AppError("Comment not found", { code: "not_found", statusCode: 404 });
  
  const canDelete = comment.userId === opts.userId || opts.userRole === "admin";
  if (!canDelete) throw new AppError("Not authorized", { code: "forbidden", statusCode: 403 });
  
  // Soft-delete: mark as deleted, keep for audit trail
  await updateComment(opts.commentId, opts.brainId, {
    deletedAt: new Date().toISOString(),
    body: "[gelöscht]",
  });
  
  return { success: true };
}
```

### 2. Reply-Struktur
```ts
// Erweitere addComment um parentId
export async function addComment(opts: {
  brainId: string;
  pageSlug: string;
  userId: string;
  userName: string;
  body: string;
  parentId?: string;  // NEU — für Replies
  threadId?: string;  // bestehend — für Thread-Gruppierung
}): Promise<Comment> {
  // Wenn parentId gesetzt: validiere dass parent existiert und gleiche pageSlug
  // Generiere threadId wenn nicht gesetzt (neuer Thread) oder übernehme parent's threadId
}
```

### 3. @mention-Notifications
```ts
// In addComment: parse @mentions aus body
function extractMentions(body: string): string[] {
  const regex = /@(\w+)/g;
  const matches = body.match(regex);
  return matches ? matches.map(m => m.slice(1)) : [];
}

// Nach addComment: create notification for each mentioned user
export async function createMentionNotifications(opts: {
  commentId: string;
  mentionedUserNames: string[];
  brainId: string;
  pageSlug: string;
  authorName: string;
}): Promise<void> {
  // Resolve mentioned names to user IDs in same brain
  // Create notification entries (new table or brain pages)
  // Trigger real-time event if SSE/WS active
}
```

### 4. Neue API-Routes
- `DELETE /api/comments/[id]` — Comment löschen
- `POST /api/comments` — erweitert um `parentId` und `mentions`

### 5. Notification-System
- Neue Tabelle: `subsumio_notifications` (userId, brainId, type, data, readAt, createdAt)
- Neue API: `GET /api/notifications`, `POST /api/notifications/[id]/read`
- Dashboard: Notification-Bell in Topbar mit Badge

**Akzeptanzkriterien:**
- [ ] `deleteComment()` in `comments.ts` — Soft-Delete mit Author/Admin-Check
- [ ] `addComment()` unterstützt `parentId` für Replies
- [ ] `@mention` Parsing in Comment-Body
- [ ] `subsumio_notifications` Tabelle für Mention-Notifications
- [ ] `DELETE /api/comments/[id]` Route
- [ ] `GET /api/notifications` Route
- [ ] Notification-Bell in Topbar mit unread-count Badge
- [ ] Unit-Test: `src/lib/comments.test.ts` (create, delete, reply, mention)

---

## P3-4: Custom-Dashboard-Widgets

**Problem:** Dashboard-Startseite (`/dashboard/page.tsx`) ist statisch — keine Personalisierung.

**Dateien:**
- `src/app/dashboard/page.tsx` — Startseite
- Neue Datei: `src/lib/dashboard-widgets.ts` — Widget-Registry
- Neue Datei: `src/components/dashboard/widgets/` — Widget-Komponenten

**Implementierung:**

### 1. Widget-Registry
```ts
// src/lib/dashboard-widgets.ts
export interface WidgetDef {
  id: string;
  title: string;
  description: string;
  defaultSize: "sm" | "md" | "lg";
  category: "stats" | "actions" | "timeline" | "legal";
  render: () => Promise<React.ReactNode>;
}

export const WIDGET_REGISTRY: WidgetDef[] = [
  { id: "stats-cases", title: "Akten-Statistik", ... },
  { id: "stats-deadlines", title: "Fristen-Übersicht", ... },
  { id: "recent-queries", title: "Letzte Anfragen", ... },
  { id: "team-activity", title: "Team-Aktivität", ... },
  { id: "billing-summary", title: "Abrechnung", ... },
  { id: "brain-health", title: "Brain-Health", ... },
  { id: "quick-actions", title: "Schnellaktionen", ... },
  { id: "upcoming-deadlines", title: "Anstehende Fristen", ... },
];
```

### 2. User-Preferences
- Speichere Widget-Konfiguration pro User (welche Widgets, Reihenfolge, Größe)
- Storage: `subsumio_user_preferences` Tabelle oder Brain-Page
- API: `GET/PUT /api/dashboard/preferences`

### 3. Drag-and-Drop Layout
- `dnd-kit` oder `react-grid-layout` für Widget-Anordnung
- Resize via CSS Grid (sm=1col, md=2col, lg=3col)
- "Customize" Button → Edit-Mode → Drag/Resize → Save

### 4. Default-Layout
- Neue User bekommen Default-Layout basierend auf `industry` (law firm vs tax vs corporate)
- Admin sieht andere Widgets als Lawyer/Assistant

**Akzeptanzkriterien:**
- [ ] `WIDGET_REGISTRY` mit 6+ Widgets
- [ ] User kann Widgets hinzufügen/entfernen (Customize-Mode)
- [ ] Drag-and-Drop Reihenfolge
- [ ] Preferences werden gespeichert (pro User)
- [ ] Default-Layout basierend auf Role/Industry
- [ ] Responsive: 1-col mobile, 2-col tablet, 3-col desktop
- [ ] Empty-State: "Keine Widgets ausgewählt — Customize klicken"
- [ ] API: `GET/PUT /api/dashboard/preferences`

---

## ZUSAMMENFASSUNG: P3 Fix-Reihenfolge

| Reihenfolge | Fix | Aufwand | Impact |
|-------------|-----|---------|--------|
| 1 | **P3-1:** Env-Var Migration | L (3h) | Branding-Konsistenz |
| 2 | **P3-2:** SSE Real-time | M (2h) | Collaboration |
| 3 | **P3-3:** Comments + Notifications | M (3h) | Collaboration |
| 4 | **P3-4:** Custom Widgets | L (4h) | Personalisierung |

**Gesamtaufwand:** ~12h für alle P3 Fixes

---

## ERWARTETES ERGEBNIS

Nach allen P3 Fixes sollte der Score auf >90% steigen:

| Bereich | Nach P2 (~80%) | Nach P3 | Grund |
|---------|----------------|---------|-------|
| Branding | 85% | 95% | +Env-Var Migration |
| Collaboration | 45% | 80% | +SSE, +Comments, +Notifications |
| Frontend | 85% | 92% | +Custom Widgets |
| **Gesamt** | **~80%** | **~90%** | |
