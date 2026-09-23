import { describe, test, expect } from "vitest";
import { diffConflictFields, diffContentLines } from "./conflict-diff";
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

describe("diffContentLines", () => {
  test("identisch → null", () => {
    expect(diffContentLines("a\nb\nc", "a\nb\nc")).toBeNull();
  });

  test("Mittel-Block geändert → Prefix/Suffix gezählt", () => {
    const d = diffContentLines("a\nb\nc\nd", "a\nX\nc\nd")!;
    expect(d.localLines).toEqual(["b"]);
    expect(d.serverLines).toEqual(["X"]);
    expect(d.unchangedBefore).toBe(1);
    expect(d.unchangedAfter).toBe(2);
    expect(d.truncated).toBe(false);
  });

  test("Zeile am Ende angehängt", () => {
    const d = diffContentLines("a\nb", "a\nb\nc")!;
    expect(d.localLines).toEqual([]);
    expect(d.serverLines).toEqual(["c"]);
    expect(d.unchangedBefore).toBe(2);
  });

  test("komplett verschieden → alles geändert", () => {
    const d = diffContentLines("x\ny", "p\nq")!;
    expect(d.unchangedBefore).toBe(0);
    expect(d.unchangedAfter).toBe(0);
  });

  test("große Region wird gekappt + truncated", () => {
    const local = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const d = diffContentLines(local, "s0")!;
    expect(d.truncated).toBe(true);
    expect(d.localLines.length).toBeLessThanOrEqual(8);
  });

  test("Mehrfach-Edits in einer Region bleiben Block", () => {
    const d = diffContentLines("a\nb\nc\nd", "a\nB\nC\nd")!;
    expect(d.localLines).toEqual(["b", "c"]);
    expect(d.serverLines).toEqual(["B", "C"]);
  });
});
