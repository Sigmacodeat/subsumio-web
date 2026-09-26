// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = { brainId: "brain-1", user: { id: "u1", email: "a@b.at" }, headers: {} };
      return handler(ctx, opts.body ? opts.body.parse(await req.json()) : undefined);
    },
  apiError: (code: string, message: string, status: number, details?: unknown) =>
    Response.json({ error: message, code, details }, { status }),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

vi.mock("@/lib/docx-export", () => ({
  generateDocx: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

import { POST } from "./route";
import { generateDocx } from "@/lib/docx-export";
import { contentHashOf, signRelease } from "@/lib/ai-release";

function exportDocx(body: Record<string, unknown>) {
  return POST(
    new Request("http://x/api/word-export", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never
  );
}

function releaseFor(text: string, brainId = "brain-1", extra: Record<string, unknown> = {}) {
  return signRelease({
    brainId,
    contentHash: contentHashOf(text),
    state: "VERIFIED",
    releasedBy: "lawyer-1",
    releasedAt: "2026-09-24T10:00:00.000Z",
    citationsVerified: 2,
    citationsUnverified: 0,
    ...extra,
  });
}

describe("POST /api/word-export — freier KI-Text (Markdown)", () => {
  it("refuses AI markdown without a lawyer's release (403 release_required)", async () => {
    const calls = vi.mocked(generateDocx).mock.calls.length;
    const res = await exportDocx({ title: "Entwurf", markdown: "Text" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("release_required");
    expect(vi.mocked(generateDocx).mock.calls.length).toBe(calls);
  });

  it("does not believe the client's ai_generated:false for free markdown", async () => {
    const res = await exportDocx({ title: "Vollmacht", markdown: "Text", ai_generated: false });
    expect(res.status).toBe(403);
  });

  it("ignores a client-sent verification state", async () => {
    const res = await exportDocx({
      title: "Entwurf",
      markdown: "Text",
      verification: { state: "VERIFIED", content_hash: "a".repeat(64) },
    });
    expect(res.status).toBe(403);
  });

  it("exports released AI markdown, marked as AI (Art. 50 KI-VO)", async () => {
    const res = await exportDocx({
      title: "Entwurf",
      markdown: "Text",
      release: releaseFor("Text"),
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(generateDocx).mock.calls.at(-1)?.[1]).toMatchObject({ aiGenerated: true });
  });

  it("refuses a release for other text (edited after the release)", async () => {
    const res = await exportDocx({
      title: "Entwurf",
      markdown: "Text geändert",
      release: releaseFor("Text"),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).details.reason).toBe("content_changed");
  });

  it("refuses a release of another firm", async () => {
    const res = await exportDocx({
      title: "Entwurf",
      markdown: "Text",
      release: releaseFor("Text", "other-brain"),
    });
    expect(res.status).toBe(403);
  });

  it("refuses a forged release token", async () => {
    const token = releaseFor("Text");
    const [body] = token.split(".");
    const res = await exportDocx({ title: "Entwurf", markdown: "Text", release: `${body}.AAAA` });
    expect(res.status).toBe(403);
  });

  it("refuses an unverified release without override reason", async () => {
    const res = await exportDocx({
      title: "Entwurf",
      markdown: "Text",
      release: releaseFor("Text", "brain-1", { state: "NEEDS_HUMAN_REVIEW" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/word-export — Vorlage (serverseitig befüllt)", () => {
  function templatePage(page: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ slug: "legal/templates/vollmacht", ...page }))
    );
  }

  it("exports a server-filled template without AI marking and without release", async () => {
    templatePage({ type: "legal_template", content: "Vollmacht für {{mandant}}", frontmatter: {} });
    const res = await exportDocx({
      title: "Vollmacht",
      template: { slug: "legal/templates/vollmacht", values: { mandant: "Muster_GmbH" } },
    });
    expect(res.status).toBe(200);
    const [md, opts] = vi.mocked(generateDocx).mock.calls.at(-1)!;
    expect(opts).toMatchObject({ aiGenerated: false });
    expect(md).toContain("Muster\\_GmbH");
  });

  it("does not accept another page type as a template", async () => {
    templatePage({
      type: "legal_document",
      content: "KI-Text",
      frontmatter: { ai_generated: true },
    });
    const res = await exportDocx({
      title: "X",
      template: { slug: "legal/drafts/ki", values: {} },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/word-export — gespeicherte KI-Seiten", () => {
  function storedPage(frontmatter: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ slug: "docs/ki", content: "Entwurf", frontmatter }))
    );
  }

  it("refuses to export a stored AI draft without a release (403)", async () => {
    storedPage({ ai_generated: true });
    const calls = vi.mocked(generateDocx).mock.calls.length;
    const res = await exportDocx({ slug: "docs/ki", title: "Entwurf" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("release_required");
    expect(vi.mocked(generateDocx).mock.calls.length).toBe(calls);
  });

  it("exports a stored AI draft with the release stored on the page, marked as AI", async () => {
    storedPage({ ai_generated: true, ai_release: releaseFor("Entwurf") });
    const res = await exportDocx({ slug: "docs/ki", title: "Entwurf", ai_generated: false });
    expect(res.status).toBe(200);
    expect(vi.mocked(generateDocx).mock.calls.at(-1)?.[1]).toMatchObject({ aiGenerated: true });
  });

  it("exports a stored page without AI origin as before", async () => {
    storedPage({});
    const res = await exportDocx({ slug: "docs/brief", title: "Brief", ai_generated: false });
    expect(res.status).toBe(200);
    expect(vi.mocked(generateDocx).mock.calls.at(-1)?.[1]).toMatchObject({ aiGenerated: false });
  });
});
