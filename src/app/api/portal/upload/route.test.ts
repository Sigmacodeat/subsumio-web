// @vitest-environment node
// Two portal uploads into the same matter at the same time: both documents and
// both communication entries must remain on the matter.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  clientIp: () => "203.0.113.9",
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/portal-token", () => ({
  verifyPortalToken: vi.fn(async () => ({
    case_slug: "cases/a",
    brain_id: "brain_1",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })),
  isPortalTokenSuperseded: () => false,
}));
vi.mock("@/lib/upload-pipeline", () => ({
  scanUploadWithDuplicateCheck: vi.fn(async (file: File) => ({
    ok: true,
    buffer: Buffer.from(await file.arrayBuffer()),
    cleanName: file.name,
    mimeType: "application/pdf",
  })),
}));
vi.mock("@/lib/duplicate-store", () => ({ brainDuplicateStore: () => ({}) }));
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: vi.fn(async () => []) }));
vi.mock("@/lib/inbound-register-stamp", () => ({
  stampInboundEntryBestEffort: vi.fn(async () => undefined),
}));
vi.mock("@/lib/post-upload-outbox", () => ({
  enqueueAllPostUploadTasks: vi.fn(async () => undefined),
}));
vi.mock("@/lib/engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine")>()),
  engineConfigurationResponse: () => null,
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
  enginePatchPage: vi.fn(async () => new Response("{}", { status: 200 })),
}));

import { POST } from "./route";
import { scanUploadWithDuplicateCheck } from "@/lib/upload-pipeline";

let caseFm: Record<string, unknown>;
let uploadCounter = 0;
let requestFm: Record<string, unknown> | null;
let requestWrites: Array<Record<string, unknown>>;

beforeEach(() => {
  caseFm = { portal_enabled: true, status: "open", documents: [], communications: [] };
  uploadCounter = 0;
  requestFm = null;
  requestWrites = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u === "http://engine.test/api/upload") {
        const n = ++uploadCounter;
        // The first upload is slow: the second one finishes in between.
        await new Promise((r) => setTimeout(r, n === 1 ? 40 : 5));
        return new Response(JSON.stringify({ slug: `documents/upload-${n}`, title: `Datei ${n}` }));
      }
      if (u === "http://engine.test/api/pages" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          slug: string;
          frontmatter: Record<string, unknown>;
        };
        if (body.slug === "cases/a") {
          // Engine merge: top-level keys replace — like the real merge write.
          await new Promise((r) => setTimeout(r, 5));
          caseFm = { ...caseFm, ...body.frontmatter };
        }
        if (body.slug === "requests/r1") requestWrites.push(body.frontmatter);
        return new Response("{}", { status: 200 });
      }
      if (u.startsWith("http://engine.test/api/pages/")) {
        const slug = decodeURIComponent(u.replace("http://engine.test/api/pages/", ""));
        if (slug === "cases/a")
          return new Response(
            JSON.stringify({
              slug: "cases/a",
              title: "Akte A",
              frontmatter: structuredClone(caseFm),
            })
          );
        if (slug === "requests/r1" && requestFm)
          return new Response(
            JSON.stringify({
              slug,
              title: "Anforderung",
              type: "document_request",
              frontmatter: requestFm,
            })
          );
      }
      return new Response("{}", { status: 404 });
    })
  );
});

function upload(name: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("token", extra.token ?? "tok");
  for (const [k, v] of Object.entries(extra)) if (k !== "token") form.append(k, v);
  form.append("file", new File([`%PDF ${name}`], name, { type: "application/pdf" }));
  return POST(
    new Request("http://x/api/portal/upload", {
      method: "POST",
      headers: { "x-portal-token": "tok" },
      body: form,
    }) as never
  );
}

