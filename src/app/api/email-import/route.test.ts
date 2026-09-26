// @vitest-environment node
// E-Mail-Import: the complete mail becomes a document of the matter, linked
// under the document-list lock; explicit matter choice reaches every matter.
import { beforeEach, describe, expect, it, vi } from "vitest";

const listEnginePages = vi.fn();
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...a: unknown[]) => listEnginePages(...a),
}));
const uploads: Array<{ caseSlug: string; filename: string | null; type: string; text: string }> =
  [];
const appended: Array<{ caseSlug: string; entries: Array<Record<string, unknown>> }> = [];
vi.mock("@/lib/email/mail-filing", () => ({
  uploadFileToMatter: vi.fn(
    async (
      _b: string,
      caseSlug: string,
      att: { filename: string | null; contentType: string; content: Buffer }
    ) => {
      uploads.push({
        caseSlug,
        filename: att.filename,
        type: att.contentType,
        text: att.content.toString("utf8"),
      });
      return {
        id: "d1",
        name: att.filename,
        slug: `documents/mail-${uploads.length}`,
        url: `documents/mail-${uploads.length}`,
        uploadedAt: "2026-09-25T10:00:00Z",
      };
    }
  ),
  appendDocumentsToMatter: vi.fn(
    async (_b: string, caseSlug: string, entries: Array<Record<string, unknown>>) => {
      appended.push({ caseSlug, entries });
      return true;
    }
  ),
}));
vi.mock("@/lib/inbound-register-stamp", () => ({
  stampInboundEntryBestEffort: vi.fn(async () => undefined),
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
            user: { id: "u1", email: "anwalt@kanzlei.at" },
          },
          opts.body ? opts.body.parse(await req.json()) : undefined
        ),
  };
});

import { POST } from "./route";

function casePage(i: number, extra: Record<string, unknown> = {}) {
  return {
    slug: `cases/akte-${i}`,
    title: `Akte ${i}`,
    type: "legal_case",
    frontmatter: { case_number: `2026-${String(i).padStart(3, "0")}`, ...extra },
  };
}

async function importMail(body: Record<string, unknown>) {
  return POST(
    new Request("http://x/api/email-import", {
      method: "POST",
      body: JSON.stringify({ subject: "Fristsetzung", from: "gegner@example.at", ...body }),
    }) as never
  );
}

beforeEach(() => {
  uploads.length = 0;
  appended.length = 0;
  listEnginePages.mockResolvedValue(Array.from({ length: 300 }, (_, i) => casePage(i)));
});

describe("POST /api/email-import", () => {
  it("stores the full text of a long mail as a document of the matter", async () => {
    const long = "A".repeat(9_990) + " Frist: 7 Tage";
    const res = await importMail({ body: long, force_case_slug: "cases/akte-250" });
    expect(res.status).toBe(200);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].caseSlug).toBe("cases/akte-250");
    expect(uploads[0].text).toContain(long);
    const entry = appended[0].entries[0];
    expect(entry.slug).toBe("documents/mail-1");
    expect(entry.url).not.toBe("#email");
  });

  it("stores the original .eml unchanged when it is sent along", async () => {
    const raw =
      "Message-ID: <abc@example.at>\r\nSubject: Fristsetzung\r\n\r\nText mit Anhang\r\n--boundary--";
    const res = await importMail({
      body: "Text mit Anhang",
      raw_eml: raw,
      force_case_slug: "cases/akte-3",
    });
    expect(res.status).toBe(200);
    expect(uploads[0].type).toBe("message/rfc822");
    expect(uploads[0].text).toBe(raw);
    expect(appended[0].entries[0].message_id).toBe("<abc@example.at>");
  });

  it("a mail already imported (same Message-ID) is not stored twice", async () => {
    listEnginePages.mockResolvedValue([
      casePage(1, {
        documents: [{ id: "x", name: "E-Mail: Alt", message_id: "<abc@example.at>" }],
      }),
    ]);
    const res = await importMail({
      body: "x",
      message_id: "<abc@example.at>",
      force_case_slug: "cases/akte-1",
    });
    expect((await res.json()).duplicate).toBe(true);
    expect(uploads).toHaveLength(0);
  });

  it("an explicitly chosen matter that is not reachable is an error, never a silent re-route", async () => {
    const res = await importMail({ body: "x", force_case_slug: "cases/unbekannt" });
    expect(res.status).toBe(404);
    expect(uploads).toHaveLength(0);
  });

  it("links the document through the locked append, not a snapshot overwrite", async () => {
    await importMail({ body: "x", force_case_slug: "cases/akte-5" });
    expect(appended).toEqual([
      expect.objectContaining({ caseSlug: "cases/akte-5", entries: [expect.anything()] }),
    ]);
  });

  it("rejects oversized input", async () => {
    // The test handler parses with the route's schema; the real one answers 400.
    await expect(importMail({ body: "x", subject: "S".repeat(3000) })).rejects.toThrow();
    expect(uploads).toHaveLength(0);
  });
  it("two matters with the same Geschäftszahl: nothing is filed, both are offered", async () => {
    listEnginePages.mockResolvedValue([
      casePage(1, { case_number: "1 Cg 3/25a" }),
      casePage(2, { case_number: "1Cg3/25a" }),
      casePage(3, { case_number: "11 Cg 3/25a" }),
    ]);
    const res = await importMail({ subject: "1 Cg 3/25a – Ladung", body: "x" });
    const json = (await res.json()) as { error?: string; candidates?: Array<{ slug: string }> };
    expect(json.error).toBe("ambiguous_match");
    expect(json.candidates?.map((c) => c.slug).sort()).toEqual(["cases/akte-1", "cases/akte-2"]);
    expect(uploads).toHaveLength(0);
  });

  it("no match: no arbitrary matter list, nothing filed", async () => {
    const res = await importMail({ subject: "Allgemeine Anfrage", body: "x" });
    const json = (await res.json()) as { error?: string; suggestions?: unknown };
    expect(json.error).toBe("no_case_match");
    expect(json.suggestions).toBeUndefined();
    expect(uploads).toHaveLength(0);
  });
});
