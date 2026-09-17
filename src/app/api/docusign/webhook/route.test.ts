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
vi.mock("@/lib/cron-utils", () => ({
  getRecipientsByBrain: vi.fn(async () => new Map([["brain_1", [{ id: "u1" }, { id: "u2" }]]])),
}));
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes(`docusign-${ENVELOPE}`)
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

  it("notifies the firm when a signer declines", async () => {
    expect((await deliver("declined")).json).toMatchObject({ mapped: "declined", declined: true });
    expect(notified).toEqual(["u1", "u2"]);
  });

  it("reads XML events with custom fields", async () => {
    const xml = `<DocuSignEnvelopeInformation><EnvelopeStatus><EnvelopeID>${ENVELOPE}</EnvelopeID><Status>Voided</Status><CustomFields><CustomField><Name>brain_id</Name><Value>brain_1</Value></CustomField></CustomFields></EnvelopeStatus></DocuSignEnvelopeInformation>`;
    expect((await deliver("voided", xml)).json).toMatchObject({
      ok: true,
      mapped: "expired",
      updated: true,
    });
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
