// @vitest-environment node
// XJustiz export of a beA draft: the main document is the draft's stored
// text with its real byte size and SHA-256 — the UI no longer sends a
// placeholder (size 0), which the schema always refused.
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ pages: {} as Record<string, unknown> }));

vi.mock("@/lib/api-handler", async () => {
  return {
    createHandler:
      (
        opts: {
          body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
        },
        handler: (ctx: unknown, body: unknown) => Promise<Response>
      ) =>
      async (req: Request) => {
        const parsed = opts.body!.safeParse(await req.json());
        if (!parsed.success) return Response.json({ error: "validation" }, { status: 400 });
        return handler(
          {
            brainId: "brain-de",
            headers: { "x-subsumio-source": "brain-de" },
            user: { id: "u1", email: "a@example.com" },
          },
          parsed.data
        );
      },
    apiSuccess: (data: unknown) => Response.json({ data }),
    apiError: (code: string, message: string, status: number) =>
      Response.json({ error: message, code }, { status }),
  };
});
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/bea-send-guard", () => ({
  hasCourtName: () => true,
  resolveFilingSender: async () => ({ name: "Kanzlei Muster", id: "SAFE-1" }),
}));

import { POST } from "./route";

const DRAFT = "legal/bea-drafts/2026-09-26-klage";
const TEXT = "Klage gegen Musterfirma — Schriftsatz mit Umlauten äöü.";

beforeEach(() => {
  m.pages = {
    [DRAFT]: { slug: DRAFT, type: "bea_draft", title: "Entwurf", content: TEXT },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const slug = decodeURIComponent(String(url).replace("http://engine.test/api/pages/", ""));
      const page = m.pages[slug];
      return page ? Response.json(page) : new Response("nf", { status: 404 });
    })
  );
});

function exportDraft(extra: Record<string, unknown> = {}) {
  return (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/bea/export", {
      method: "POST",
      body: JSON.stringify({
        case_slug: DRAFT,
        court: "Landgericht Berlin",
        subject: "Klage",
        draft_slug: DRAFT,
        ...extra,
      }),
    })
  );
}

describe("POST /api/bea/export — draft export", () => {
  it("exports the draft text with its real size and hash", async () => {
    const res = await exportDraft();
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: { xml: string; manifest: { documents?: Array<Record<string, unknown>> } };
    };
    const bytes = Buffer.from(TEXT, "utf8");
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(data.xml).toContain(hash);
    expect(JSON.stringify(data.manifest)).toContain(String(bytes.length));
  });

  it("refuses an empty draft", async () => {
    m.pages[DRAFT] = { slug: DRAFT, type: "bea_draft", content: "" };
    const res = await exportDraft();
    expect(res.status).toBe(422);
  });

  it("answers 404 for an unknown draft", async () => {
    const res = await exportDraft({ draft_slug: "legal/bea-drafts/fehlt" });
    expect(res.status).toBe(404);
  });

  it("still refuses a placeholder document of size 0", async () => {
    const res = await exportDraft({
      draft_slug: undefined,
      documents: [
        {
          title: "x",
          file_path: DRAFT,
          mime_type: "application/pdf",
          size_bytes: 0,
          file_hash: "pending",
          is_main_document: true,
        },
      ],
    });
    expect(res.status).toBe(400);
  });
});
