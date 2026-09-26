// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const handlerOpts: { action?: string } = {};

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: vi.fn(async () => new Response("{}", { status: 200 })),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { action: string; body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      handlerOpts.action = opts.action;
      const ctx = {
        brainId: "brain-1",
        user: { id: "lawyer-1", email: "ra@kanzlei.at", role: "lawyer", jurisdiction: "AT" },
        headers: {},
      };
      return handler(ctx, opts.body ? opts.body.parse(await req.json()) : undefined);
    },
  apiError: (code: string, message: string, status: number, details?: unknown) =>
    Response.json({ error: message, code, details }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => undefined),
  SYSTEM_BRAIN: "system",
}));

const grounding = {
  citations_verified: 2,
  citations_unverified: 0,
  corpus_checked: true,
  grounded_citations: [],
  analyzed_at: "2026-09-24T10:00:00.000Z",
  has_unverified: false,
} as Record<string, unknown>;

vi.mock("@/lib/citation-gate", () => ({
  groundAnswerCitations: vi.fn(async () => grounding),
}));

import { POST } from "./route";
import { enginePatchPage } from "@/lib/engine";
import { groundAnswerCitations } from "@/lib/citation-gate";
import { contentHashOf, verifyRelease } from "@/lib/ai-release";

function release(body: Record<string, unknown>) {
  return POST(
    new Request("http://x/api/ai-output/release", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  vi.mocked(groundAnswerCitations).mockResolvedValue(grounding as never);
  vi.mocked(enginePatchPage).mockClear();
});

describe("POST /api/ai-output/release", () => {
  it("is limited to roles that may approve (lawyer/admin)", async () => {
    await release({ content: "Text", check_only: true });
    expect(handlerOpts.action).toBe("workflow.approve");
  });

  it("checks citations server-side and issues a release bound to the text", async () => {
    const res = await release({ content: "Klage nach § 1295 ABGB" });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.state).toBe("VERIFIED");
    expect(groundAnswerCitations).toHaveBeenCalledWith(
      "Klage nach § 1295 ABGB",
      expect.objectContaining({ fallbackJurisdiction: "at" })
    );
    const check = verifyRelease(data.release, {
      brainId: "brain-1",
      contentHash: contentHashOf("Klage nach § 1295 ABGB"),
    });
    expect(check.ok).toBe(true);
  });

  it("check_only returns the result without a release", async () => {
    const res = await release({ content: "Text", check_only: true });
    const { data } = await res.json();
    expect(data.release).toBeUndefined();
    expect(data.state).toBe("VERIFIED");
  });

  it("unverified citations need a reason (422), then release with the override logged", async () => {
    vi.mocked(groundAnswerCitations).mockResolvedValue({
      ...grounding,
      citations_verified: 1,
      citations_unverified: 1,
      has_unverified: true,
    } as never);
    const refused = await release({ content: "Text mit § 999 XYZ" });
    expect(refused.status).toBe(422);
    expect((await refused.json()).code).toBe("override_reason_required");

    const tooShort = await release({ content: "Text mit § 999 XYZ", override_reason: "ok" });
    expect(tooShort.status).toBe(422);

    const res = await release({
      content: "Text mit § 999 XYZ",
      override_reason: "Zitat händisch im RIS geprüft",
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const check = verifyRelease(data.release, {
      brainId: "brain-1",
      contentHash: contentHashOf("Text mit § 999 XYZ"),
    });
    expect(check.ok && check.release.overrideReason).toBe("Zitat händisch im RIS geprüft");
  });

  it("a failed citation check cannot be released, not even with a reason", async () => {
    vi.mocked(groundAnswerCitations).mockResolvedValue({
      ...grounding,
      check_failed: true,
      corpus_checked: false,
    } as never);
    const res = await release({ content: "Text", override_reason: "trotzdem freigeben bitte" });
    expect(res.status).toBe(409);
  });

  it("an unreachable checker is 503, no release", async () => {
    vi.mocked(groundAnswerCitations).mockRejectedValue(new Error("down"));
    const res = await release({ content: "Text" });
    expect(res.status).toBe(503);
  });

  it("releases a stored page by its server-read text and stores the release on it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ slug: "legal/drafts/a", title: "Klage", compiled_truth: "Gespeichert" })
      )
    );
    const res = await release({ slug: "legal/drafts/a" });
    expect(res.status).toBe(200);
    const patch = vi.mocked(enginePatchPage).mock.calls[0]![1] as {
      frontmatter: Record<string, unknown>;
    };
    const check = verifyRelease(patch.frontmatter.ai_release, {
      brainId: "brain-1",
      contentHash: contentHashOf("Gespeichert"),
    });
    expect(check.ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it("requires exactly one of content and slug", async () => {
    await expect(release({})).rejects.toThrow();
    await expect(release({ content: "a", slug: "b" })).rejects.toThrow();
  });
});
