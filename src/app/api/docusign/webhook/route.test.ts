// @vitest-environment node
// Executes the webhook with signed Connect payloads against a mocked engine.
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const processed = new Set<string>();
vi.mock("@/lib/docusign", async (orig) => ({
  ...(await orig<typeof import("@/lib/docusign")>()),
  isWebhookProcessed: vi.fn(async (k: string) => processed.has(k)),
  markWebhookProcessed: vi.fn(async (k: string) => void processed.add(k)),
  downloadEnvelopeDocuments: vi.fn(async () => Buffer.from("%PDF-1.7 signed")),
}));
const uploads: Array<{ caseSlug: string; filename: string | null; source: string }> = [];
vi.mock("@/lib/email/mail-filing", () => ({
  uploadFileToMatter: vi.fn(
    async (_b: string, caseSlug: string, att: { filename: string | null }, source: string) => {
      uploads.push({ caseSlug, filename: att.filename, source });
      return {
        id: "d1",
        name: att.filename,
        slug: "documents/signed",
        url: "documents/signed",
        uploadedAt: "now",
      };
    }
  ),
  appendDocumentsToMatter: vi.fn(async () => true),
}));
const notified: string[] = [];
vi.mock("@/lib/comments", () => ({
  createNotificationFailureNotification: vi.fn(
    async (n: { userId: string }) => void notified.push(n.userId)
  ),
}));
vi.mock("@/lib/cron-utils", async (orig) => ({
  ...(await orig<typeof import("@/lib/cron-utils")>()),
  getRecipientsByBrain: vi.fn(
    async () =>
      new Map([
        [
          "brain_1",
          [
            { id: "a1", role: "admin" },
            { id: "u1", role: "lawyer" },
            { id: "u2", role: "assistant" },
            { id: "walled", role: "lawyer" },
            { id: "client", role: "client_viewer" },
            { id: "gone", role: "lawyer", deactivatedAt: "2026-01-01" },
          ],
        ],
      ])
  ),
}));
/** The matter page as the engine returns it; null → unreadable. */
let matterPage: Record<string, unknown> | null = null;
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const patches: Array<{ slug: string; frontmatter: Record<string, unknown> }> = [];
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
  enginePatchPage: vi.fn(
    async (_h: unknown, body: { slug: string; frontmatter: Record<string, unknown> }) => {
      patches.push(body);
      return new Response("{}", { status: 200 });
    }
  ),
}));

const SECRET = "connect-secret";
const ENVELOPE = "env-123";

beforeEach(() => {
  processed.clear();
  uploads.length = 0;
  notified.length = 0;
  patches.length = 0;
  process.env.DOCUSIGN_CONNECT_SECRET = SECRET;
  matterPage = {
    slug: "legal/cases/berger",
    frontmatter: { permissions: { blocked_users: ["walled"] } },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/api/pages/legal/cases/berger")
        ? matterPage
          ? Response.json(matterPage)
          : new Response("unavailable", { status: 503 })
        : String(url).includes(`docusign-${ENVELOPE}`)
          ? new Response(
              JSON.stringify({
                slug: `legal/signatures/docusign-${ENVELOPE}`,
                frontmatter: {
                  title: "Vollmacht Berger",
                  case_slug: "legal/cases/berger",
                  docusign_envelope_id: ENVELOPE,
                },
              }),
              { status: 200 }
            )
          : new Response("not found", { status: 404 })
    )
  );
});

async function deliver(status: string, body?: string) {
  const { POST } = await import("./route");
  const payload =
    body ??
    JSON.stringify({
      event: `envelope-${status}`,
      data: {
        envelopeId: ENVELOPE,
        envelopeSummary: {
          status,
          customFields: { textCustomFields: [{ name: "brain_id", value: "brain_1" }] },
        },
      },
    });
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64");
  const req = new Request("http://localhost/api/docusign/webhook", {
    method: "POST",
    headers: {
      "content-type": body ? "text/xml" : "application/json",
      "x-docusign-signature-1": sig,
    },
    body: payload,
  });
  const res = await POST(req as never);
  return { status: res.status, json: await res.json() };
}

describe("DocuSign Connect webhook", () => {
  it("follows sent → completed, stores the signed PDF in the matter, and does not dedup across statuses", async () => {
    const sent = await deliver("sent");
    expect(sent.json).toMatchObject({ ok: true, mapped: "sent", updated: true });
    const done = await deliver("completed");
    expect(done.json).toMatchObject({
      ok: true,
      mapped: "signed",
      updated: true,
      documentStored: true,
    });
    expect(patches.some((p) => p.frontmatter.status === "signed")).toBe(true);
    expect(uploads).toEqual([
      {
        caseSlug: "legal/cases/berger",
        filename: "Vollmacht Berger (unterschrieben).pdf",
        source: "docusign",
      },
    ]);
    expect(patches.at(-1)?.frontmatter).toEqual({ signed_document_slug: "documents/signed" });
  });

  it("processes the same status only once", async () => {
    await deliver("completed");
    expect((await deliver("completed")).json).toEqual({ ok: true, dedup: true });
    expect(uploads).toHaveLength(1);
  });

  it("notifies active staff with access to the matter when a signer declines", async () => {
    expect((await deliver("declined")).json).toMatchObject({ mapped: "declined", declined: true });
    // Never client accounts, deactivated users, or people walled off the matter.
    expect(notified).toEqual(["a1", "u1", "u2"]);
  });

  it("notifies admins only when the matter cannot be read (fail-closed)", async () => {
    matterPage = null;
    await deliver("declined");
    expect(notified).toEqual(["a1"]);
  });

  it("reads XML events with custom fields", async () => {
    const xml = `<DocuSignEnvelopeInformation><EnvelopeStatus><EnvelopeID>${ENVELOPE}</EnvelopeID><Status>Voided</Status><CustomFields><CustomField><Name>brain_id</Name><Value>brain_1</Value></CustomField></CustomFields></EnvelopeStatus></DocuSignEnvelopeInformation>`;
    expect((await deliver("voided", xml)).json).toMatchObject({
      ok: true,
      mapped: "expired",
      updated: true,
    });
  });

  it("a failed download is not marked processed (500); the retry stores the document", async () => {
    const docusign = await import("@/lib/docusign");
    vi.mocked(docusign.downloadEnvelopeDocuments).mockRejectedValueOnce(new Error("HTTP 502"));
    const first = await deliver("completed");
    expect(first.status).toBe(500);
    expect(processed.size).toBe(0);
    expect(uploads).toHaveLength(0);
    const second = await deliver("completed");
    expect(second.status).toBe(200);
    expect(second.json).toMatchObject({ documentStored: true });
    expect(uploads).toHaveLength(1);
  });

  it("a download that is not a PDF is not filed", async () => {
    const docusign = await import("@/lib/docusign");
    vi.mocked(docusign.downloadEnvelopeDocuments).mockResolvedValueOnce(
      Buffer.from("<html>error</html>")
    );
    expect((await deliver("completed")).status).toBe(500);
    expect(uploads).toHaveLength(0);
  });

  it("a failed status update is retried by DocuSign (500, not processed)", async () => {
    const engine = await import("@/lib/engine");
    vi.mocked(engine.enginePatchPage).mockResolvedValueOnce(new Response("", { status: 503 }));
    const res = await deliver("sent");
    expect(res.status).toBe(500);
    expect(processed.size).toBe(0);
  });

  it("rejects an invalid signature", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/docusign/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-docusign-signature-1": "forged" },
        body: "{}",
      }) as never
    );
    expect(res.status).toBe(401);
  });
});
