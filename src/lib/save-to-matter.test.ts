import { describe, expect, it } from "vitest";
import {
  savedDocumentContent,
  savedDocumentFrontmatter,
  savedDocumentSlug,
} from "./save-to-matter";
import type { GroundedCitation } from "./types";

const now = new Date("2026-09-19T21:05:07Z");
const cite = (verified: boolean, paragraph: string): GroundedCitation => ({
  code: "ABGB",
  paragraph,
  verified,
});

describe("save to matter", () => {
  it("builds a readable slug under the matter's folder", () => {
    expect(
      savedDocumentSlug("legal/cases/2026-001", "Tiefenanalyse: Mietvertrag Größe!", now)
    ).toBe("legal/documents/2026-001/ki-tiefenanalyse-mietvertrag-grosse-20260919210507");
    expect(savedDocumentSlug("legal/cases/x", "###", now)).toBe(
      "legal/documents/x/ki-ki-ergebnis-20260919210507"
    );
  });

  it("marks the result unreviewed and AI-generated, with the grounding verdict", () => {
    const fm = savedDocumentFrontmatter(
      {
        case_slug: "legal/cases/a",
        title: "T",
        content: "x",
        source: "chat",
        citations: [cite(true, "§ 1295"), cite(false, "§ 9999")],
      },
      "anwalt@example.com",
      now
    );
    expect(fm).toMatchObject({
      case_slug: "legal/cases/a",
      ai_generated: true,
      ai_source: "chat",
      review_status: "unreviewed",
      saved_by: "anwalt@example.com",
      grounding: { citations_total: 2, citations_verified: 1, citations_unverified: 1 },
    });
  });

  it("puts the review notice first and lists unverified citations", () => {
    const md = savedDocumentContent({
      case_slug: "legal/cases/a",
      title: "T",
      content: "Antworttext",
      source: "deep_analysis",
      citations: [cite(true, "§ 1295"), cite(false, "§ 9999")],
    });
    expect(md.split("\n")[0]).toContain("anwaltlich zu prüfen");
    expect(md).toContain("1 von 2 gegen den Korpus verifiziert");
    expect(md).toContain("Antworttext");
    expect(md).toContain("## Nicht verifizierte Zitate\n- § 9999 ABGB");
  });

  it("says when no citations were checked", () => {
    const md = savedDocumentContent({
      case_slug: "legal/cases/a",
      title: "T",
      content: "Diktat",
      source: "dictation",
    });
    expect(md).toContain("Keine Zitate geprüft.");
    expect(md).not.toContain("Nicht verifizierte");
  });
});
