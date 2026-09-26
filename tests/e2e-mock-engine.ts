/**
 * Mock Engine for E2E Tests
 * ==========================
 * Lightweight HTTP server that mimics the Subsumio Engine API
 * for Playwright E2E tests. Eliminates the dependency on a real
 * GBrain engine instance, making E2E tests deterministic and fast.
 *
 * Endpoints covered:
 *   - GET    /api/pages           (list)
 *   - POST   /api/pages           (create)
 *   - GET    /api/pages/:slug     (read)
 *   - PATCH  /api/pages/:slug     (update)
 *   - DELETE /api/pages/:slug     (delete)
 *   - GET    /api/search          (search)
 *   - POST   /api/think           (SSE stream)
 *   - GET    /api/graph           (graph data)
 *   - POST   /api/legal/analyze   (JSON)
 *   - POST   /api/legal/contract-redline (JSON)
 *   - POST   /api/legal/ai-deadlines (JSON)
 *   - GET    /api/brains          (list brains)
 *   - GET    /api/stats           (dashboard stats)
 *   - GET    /api/audit           (audit log)
 *   - GET    /api/queries/recent  (recent queries)
 *   - GET    /health              (health check)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  applyArrayAppend,
  applyArrayMutate,
  ifAbsentRejection,
  isoDaysFromNow,
  listWindow,
  mockConflictCheck,
} from "./e2e-mock-shared";

const PORT = parseInt(process.env.MOCK_ENGINE_PORT || "3001", 10);

// ── In-memory store ───────────────────────────────────────────────────

interface MockPage {
  slug: string;
  title: string;
  content: string;
  type: string;
  frontmatter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const pages = new Map<string, MockPage>();

// ── Demo sources (public live demo) ──────────────────────────────────
// Source-scoped page stores for `demo-*` sources: the `demo-template`
// source is seeded from src/content/demo-matter.ts at startup; each
// /demo session clones it into its own `demo-s-*` source via
// POST /api/sources/clone. Requests carrying `x-subsumio-source: demo-*`
// are served from these maps — the flat `pages` map above stays the
// default tenant fixture.

const sourcePages = new Map<string, Map<string, MockPage>>();

function srcStore(source: string): Map<string, MockPage> {
  let m = sourcePages.get(source);
  if (!m) {
    m = new Map();
    sourcePages.set(source, m);
  }
  return m;
}

function requestSource(req: IncomingMessage): string {
  const h = req.headers["x-subsumio-source"];
  return typeof h === "string" ? h : "";
}

function isDemoSource(source: string): boolean {
  return source.startsWith("demo-template") || source.startsWith("demo-s-");
}

async function seedDemoTemplate() {
  try {
    const { demoMatterPages, demoTemplateSource } = await import("../src/content/demo-matter");
    const now = new Date().toISOString();
    for (const jur of ["at", "de"] as const) {
      const store = srcStore(demoTemplateSource(jur));
      for (const p of demoMatterPages(new Date(), jur)) {
        store.set(p.slug, {
          slug: p.slug,
          title: p.title,
          content: p.content,
          type: p.type,
          frontmatter: p.frontmatter,
          created_at: now,
          updated_at: now,
        });
      }
      console.log(`[mock] demo template ${jur} seeded: ${store.size} pages`);
    }
  } catch (e) {
    console.warn("[mock] demo template seed failed:", e);
  }
}
void seedDemoTemplate();

// Seed with a few pages
function seedPages() {
  const now = new Date().toISOString();
  const seed = [
    {
      slug: "test/seed-case-1",
      title: "Musterfall GmbH vs. Schuldner AG",
      type: "legal_case",
      content: "Sachverhalt: Vertragsbruch durch Lieferverzug.",
    },
    {
      slug: "test/seed-memo-1",
      title: "Rechtsgutachten zum Lieferverzug",
      type: "memo",
      content: "Gutachten zur Frage des Lieferverzugs.",
    },
    {
      slug: "test/seed-deadline-1",
      title: "Klagefrist Musterfall",
      type: "deadline",
      content: "Frist endet am 31.12.2026.",
    },
  ];
  for (const s of seed) {
    pages.set(s.slug, {
      ...s,
      frontmatter: {
        case_number: `SMK-${Date.now()}`,
        status: "open",
        legal_area: "Zivilrecht",
        priority: "high",
        version: 1,
      },
      created_at: now,
      updated_at: now,
    });
  }
}

seedPages();

// ── Helpers ───────────────────────────────────────────────────────────

function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown,
  extraHeaders: Record<string, string> = {}
) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...extraHeaders,
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  });
  res.end(body);
}

function sendSse(res: ServerResponse, events: string[]) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  for (const evt of events) {
    res.write(`data: ${JSON.stringify({ chunk: evt })}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
  });
}

function parseUrl(url: string): { path: string; query: URLSearchParams } {
  const [path, qs] = url.split("?");
  return { path, query: new URLSearchParams(qs || "") };
}

function computeMockDeadlineStatus(
  dueDate: string,
  existingStatus?: string,
  vorfristDate?: string,
  heute?: string
): string {
  if (existingStatus === "done" || existingStatus === "completed") return "done";
  const today = heute || new Date().toISOString().slice(0, 10);
  const due = dueDate.slice(0, 10);
  const diffDays = Math.ceil(
    (new Date(due).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "critical";
  if (vorfristDate) {
    const vfDiff = Math.ceil(
      (new Date(vorfristDate.slice(0, 10)).getTime() - new Date(today).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (vfDiff <= 0 && diffDays > 3) return "vorfrist";
  }
  if (diffDays <= 7) return "warning";
  return "pending";
}

// ── Route handler ─────────────────────────────────────────────────────

async function handleReq(req: IncomingMessage, res: ServerResponse) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    });
    res.end();
    return;
  }

  const { path, query } = parseUrl(req.url || "/");

  // Source-scoped page store: demo sessions (x-subsumio-source: demo-*)
  // read/write their own clone; everything else uses the global fixture.
  const reqSrc = requestSource(req);
  const reqPages = isDemoSource(reqSrc) ? srcStore(reqSrc) : pages;

  // ── Health ──────────────────────────────────────────────────────────
  if (path === "/health" || path === "/api/health") {
    return sendJson(res, 200, { status: "ok", engine: "mock", version: "test" });
  }

  // ── Pages: list ─────────────────────────────────────────────────────
  if (path === "/api/pages" && req.method === "GET") {
    const typeFilter = query.get("type");
    const q = query.get("q") || "";
    let items = Array.from(reqPages.values());
    if (typeFilter) items = items.filter((p) => p.type === typeFilter);
    if (q)
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(q.toLowerCase()) ||
          p.content.toLowerCase().includes(q.toLowerCase()) ||
          p.slug.toLowerCase().includes(q.toLowerCase())
      );
    // Like the engine: max. 100 rows, offset or keyset cursor (x-next-cursor).
    const window = listWindow(items, query);
    return sendJson(
      res,
      200,
      window.items,
      window.nextCursor ? { "x-next-cursor": window.nextCursor } : {}
    );
  }

  // ── Pages: create ───────────────────────────────────────────────────
  if (path === "/api/pages" && req.method === "POST") {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const slug = body.slug || `test/page-${Date.now()}`;
    const now = new Date().toISOString();

    const store = reqPages;

    // Create-only write: a taken slug is refused like the engine does.
    const taken = ifAbsentRejection(body, store.has(slug));
    if (taken) return sendJson(res, taken.status, taken.body);

    // Support merge:true (used by enginePatchPage) — merge frontmatter into existing page
    if (body.merge && store.has(slug)) {
      const existing = store.get(slug)!;
      const updated: MockPage = {
        ...existing,
        title: body.title || existing.title,
        content: body.content ?? existing.content,
        type: body.type || existing.type,
        frontmatter: {
          ...existing.frontmatter,
          ...(body.frontmatter || {}),
        },
        updated_at: now,
      };
      store.set(slug, updated);
      return sendJson(res, 200, updated);
    }

    const page: MockPage = {
      slug,
      title: body.title || "Untitled",
      content: body.content || "",
      type: body.type || "note",
      frontmatter: body.frontmatter || { version: 1 },
      created_at: now,
      updated_at: now,
    };
    store.set(slug, page);
    return sendJson(res, 200, page);
  }

  // ── Sources: clone + purge (public live demo) ──────────────────────
  if (path === "/api/sources/clone" && req.method === "POST") {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const from = String(body.from ?? "");
    const to = String(body.to ?? "");
    const slugs: string[] | null = Array.isArray(body.slugs) ? body.slugs : null;
    const fromStore = sourcePages.get(from);
    if (!from || !to || !fromStore) {
      return sendJson(res, 200, { ok: true, cloned: { pages: 0 } });
    }
    const toStore = srcStore(to);
    let n = 0;
    for (const [slug, p] of fromStore) {
      if (slugs && !slugs.includes(slug)) continue;
      if (!toStore.has(slug)) {
        toStore.set(slug, { ...p });
        n++;
      }
    }
    return sendJson(res, 200, { ok: true, cloned: { pages: n } });
  }

  if (path === "/api/source-data" && req.method === "DELETE") {
    const src = requestSource(req);
    const n = src ? (sourcePages.get(src)?.size ?? 0) : 0;
    if (src) sourcePages.delete(src);
    return sendJson(res, 200, { ok: true, pages_deleted: n });
  }

  // ── Pages: atomic array ops (time entries, expenses, billing) ───────
  if (
    (path === "/api/pages/array-append" || path === "/api/pages/array-mutate") &&
    req.method === "POST"
  ) {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const target = reqPages.get(String(body.slug ?? ""));
    if (!target) return sendJson(res, 404, { error: "not_found" });
    const field = String(body.field ?? "");
    if (!field) return sendJson(res, 400, { error: "field_required" });
    target.frontmatter = { ...target.frontmatter };
    target.updated_at = new Date().toISOString();
    const result =
      path === "/api/pages/array-append"
        ? applyArrayAppend(
            target.frontmatter,
            target.slug,
            field,
            Array.isArray(body.items) ? body.items : []
          )
        : applyArrayMutate(target.frontmatter, target.slug, field, body);
    return sendJson(res, 200, result);
  }

  // ── Pages: by slug ──────────────────────────────────────────────────
  const pageMatch = path.match(/^\/api\/pages\/(.+)$/);
  if (pageMatch) {
    const slug = decodeURIComponent(pageMatch[1]);
    const store = reqPages;

    if (req.method === "GET") {
      const page = store.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      return sendJson(res, 200, page);
    }

    // PUT = upsert (post-upload outbox, idempotent task pages). Creates the
    // page when missing, merges frontmatter when present — mirrors the real
    // engine's PUT /api/pages/:slug semantics.
    if (req.method === "PUT") {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const now = new Date().toISOString();
      const existing = store.get(slug);
      const page: MockPage = {
        slug,
        title: body.title || existing?.title || "Untitled",
        content: body.content ?? existing?.content ?? "",
        type: body.type || existing?.type || "note",
        frontmatter: {
          ...(existing?.frontmatter || {}),
          ...(body.frontmatter || { version: 1 }),
        },
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      store.set(slug, page);
      return sendJson(res, 200, page);
    }

    if (req.method === "PATCH") {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const page = store.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });

      // Server-side guard: block modifications to archived cases unless it's a restore
      const isRestore = !!body.frontmatter?.restored_at && body.frontmatter?.status !== "archived";
      if (!isRestore && page.frontmatter?.status === "archived") {
        return sendJson(res, 403, {
          error: "case_archived",
          message: "Akte ist archiviert — zuerst wiederherstellen.",
        });
      }

      const updated = {
        ...page,
        ...body,
        slug, // slug is immutable
        frontmatter: { ...page.frontmatter, ...body.frontmatter },
        updated_at: new Date().toISOString(),
      };
      store.set(slug, updated);

      // Restore cascade: un-tombstone documents when case is restored
      if (body.frontmatter?.restored_at && body.frontmatter?.status !== "archived") {
        // Add restore timeline event
        const existingTimeline =
          (updated.frontmatter?.timeline_events as Array<Record<string, unknown>>) || [];
        updated.frontmatter = {
          ...updated.frontmatter,
          timeline_events: [
            ...existingTimeline,
            {
              id: `tl-restore-${Date.now()}`,
              timestamp: new Date().toISOString(),
              type: "status_change",
              title: "Akte wiederhergestellt",
              description: "Wiederhergestellt von test@e2e.local",
              actor: "test@e2e.local",
            },
          ],
        };
        store.set(slug, updated);

        for (const [docSlug, docPage] of store.entries()) {
          if (
            docPage.type === "document" &&
            docPage.frontmatter?.case_slug === slug &&
            docPage.frontmatter?.status === "tombstoned"
          ) {
            docPage.frontmatter = {
              ...docPage.frontmatter,
              status: "active",
              tombstone_reason: null,
            };
            store.set(docSlug, docPage);
          }
        }
      }

      return sendJson(res, 200, updated);
    }

    if (req.method === "DELETE") {
      const page = store.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      // Soft-delete: if legal_case, archive instead of delete
      if (page.type === "legal_case") {
        // Guard: already archived
        if (page.frontmatter?.status === "archived") {
          return sendJson(res, 409, {
            error: "already_archived",
            message: "Akte ist bereits archiviert.",
          });
        }
        const existingTimeline =
          (page.frontmatter?.timeline_events as Array<Record<string, unknown>>) || [];
        page.frontmatter = {
          ...page.frontmatter,
          status: "archived",
          archived_at: new Date().toISOString(),
          archived_by: "test@e2e.local",
          timeline_events: [
            ...existingTimeline,
            {
              id: `tl-archive-${Date.now()}`,
              timestamp: new Date().toISOString(),
              type: "status_change",
              title: "Akte archiviert",
              description: "Archiviert von test@e2e.local",
              actor: "test@e2e.local",
            },
          ],
        };
        store.set(slug, page);
        // Tombstone cascade: mark all documents with matching case_slug as tombstoned
        for (const [docSlug, docPage] of store.entries()) {
          if (docPage.type === "document" && docPage.frontmatter?.case_slug === slug) {
            docPage.frontmatter = { ...docPage.frontmatter, status: "tombstoned" };
            store.set(docSlug, docPage);
          }
        }
        return sendJson(res, 200, { ok: true, method: "archived", slug });
      }
      // Hard delete for non-case pages
      store.delete(slug);
      return sendJson(res, 200, { ok: true, method: "deleted", slug });
    }
  }

  // ── Search ──────────────────────────────────────────────────────────
  if (path === "/api/search" && req.method === "GET") {
    const q = query.get("q") || "";
    const limit = parseInt(query.get("limit") || "10", 10);

    // Support frontmatter field:value query syntax (e.g. "docusign_envelope_id:abc123")
    const fieldMatch = q.match(/^(\w+):(.+)$/);
    let matched: MockPage[];
    if (fieldMatch) {
      const [, field, value] = fieldMatch;
      matched = Array.from(reqPages.values()).filter((p) => {
        const fm = p.frontmatter || {};
        return String(fm[field] ?? "") === value;
      });
    } else {
      matched = Array.from(reqPages.values()).filter(
        (p) =>
          p.title.toLowerCase().includes(q.toLowerCase()) ||
          p.content.toLowerCase().includes(q.toLowerCase()) ||
          p.slug.toLowerCase().includes(q.toLowerCase())
      );
    }
    // Same contract as the real engine's /api/search (server/src/commands/
    // web-api.ts mapSearchResults): a bare array — no { results, total } wrap.
    const results = matched.slice(0, limit).map((p) => ({
      slug: p.slug,
      title: p.title,
      type: p.type,
      frontmatter: p.frontmatter,
      snippet: p.content.slice(0, 200),
      score: 0.9,
    }));
    return sendJson(res, 200, results);
  }

  // ── Think (SSE) ─────────────────────────────────────────────────────
  if (path === "/api/think" && req.method === "POST") {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const queryText = body.query || "";
    const responseChunks = [
      `Basierend auf Ihrer Frage "${queryText.slice(0, 80)}" `,
      `hier eine erste Einschätzung: `,
      `Die relevanten Rechtsgrundlagen finden sich im BGB. `,
      `Ein konkreter Anspruch könnte sich aus § 433 BGB ergeben. `,
      `Hinweis: Dies ist eine KI-generierte Antwort und ersetzt keine anwaltliche Prüfung.`,
    ];
    return sendSse(res, responseChunks);
  }

  // ── Utility completions, streamed and whole (website concierge) ─────
  if ((path === "/api/llm/stream" || path === "/api/llm/complete") && req.method === "POST") {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}") as { purpose?: string };
    // A concierge-shaped answer: sentences with the id of a real knowledge
    // chunk, so the claim check keeps them.
    const answer = JSON.stringify({
      intent: "pricing",
      sentences: [
        { text: "Der Tarif Solo kostet 249 € pro Monat.", sources: ["pricing-overview"] },
        { text: "Der Tarif Kanzlei kostet 1.499 € pro Monat.", sources: ["pricing-overview"] },
      ],
      next_step: "show_pricing",
      suggestions: ["Wie funktioniert die Testphase?"],
      profile: {},
    });
    const result = {
      text: answer,
      model: "mock:model",
      provider: "mock",
      stop_reason: "end_turn",
      usage: { input_tokens: 1200, output_tokens: 90 },
      latency_ms: 5,
      purpose: body.purpose ?? "mock",
      tier: "reasoning",
    };
    if (path === "/api/llm/complete") return sendJson(res, 200, result);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    for (let i = 0; i < answer.length; i += 40) {
      res.write(`data: ${JSON.stringify({ type: "text", text: answer.slice(i, i + 40) })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: "done", result })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  // ── Legal: conflict-check ───────────────────────────────────────────
  if (path === "/api/legal/conflict-check" && req.method === "POST") {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const pSrc = requestSource(req);
    const pStore = isDemoSource(pSrc) ? srcStore(pSrc) : pages;
    // The real engine checker over the mock's pages — same answer shape
    // (severity, explanation, per-hit assessment) the web app requires.
    try {
      return sendJson(res, 200, await mockConflictCheck(pStore.values(), body));
    } catch (err) {
      return sendJson(res, 400, {
        error: "invalid_request",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Legal: analyze ──────────────────────────────────────────────────
  if (path === "/api/legal/analyze" && req.method === "POST") {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const caseSlug = body.caseSlug || body.case_slug || "";
    const aSrc = requestSource(req);
    const aStore = isDemoSource(aSrc) ? srcStore(aSrc) : pages;
    // Writeback suggested_deadlines and suggested_parties to case frontmatter
    if (caseSlug && aStore.has(caseSlug)) {
      const casePage = aStore.get(caseSlug)!;
      const fm = casePage.frontmatter || {};
      const existingDl = Array.isArray(fm.suggested_deadlines) ? fm.suggested_deadlines : [];
      const existingParty = Array.isArray(fm.suggested_parties) ? fm.suggested_parties : [];
      // Dedup by title|due_date and name|role
      const dlKeys = new Set(
        existingDl.map((d: Record<string, unknown>) => `${d.title}|${d.due_date}`)
      );
      const partyKeys = new Set(
        existingParty.map((p: Record<string, unknown>) => `${p.name}|${p.role}`)
      );
      const newDl = [
        ...existingDl,
        ...[
          {
            title: "Klagefrist",
            due_date: isoDaysFromNow(60),
            urgency: "high",
            source: "KI-Analyse",
            confirmed: false,
          },
        ].filter((d) => {
          const k = `${d.title}|${d.due_date}`;
          if (dlKeys.has(k)) return false;
          dlKeys.add(k);
          return true;
        }),
      ];
      const newParty = [
        ...existingParty,
        ...[
          { name: "Klient Müller", role: "client", source: "KI-Analyse", confirmed: false },
          { name: "Gegner Meier", role: "opponent", source: "KI-Analyse", confirmed: false },
        ].filter((p) => {
          const k = `${p.name}|${p.role}`;
          if (partyKeys.has(k)) return false;
          partyKeys.add(k);
          return true;
        }),
      ];
      casePage.frontmatter = { ...fm, suggested_deadlines: newDl, suggested_parties: newParty };
      aStore.set(caseSlug, casePage);
    }
    return sendJson(res, 200, {
      analysis: "Mock-Analyse: Der Vertrag enthält Standardklauseln.",
      issues: [
        { severity: "medium", clause: "§ 3", description: "Lieferfrist unpräzise definiert." },
        { severity: "low", clause: "§ 7", description: "Vertragsstrafe gering bemessen." },
      ],
      recommendation: "Lieferfrist präzisieren und Vertragsstrafe anpassen.",
    });
  }

  // ── Legal: contract-redline ─────────────────────────────────────────
  if (path === "/api/legal/contract-redline" && req.method === "POST") {
    return sendJson(res, 200, {
      clauses: [
        {
          id: "clause-1",
          title: "Lieferfrist",
          original: "Die Lieferung erfolgt binnen angemessener Frist.",
          revised: "Die Lieferung erfolgt binnen 14 Tagen ab Vertragschluss.",
          risk_level: "medium",
          recommendation: "Frist konkretisieren.",
        },
        {
          id: "clause-2",
          title: "Vertragsstrafe",
          original: "Bei Verzug wird eine Vertragsstrafe fällig.",
          revised: "Bei Verzug wird eine Vertragsstrafe in Höhe von 5% des Auftragswerts fällig.",
          risk_level: "low",
          recommendation: "Höhe der Strafe definieren.",
        },
      ],
    });
  }

  // ── Legal: ai-deadlines ─────────────────────────────────────────────
  if (path === "/api/legal/ai-deadlines" && req.method === "POST") {
    return sendJson(res, 200, {
      deadlines: [
        {
          type: "absolute",
          date: isoDaysFromNow(60),
          label: "Klagefrist",
          confidence: 0.95,
          source: "§ 253 ZPO",
        },
      ],
    });
  }

  // ── Graph ───────────────────────────────────────────────────────────
  if (path === "/api/graph" && req.method === "GET") {
    return sendJson(res, 200, {
      nodes: [
        { id: "case-1", label: "Musterfall GmbH vs. Schuldner AG", type: "case" },
        { id: "client-1", label: "Muster GmbH", type: "client" },
        { id: "opp-1", label: "Schuldner AG", type: "opponent" },
        { id: "court-1", label: "LG München", type: "court" },
      ],
      edges: [
        { from: "case-1", to: "client-1", label: "client" },
        { from: "case-1", to: "opp-1", label: "opponent" },
        { from: "case-1", to: "court-1", label: "court" },
      ],
    });
  }

  // ── Brains ──────────────────────────────────────────────────────────
  if (path === "/api/brains" && req.method === "GET") {
    return sendJson(res, 200, [{ id: "test-brain", name: "Test Brain", pages: reqPages.size }]);
  }

  // ── Stats ───────────────────────────────────────────────────────────
  if (path === "/api/stats" && req.method === "GET") {
    return sendJson(res, 200, {
      total_pages: reqPages.size,
      cases: Array.from(reqPages.values()).filter((p) => p.type === "legal_case").length,
      deadlines: Array.from(reqPages.values()).filter((p) => p.type === "deadline").length,
      memos: Array.from(reqPages.values()).filter((p) => p.type === "memo").length,
    });
  }

  // ── Audit ───────────────────────────────────────────────────────────
  if (path === "/api/audit" && req.method === "GET") {
    return sendJson(res, 200, { entries: [], total: 0 });
  }

  // ── Recent queries ──────────────────────────────────────────────────
  if (path === "/api/queries/recent" && req.method === "GET") {
    return sendJson(res, 200, { queries: [] });
  }

  // ── Workflows ───────────────────────────────────────────────────────
  if (path === "/api/workflows" && req.method === "GET") {
    return sendJson(res, 200, { items: [], templates: [] });
  }

  // ── Clause annotations ──────────────────────────────────────────────
  if (path === "/api/clause-annotations" && req.method === "GET") {
    return sendJson(res, 200, { items: [], stats: { total: 0, by_risk: {}, by_status: {} } });
  }

  // ── Pages: batch-list (used by /api/legal/fristen) ──────────────────
  if (path === "/api/pages/batch-list" && req.method === "GET") {
    const types = (query.get("types") || "").split(",").filter(Boolean);
    const limit = parseInt(query.get("limit") || "300", 10);
    const results: Record<string, MockPage[]> = {};
    for (const t of types) {
      results[t] = Array.from(reqPages.values())
        .filter((p) => p.type === t)
        .slice(0, limit);
    }
    return sendJson(res, 200, { results });
  }

  // ── Legal: fristenbuch ──────────────────────────────────────────────
  if (path === "/api/legal/fristenbuch" && req.method === "GET") {
    const caseFilter = query.get("case");
    const heute = query.get("heute") || new Date().toISOString().slice(0, 10);
    const eintraege: Array<Record<string, unknown>> = [];
    for (const p of reqPages.values()) {
      if (p.type === "legal_case") {
        const fm = p.frontmatter || {};
        const deadlines = Array.isArray(fm.deadlines) ? fm.deadlines : [];
        for (const d of deadlines as Array<Record<string, unknown>>) {
          if (caseFilter && p.slug !== caseFilter) continue;
          const dueDate = String(d.due_date || d.date || "");
          if (!dueDate) continue;
          const status = computeMockDeadlineStatus(
            dueDate,
            d.status as string | undefined,
            d.vorfrist_date as string | undefined,
            heute
          );
          eintraege.push({
            case_slug: p.slug,
            datum: dueDate.slice(0, 10),
            frist: d.title || d.description || "Frist",
            rechtsgrundlage: d.law || "",
            folge_bei_versaeumnis: "",
            beleg_on: "",
            ampel: status,
            status,
            vorfrist: d.vorfrist_date || "",
            eskalation: status === "overdue" || status === "critical",
          });
        }
      }
      if (p.type === "legal_deadline") {
        if (caseFilter && p.frontmatter?.case_slug !== caseFilter) continue;
        const fm = p.frontmatter || {};
        const dueDate = String(fm.due_date || fm.date || "");
        if (!dueDate) continue;
        const status = computeMockDeadlineStatus(
          dueDate,
          fm.status as string | undefined,
          fm.vorfrist_date as string | undefined,
          heute
        );
        eintraege.push({
          case_slug: fm.case_slug || p.slug,
          datum: dueDate.slice(0, 10),
          frist: fm.description || fm.title || p.title || "Frist",
          rechtsgrundlage: fm.law || "",
          folge_bei_versaeumnis: "",
          beleg_on: "",
          ampel: status,
          status,
          vorfrist: fm.vorfrist_date || "",
          eskalation: status === "overdue" || status === "critical",
        });
      }
    }
    return sendJson(res, 200, {
      heute,
      eintraege,
      zusammenfassung: {
        gesamt: eintraege.length,
        ueberfaellig: eintraege.filter((e) => e.status === "overdue").length,
        kritisch: eintraege.filter((e) => e.status === "critical").length,
        vorfrist: eintraege.filter((e) => e.status === "vorfrist").length,
        ok: eintraege.filter((e) => e.status === "pending" || e.status === "ok").length,
        warning: eintraege.filter((e) => e.status === "warning").length,
        done: eintraege.filter((e) => e.status === "done").length,
        unparsebar: 0,
      },
    });
  }

  // ── Legal: deadlines.ics ────────────────────────────────────────────
  if (path === "/api/legal/deadlines.ics" && req.method === "GET") {
    const caseFilter = query.get("case");
    const heute = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Subsumio//Mock//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Subsumio Kanzlei-Fristen",
      "X-WR-TIMEZONE:Europe/Berlin",
    ];
    for (const p of reqPages.values()) {
      if (p.type === "legal_case") {
        if (caseFilter && p.slug !== caseFilter) continue;
        const fm = p.frontmatter || {};
        const deadlines = Array.isArray(fm.deadlines) ? fm.deadlines : [];
        for (const d of deadlines) {
          const dueDate = String(d.due_date || d.date || "");
          if (!dueDate) continue;
          const dateStr = dueDate.slice(0, 10).replace(/-/g, "");
          lines.push("BEGIN:VEVENT");
          lines.push(`UID:${p.slug}-${dueDate}@subsumio.local`);
          lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
          lines.push(`DTEND;VALUE=DATE:${dateStr}`);
          lines.push(`SUMMARY:${d.title || d.description || "Frist"}`);
          lines.push("BEGIN:VALARM");
          lines.push("TRIGGER:-P2DT8H");
          lines.push("ACTION:DISPLAY");
          lines.push(`DESCRIPTION:Frist: ${d.title || d.description || ""}`);
          lines.push("END:VALARM");
          lines.push(`DTSTAMP:${heute}T000000Z`);
          lines.push("END:VEVENT");
        }
      }
    }
    lines.push("END:VCALENDAR");
    const ics = lines.join("\r\n");
    res.writeHead(200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fristenbuch.ics"',
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": "*",
    });
    return res.end(ics);
  }

  // ── Upload (multipart) — used by portal upload flow ────────────────
  if (path === "/api/upload" && req.method === "POST") {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return sendJson(res, 400, { error: "invalid_content_type" });
    }
    // Parse multipart form data
    const boundary = contentType.match(/boundary=(.+)/)?.[1]?.trim();
    if (!boundary) {
      return sendJson(res, 400, { error: "no_boundary" });
    }
    const raw = await readBody(req);
    const buffer = Buffer.from(raw || "");
    const boundaryBuf = Buffer.from(`--${boundary}`);
    const parts: Array<{ name: string; filename?: string; data: Buffer; type?: string }> = [];
    let start = buffer.indexOf(boundaryBuf);
    while (start !== -1) {
      const nextStart = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
      if (nextStart === -1) break;
      const partData = buffer.slice(start + boundaryBuf.length + 2, nextStart - 2);
      const headerEnd = partData.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        start = nextStart;
        continue;
      }
      const headerStr = partData.slice(0, headerEnd).toString("utf-8");
      const bodyData = partData.slice(headerEnd + 4);
      const nameMatch = headerStr.match(/name="([^"]+)"/);
      const filenameMatch = headerStr.match(/filename="([^"]+)"/);
      const typeMatch = headerStr.match(/Content-Type:\s*(.+)/i);
      if (nameMatch) {
        parts.push({
          name: nameMatch[1],
          filename: filenameMatch?.[1],
          data: bodyData,
          type: typeMatch?.[1]?.trim(),
        });
      }
      start = nextStart;
    }
    const filePart = parts.find((p) => p.name === "file");
    const titlePart = parts.find((p) => p.name === "title");
    const caseSlugPart = parts.find((p) => p.name === "case_slug");
    const sourcePart = parts.find((p) => p.name === "source");
    if (!filePart || !filePart.filename) {
      return sendJson(res, 400, { error: "file_required" });
    }
    const now = new Date().toISOString();
    const docSlug = `legal/documents/${filePart.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}_${Date.now()}`;
    const docPage: MockPage = {
      slug: docSlug,
      title: titlePart?.data.toString("utf-8").trim() || filePart.filename,
      content: "",
      type: "document",
      frontmatter: {
        filename: filePart.filename,
        mime_type: filePart.type || "application/octet-stream",
        source: sourcePart?.data.toString("utf-8").trim() || "upload",
        case_slug: caseSlugPart?.data.toString("utf-8").trim() || "",
        uploaded_at: now,
        size: filePart.data.length,
      },
      created_at: now,
      updated_at: now,
    };
    const uSrc = requestSource(req);
    (isDemoSource(uSrc) ? srcStore(uSrc) : pages).set(docSlug, docPage);
    return sendJson(res, 200, { ok: true, slug: docSlug, page: docPage });
  }

  // ── Generic fallback: try to return reasonable response ─────────────
  if (req.method === "GET") {
    return sendJson(res, 200, { items: [], mock: true, path });
  }
  if (req.method === "POST" || req.method === "PATCH") {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    return sendJson(res, 200, { ...body, mock: true, path });
  }

  return sendJson(res, 404, { error: "not_found", path });
}

// ── Start server ──────────────────────────────────────────────────────

/** Request handler — exported for the contract test (src/test/e2e-mock-contract.test.ts). */
export const mockEngineHandler = (req: IncomingMessage, res: ServerResponse) => {
  handleReq(req, res).catch((err) => {
    console.error("[mock-engine] error:", err);
    if (!res.headersSent) sendJson(res, 500, { error: "mock_engine_error" });
  });
};

// Listen only when started as a program (`bun run tests/e2e-mock-engine.ts`),
// not when a test imports the handler.
const isMain =
  (import.meta as { main?: boolean }).main ?? /e2e-mock-engine\.ts$/.test(process.argv[1] ?? "");
if (isMain) {
  const server = createServer(mockEngineHandler);
  server.listen(PORT, () => {
    console.log(`[mock-engine] listening on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    server.close();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    server.close();
    process.exit(0);
  });
}