describe("POST /api/portal/upload", () => {
  it("two parallel uploads keep both documents and both communications", async () => {
    const [a, b] = await Promise.all([upload("a.pdf"), upload("b.pdf")]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const docs = (caseFm.documents as Array<{ slug: string }>).map((d) => d.slug).sort();
    expect(docs).toEqual(["documents/upload-1", "documents/upload-2"]);
    expect(caseFm.communications as unknown[]).toHaveLength(2);
  });

  describe("document requests", () => {
    const openRequest = () => ({
      type: "document_request",
      case_slug: "cases/a",
      recipient_role: "client",
      status: "sent",
      items: [
        { key: "reisepass", label: "Reisepass", required: true },
        { key: "meldezettel", label: "Meldezettel", required: true },
      ],
      created_at: "2026-09-01T00:00:00.000Z",
    });

    it("a general upload never ticks off a requested document", async () => {
      requestFm = openRequest();
      const res = await upload("reisepass.pdf");
      expect(res.status).toBe(200);
      expect(requestWrites).toHaveLength(0);
      const json = await res.json();
      expect(json.documentRequestSlug).toBeUndefined();
    });

    it("the chosen item is recorded as submitted — received only after the firm confirms", async () => {
      requestFm = openRequest();
      const res = await upload("IMG_1234.jpg", {
        document_request_slug: "requests/r1",
        item_key: "meldezettel",
      });
      expect(res.status).toBe(200);
      expect(requestWrites).toHaveLength(1);
      const items = requestWrites[0].items as Array<Record<string, unknown>>;
      expect(items[0].submitted_document_slug).toBeUndefined();
      expect(items[1].submitted_document_slug).toBe("documents/upload-1");
      expect(items.every((i) => i.received_document_slug === undefined)).toBe(true);
      expect(requestWrites[0].status).toBeUndefined();
    });

    it.each([
      ["a draft", { status: "draft" }],
      ["a firm-internal request", { recipient_role: "lawyer" }],
      ["another matter's request", { case_slug: "cases/b" }],
    ])("does not touch %s", async (_label, patch) => {
      requestFm = { ...openRequest(), ...patch };
      const res = await upload("x.pdf", {
        document_request_slug: "requests/r1",
        item_key: "reisepass",
      });
      expect(res.status).toBe(200);
      expect(requestWrites).toHaveLength(0);
    });
  });

  describe("access before the body", () => {
    function bare(headers: Record<string, string>) {
      const req = new Request("http://x/api/portal/upload", {
        method: "POST",
        headers,
        body: "x",
      });
      const spy = vi.spyOn(req, "formData");
      return { req, spy };
    }

    it("refuses a request without header or session cookie and never reads the body", async () => {
      const { req, spy } = bare({});
      const res = await POST(req as never);
      expect(res.status).toBe(403);
      expect(spy).not.toHaveBeenCalled();
    });

    it("refuses an oversized declared body unread", async () => {
      const { req, spy } = bare({
        "x-portal-token": "tok",
        "content-length": String(10 * 1024 * 1024 * 1024),
      });
      const res = await POST(req as never);
      expect(res.status).toBe(413);
      expect(spy).not.toHaveBeenCalled();
    });

    it("refuses an invalid token unread", async () => {
      const { verifyPortalToken } = await import("@/lib/portal-token");
      vi.mocked(verifyPortalToken).mockResolvedValueOnce(null);
      const { req, spy } = bare({ "x-portal-token": "bad" });
      const res = await POST(req as never);
      expect(res.status).toBe(403);
      expect(spy).not.toHaveBeenCalled();
    });

    it("accepts the session cookie instead of the header", async () => {
      const form = new FormData();
      form.append("file", new File(["%PDF c"], "c.pdf", { type: "application/pdf" }));
      const res = await POST(
        new Request("http://x/api/portal/upload", {
          method: "POST",
          headers: { cookie: "subsumio_portal=tok" },
          body: form,
        }) as never
      );
      expect(res.status).toBe(200);
    });

    it("refuses a form token that differs from the checked one", async () => {
      const res = await upload("d.pdf", { token: "other" });
      expect(res.status).toBe(403);
    });
  });

  it("a duplicate is reported without the firm's internal file name or slug", async () => {
    vi.mocked(scanUploadWithDuplicateCheck).mockResolvedValueOnce({
      ok: false,
      error: "duplicate_file",
      message: 'Datei bereits vorhanden: „Interne Strategie.pdf" (Slug: documents/intern-1)',
      status: 409,
    } as never);
    const res = await upload("x.pdf");
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(text).not.toContain("documents/intern-1");
    expect(text).not.toContain("Interne Strategie");
    expect(JSON.parse(text).message).toBe("Diese Datei liegt Ihrer Kanzlei bereits vor.");
  });
});
