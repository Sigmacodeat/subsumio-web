import { describe, expect, test } from "vitest";
import {
  appendCaseDocument,
  buildPortalDocumentEntry,
  findDocumentRequestItemIndex,
  submitDocumentRequestItem,
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
  test("an upload without a chosen item matches nothing — no guessing from the file name", () => {
    const items = [
      { key: "reisepass", label: "Reisepass", required: true },
      { key: "meldezettel", label: "Meldezettel", required: true },
    ];
    expect(findDocumentRequestItemIndex(items)).toBe(-1);
    expect(findDocumentRequestItemIndex(items, "unknown")).toBe(-1);
    const result = submitDocumentRequestItem(
      { ...baseFrontmatter, items },
      "uploads/IMG_1234",
      undefined
    );
    expect(result.matchedItem).toBeUndefined();
    expect(result.items).toEqual(items);
    expect(result.status).toBe("sent");
  });

  test("the chosen item is marked as submitted, not received; status unchanged", () => {
    const result = submitDocumentRequestItem(
      baseFrontmatter,
      "uploads/kuendigung",
      "kuendigung",
      "2026-09-26T10:00:00.000Z"
    );
    expect(findDocumentRequestItemIndex(baseFrontmatter.items, "kuendigung")).toBe(1);
    expect(result.matchedItem?.key).toBe("kuendigung");
    expect(result.items[1].submitted_document_slug).toBe("uploads/kuendigung");
    expect(result.items[1].submitted_at).toBe("2026-09-26T10:00:00.000Z");
    expect(result.items[1].received_document_slug).toBeUndefined();
    expect(result.items[0]).toEqual(baseFrontmatter.items[0]);
    expect(result.status).toBe("sent");
  });

  test("an item the firm already confirmed is not overwritten", () => {
    const fm = {
      ...baseFrontmatter,
      items: [
        { key: "vollmacht", label: "Vollmacht", required: true, received_document_slug: "x" },
      ],
    };
    const result = submitDocumentRequestItem(fm, "uploads/other", "vollmacht");
    expect(result.matchedItem).toBeUndefined();
    expect(result.items[0].submitted_document_slug).toBeUndefined();
  });

  test("does not duplicate case documents", () => {
    const entry = buildPortalDocumentEntry({ slug: "uploads/doc", name: "doc.pdf" });
    expect(appendCaseDocument([entry], entry)).toHaveLength(1);
  });
});
