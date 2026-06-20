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

// Seed with a few pages
function seedPages() {
  const now = new Date().toISOString();
  const seed = [
    { slug: "test/seed-case-1", title: "Musterfall GmbH vs. Schuldner AG", type: "legal_case", content: "Sachverhalt: Vertragsbruch durch Lieferverzug." },
    { slug: "test/seed-memo-1", title: "Rechtsgutachten zum Lieferverzug", type: "memo", content: "Gutachten zur Frage des Lieferverzugs." },
    { slug: "test/seed-deadline-1", title: "Klagefrist Musterfall", type: "deadline", content: "Frist endet am 31.12.2026." },
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

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
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
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  for (const evt of events) {
    res.write(`data: ${JSON.stringify({ content: evt })}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
  });
}

function parseUrl(url: string): { path: string; query: URLSearchParams } {
  const [path, qs] = url.split("?");
  return { path, query: new URLSearchParams(qs || "") };
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

  // ── Health ──────────────────────────────────────────────────────────
  if (path === "/health" || path === "/api/health") {
    return sendJson(res, 200, { status: "ok", engine: "mock", version: "test" });
  }

  // ── Pages: list ─────────────────────────────────────────────────────
  if (path === "/api/pages" && req.method === "GET") {
    const limit = parseInt(query.get("limit") || "50", 10);
    const typeFilter = query.get("type");
    const q = query.get("q") || "";
    let items = Array.from(pages.values());
    if (typeFilter) items = items.filter((p) => p.type === typeFilter);
    if (q) items = items.filter((p) =>
      p.title.toLowerCase().includes(q.toLowerCase()) ||
      p.content.toLowerCase().includes(q.toLowerCase()) ||
      p.slug.toLowerCase().includes(q.toLowerCase())
    );
    items = items.slice(0, limit);
    return sendJson(res, 200, items);
  }

  // ── Pages: create ───────────────────────────────────────────────────
  if (path === "/api/pages" && req.method === "POST") {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const slug = body.slug || `test/page-${Date.now()}`;
    const now = new Date().toISOString();
    const page: MockPage = {
      slug,
      title: body.title || "Untitled",
      content: body.content || "",
      type: body.type || "note",
      frontmatter: body.frontmatter || { version: 1 },
      created_at: now,
      updated_at: now,
    };
    pages.set(slug, page);
    return sendJson(res, 200, page);
  }

  // ── Pages: by slug ──────────────────────────────────────────────────
  const pageMatch = path.match(/^\/api\/pages\/(.+)$/);
  if (pageMatch) {
    const slug = decodeURIComponent(pageMatch[1]);

    if (req.method === "GET") {
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      return sendJson(res, 200, page);
    }

    if (req.method === "PATCH") {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      const updated = {
        ...page,
        ...body,
        slug, // slug is immutable
        frontmatter: { ...page.frontmatter, ...body.frontmatter },
        updated_at: new Date().toISOString(),
      };
      pages.set(slug, updated);
      return sendJson(res, 200, updated);
    }

    if (req.method === "DELETE") {
      if (!pages.has(slug)) return sendJson(res, 404, { error: "not_found" });
      pages.delete(slug);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── Search ──────────────────────────────────────────────────────────
  if (path === "/api/search" && req.method === "GET") {
    const q = query.get("q") || "";
    const limit = parseInt(query.get("limit") || "10", 10);
    const matched = Array.from(pages.values()).filter((p) =>
      p.title.toLowerCase().includes(q.toLowerCase()) ||
      p.content.toLowerCase().includes(q.toLowerCase()) ||
      p.slug.toLowerCase().includes(q.toLowerCase())
    );
    const results = matched.slice(0, limit).map((p) => ({
      slug: p.slug,
      title: p.title,
      type: p.type,
      snippet: p.content.slice(0, 200),
      score: 0.9,
    }));
    return sendJson(res, 200, { results, total: results.length });
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

  // ── Legal: analyze ──────────────────────────────────────────────────
  if (path === "/api/legal/analyze" && req.method === "POST") {
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
          date: "2026-12-31",
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
    return sendJson(res, 200, [
      { id: "test-brain", name: "Test Brain", pages: pages.size },
    ]);
  }

  // ── Stats ───────────────────────────────────────────────────────────
  if (path === "/api/stats" && req.method === "GET") {
    return sendJson(res, 200, {
      total_pages: pages.size,
      cases: Array.from(pages.values()).filter((p) => p.type === "legal_case").length,
      deadlines: Array.from(pages.values()).filter((p) => p.type === "deadline").length,
      memos: Array.from(pages.values()).filter((p) => p.type === "memo").length,
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

const server = createServer((req, res) => {
  try {
    void handleReq(req, res);
  } catch (err) {
    console.error("[mock-engine] error:", err);
    sendJson(res, 500, { error: "mock_engine_error" });
  }
});

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
