import { describe, expect, it } from "vitest";
import {
  checkClientReleaseArrayOp,
  guardClientReleaseWrite,
  guardProtectedPageWrite,
} from "./page-write-guards";

const matter = (docs: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({
  slug: "legal/cases/m1",
  type: "legal_case",
  frontmatter: { type: "legal_case", documents: docs, ...extra },
});

const lawyer = { email: "anwalt@k.example", canWriteSettings: false, role: "lawyer" };
const assistant = { email: "sek@k.example", canWriteSettings: false, role: "assistant" };
const NOW = "2026-09-26T10:00:00.000Z";

describe("guardClientReleaseWrite — Freigabe für den Mandanten", () => {
  it("a lawyer releases a document; who and when is stamped server-side", () => {
    const res = guardClientReleaseWrite({
      current: matter([{ id: "d1", name: "Klage.pdf", slug: "documents/klage" }]),
      actor: lawyer,
      frontmatter: {
        documents: [
          {
            id: "d1",
            name: "Klage.pdf",
            slug: "documents/klage",
            portal_visible: true,
            portal_released_by: "gefälscht@x",
          },
        ],
      },
      now: NOW,
    });
    if ("reject" in res) throw new Error(res.reject.message);
    const doc = (res.frontmatter!.documents as Array<Record<string, unknown>>)[0];
    expect(doc.portal_released_by).toBe("anwalt@k.example");
    expect(doc.portal_released_at).toBe(NOW);
    expect(res.changes).toEqual([{ slug: "documents/klage", name: "Klage.pdf", released: true }]);
  });

  it("the assistant may not release, withdraw or un-privilege a document", () => {
    for (const change of [{ portal_visible: true }, { privileged: true }]) {
      const res = guardClientReleaseWrite({
        current: matter([{ id: "d1", name: "Klage.pdf" }]),
        actor: assistant,
        frontmatter: { documents: [{ id: "d1", name: "Klage.pdf", ...change }] },
      });
      expect("reject" in res && res.reject.error).toBe("client_release_forbidden");
    }
    const withdraw = guardClientReleaseWrite({
      current: matter([{ id: "d1", name: "Klage.pdf", portal_visible: true }]),
      actor: assistant,
      frontmatter: { documents: [{ id: "d1", name: "Klage.pdf", portal_visible: false }] },
    });
    expect("reject" in withdraw && withdraw.reject.error).toBe("client_release_forbidden");
  });

  it("the assistant may add a new internal document and save unchanged releases", () => {
    const res = guardClientReleaseWrite({
      current: matter([{ id: "d1", name: "Klage.pdf", portal_visible: true }]),
      actor: assistant,
      frontmatter: {
        documents: [
          { id: "d1", name: "Klage.pdf", portal_visible: true },
          { id: "d2", name: "Vermerk.docx" },
        ],
      },
    });
    expect("reject" in res).toBe(false);
  });

  it("a new document cannot arrive already released from the assistant", () => {
    const res = guardClientReleaseWrite({
      current: matter([]),
      actor: assistant,
      frontmatter: { documents: [{ id: "d9", name: "Neu.pdf", portal_visible: true }] },
    });
    expect("reject" in res && res.reject.error).toBe("client_release_forbidden");
  });

  it("a privileged document is never released — not even by a lawyer", () => {
    const res = guardClientReleaseWrite({
      current: matter([{ id: "d1", name: "Entwurf.docx", privileged: true }]),
      actor: lawyer,
      frontmatter: {
        documents: [{ id: "d1", name: "Entwurf.docx", privileged: true, portal_visible: true }],
      },
    });
    expect("reject" in res && res.reject.error).toBe("privileged_not_releasable");
  });

  it("portal switch and released summary: lawyer/admin only", () => {
    for (const fm of [{ portal_enabled: true }, { portal_summary: "Stand: Klage eingebracht" }]) {
      const res = guardProtectedPageWrite({
        slug: "legal/cases/m1",
        current: matter([]),
        actor: assistant,
        mode: "merge",
        frontmatter: fm,
      });
      expect("reject" in res && res.reject.error).toBe("client_release_forbidden");
      const ok = guardProtectedPageWrite({
        slug: "legal/cases/m1",
        current: matter([]),
        actor: lawyer,
        mode: "merge",
        frontmatter: fm,
      });
      expect("reject" in ok).toBe(false);
    }
  });

  it("an actor without a role releases nothing (fail-closed)", () => {
    const res = guardProtectedPageWrite({
      slug: "legal/cases/m1",
      current: matter([]),
      actor: { email: "x@y", canWriteSettings: false },
      mode: "merge",
      frontmatter: { portal_enabled: true },
    });
    expect("reject" in res).toBe(true);
  });
});

describe("checkClientReleaseArrayOp", () => {
  it("array ops never release, withdraw or un-privilege documents", () => {
    expect(checkClientReleaseArrayOp("documents", { set: { privileged: false } })).not.toBeNull();
    expect(
      checkClientReleaseArrayOp("documents", { items: [{ id: "x", portal_visible: true }] })
    ).not.toBeNull();
    expect(checkClientReleaseArrayOp("documents", { items: [{ id: "x" }] })).toBeNull();
    expect(checkClientReleaseArrayOp("portal_summary", {})).not.toBeNull();
    expect(checkClientReleaseArrayOp("time_entries", { set: { portal_visible: true } })).toBeNull();
  });
});
