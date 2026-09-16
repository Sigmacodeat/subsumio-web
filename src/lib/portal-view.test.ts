import { describe, expect, it } from "vitest";
import {
  buildPortalCaseView,
  isPortalVisibleDocument,
  portalVisibleDocumentSlugs,
} from "./portal-view";

const page = {
  slug: "legal/cases/x",
  title: "Novak ./. Versicherung AG",
  content: "Sachverhalt …",
  created_at: "",
  updated_at: "",
  frontmatter: {
    case_number: "QA-2026-003",
    status: "open",
    legal_area: "Zivilrecht",
    client_name: "Petra Novak",
    opponent_name: "Versicherung AG",
    own_lawyer_name: "Dr. Intern",
    portal_enabled: true,
    time_entries: [{ minutes: 90, rate: 250 }],
    notes: [{ text: "internes Memo" }],
    strategy: { summary: "geheim" },
    deadlines: [
      {
        id: "d1",
        title: "Klagebeantwortung",
        due_date: "2026-10-21",
        status: "pending",
        second_check_by: "X",
      },
      { id: "d2", title: "ohne Datum" },
    ],
    documents: [
      { id: "1", name: "Kündigung", slug: "documents/k", uploadedAt: "", portal_visible: true },
      { id: "2", name: "Internes Gutachten", slug: "documents/g", uploadedAt: "" },
      {
        id: "3",
        name: "Privilegiert",
        slug: "documents/p",
        uploadedAt: "",
        portal_visible: true,
        privileged: true,
      },
      {
        id: "4",
        name: "Mandanten-Upload",
        slug: "documents/u",
        uploadedAt: "",
        portal_visible: true,
      },
    ],
  },
};

describe("buildPortalCaseView", () => {
  it("whitelists client-facing fields and drops internal ones", () => {
    const view = buildPortalCaseView(page as never);
    expect(view.frontmatter).toMatchObject({
      case_number: "QA-2026-003",
      client_name: "Petra Novak",
      portal_enabled: true,
    });
    const keys = Object.keys(view.frontmatter);
    for (const k of ["time_entries", "notes", "strategy", "own_lawyer_name"]) {
      expect(keys).not.toContain(k);
    }
    expect(JSON.stringify(view)).not.toContain("geheim");
    expect(JSON.stringify(view)).not.toContain("internes Memo");
  });

  it("lists only released, non-privileged documents", () => {
    const view = buildPortalCaseView(page as never);
    expect(view.frontmatter.documents.map((d) => d.slug)).toEqual(["documents/k", "documents/u"]);
  });

  it("strips the second-check trail from deadlines and skips undated ones", () => {
    const view = buildPortalCaseView(page as never);
    expect(view.frontmatter.deadlines).toEqual([
      { title: "Klagebeantwortung", due_date: "2026-10-21", status: "pending" },
    ]);
  });

  it("defaults to hidden", () => {
    expect(isPortalVisibleDocument({ id: "x", name: "n", uploadedAt: "" })).toBe(false);
    expect(
      isPortalVisibleDocument({ id: "x", name: "n", uploadedAt: "", portal_visible: true })
    ).toBe(true);
    expect(
      Array.from(portalVisibleDocumentSlugs(page.frontmatter.documents as never)).sort()
    ).toEqual(["documents/k", "documents/u"]);
  });
});
