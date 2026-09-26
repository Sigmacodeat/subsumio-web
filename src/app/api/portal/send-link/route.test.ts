// @vitest-environment node
// Signature link: validate → deliver → only then register + mark as sent; the
// token never lands on the document; a document of another matter is refused.
import { beforeEach, describe, expect, it, vi } from "vitest";

const patches: Array<{ slug: string; frontmatter: Record<string, unknown> }> = [];
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: vi.fn(
    async (_h: unknown, p: { slug: string; frontmatter: Record<string, unknown> }) => {
      patches.push(p);
      return new Response("{}", { status: 200 });
    }
  ),
}));
const sendFirmMail = vi.fn();
vi.mock("@/lib/firm-mail", () => ({ sendFirmMail: (...a: unknown[]) => sendFirmMail(...a) }));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: vi.fn(async () => ({})),
}));
vi.mock("@/lib/whatsapp/proactive-send", () => ({ sendProactiveMessage: vi.fn() }));
vi.mock("@/lib/portal-token", () => ({
  signPortalToken: vi.fn(async () => "SECRET-PORTAL-TOKEN-123"),
  verifyPortalToken: vi.fn(async () => ({ exp: Math.floor(Date.now() / 1000) + 3600 })),
}));
const registerPortalLink = vi.fn(async () => undefined);
vi.mock("@/lib/portal-links", () => ({
  registerPortalLink: (...a: unknown[]) => registerPortalLink(...(a as [])),
}));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: { body?: { parse: (v: unknown) => unknown } },
        handler: (ctx: unknown, body: unknown) => Promise<Response>
      ) =>
      async (req: Request) =>
        handler(
          {
            brainId: "brain_1",
            headers: { "x-subsumio-source": "brain_1" },
            user: { id: "u1", email: "anwalt@kanzlei.at", role: "lawyer" },
          },
          opts.body ? opts.body.parse(await req.json()) : undefined
        ),
  };
});

import { POST } from "./route";

let docFm: Record<string, unknown>;

beforeEach(() => {
  patches.length = 0;
  vi.clearAllMocks();
  docFm = { case_slug: "cases/a", status: "draft" };
  sendFirmMail.mockResolvedValue({ sent: true, via: "smtp" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const slug = decodeURIComponent(String(url).replace("http://engine.test/api/pages/", ""));
      if (slug === "cases/a")
        return new Response(JSON.stringify({ frontmatter: { portal_enabled: true } }));
      if (slug === "legal/poa/p1") return new Response(JSON.stringify({ frontmatter: docFm }));
      return new Response("{}", { status: 404 });
    })
  );
});

function send(extra: Record<string, unknown>) {
  return POST(
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        case_slug: "cases/a",
        document_slug: "legal/poa/p1",
        document_title: "Vollmacht",
        document_type: "power_of_attorney",
        ...extra,
      }),
    }) as never
  );
}

describe("POST /api/portal/send-link", () => {
  it("email without address → 400, nothing marked or registered", async () => {
    const res = await send({ channel: "email" });
    expect(res.status).toBe(400);
    expect(patches).toHaveLength(0);
    expect(registerPortalLink).not.toHaveBeenCalled();
  });

  it("a failed mail leaves the document status unchanged", async () => {
    sendFirmMail.mockResolvedValue({ sent: false, error: "SMTP down" });
    const res = await send({ channel: "email", recipient_email: "m@example.at" });
    expect(res.status).toBe(502);
    expect(patches).toHaveLength(0);
    expect(registerPortalLink).not.toHaveBeenCalled();
  });

  it("a document of another matter is refused with 409", async () => {
    docFm = { case_slug: "cases/b", status: "draft" };
    const res = await send({ channel: "email", recipient_email: "m@example.at" });
    expect(res.status).toBe(409);
    expect(sendFirmMail).not.toHaveBeenCalled();
    expect(patches).toHaveLength(0);
  });

  it("a revoked document is not sent again", async () => {
    docFm = { case_slug: "cases/a", status: "revoked" };
    const res = await send({ channel: "copy" });
    expect(res.status).toBe(409);
  });

  it("after delivery the document is marked sent, without any token in its frontmatter", async () => {
    const res = await send({ channel: "email", recipient_email: "m@example.at" });
    expect(res.status).toBe(200);
    expect(registerPortalLink).toHaveBeenCalledTimes(1);
    expect(patches).toHaveLength(1);
    expect(patches[0].frontmatter.status).toBe("sent");
    expect(JSON.stringify(patches[0].frontmatter)).not.toContain("SECRET-PORTAL-TOKEN");
    expect(patches[0].frontmatter.portal_url).toBeNull();
  });
});
