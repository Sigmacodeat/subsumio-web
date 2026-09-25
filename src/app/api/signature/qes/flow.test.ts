// @vitest-environment node
// The full PDF-AS-WEB user-agent flow against a mocked engine and PDF-AS.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: (k: string) =>
    ({
      PDFAS_WEB_URL: "https://pdfas.kanzlei.at/pdf-as-web",
      NEXT_PUBLIC_APP_URL: "https://app.subsum.io",
    })[k],
}));
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: async () => ({ ok: true }),
  clientIp: () => "1.2.3.4",
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const uploads: Array<{ caseSlug: string; filename: string | null; source: string; bytes: number }> =
  [];
vi.mock("@/lib/email/mail-filing", () => ({
  uploadFileToMatter: vi.fn(
    async (
      _b: string,
      caseSlug: string,
      att: { filename: string | null; content: Buffer },
      source: string
    ) => {
      uploads.push({ caseSlug, filename: att.filename, source, bytes: att.content.byteLength });
      return {
        id: "d",
        name: att.filename,
        slug: "documents/vollmacht-qes",
        url: "documents/vollmacht-qes",
        uploadedAt: "now",
      };
    }
  ),
  appendDocumentsToMatter: vi.fn(async () => true),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
  enginePatchPage: vi.fn(async () => new Response("{}", { status: 200 })),
  requireEngineOk: vi.fn(async (res: Response) => {
    if (!res.ok) throw new Error(`Engine write failed: HTTP ${res.status}`);
    return res;
  }),
  // Delegate to global fetch so the stubbed engine endpoints observe the write.
  engineWriteOrThrow: vi.fn(
    async (
      headers: Record<string, string>,
      body: Record<string, unknown>,
      opts?: { path?: string }
    ) => {
      const res = await fetch(`http://engine.test${opts?.path ?? "/api/pages"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Engine write failed: HTTP ${res.status}`);
      return res;
    }
  ),
}));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    // Run handlers with a fixed signed-in lawyer instead of a session cookie.
    createHandler:
      (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
      async (req: Request) =>
        handler(
          {
            brainId: "brain_1",
            headers: { "x-subsumio-source": "brain_1" },
            user: { id: "u1", email: "anwalt@kanzlei.at" },
          },
          await req.json().catch(() => undefined)
        ),
  };
});

const ORIGINAL = Buffer.from("%PDF-1.7 Vollmacht original");
const SIGNED = Buffer.from("%PDF-1.7 Vollmacht original + signature");

let signedFetchUrl = "";
beforeEach(() => {
  uploads.length = 0;
  signedFetchUrl = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("http://engine.test/api/pages/")) {
        return new Response(
          JSON.stringify({
            slug: "documents/vollmacht",
            title: "Vollmacht Berger",
            frontmatter: { case_slug: "legal/cases/berger", mime_type: "application/pdf" },
          }),
          { status: 200 }
        );
      }
      if (u.startsWith("http://engine.test/api/files/"))
        return new Response(ORIGINAL, { status: 200 });
      if (u.startsWith("http://engine.test/api/pages")) return new Response("{}", { status: 201 });
      if (u.startsWith("https://pdfas.kanzlei.at/pdf-as-web/PDFData")) {
        signedFetchUrl = u;
        return new Response(SIGNED, {
          status: 200,
          headers: { ValueCheckCode: "0", CertificateCheckCode: "0" },
        });
      }
      return new Response("nope", { status: 404 });
    })
  );
});

async function start(method = "id_austria") {
  const { POST } = await import("./start/route");
  const res = await POST(
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ document_slug: "documents/vollmacht", method }),
    }) as never
  );
  const json = await res.json();
  const redirect = new URL(json.data.redirectUrl);
  return { res, redirect, token: redirect.searchParams.get("pdf-url")!.split("/").pop()! };
}
const params = (token: string) => ({ params: Promise.resolve({ token }) });

describe("qualified signature via PDF-AS-WEB", () => {
  it("signs with ID Austria: original handed out, signed PDF bound by digest, stored in the matter", async () => {
    const { redirect, token } = await start();
    expect(redirect.searchParams.get("connector")).toBe("mobilebku");

    const { GET: pdf } = await import("./pdf/[token]/route");
    const handed = await pdf(new Request("http://x") as never, params(token));
    expect(handed.status).toBe(200);
    expect(Buffer.from(await handed.arrayBuffer()).equals(ORIGINAL)).toBe(true);

    const { GET: done } = await import("./done/[token]/route");
    const res = await done(
      new (await import("next/server")).NextRequest(
        `http://x/api/signature/qes/done/${token}?pdfurl=${encodeURIComponent("https://pdfas.kanzlei.at/pdf-as-web/PDFData")}&pdflength=40`
      ),
      params(token)
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://app.subsum.io/dashboard/cases/legal/cases/berger/documents?qes=signed"
    );
    const { createHash } = await import("node:crypto");
    expect(new URL(signedFetchUrl).searchParams.get("origdigest")).toBe(
      createHash("sha256").update(ORIGINAL).digest("hex")
    );
    expect(uploads).toEqual([
      {
        caseSlug: "legal/cases/berger",
        filename: "Vollmacht Berger (qualifiziert signiert).pdf",
        source: "qes",
        bytes: SIGNED.byteLength,
      },
    ]);
  });

  it("uses the signature card connector for A-Trust cards", async () => {
    const { redirect } = await start("a_trust_card");
    expect(redirect.searchParams.get("connector")).toBe("bku");
  });

  it("never fetches a signed PDF from another host", async () => {
    const { token } = await start();
    const { GET: pdf } = await import("./pdf/[token]/route");
    await pdf(new Request("http://x") as never, params(token));
    const { GET: done } = await import("./done/[token]/route");
    const res = await done(
      new (await import("next/server")).NextRequest(
        `http://x/done?pdfurl=${encodeURIComponent("https://attacker.example/PDFData")}`
      ),
      params(token)
    );
    expect(res.headers.get("location")).toContain("qes=failed");
    expect(signedFetchUrl).toBe("");
    expect(uploads).toHaveLength(0);
  });

  it("refuses a result whose signature does not verify", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      const u = String(url);
      if (u.startsWith("http://engine.test/api/pages/")) {
        return new Response(
          JSON.stringify({
            slug: "documents/vollmacht",
            title: "V",
            frontmatter: { case_slug: "legal/cases/berger", mime_type: "application/pdf" },
          }),
          { status: 200 }
        );
      }
      if (u.startsWith("http://engine.test/api/files/"))
        return new Response(ORIGINAL, { status: 200 });
      return new Response(SIGNED, { status: 200, headers: { ValueCheckCode: "1" } });
    });
    const { token } = await start();
    const { GET: pdf } = await import("./pdf/[token]/route");
    await pdf(new Request("http://x") as never, params(token));
    const { GET: done } = await import("./done/[token]/route");
    const res = await done(
      new (await import("next/server")).NextRequest(
        `http://x/done?pdfurl=${encodeURIComponent("https://pdfas.kanzlei.at/pdf-as-web/PDFData")}`
      ),
      params(token)
    );
    expect(res.headers.get("location")).toContain("qes=failed");
    expect(uploads).toHaveLength(0);
  });

  it("an unknown token reveals nothing", async () => {
    const { GET: pdf } = await import("./pdf/[token]/route");
    expect((await pdf(new Request("http://x") as never, params("x".repeat(32)))).status).toBe(404);
  });
});
