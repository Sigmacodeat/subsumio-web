import { describe, test, expect } from "vitest";
import { diffConflictFields } from "./conflict-diff";
import type { QueuedMutation } from "./offline-store";
import type { BrainPage } from "./types";

const server: BrainPage = {
  slug: "cases/neu",
  title: "Server-Titel",
  content: "server content",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  frontmatter: { status: "open", priority: "high" },
};

function mut(payload: Record<string, unknown>): QueuedMutation {
  return { id: "m1", type: "updatePage", payload, createdAt: "2026-01-01T12:00:00Z" };
}

describe("diffConflictFields", () => {
  test("identischer Payload → keine Diffs", () => {
    const d = diffConflictFields(
      mut({ slug: "cases/neu", title: "Server-Titel", frontmatter: server.frontmatter }),
      server
    );
    expect(d).toEqual([]);
  });

  test("title-Diff", () => {
    const d = diffConflictFields(
      mut({ title: "Lokaler Titel", frontmatter: server.frontmatter }),
      server
    );
    expect(d).toEqual([{ field: "title", local: "Lokaler Titel", server: "Server-Titel" }]);
  });

  test("content-Diff zeigt Zeichenzahl", () => {
    const d = diffConflictFields(mut({ content: "ab", frontmatter: server.frontmatter }), server);
    expect(d).toEqual([{ field: "content", local: "2 Zeichen", server: "14 Zeichen" }]);
  });

  test("frontmatter: geänderte, neue und fehlende Keys", () => {
    const d = diffConflictFields(mut({ frontmatter: { status: "closed", extra: true } }), server);
    expect(d).toContainEqual({ field: "frontmatter.status", local: "closed", server: "open" });
    expect(d).toContainEqual({ field: "frontmatter.extra", local: "true", server: "—" });
    expect(d).toContainEqual({ field: "frontmatter.priority", local: "—", server: "high" });
  });

  test("Payload ohne Felder → nur Frontmatter-Lücken gemeldet", () => {
    const d = diffConflictFields(mut({ slug: "cases/neu" }), server);
    expect(d).toHaveLength(2);
    expect(d.every((x) => x.field.startsWith("frontmatter."))).toBe(true);
  });
});
