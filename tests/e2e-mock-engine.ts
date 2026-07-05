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
    Connection: "keep-alive",
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
    if (q)
      items = items.filter(
        (p) =>
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

    // Support merge:true (used by enginePatchPage) — merge frontmatter into existing page
    if (body.merge && pages.has(slug)) {
      const existing = pages.get(slug)!;
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
      pages.set(slug, updated);
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
      pages.set(slug, updated);

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
        pages.set(slug, updated);

        for (const [docSlug, docPage] of pages.entries()) {
          if (
            docPage.type === "document" &&
            docPage.frontmatter?.case_slug === slug &&
            docPage.frontmatter?.status === "tombstoned"
          ) {
            docPage.frontmatter = {
              ...docPage.frontmatter,
              status: "active",
              tombstoned_at: null,
              tombstone_reason: null,
            };
            pages.set(docSlug, docPage);
          }
        }
      }

      return sendJson(res, 200, updated);
    }

    if (req.method === "DELETE") {
      const page = pages.get(slug);
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
        pages.set(slug, page);
        // Tombstone cascade: mark all documents with matching case_slug as tombstoned
        for (const [docSlug, docPage] of pages.entries()) {
          if (docPage.type === "document" && docPage.frontmatter?.case_slug === slug) {
            docPage.frontmatter = { ...docPage.frontmatter, status: "tombstoned" };
            pages.set(docSlug, docPage);
          }
        }
        return sendJson(res, 200, { ok: true, method: "archived", slug });
      }
      // Hard delete for non-case pages
      pages.delete(slug);
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
      matched = Array.from(pages.values()).filter((p) => {
        const fm = p.frontmatter || {};
        return String(fm[field] ?? "") === value;
      });
    } else {
      matched = Array.from(pages.values()).filter(
        (p) =>
          p.title.toLowerCase().includes(q.toLowerCase()) ||
          p.content.toLowerCase().includes(q.toLowerCase()) ||
          p.slug.toLowerCase().includes(q.toLowerCase())
      );
    }
    const results = matched.slice(0, limit).map((p) => ({
      slug: p.slug,
      title: p.title,
      type: p.type,
      frontmatter: p.frontmatter,
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

  // ── Legal: conflict-check ───────────────────────────────────────────
  if (path === "/api/legal/conflict-check" && req.method === "POST") {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const name = String(body.name || "").toLowerCase();
    // Find pages with matching client_name or opponent_name
    const matches: Array<{ name: string; slug: string; type: string }> = [];
    for (const p of pages.values()) {
      const fm = p.frontmatter || {};
      const clientName = String(fm.client_name || "").toLowerCase();
      const opponentName = String(fm.opponent_name || "").toLowerCase();
      if (clientName === name || opponentName === name) {
        matches.push({
          name: String(fm.client_name || fm.opponent_name || ""),
          slug: p.slug,
          type: p.type,
        });
      }
    }
    return sendJson(res, 200, { matches });
  }

  // ── Legal: analyze ──────────────────────────────────────────────────
  if (path === "/api/legal/analyze" && req.method === "POST") {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const caseSlug = body.caseSlug || body.case_slug || "";
    // Writeback suggested_deadlines and suggested_parties to case frontmatter
    if (caseSlug && pages.has(caseSlug)) {
      const casePage = pages.get(caseSlug)!;
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
            due_date: "2026-12-31",
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
      pages.set(caseSlug, casePage);
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
    return sendJson(res, 200, [{ id: "test-brain", name: "Test Brain", pages: pages.size }]);
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

  // ── Pages: batch-list (used by /api/legal/fristen) ──────────────────
  if (path === "/api/pages/batch-list" && req.method === "GET") {
    const types = (query.get("types") || "").split(",").filter(Boolean);
    const limit = parseInt(query.get("limit") || "300", 10);
    const results: Record<string, MockPage[]> = {};
    for (const t of types) {
      results[t] = Array.from(pages.values())
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
    for (const p of pages.values()) {
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
    for (const p of pages.values()) {
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
    pages.set(docSlug, docPage);
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
