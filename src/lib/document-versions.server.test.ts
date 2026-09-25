// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: vi.fn(async () => [
    {
      slug: "legal/doc-versions/docs/brief/1",
      title: "Version 1",
      frontmatter: {
        doc_slug: "docs/brief",
        version: 1,
        doc_content: "Alter Text",
        doc_title: "Brief (alt)",
        doc_frontmatter: {
          case_slug: "legal/cases/a",
          status: "tombstoned",
          tombstone_reason: "manual_delete",
          extraction_status: "failed",
        },
        checked_in_by: "a@b.at",
        checked_in_at: "2026-01-01T00:00:00Z",
      },
    },
  ]),
}));

import { restoreDocumentVersion } from "./document-versions.server";

describe("restoreDocumentVersion", () => {
  test("restores the text but keeps the current matter, status and extraction state", async () => {
    const writes: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          writes.push(JSON.parse(String(init.body)));
          return Response.json({ ok: true });
        }
        return Response.json({
          slug: "docs/brief",
          title: "Brief",
          content: "Neuer Text",
          frontmatter: { case_slug: "legal/cases/b", extraction_status: "ready" },
        });
      })
    );

    await restoreDocumentVersion({}, "docs/brief", 1, { id: "u1", email: "a@b.at" });

    const docWrite = writes.find((w) => w.slug === "docs/brief")!;
    expect(docWrite.content).toBe("Alter Text");
    expect(docWrite.title).toBe("Brief (alt)");
    const fm = docWrite.frontmatter as Record<string, unknown>;
    expect(fm.case_slug).toBe("legal/cases/b");
    expect(fm.extraction_status).toBe("ready");
    expect(fm.status).toBeUndefined();
    expect(fm.tombstone_reason).toBeUndefined();
    expect(fm.restored_from_version).toBe(1);
    // The current state was saved as a safety version first.
    expect(writes.some((w) => String(w.slug).startsWith("legal/doc-versions/docs/brief/"))).toBe(
      true
    );
  });
});
