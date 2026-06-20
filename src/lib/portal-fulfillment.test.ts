import { describe, expect, test } from "vitest";
import {
  appendCaseDocument,
  buildPortalDocumentEntry,
  findDocumentRequestItemIndex,
  fulfillDocumentRequestItems,
} from "./portal-fulfillment";
import type { DocumentRequestFrontmatter } from "./document-requests";

const baseFrontmatter: DocumentRequestFrontmatter = {
  type: "document_request",
  case_slug: "legal/cases/1",
  recipient_role: "client",
  channel: "portal",
  status: "sent",
  items: [
    { key: "vollmacht", label: "Vollmacht", required: true },
    { key: "kuendigung", label: "Kündigung", required: true },
  ],
  created_at: "2026-06-20T10:00:00.000Z",
  updated_at: "2026-06-20T10:00:00.000Z",
};

describe("portal fulfillment", () => {
  test("matches requested item from filename", () => {
    expect(findDocumentRequestItemIndex(baseFrontmatter.items, "scan-vollmacht.pdf")).toBe(0);
    expect(findDocumentRequestItemIndex(baseFrontmatter.items, "kuendigung-mai.pdf")).toBe(1);
  });

  test("marks request partially fulfilled until all required items are received", () => {
    const result = fulfillDocumentRequestItems(baseFrontmatter, "uploads/vollmacht", "vollmacht.pdf");
    expect(result.status).toBe("partially_fulfilled");
    expect(result.items[0].received_document_slug).toBe("uploads/vollmacht");
  });

  test("marks request fulfilled when all required items are received", () => {
    const result = fulfillDocumentRequestItems(
      {
        ...baseFrontmatter,
        items: [
          { key: "vollmacht", label: "Vollmacht", required: true, received_document_slug: "uploads/vollmacht" },
          { key: "kuendigung", label: "Kündigung", required: true },
        ],
      },
      "uploads/kuendigung",
      "kuendigung.pdf",
    );
    expect(result.status).toBe("fulfilled");
    expect(result.items[1].received_document_slug).toBe("uploads/kuendigung");
  });

  test("does not duplicate case documents", () => {
    const entry = buildPortalDocumentEntry({ slug: "uploads/doc", name: "doc.pdf" });
    expect(appendCaseDocument([entry], entry)).toHaveLength(1);
  });
});
