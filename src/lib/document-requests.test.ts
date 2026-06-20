import { describe, expect, it, vi } from "vitest";
import {
  buildDocumentRequest,
  documentRequestFromPage,
  extractRequestedDocumentItems,
  writeDocumentRequest,
} from "./document-requests";
import type { BrainPage } from "./types";

describe("document requests", () => {
  it("extracts common requested document items from German text", () => {
    const items = extractRequestedDocumentItems("Bitte Vollmacht, Bescheid und Zustellnachweis hochladen");
    expect(items.map((i) => i.key)).toEqual(["vollmacht", "bescheid", "zustellnachweis"]);
  });

  it("builds a draft document_request and can include a portal link", async () => {
    const request = await buildDocumentRequest(
      {
        caseSlug: "legal/cases/2026-014",
        items: ["Vollmacht", { key: "bescheid", label: "Bescheid" }],
        includePortalLink: true,
        sourceEventSlug: "legal/conversations/whatsapp/wamid-docs",
      },
      new Date("2026-06-20T12:00:00.000Z")
    );

    expect(request.slug).toBe("legal/document-requests/2026-014-1781956800000");
    expect(request.frontmatter).toMatchObject({
      type: "document_request",
      case_slug: "legal/cases/2026-014",
      status: "draft",
      source_event_slug: "legal/conversations/whatsapp/wamid-docs",
    });
    expect(request.frontmatter.items).toHaveLength(2);
    expect(request.frontmatter.portal_url).toContain("/portal/");
  });

  it("writes document requests as mergeable brain pages", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const request = await buildDocumentRequest({
      caseSlug: "legal/cases/2026-014",
      items: ["Vollmacht"],
    });

    await writeDocumentRequest("brain-1", request, fetchImpl as unknown as typeof fetch);

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.type).toBe("document_request");
    expect(body.merge).toBe(true);
  });

  it("parses document_request pages and ignores other page types", async () => {
    const page = {
      slug: "legal/document-requests/x",
      title: "Dokumentenanfrage",
      content: "Bitte senden",
      frontmatter: (await buildDocumentRequest({ caseSlug: "legal/cases/1", items: ["Vollmacht"] })).frontmatter,
    } as BrainPage;

    expect(documentRequestFromPage(page)?.frontmatter.type).toBe("document_request");
    expect(documentRequestFromPage({ ...page, frontmatter: { type: "legal_case" } } as BrainPage)).toBeNull();
  });
});
