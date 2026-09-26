import { describe, expect, it } from "vitest";
import { buildMobileNotePage } from "./mobile-note";

describe("mobile notes", () => {
  it("with a matter, the note is a matter note (legal_note + case_slug) the notes tab lists", () => {
    const page = buildMobileNotePage({
      slug: "legal/notes/abc",
      title: "Notiz",
      text: "Telefonat mit Gegenseite",
      caseSlug: "cases/a",
      source: "mobile_quick_note",
      tags: ["telefon"],
      at: new Date("2026-09-26T08:00:00Z"),
    });
    expect(page.type).toBe("legal_note");
    expect(page.frontmatter).toMatchObject({
      type: "legal_note",
      case_slug: "cases/a",
      source: "mobile_quick_note",
      tags: ["telefon"],
    });
    expect(page.frontmatter).not.toHaveProperty("matter");
  });

  it("without a matter it stays a plain note without a matter field", () => {
    const page = buildMobileNotePage({
      slug: "share-1",
      title: "Geteilt",
      text: "x",
      caseSlug: "",
      source: "mobile_share",
    });
    expect(page.type).toBe("note");
    expect(page.frontmatter).not.toHaveProperty("case_slug");
    expect(page.frontmatter).not.toHaveProperty("matter");
  });
});
