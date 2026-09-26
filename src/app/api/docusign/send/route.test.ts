// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  asUser: vi.fn(),
  service: vi.fn(),
}));

vi.mock("@/lib/docusign", async (orig) => ({
  ...(await orig<typeof import("@/lib/docusign")>()),
  isConfigured: () => true,
  createEnvelopeAsUser: (...a: unknown[]) => m.asUser(...a),
  createEnvelope: (...a: unknown[]) => m.service(...a),
}));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: { body: { parse: (v: unknown) => unknown } },
        handler: (ctx: unknown, body: unknown) => Promise<Response>
      ) =>
      async (req: Request) =>
        handler(
          { brainId: "b1", headers: {}, user: { id: "u1", email: "a@k.at" } },
          opts.body.parse(await req.json())
        ),
  };
});

import { POST } from "./route";

const b64 = (s: string) => Buffer.from(s).toString("base64");
const send = (documentBase64: string) =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://x/api/docusign/send", {
      method: "POST",
      body: JSON.stringify({
        emailSubject: "Zur Unterschrift",
        documents: [{ documentBase64, name: "Vollmacht", documentId: "doc-1" }],
        recipients: { signers: [{ email: "m@x.at", name: "M" }] },
      }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  m.asUser.mockResolvedValue({ envelopeId: "e1", status: "sent" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}"))
  );
});

describe("POST /api/docusign/send — documents", () => {
  it.each([
    ["an error JSON body", b64('{"error":"unauthorized"}')],
    ["an HTML error page", b64("<html>502 Bad Gateway</html>")],
    ["invalid base64", "***"],
  ])("rejects %s with 400 and sends nothing", async (_label, doc) => {
    const res = await send(doc);
    expect(res.status).toBe(400);
    expect(m.asUser).not.toHaveBeenCalled();
    expect(m.service).not.toHaveBeenCalled();
  });

  it("sends a PDF with its file type", async () => {
    const res = await send(b64("%PDF-1.7 content"));
    expect(res.status).toBe(200);
    const req = m.asUser.mock.calls[0][1] as { documents: Array<{ fileExtension?: string }> };
    expect(req.documents[0].fileExtension).toBe("pdf");
  });
});
