import { describe, expect, it } from "vitest";
import { isAwaitingReview, reviewSubmittedItem, statusFromItems } from "./document-request-review";

const items = [
  { key: "pass", label: "Reisepass", required: true, submitted_document_slug: "uploads/p" },
  { key: "melde", label: "Meldezettel", required: true },
  { key: "extra", label: "Sonstiges", required: false },
];

describe("document request review", () => {
  it("a submitted item awaits review until the firm confirms it", () => {
    expect(isAwaitingReview(items[0])).toBe(true);
    expect(isAwaitingReview(items[1])).toBe(false);
  });

  it("accepting marks the item received and the request partially fulfilled", () => {
    const out = reviewSubmittedItem(items, "pass", "accept", "sent");
    expect(out?.items[0].received_document_slug).toBe("uploads/p");
    expect(out?.status).toBe("partially_fulfilled");
  });

  it("rejecting clears the submission so the client can upload again", () => {
    const out = reviewSubmittedItem(items, "pass", "reject", "sent");
    expect(out?.items[0].submitted_document_slug).toBeUndefined();
    expect(out?.items[0].received_document_slug).toBeUndefined();
    expect(out?.status).toBe("sent");
  });

  it("the request is fulfilled only once every required item is confirmed", () => {
    const all = [
      { key: "a", label: "A", required: true, received_document_slug: "x" },
      { key: "b", label: "B", required: true, submitted_document_slug: "y" },
    ];
    expect(statusFromItems(all, "partially_fulfilled")).toBe("partially_fulfilled");
    const out = reviewSubmittedItem(all, "b", "accept", "partially_fulfilled");
    expect(out?.status).toBe("fulfilled");
  });

  it("items without a pending submission cannot be reviewed", () => {
    expect(reviewSubmittedItem(items, "melde", "accept", "sent")).toBeNull();
    expect(reviewSubmittedItem(items, "missing", "accept", "sent")).toBeNull();
  });
});
