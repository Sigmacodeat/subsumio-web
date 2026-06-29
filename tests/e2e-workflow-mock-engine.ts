/**
 * Extended Mock Engine for E2E Workflow Simulation
 * ================================================
 * Full mock of the Subsumio Engine API including all legal endpoints,
 * upload/OCR simulation, SSE streaming, and session handling.
 *
 * Port: 3999 (configurable via MOCK_ENGINE_PORT)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = parseInt(process.env.MOCK_ENGINE_PORT || "3999", 10);

// ── Types ─────────────────────────────────────────────────────────────

interface MockPage {
  slug: string;
  title: string;
  content: string;
  type: string;
  frontmatter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface MockUpload {
  slug: string;
  title: string;
  filename: string;
  mime_type: string;
  size: number;
  extraction_status: "processing" | "ready" | "failed";
  extraction_method: string;
  extraction_warnings?: string;
  analysis_status: "pending" | "queued" | "completed" | "failed";
  case_slug?: string;
  created_at: string;
}

// ── In-memory stores ──────────────────────────────────────────────────

const pages = new Map<string, MockPage>();
const uploads = new Map<string, MockUpload>();
const auditLog: Array<Record<string, unknown>> = [];
const sessions = new Map<string, { uid: string; email: string; brainId: string }>();
const recentQueries: Array<Record<string, unknown>> = [];

// ── Helpers ───────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

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

function sendSse(res: ServerResponse, events: Array<Record<string, unknown>>) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  for (const evt of events) {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB limit

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("error", reject);
    req.on("end", () => resolve(data));
  });
}

function safeJsonParse(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseUrl(url: string): { path: string; query: URLSearchParams } {
  const [path, qs] = url.split("?");
  return { path, query: new URLSearchParams(qs || "") };
}

function getSession(req: IncomingMessage): { uid: string; email: string; brainId: string } | null {
  const cookie = req.headers["cookie"] || "";
  const match = cookie.match(/subsumio_session=([^;]+)/);
  if (!match) return null;
  return sessions.get(match[1]) ?? null;
}

function audit(action: string, entityType: string, details: Record<string, unknown>) {
  auditLog.push({ action, entityType, details, timestamp: now() });
}

// ── Seed data ─────────────────────────────────────────────────────────

function seed() {
  const t = now();
  // Seed a few pages for search/graph
  pages.set("test/seed-case-1", {
    slug: "test/seed-case-1",
    title: "Musterfall GmbH vs. Schuldner AG",
    type: "legal_case",
    content: "Sachverhalt: Vertragsbruch durch Lieferverzug.",
    frontmatter: {
      case_number: "SMK-001",
      status: "open",
      legal_area: "Zivilrecht",
      priority: "high",
    },
    created_at: t,
    updated_at: t,
  });
  pages.set("test/seed-memo-1", {
    slug: "test/seed-memo-1",
    title: "Rechtsgutachten zum Lieferverzug",
    type: "memo",
    content: "Gutachten zur Frage des Lieferverzugs.",
    frontmatter: { version: 1 },
    created_at: t,
    updated_at: t,
  });
}

seed();

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
    return sendJson(res, 200, { status: "ok", engine: "mock-extended", version: "2.0.0" });
  }

  // ── Auth: login ─────────────────────────────────────────────────────
  if (path === "/api/auth/login" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const sessionId = `sess_${randomUUID()}`;
    const user = {
      uid: "test-user-1",
      email: body.email || "test@kanzlei.de",
      brainId: "test-brain-1",
    };
    sessions.set(sessionId, user);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Set-Cookie": `subsumio_session=${sessionId}; Path=/; HttpOnly`,
    });
    return res.end(
      JSON.stringify({ ok: true, user: { id: user.uid, email: user.email, name: "Test Anwalt" } })
    );
  }

  // ── Auth: me ────────────────────────────────────────────────────────
  if (path === "/api/auth/me" && req.method === "GET") {
    const session = getSession(req);
    if (!session) return sendJson(res, 401, { error: "unauthorized" });
    return sendJson(res, 200, {
      id: session.uid,
      email: session.email,
      name: "Test Anwalt",
      plan: "pro",
    });
  }

  // ── Pages: list ─────────────────────────────────────────────────────
  if (path === "/api/pages" && req.method === "GET") {
    const limit = parseInt(query.get("limit") || "50", 10);
    const typeFilter = query.get("type");
    const q = query.get("q") || "";
    let items = Array.from(pages.values());
    if (typeFilter) items = items.filter((p) => p.type === typeFilter);
    if (q) {
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(q.toLowerCase()) ||
          p.content.toLowerCase().includes(q.toLowerCase()) ||
          p.slug.toLowerCase().includes(q.toLowerCase())
      );
    }
    return sendJson(res, 200, items.slice(0, limit));
  }

  // ── Pages: create / merge-update ────────────────────────────────────
  if (path === "/api/pages" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const slug = body.slug || `test/page-${Date.now()}`;
    const existing = pages.get(slug);
    const t = now();

    if (existing && body.merge) {
      const updated: MockPage = {
        ...existing,
        title: body.title ?? existing.title,
        content: body.content ?? existing.content,
        type: body.type ?? existing.type,
        frontmatter: { ...existing.frontmatter, ...(body.frontmatter || {}) },
        updated_at: t,
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
      created_at: t,
      updated_at: t,
    };
    pages.set(slug, page);
    return sendJson(res, 200, page);
  }

  // ── Pages: batch list ───────────────────────────────────────────────
  if (path === "/api/pages/batch-list" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const types: string[] = body.types || [];
    const limit = body.limit || 100;
    const results: Record<string, MockPage[]> = {};
    for (const type of types) {
      results[type] = Array.from(pages.values())
        .filter((p) => p.type === type)
        .slice(0, limit);
    }
    return sendJson(res, 200, { results, errors: [] });
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
      const body = safeJsonParse(raw);
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });

      // Archive guard
      const isRestore = !!body.frontmatter?.restored_at && body.frontmatter?.status !== "archived";
      if (!isRestore && page.frontmatter?.status === "archived") {
        return sendJson(res, 403, { error: "case_archived", message: "Akte ist archiviert." });
      }

      const updated: MockPage = {
        ...page,
        ...body,
        slug,
        frontmatter: { ...page.frontmatter, ...(body.frontmatter || {}) },
        updated_at: now(),
      };
      pages.set(slug, updated);
      return sendJson(res, 200, updated);
    }

    if (req.method === "DELETE") {
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      if (page.type === "legal_case") {
        if (page.frontmatter?.status === "archived") {
          return sendJson(res, 409, { error: "already_archived" });
        }
        page.frontmatter = { ...page.frontmatter, status: "archived", archived_at: now() };
        pages.set(slug, page);
        return sendJson(res, 200, { ok: true, method: "archived", slug });
      }
      pages.delete(slug);
      return sendJson(res, 200, { ok: true, method: "deleted", slug });
    }
  }

  // ── Upload ──────────────────────────────────────────────────────────
  if (path === "/api/upload" && req.method === "POST") {
    // Parse multipart (simplified — just read the body)
    const contentType = req.headers["content-type"] || "";
    let filename = "upload.bin";
    let mimeType = "application/octet-stream";
    let caseSlug = "";
    let title = "";

    // Extract filename from content-type boundary (simplified)
    if (contentType.includes("multipart/form-data")) {
      // Read raw body to extract file content and fields
      const raw = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;
        req.on("data", (c) => {
          totalSize += c.length;
          if (totalSize > MAX_BODY_SIZE) {
            reject(new Error("Upload too large"));
            req.destroy();
            return;
          }
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
        });
        req.on("error", reject);
        req.on("end", () => resolve(Buffer.concat(chunks)));
      });

      // Parse multipart fields (basic extraction)
      const boundary = contentType.split("boundary=")[1]?.trim() || "";
      const parts = raw.toString("binary").split(boundary);
      for (const part of parts) {
        if (part.includes('name="file"')) {
          const fnMatch = part.match(/filename="([^"]+)"/);
          if (fnMatch) filename = fnMatch[1];
          const ctMatch = part.match(/Content-Type:\s*(\S+)/);
          if (ctMatch) mimeType = ctMatch[1];
        }
        if (part.includes('name="case_slug"')) {
          const valMatch = part.match(/name="case_slug"\r\n\r\n([^\r]+)/);
          if (valMatch) caseSlug = valMatch[1].trim();
        }
        if (part.includes('name="title"')) {
          const valMatch = part.match(/name="title"\r\n\r\n([^\r]+)/);
          if (valMatch) title = valMatch[1].trim();
        }
      }
    }

    const slug = `documents/${Date.now()}-${filename.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
    const isImage = /\.(jpg|jpeg|png|heic|heif|avif|bmp|tiff?)$/i.test(filename);
    const isPdf = /\.pdf$/i.test(filename);
    const isDocx = /\.docx$/i.test(filename);

    const extractionMethod = isImage
      ? "ocr_vision"
      : isPdf
        ? "text_layer"
        : isDocx
          ? "native_parser"
          : "native_parser";
    const upload: MockUpload = {
      slug,
      title: title || filename.replace(/\.[^.]+$/, ""),
      filename,
      mime_type: mimeType,
      size: 1000,
      extraction_status: "ready",
      extraction_method: extractionMethod,
      analysis_status: "pending",
      case_slug: caseSlug || undefined,
      created_at: now(),
    };
    uploads.set(slug, upload);

    // Also create a page for the document
    const docPage: MockPage = {
      slug,
      title: upload.title,
      type: "document",
      content: isImage
        ? "[OCR] Klageschrift des Landgerichts München I, Aktenzeichen 12 O 345/26. Kläger: Müller GmbH. Beklagter: Schuldner AG. Streitgegenstand: €45.000."
        : isPdf
          ? "Vertrag zwischen Müller GmbH und Schuldner AG über Lieferung von 500 Widget-Einheiten zum Preis von €45.000. Lieferfrist: 14 Tage ab Vertragschluss."
          : isDocx
            ? "Anschreiben vom 15.03.2026. Betreff: Mahnung wegen Lieferverzug. Sehr geehrte Damen und Herren, wir mahnen die noch offene Lieferung..."
            : "Dokument-Inhalt",
      frontmatter: {
        type: "document",
        source_format: isImage ? "image" : isPdf ? "pdf" : isDocx ? "docx" : "text",
        extraction_method: extractionMethod,
        extraction_status: "ready",
        extraction_unverified: isImage ? "true" : undefined,
        case_slug: caseSlug || undefined,
        analysis_status: "pending",
      },
      created_at: now(),
      updated_at: now(),
    };
    pages.set(slug, docPage);

    audit("document.upload", "document", { slug, filename, case_slug: caseSlug });
    return sendJson(res, 200, {
      slug,
      title: upload.title,
      extraction_status: "ready",
      extraction_method: extractionMethod,
      original_persisted: true,
    });
  }

  // ── Upload status ───────────────────────────────────────────────────
  const uploadStatusMatch = path.match(/^\/api\/upload-status\/(.+)$/);
  if (uploadStatusMatch) {
    const slug = decodeURIComponent(uploadStatusMatch[1]);
    const upload = uploads.get(slug);
    if (!upload) return sendJson(res, 404, { error: "not_found" });
    return sendJson(res, 200, {
      slug: upload.slug,
      title: upload.title,
      status: "ready_to_query",
      extraction_status: upload.extraction_status,
      extraction_method: upload.extraction_method,
      analysis_status: upload.analysis_status,
      updated_at: upload.created_at,
    });
  }

  // ── Search ──────────────────────────────────────────────────────────
  if (path === "/api/search" && req.method === "GET") {
    const q = (query.get("q") || "").toLowerCase();
    const limit = parseInt(query.get("limit") || "10", 10);
    const matched = Array.from(pages.values()).filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
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
    const body = safeJsonParse(raw);
    const q = body.query || "";
    recentQueries.push({ query: q, timestamp: now() });
    return sendSse(res, [
      { chunk: `Basierend auf Ihrer Frage "${q.slice(0, 80)}" ` },
      { chunk: `hier eine rechtliche Einschätzung: ` },
      { chunk: `Die relevanten Rechtsgrundlagen finden sich im BGB. ` },
      { chunk: `Ein konkreter Anspruch könnte sich aus § 433 BGB ergeben. ` },
      {
        chunk: `Hinweis: Dies ist eine KI-generierte Antwort und ersetzt keine anwaltliche Prüfung.`,
      },
      { citations: [], gaps: [], tokens_used: 150, latency_ms: 230 },
    ]);
  }

  // ── Dashboard: cockpit ──────────────────────────────────────────────
  if (path === "/api/dashboard/cockpit" && req.method === "GET") {
    return sendJson(res, 200, {
      stats: {
        total_pages: pages.size,
        cases: Array.from(pages.values()).filter((p) => p.type === "legal_case").length,
        deadlines: Array.from(pages.values()).filter((p) => p.type === "deadline").length,
        memos: Array.from(pages.values()).filter((p) => p.type === "memo").length,
      },
      recent: recentQueries.slice(-5),
      pages: {},
    });
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
    return sendJson(res, 200, { entries: auditLog, total: auditLog.length });
  }

  // ── Recent queries ──────────────────────────────────────────────────
  if (path === "/api/queries/recent" && req.method === "GET") {
    return sendJson(res, 200, { queries: recentQueries.slice(-10) });
  }

  // ── Graph ───────────────────────────────────────────────────────────
  if (path === "/api/graph" && req.method === "GET") {
    return sendJson(res, 200, {
      nodes: [
        { id: "case-1", label: "Musterfall GmbH vs. Schuldner AG", type: "case" },
        { id: "client-1", label: "Müller GmbH", type: "client" },
        { id: "opp-1", label: "Schuldner AG", type: "opponent" },
      ],
      links: [
        { from: "case-1", to: "client-1", label: "client" },
        { from: "case-1", to: "opp-1", label: "opponent" },
      ],
    });
  }

  // ── Intake ──────────────────────────────────────────────────────────
  if (path === "/api/intake" && req.method === "GET") {
    const items = Array.from(pages.values()).filter((p) => p.type === "intake");
    return sendJson(res, 200, { items, total: items.length });
  }
  if (path === "/api/intake" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const slug = `intake/${Date.now()}`;
    const page: MockPage = {
      slug,
      title: body.summary || "Intake",
      type: "intake",
      content: body.summary || "",
      frontmatter: {
        type: "intake",
        status: "new",
        source: body.source || "manual",
        client_name: body.client_name || null,
        legal_area: body.legal_area || null,
        missing_documents: body.missing_documents || [],
        created_at: now(),
      },
      created_at: now(),
      updated_at: now(),
    };
    pages.set(slug, page);
    return sendJson(res, 201, { slug, ...page });
  }
  if (path === "/api/intake" && req.method === "PATCH") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const slug = body.slug;
    const page = pages.get(slug);
    if (!page) return sendJson(res, 404, { error: "not_found" });
    page.frontmatter = { ...page.frontmatter, status: body.status || page.frontmatter.status };
    pages.set(slug, page);
    return sendJson(res, 200, page);
  }
  if (path === "/api/intake/convert" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const intakeSlug = body.slug;
    const intake = pages.get(intakeSlug);
    if (!intake) return sendJson(res, 404, { error: "intake_not_found" });

    const caseSlug = body.case_slug || `cases/${Date.now()}`;
    const casePage: MockPage = {
      slug: caseSlug,
      title: body.title || `Akte ${intake.frontmatter.client_name || "Unbekannt"}`,
      type: "legal_case",
      content: intake.content,
      frontmatter: {
        type: "legal_case",
        case_number: body.case_number || `AZ-${Date.now()}`,
        status: "open",
        priority: body.priority || "medium",
        client_name: intake.frontmatter.client_name,
        legal_area: intake.frontmatter.legal_area,
        documents: [],
        timeline_events: [
          {
            id: `tl-${Date.now()}`,
            timestamp: now(),
            type: "case_created",
            title: "Akte erstellt",
            description: "Konvertiert aus Intake",
            actor: "test@kanzlei.de",
          },
        ],
        created_at: now(),
      },
      created_at: now(),
      updated_at: now(),
    };
    pages.set(caseSlug, casePage);
    intake.frontmatter = {
      ...intake.frontmatter,
      status: "converted",
      converted_case_slug: caseSlug,
    };
    pages.set(intakeSlug, intake);
    audit("case.create", "legal_case", { slug: caseSlug, from_intake: intakeSlug });
    return sendJson(res, 200, { slug: caseSlug, case_slug: caseSlug, ...casePage });
  }

  // ── Legal: conflict-check ───────────────────────────────────────────
  if (path === "/api/legal/conflict-check" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const name = String(body.name || "").toLowerCase();
    const matches: Array<Record<string, unknown>> = [];
    for (const p of pages.values()) {
      const fm = p.frontmatter || {};
      const clientName = String(fm.client_name || "").toLowerCase();
      const opponentName = String(fm.opponent_name || "").toLowerCase();
      if (clientName === name || opponentName === name) {
        matches.push({ name: fm.client_name || fm.opponent_name, slug: p.slug, type: p.type });
      }
    }
    return sendJson(res, 200, { matches, checked_at: now() });
  }

  // ── Legal: analyze ──────────────────────────────────────────────────
  if (path === "/api/legal/analyze" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const caseSlug = body.caseSlug || body.case_slug;
    if (caseSlug && pages.has(caseSlug)) {
      const casePage = pages.get(caseSlug)!;
      const fm = casePage.frontmatter || {};
      const existingDl = Array.isArray(fm.suggested_deadlines) ? fm.suggested_deadlines : [];
      casePage.frontmatter = {
        ...fm,
        suggested_deadlines: [
          ...existingDl,
          {
            title: "Klagefrist",
            due_date: "2026-12-31",
            urgency: "high",
            source: "KI-Analyse",
            confirmed: false,
          },
        ],
      };
      pages.set(caseSlug, casePage);
    }
    return sendJson(res, 200, {
      analysis: "Vertragsanalyse: Der Vertrag enthält Standardklauseln mit Optimierungspotenzial.",
      issues: [
        { severity: "medium", clause: "§ 3", description: "Lieferfrist unpräzise definiert." },
        { severity: "low", clause: "§ 7", description: "Vertragsstrafe gering bemessen." },
        { severity: "high", clause: "§ 12", description: "Haftungsausschluss zu weitreichend." },
      ],
      recommendation: "Lieferfrist präzisieren, Vertragsstrafe anpassen, Haftung begrenzen.",
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
        {
          type: "relative",
          days: 14,
          label: "Widerspruchsfrist",
          confidence: 0.88,
          source: "§ 339 ZPO",
        },
        {
          type: "relative",
          days: 30,
          label: "Berufungsfrist",
          confidence: 0.92,
          source: "§ 517 ZPO",
        },
      ],
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
        {
          id: "clause-3",
          title: "Haftung",
          original: "Die Haftung ist ausgeschlossen.",
          revised:
            "Die Haftung ist für Vorsatz und grobe Fahrlässigkeit uneingeschränkt. Für leichte Fahrlässigkeit auf den vertragstypischen Schaden begrenzt.",
          risk_level: "high",
          recommendation: "Haftungsausschluss einschränken.",
        },
      ],
    });
  }

  // ── Legal: contract-draft ───────────────────────────────────────────
  if (path === "/api/legal/contract-draft" && req.method === "POST") {
    return sendSse(res, [
      { chunk: "# Dienstleistungsvertrag\n\n" },
      { chunk: "zwischen\n\n" },
      { chunk: "**Müller GmbH** (Auftraggeber)\nund\n**Schuldner AG** (Auftragnehmer)\n\n" },
      {
        chunk:
          "## § 1 Leistungsumfang\nDer Auftragnehmer erbringt die vereinbarten Leistungen nach Maßgabe dieses Vertrags.\n\n",
      },
      { chunk: "## § 2 Vergütung\nDie Vergütung beträgt €45.000 zzgl. USt.\n\n" },
      { chunk: "## § 3 Lieferfrist\nDie Lieferung erfolgt binnen 14 Tagen ab Vertragschluss.\n\n" },
      { chunk: "## § 4 Gewährleistung\nEs gelten die gesetzlichen Gewährleistungsfristen.\n" },
      { citations: [], gaps: [] },
    ]);
  }

  // ── Legal: contradictions ───────────────────────────────────────────
  if (path === "/api/legal/contradictions" && req.method === "POST") {
    return sendJson(res, 200, {
      contradictions: [
        {
          doc_a_slug: "documents/doc-1",
          doc_b_slug: "documents/doc-2",
          field: "lieferfrist",
          value_a: "14 Tage",
          value_b: "30 Tage",
          severity: "high",
          description: "Widersprüchliche Lieferfristen in Vertrag und Anschreiben.",
        },
      ],
      documents_checked: 2,
      checked_at: now(),
    });
  }

  // ── Legal: contradiction-probe ──────────────────────────────────────
  if (path === "/api/legal/contradiction-probe" && req.method === "GET") {
    return sendJson(res, 200, {
      findings: [],
      total: 0,
      last_run: now(),
      probe_available: true,
    });
  }

  // ── Legal: precedent-search ─────────────────────────────────────────
  if (path === "/api/legal/precedent-search" && req.method === "POST") {
    return sendJson(res, 200, {
      results: [
        {
          slug: "judgments/bgh-vi-zr-123-21",
          title: "BGH, VI ZR 123/21 — Lieferverzug und Schadensersatz",
          court: "BGH",
          date: "2023-05-15",
          summary:
            "Der BGH bestätigt, dass bei Lieferverzug Schadensersatz gem. § 280 I BGB verlangt werden kann.",
          relevance: 0.92,
        },
        {
          slug: "judgments/olg-muenchen-12-u-345-20",
          title: "OLG München, 12 U 345/20 — Vertragsstrafe bei unpräziser Frist",
          court: "OLG München",
          date: "2022-11-08",
          summary: "Unpräzise Lieferfristen führen zur Unwirksamkeit der Vertragsstrafenklausel.",
          relevance: 0.85,
        },
      ],
      total: 2,
    });
  }

  // ── Legal: case-strategy ────────────────────────────────────────────
  if (path === "/api/legal/case-strategy" && req.method === "POST") {
    return sendJson(res, 200, {
      summary: "Empfohlene Strategie: Klage auf Erfüllung und Schadensersatz.",
      recommended:
        "Klage auf Erfüllung gem. § 433 II BGB und Schadensersatz gem. § 280 I, 280 II, 286 BGB.",
      recommendedApproach: "litigation",
      risks: [
        {
          description: "Gegner hat Einrede der Verjährung",
          probability: "low",
          impact: "high",
          mitigation: "Hemmung der Verjährung durch Mahnung dokumentieren",
        },
        {
          description: "Beweisprobleme beim Lieferverzug",
          probability: "medium",
          impact: "medium",
          mitigation: "Zeugenaussagen und Email-Verlauf sichern",
        },
      ],
      next_steps: [
        "Mahnung mit Fristsetzung versenden",
        "Beweise für Lieferverzug sichern",
        "Klage bei zuständigem Gericht einreichen",
      ],
      cost_estimate: { min: 3500, max: 8000, currency: "EUR", basis: "RVG § 13 VV" },
      success_probability: 0.72,
      generatedAt: now(),
    });
  }

  // ── Legal: obligation-extract ───────────────────────────────────────
  if (path === "/api/legal/obligation-extract" && req.method === "POST") {
    return sendJson(res, 200, {
      obligations: [
        {
          party: "Auftragnehmer",
          action: "Lieferung von 500 Widget-Einheiten",
          deadline: "14 Tage",
          clause: "§ 3",
        },
        {
          party: "Auftraggeber",
          action: "Zahlung von €45.000",
          deadline: "30 Tage nach Lieferung",
          clause: "§ 2",
        },
        {
          party: "Beide",
          action: "Geheimhaltung",
          deadline: "auf unbestimmte Zeit",
          clause: "§ 8",
        },
      ],
      total: 3,
    });
  }

  // ── Legal: anonymize ────────────────────────────────────────────────
  if (path === "/api/legal/anonymize" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const text = body.text || "";
    const anonymized = text
      .replace(/Herrn?\s+\w+/g, "Herr [ANON]")
      .replace(/Frau\s+\w+/g, "Frau [ANON]")
      .replace(/\b\d{4}\s+\w+/g, "[STRASSE]")
      .replace(/Müller GmbH/g, "[FIRMA_A]")
      .replace(/Schuldner AG/g, "[FIRMA_B]");
    return sendJson(res, 200, {
      anonymized_text: anonymized,
      replacements: [
        { original: "Müller GmbH", placeholder: "[FIRMA_A]", type: "organization" },
        { original: "Schuldner AG", placeholder: "[FIRMA_B]", type: "organization" },
      ],
      pii_found: 2,
    });
  }

  // ── Legal: ground ───────────────────────────────────────────────────
  if (path === "/api/legal/ground" && req.method === "POST") {
    return sendJson(res, 200, {
      citations_verified: 3,
      citations_unverified: 0,
      corpus_checked: true,
      grounded_citations: [
        {
          code: "BGB",
          paragraph: "§ 433",
          context: "Kaufvertrag",
          verified: true,
          source_text: "Der Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben...",
        },
        {
          code: "BGB",
          paragraph: "§ 280",
          context: "Schadensersatz",
          verified: true,
          source_text: "Verletzt der Schuldner eine Pflicht...",
        },
        {
          code: "BGB",
          paragraph: "§ 286",
          context: "Verzug",
          verified: true,
          source_text: "Gerät der Schuldner in Verzug...",
        },
      ],
      analyzed_at: now(),
      has_unverified: false,
    });
  }

  // ── Legal: translate ────────────────────────────────────────────────
  if (path === "/api/legal/translate" && req.method === "POST") {
    return sendJson(res, 200, {
      translated_text:
        "Contract between [FIRMA_A] and [FIRMA_B] for delivery of 500 widget units...",
      source_language: "de",
      target_language: "en",
      legal_terminology_preserved: true,
    });
  }

  // ── Legal: deep-analysis ────────────────────────────────────────────
  if (path === "/api/legal/deep-analysis" && req.method === "POST") {
    return sendJson(res, 200, {
      executive_summary:
        "Die analysierten Dokumente zeigen einen klaren Fall von Lieferverzug mit Schadensersatzansprüchen.",
      document_count: 4,
      findings: [
        {
          theme: "Lieferverzug",
          description: "Mehrere Dokumente bestätigen den Lieferverzug der Schuldner AG.",
          risk_level: "high",
          affected_documents: ["documents/doc-1", "documents/doc-2"],
          citations: [
            { slug: "documents/doc-1", title: "Vertrag", quote: "Lieferung binnen 14 Tagen" },
          ],
        },
        {
          theme: "Vertragsstrafenklausel",
          description: "Die Vertragsstrafe ist unpräzise formuliert.",
          risk_level: "medium",
          affected_documents: ["documents/doc-1"],
          citations: [
            { slug: "documents/doc-1", title: "Vertrag", quote: "Vertragsstrafe fällig" },
          ],
        },
      ],
      cross_document_patterns: ["Widersprüchliche Lieferfristen", "Fehlende Haftungsbegrenzung"],
      overall_risk: "medium",
      warnings: [],
      attorney_review_required: true,
    });
  }

  // ── Legal: tabular-review ───────────────────────────────────────────
  if (path === "/api/legal/tabular-review" && req.method === "POST") {
    return sendJson(res, 200, {
      rows: [
        {
          slug: "documents/doc-1",
          title: "Vertrag",
          answers: { "Lieferfrist klar?": "Nein", "Vertragsstrafe definiert?": "Nein" },
        },
        {
          slug: "documents/doc-2",
          title: "Anschreiben",
          answers: { "Lieferfrist klar?": "Ja", "Vertragsstrafe definiert?": "N/A" },
        },
      ],
      questions: ["Lieferfrist klar?", "Vertragsstrafe definiert?"],
      total: 2,
    });
  }

  // ── Legal: judgements-search ────────────────────────────────────────
  if (path === "/api/legal/judgements-search" && req.method === "GET") {
    return sendJson(res, 200, {
      results: [
        {
          slug: "judgments/bgh-vi-zr-123-21",
          title: "BGH VI ZR 123/21",
          court: "BGH",
          date: "2023-05-15",
        },
      ],
    });
  }

  // ── Legal: judgements-sync ──────────────────────────────────────────
  if (path === "/api/legal/judgements-sync" && req.method === "POST") {
    return sendJson(res, 200, { synced: 15, errors: [], duration_ms: 1200 });
  }

  // ── Legal: summarize ────────────────────────────────────────────────
  if (path === "/api/legal/summarize" && req.method === "POST") {
    return sendJson(res, 200, {
      summary:
        "Zusammenfassung: Der Vertrag regelt die Lieferung von 500 Widget-Einheiten. Die Lieferfrist ist unpräzise, die Vertragsstrafe nicht beziffert.",
      key_points: [
        "Lieferung von 500 Einheiten",
        "Preis: €45.000",
        "Lieferfrist: unpräzise",
        "Vertragsstrafe: nicht beziffert",
      ],
    });
  }

  // ── Legal: memo ─────────────────────────────────────────────────────
  if (path === "/api/legal/memo" && req.method === "POST") {
    return sendJson(res, 200, {
      memo: "# Aktennotiz\n\n**Sachverhalt:** Müller GmbH beauftragt Schuldner AG mit Lieferung von 500 Widget-Einheiten.\n\n**Rechtliche Würdigung:** Anspruch gem. § 433 II BGB. Verzug nach § 286 BGB.\n\n**Empfehlung:** Klage einreichen.",
    });
  }

  // ── Legal: chronology ───────────────────────────────────────────────
  if (path === "/api/legal/chronology" && req.method === "POST") {
    return sendJson(res, 200, {
      events: [
        {
          date: "2026-01-15",
          title: "Vertragsschluss",
          description: "Vertrag zwischen Müller GmbH und Schuldner AG",
        },
        {
          date: "2026-01-29",
          title: "Lieferfrist abgelaufen",
          description: "14-Tage-Frist abgelaufen ohne Lieferung",
        },
        { date: "2026-03-15", title: "Mahnung", description: "Erste Mahnung versendet" },
      ],
    });
  }

  // ── Legal: risk-analysis ────────────────────────────────────────────
  if (path === "/api/legal/risk-analysis" && req.method === "POST") {
    return sendJson(res, 200, {
      overall_risk: "medium",
      risks: [
        {
          category: "vertraglich",
          description: "Unpräzise Lieferfrist",
          severity: "medium",
          mitigation: "Nachtrag vereinbaren",
        },
        {
          category: "prozessual",
          description: "Beweislast beim Kläger",
          severity: "high",
          mitigation: "Beweise sichern",
        },
      ],
    });
  }

  // ── Legal: portfolio-insights ───────────────────────────────────────
  if (path === "/api/legal/portfolio-insights" && req.method === "GET") {
    return sendJson(res, 200, {
      insights: [
        { metric: "active_cases", value: 5, trend: "up" },
        { metric: "avg_case_duration_days", value: 180, trend: "stable" },
        { metric: "success_rate", value: 0.68, trend: "up" },
      ],
    });
  }

  // ── Legal: rvg ──────────────────────────────────────────────────────
  if (path === "/api/legal/rvg" && req.method === "POST") {
    return sendJson(res, 200, {
      gebuehr: 1.3,
      streitwert: 45000,
      kosten: { anwalt: 1785.5, gericht: 1080.0, total: 2865.5 },
      vv: ["3100", "3103", "3202"],
    });
  }

  // ── Legal: statute-search ───────────────────────────────────────────
  if (path === "/api/legal/statute-search" && req.method === "GET") {
    return sendJson(res, 200, {
      results: [
        {
          code: "BGB",
          paragraph: "§ 433",
          title: "Vertragstypische Pflichten beim Kaufvertrag",
          text: "Der Verkäufer ist verpflichtet...",
        },
        {
          code: "BGB",
          paragraph: "§ 280",
          title: "Schadensersatz wegen Pflichtverletzung",
          text: "Verletzt der Schuldner eine Pflicht...",
        },
      ],
    });
  }

  // ── Legal: research ─────────────────────────────────────────────────
  if (path === "/api/legal/research" && req.method === "POST") {
    return sendJson(res, 200, {
      answer:
        "Basierend auf der Recherche: § 433 BGB regelt die Pflichten beim Kaufvertrag. Bei Verzug kann Schadensersatz gem. § 280 I BGB geltend gemacht werden.",
      citations: [
        { code: "BGB", paragraph: "§ 433", verified: true },
        { code: "BGB", paragraph: "§ 280", verified: true },
      ],
      sources: ["law-de/bgb.md"],
    });
  }

  // ── Legal: writing-styles ───────────────────────────────────────────
  if (path === "/api/legal/writing-styles" && req.method === "GET") {
    return sendJson(res, 200, {
      styles: [
        { id: "formal", label: "Formal", description: "Klassischer anwaltlicher Stil" },
        { id: "modern", label: "Modern", description: "Zeitgemäße, klare Sprache" },
        { id: "persuasive", label: "Persuasiv", description: "Überzeugend und argumentativ" },
      ],
    });
  }

  // ── Legal: document-review ──────────────────────────────────────────
  if (path === "/api/legal/document-review" && req.method === "POST") {
    return sendJson(res, 200, {
      review: "Dokument geprüft: Keine auffälligen Klauseln. Standardvertrag.",
      issues: [],
      recommendation: "Vertrag kann unterzeichnet werden.",
    });
  }

  // ── Legal: due-diligence ────────────────────────────────────────────
  if (path === "/api/legal/due-diligence" && req.method === "POST") {
    return sendJson(res, 200, {
      categories: [
        { category: "Vertrag", status: "ok", findings: [] },
        {
          category: "Haftung",
          status: "warning",
          findings: ["Haftungsausschluss zu weitreichend"],
        },
        { category: "Compliance", status: "ok", findings: [] },
      ],
      overall_status: "warning",
    });
  }

  // ── Legal: auto-playbook ────────────────────────────────────────────
  if (path === "/api/legal/auto-playbook" && req.method === "POST") {
    return sendJson(res, 200, {
      playbook: {
        title: "Auto-Playbook Lieferverzug",
        rules: [
          { clause_type: "lieferfrist", rule: "Maximal 14 Tage", severity: "high" },
          {
            clause_type: "vertragsstrafe",
            rule: "Mindestens 5% des Auftragswerts",
            severity: "medium",
          },
        ],
      },
    });
  }

  // ── Legal: secretary-metrics ────────────────────────────────────────
  if (path === "/api/legal/secretary-metrics" && req.method === "GET") {
    return sendJson(res, 200, {
      metrics: {
        documents_filed: 42,
        deadlines_tracked: 15,
        reminders_sent: 8,
        overdue: 1,
      },
    });
  }

  // ── Legal: eval-gate ────────────────────────────────────────────────
  if (path === "/api/legal/eval-gate" && req.method === "POST") {
    return sendJson(res, 200, { passed: true, score: 0.87, details: "Alle Kriterien erfüllt." });
  }

  // ── Legal: retrieval-feedback ───────────────────────────────────────
  if (path === "/api/legal/retrieval-feedback" && req.method === "POST") {
    return sendJson(res, 200, { id: `fb-${Date.now()}`, created_at: now() });
  }

  // ── Legal: batch-edit ───────────────────────────────────────────────
  if (path === "/api/legal/batch-edit" && req.method === "POST") {
    return sendJson(res, 200, { updated: 5, errors: [] });
  }

  // ── Legal: permissions ──────────────────────────────────────────────
  if (path === "/api/legal/permissions" && req.method === "GET") {
    return sendJson(res, 200, { permissions: ["read", "write", "admin"], role: "lawyer" });
  }

  // ── Legal: knowledge-sources ────────────────────────────────────────
  if (path === "/api/legal/knowledge-sources" && req.method === "GET") {
    return sendJson(res, 200, {
      sources: [{ id: "law-de", label: "Deutsche Gesetze", count: 19 }],
    });
  }

  // ── Legal: sources ──────────────────────────────────────────────────
  if (path === "/api/legal/sources" && req.method === "GET") {
    return sendJson(res, 200, {
      sources: [
        {
          id: "law-de",
          label: "Deutsche Gesetze",
          jurisdiction: "de",
          type: "statute",
          status: "active",
          count: 19,
        },
        {
          id: "law-at",
          label: "Österreichische Gesetze",
          jurisdiction: "at",
          type: "statute",
          status: "active",
          count: 34,
        },
        {
          id: "law-ch",
          label: "Schweizer Gesetze",
          jurisdiction: "ch",
          type: "statute",
          status: "active",
          count: 7,
        },
      ],
    });
  }
  if (path === "/api/legal/sources" && req.method === "POST") {
    return sendJson(res, 200, {
      success: true,
      source_id: "law-de",
      sync_summary: { fetched: 19, imported: 19, errors: [], duration_ms: 500, timestamp: now() },
    });
  }

  // ── Legal: trigger-pipeline ─────────────────────────────────────────
  if (path === "/api/legal/trigger-pipeline" && req.method === "POST") {
    return sendJson(res, 200, {
      success: true,
      pipeline_id: `pipe-${Date.now()}`,
      status: "queued",
    });
  }

  // ── Legal: case-scanner ─────────────────────────────────────────────
  if (path === "/api/legal/case-scanner" && req.method === "POST") {
    return sendJson(res, 200, {
      success: true,
      job_id: `scan-${Date.now()}`,
      status: "queued",
      look_ahead_days: 7,
      evidence_threshold: 1,
      max_cases: 50,
    });
  }

  // ── Legal: ai-deadlines (GET) ───────────────────────────────────────
  if (path === "/api/legal/ai-deadlines" && req.method === "GET") {
    return sendJson(res, 200, { deadlines: [] });
  }

  // ── Legal: statute ──────────────────────────────────────────────────
  if (path === "/api/legal/statute" && req.method === "GET") {
    return sendJson(res, 200, {
      code: "BGB",
      paragraph: "§ 433",
      title: "Vertragstypische Pflichten beim Kaufvertrag",
      text: "(1) Durch den Kaufvertrag wird der Verkäufer einer Sache verpflichtet, dem Käufer die Sache zu übergeben und das Eigentum an der Sache zu verschaffen...",
    });
  }

  // ── Playbooks ───────────────────────────────────────────────────────
  if (path === "/api/legal/playbooks" && req.method === "GET") {
    const items = Array.from(pages.values()).filter((p) => p.type === "playbook");
    return sendJson(res, 200, items);
  }
  if (path === "/api/legal/playbooks" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const slug = `playbooks/${Date.now()}`;
    const page: MockPage = {
      slug,
      title: body.title,
      type: "playbook",
      content: body.description || "",
      frontmatter: {
        type: "playbook",
        title: body.title,
        jurisdiction: body.jurisdiction,
        contract_types: body.contract_types || [],
        rules: body.rules || [],
        created_at: now(),
      },
      created_at: now(),
      updated_at: now(),
    };
    pages.set(slug, page);
    return sendJson(res, 201, { slug });
  }
  const playbookMatch = path.match(/^\/api\/legal\/playbooks\/(.+)$/);
  if (playbookMatch) {
    const slug = decodeURIComponent(playbookMatch[1]);
    if (req.method === "GET") {
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      return sendJson(res, 200, page);
    }
    if (req.method === "PATCH") {
      const raw = await readBody(req);
      const body = safeJsonParse(raw);
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      page.frontmatter = {
        ...page.frontmatter,
        ...(body.rules ? { rules: body.rules } : {}),
        ...(body.title ? { title: body.title } : {}),
      };
      pages.set(slug, page);
      return sendJson(res, 200, { slug, success: true });
    }
    if (req.method === "DELETE") {
      pages.delete(slug);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── Templates ───────────────────────────────────────────────────────
  if (path === "/api/legal/templates" && req.method === "GET") {
    const items = Array.from(pages.values()).filter((p) => p.type === "template");
    return sendJson(res, 200, items);
  }
  if (path === "/api/legal/templates" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const slug = `templates/${Date.now()}`;
    const page: MockPage = {
      slug,
      title: body.title,
      type: "template",
      content: body.body || "",
      frontmatter: {
        type: "template",
        category: body.category,
        jurisdiction: body.jurisdiction,
        variables: body.variables || [],
        created_at: now(),
      },
      created_at: now(),
      updated_at: now(),
    };
    pages.set(slug, page);
    return sendJson(res, 201, { slug });
  }
  const templateMatch = path.match(/^\/api\/legal\/templates\/(.+)$/);
  if (templateMatch) {
    const slug = decodeURIComponent(templateMatch[1]);
    if (req.method === "GET") {
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      return sendJson(res, 200, page);
    }
    if (req.method === "DELETE") {
      pages.delete(slug);
      return sendJson(res, 200, { ok: true });
    }
  }

  // ── Litigation ──────────────────────────────────────────────────────
  if (path === "/api/legal/litigation" && req.method === "GET") {
    const items = Array.from(pages.values()).filter((p) => p.type === "litigation_matter");
    return sendJson(res, 200, items);
  }
  if (path === "/api/legal/litigation" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const slug = `litigation/${body.caseSlug}/${Date.now()}`;
    const page: MockPage = {
      slug,
      title: `Litigation: ${body.caseTitle}`,
      type: "litigation_matter",
      content: `Litigation matter for case ${body.caseTitle}`,
      frontmatter: {
        type: "litigation_matter",
        case_slug: body.caseSlug,
        case_title: body.caseTitle,
        phase: body.phase || "pre_filing",
        court: body.court || null,
        court_file_number: body.courtFileNumber || null,
        instance: body.instance || "1. Instanz",
        steps: body.steps || [],
        phase_history: [
          { phase: body.phase || "pre_filing", changedAt: now(), changedBy: "test@kanzlei.de" },
        ],
        settlement: { status: "none" },
        judgment: { outcome: "pending", appealable: false },
        created_at: now(),
        updated_at: now(),
      },
      created_at: now(),
      updated_at: now(),
    };
    pages.set(slug, page);
    audit("case.create", "litigation_matter", { slug });
    return sendJson(res, 201, { slug });
  }
  const litigationMatch = path.match(/^\/api\/legal\/litigation\/(.+)$/);
  if (litigationMatch) {
    const slug = decodeURIComponent(litigationMatch[1]);
    if (req.method === "GET") {
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      return sendJson(res, 200, page);
    }
    if (req.method === "PATCH") {
      const raw = await readBody(req);
      const body = safeJsonParse(raw);
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });

      // Validate phase transition
      const VALID_TRANSITIONS: Record<string, string[]> = {
        pre_filing: ["filing", "closed"],
        filing: ["discovery", "pre_trial", "closed"],
        discovery: ["pre_trial", "trial", "closed"],
        pre_trial: ["trial", "settlement", "closed"],
        trial: ["post_trial", "appeal", "closed"],
        post_trial: ["appeal", "enforcement", "closed"],
        appeal: ["enforcement", "closed"],
        enforcement: ["closed"],
        closed: [],
      };
      const currentPhase = page.frontmatter.phase as string;
      if (body.phase && body.phase !== currentPhase) {
        const allowed = VALID_TRANSITIONS[currentPhase] || [];
        if (!allowed.includes(body.phase)) {
          return sendJson(res, 400, {
            error: "invalid_transition",
            message: `Cannot advance from ${currentPhase} to ${body.phase}`,
          });
        }
        const history = (page.frontmatter.phase_history as Array<Record<string, unknown>>) || [];
        history.push({ phase: body.phase, changedAt: now(), changedBy: "test@kanzlei.de" });
        page.frontmatter = { ...page.frontmatter, phase: body.phase, phase_history: history };
      }
      if (body.steps) page.frontmatter.steps = body.steps;
      if (body.settlement) page.frontmatter.settlement = body.settlement;
      if (body.judgment) page.frontmatter.judgment = body.judgment;
      if (body.court) page.frontmatter.court = body.court;
      if (body.courtFileNumber) page.frontmatter.court_file_number = body.courtFileNumber;
      page.frontmatter.updated_at = now();
      pages.set(slug, page);
      return sendJson(res, 200, page);
    }
    if (req.method === "DELETE") {
      pages.delete(slug);
      return sendJson(res, 200, { success: true });
    }
  }

  // ── Review Sets ─────────────────────────────────────────────────────
  if (path === "/api/legal/review-sets" && req.method === "GET") {
    const items = Array.from(pages.values()).filter((p) => p.type === "review_set");
    return sendJson(res, 200, items);
  }
  if (path === "/api/legal/review-sets" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const slug = `review-sets/${Date.now()}`;
    const page: MockPage = {
      slug,
      title: body.title,
      type: "review_set",
      content: body.description || "",
      frontmatter: {
        type: "review_set",
        title: body.title,
        case_slug: body.caseSlug || null,
        status: "draft",
        documents: [],
        criteria: body.criteria || {},
        production: { produced: false, ...(body.production || {}) },
        statistics: {
          total: 0,
          responsive: 0,
          non_responsive: 0,
          privileged: 0,
          redacted: 0,
          withheld: 0,
        },
        created_at: now(),
        updated_at: now(),
      },
      created_at: now(),
      updated_at: now(),
    };
    pages.set(slug, page);
    return sendJson(res, 201, { slug });
  }
  const reviewSetMatch = path.match(/^\/api\/legal\/review-sets\/(.+)$/);
  if (reviewSetMatch) {
    const slug = decodeURIComponent(reviewSetMatch[1]);
    if (req.method === "GET") {
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      return sendJson(res, 200, page);
    }
    if (req.method === "PATCH") {
      const raw = await readBody(req);
      const body = safeJsonParse(raw);
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });

      if (body.documents) {
        // Apply Bates numbering if prefix provided
        let docs = body.documents;
        if (body.production?.batesPrefix && body.production?.batesStart !== undefined) {
          docs = docs.map((d: Record<string, unknown>, i: number) => ({
            ...d,
            batesNumber:
              d.batesNumber ??
              `${body.production.batesPrefix}-${String(body.production.batesStart + i).padStart(6, "0")}`,
          }));
        }
        page.frontmatter.documents = docs;
        // Compute statistics
        const stats = {
          total: docs.length,
          responsive: 0,
          non_responsive: 0,
          privileged: 0,
          redacted: 0,
          withheld: 0,
        };
        for (const d of docs) {
          const decision = (d as Record<string, unknown>).decision as string;
          if (decision === "responsive") stats.responsive++;
          if (decision === "non_responsive") stats.non_responsive++;
          if (decision === "privileged") stats.privileged++;
          if (decision === "redact") stats.redacted++;
          if (decision === "withhold") stats.withheld++;
        }
        page.frontmatter.statistics = stats;
      }
      if (body.status) page.frontmatter.status = body.status;
      if (body.production)
        page.frontmatter.production = { ...page.frontmatter.production, ...body.production };
      page.frontmatter.updated_at = now();
      pages.set(slug, page);
      return sendJson(res, 200, page);
    }
    if (req.method === "DELETE") {
      pages.delete(slug);
      return sendJson(res, 200, { success: true });
    }
  }

  // ── Trust Accounts ──────────────────────────────────────────────────
  if (path === "/api/legal/trust-accounts" && req.method === "GET") {
    const items = Array.from(pages.values()).filter((p) => p.type === "trust_account");
    return sendJson(res, 200, items);
  }
  if (path === "/api/legal/trust-accounts" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const slug = `trust-accounts/${Date.now()}`;
    const page: MockPage = {
      slug,
      title: body.accountName,
      type: "trust_account",
      content: `Trust account: ${body.accountName}`,
      frontmatter: {
        type: "trust_account",
        account_name: body.accountName,
        account_number: body.accountNumber,
        bank_name: body.bankName || null,
        iban: body.iban || null,
        bic: body.bic || null,
        status: "active",
        currency: body.currency || "EUR",
        opening_balance: body.openingBalance || 0,
        current_balance: body.openingBalance || 0,
        matter_slug: body.matterSlug || null,
        client_name: body.clientName || null,
        transactions: [],
        reconciliations: [],
        created_at: now(),
        updated_at: now(),
      },
      created_at: now(),
      updated_at: now(),
    };
    pages.set(slug, page);
    return sendJson(res, 201, { slug });
  }
  const trustMatch = path.match(/^\/api\/legal\/trust-accounts\/(.+)$/);
  if (trustMatch) {
    const slug = decodeURIComponent(trustMatch[1]);
    if (req.method === "GET") {
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      return sendJson(res, 200, page);
    }
    if (req.method === "PATCH") {
      const raw = await readBody(req);
      const body = safeJsonParse(raw);
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });

      if (body.status) page.frontmatter.status = body.status;
      if (body.transactions) {
        page.frontmatter.transactions = body.transactions;
        const opening = page.frontmatter.opening_balance as number;
        const balance = (body.transactions as Array<Record<string, unknown>>).reduce(
          (sum, tx) =>
            sum +
            (tx.type === "deposit" || tx.type === "interest"
              ? (tx.amount as number)
              : -(tx.amount as number)),
          opening
        );
        page.frontmatter.current_balance = balance;
      }
      if (body.reconciliations) page.frontmatter.reconciliations = body.reconciliations;
      page.frontmatter.updated_at = now();
      pages.set(slug, page);
      return sendJson(res, 200, page);
    }
    if (req.method === "POST") {
      // Add transaction
      const raw = await readBody(req);
      const body = safeJsonParse(raw);
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });

      const txs = (page.frontmatter.transactions as Array<Record<string, unknown>>) || [];
      const newTx = {
        id: `tx_${Date.now()}`,
        type: body.type,
        amount: body.amount,
        currency: body.currency || "EUR",
        date: body.date || now(),
        description: body.description,
        matterSlug: body.matterSlug,
        reference: body.reference,
        createdBy: "test@kanzlei.de",
        createdAt: now(),
      };
      const allTxs = [...txs, newTx];
      const opening = page.frontmatter.opening_balance as number;
      const balance = allTxs.reduce(
        (sum, tx) =>
          sum +
          (tx.type === "deposit" || tx.type === "interest"
            ? (tx.amount as number)
            : -(tx.amount as number)),
        opening
      );
      page.frontmatter.transactions = allTxs;
      page.frontmatter.current_balance = balance;
      page.frontmatter.updated_at = now();
      pages.set(slug, page);
      return sendJson(res, 201, { transaction: newTx });
    }
    if (req.method === "DELETE") {
      pages.delete(slug);
      return sendJson(res, 200, { success: true });
    }
  }

  // ── Analytics ───────────────────────────────────────────────────────
  if (path === "/api/legal/analytics" && req.method === "GET") {
    const items = Array.from(pages.values()).filter((p) => p.type === "litigation_analytics");
    return sendJson(res, 200, items);
  }
  if (path === "/api/legal/analytics" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const slug = `litigation-analytics/${Date.now()}`;
    let durationDays: number | undefined;
    if (body.startDate && body.endDate) {
      durationDays = Math.round(
        (new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
    }
    const page: MockPage = {
      slug,
      title: body.caseTitle,
      type: "litigation_analytics",
      content: `Analytics: ${body.caseTitle} — ${body.court}`,
      frontmatter: {
        type: "litigation_analytics",
        case_slug: body.caseSlug,
        case_title: body.caseTitle,
        case_number: body.caseNumber || null,
        court: body.court,
        court_level: body.courtLevel || null,
        judge: body.judge || null,
        procedure_type: body.procedureType || "zivil",
        outcome: body.outcome || "pending",
        amount_in_dispute: body.amountInDispute || null,
        amount_awarded: body.amountAwarded || null,
        start_date: body.startDate || null,
        end_date: body.endDate || null,
        duration_days: durationDays,
        lawyer_hours: body.lawyerHours || null,
        notes: body.notes || null,
        created_at: now(),
        updated_at: now(),
      },
      created_at: now(),
      updated_at: now(),
    };
    pages.set(slug, page);
    return sendJson(res, 201, { slug });
  }
  const analyticsMatch = path.match(/^\/api\/legal\/analytics\/(.+)$/);
  if (analyticsMatch) {
    const slug = decodeURIComponent(analyticsMatch[1]);
    if (req.method === "GET") {
      const page = pages.get(slug);
      if (!page) return sendJson(res, 404, { error: "not_found" });
      return sendJson(res, 200, page);
    }
    if (req.method === "DELETE") {
      pages.delete(slug);
      return sendJson(res, 200, { success: true });
    }
  }

  // ── Email import ────────────────────────────────────────────────────
  if (path === "/api/email-import" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    // Try to match a case
    let matchedCase: Record<string, unknown> | null = null;
    for (const p of pages.values()) {
      if (
        p.type === "legal_case" &&
        p.title.toLowerCase().includes((body.subject || "").toLowerCase().slice(0, 20))
      ) {
        matchedCase = { slug: p.slug, title: p.title };
        break;
      }
    }
    return sendJson(res, 200, {
      success: true,
      duplicate: false,
      matchedCase: matchedCase || undefined,
      suggestions: matchedCase
        ? []
        : Array.from(pages.values())
            .filter((p) => p.type === "legal_case")
            .slice(0, 3)
            .map((p) => ({ slug: p.slug, title: p.title })),
    });
  }

  // ── Document requests ───────────────────────────────────────────────
  if (path === "/api/document-requests" && req.method === "GET") {
    const items = Array.from(pages.values()).filter((p) => p.type === "document_request");
    return sendJson(res, 200, { items, total: items.length });
  }
  if (path === "/api/document-requests" && req.method === "POST") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    const slug = `doc-requests/${Date.now()}`;
    const page: MockPage = {
      slug,
      title: `Dokumentenanforderung: ${body.case_slug}`,
      type: "document_request",
      content: body.text || "",
      frontmatter: {
        type: "document_request",
        case_slug: body.case_slug,
        items: body.items || [],
        status: body.status || "draft",
        channel: body.channel || "manual",
        created_at: now(),
      },
      created_at: now(),
      updated_at: now(),
    };
    pages.set(slug, page);
    return sendJson(res, 201, { slug });
  }

  // ── Connectors ──────────────────────────────────────────────────────
  if (path === "/api/connectors" && req.method === "GET") {
    return sendJson(res, 200, {
      connectors: [
        {
          service: "advokat-import",
          configured: false,
          enabled: false,
          connected: false,
          hasCredentials: false,
          last_sync_at: null,
        },
        {
          service: "bea-import",
          configured: false,
          enabled: false,
          connected: false,
          hasCredentials: false,
          last_sync_at: null,
        },
      ],
    });
  }

  // ── OCR status ──────────────────────────────────────────────────────
  if (path === "/api/ocr-status" && req.method === "GET") {
    return sendJson(res, 200, {
      ocr_enabled: true,
      model: "gpt-4o-mini",
      attempted: 2,
      succeeded: 2,
      failed: 0,
    });
  }

  // ── Workflows ───────────────────────────────────────────────────────
  if (path === "/api/workflows" && req.method === "GET") {
    return sendJson(res, 200, { items: [], templates: [] });
  }

  // ── Clause annotations ──────────────────────────────────────────────
  if (path === "/api/clause-annotations" && req.method === "GET") {
    return sendJson(res, 200, { items: [], stats: { total: 0, by_risk: {}, by_status: {} } });
  }

  // ── Human review ────────────────────────────────────────────────────
  if (path === "/api/human-review" && req.method === "GET") {
    return sendJson(res, 200, { items: [] });
  }

  // ── Generic fallback ────────────────────────────────────────────────
  if (req.method === "GET") {
    return sendJson(res, 200, { items: [], mock: true, path });
  }
  if (req.method === "POST" || req.method === "PATCH") {
    const raw = await readBody(req);
    const body = safeJsonParse(raw);
    return sendJson(res, 200, { ...body, mock: true, path });
  }

  return sendJson(res, 404, { error: "not_found", path });
}

// ── Start server ──────────────────────────────────────────────────────

const server = createServer((req, res) => {
  try {
    void handleReq(req, res);
  } catch (err) {
    console.error("[mock-engine-extended] error:", err);
    sendJson(res, 500, { error: "mock_engine_error" });
  }
});

server.listen(PORT, () => {
  console.log(`[mock-engine-extended] listening on http://localhost:${PORT}`);
});

process.on("SIGTERM", () => {
  server.close();
  process.exit(0);
});
process.on("SIGINT", () => {
  server.close();
  process.exit(0);
});

export { server };
