import { describe, expect, it } from "vitest";
import {
  buildPortalCaseView,
  isPortalVisibleDocument,
  isPortalVisibleRequest,
  portalReleasedSummary,
  portalVisibleDocumentSlugs,
  toPortalQuestionnaire,
  toPortalRequest,
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

  it("never exposes the case body; only the released portal summary", () => {
    const internal = { ...page, content: "INTERN Strategie" };
    expect(buildPortalCaseView(internal as never).content).toBe("");
    expect(JSON.stringify(buildPortalCaseView(internal as never))).not.toContain("INTERN");
    const released = {
      ...internal,
      frontmatter: { ...internal.frontmatter, portal_summary: "Freigegebener Sachverhalt" },
    };
    expect(buildPortalCaseView(released as never).content).toBe("Freigegebener Sachverhalt");
    expect(portalReleasedSummary(released.frontmatter)).toBe("Freigegebener Sachverhalt");
    expect(portalReleasedSummary({ portal_summary: 42 })).toBe("");
    expect(portalReleasedSummary(undefined)).toBe("");
  });

  it("hides unreviewed/rejected AI deadlines, pre-deadlines and done ones", () => {
    const withDeadlines = {
      ...page,
      frontmatter: {
        ...page.frontmatter,
        deadlines: [
          { title: "Abgelehnt", due_date: "2026-10-01", review_status: "rejected" },
          { title: "Ungeprüft", due_date: "2026-10-02", review_status: "unreviewed" },
          { title: "Vorfrist", due_date: "2026-10-03", status: "vorfrist" },
          { title: "Erledigt", due_date: "2026-10-04", status: "done" },
          { title: "Später", due_date: "2026-12-01", review_status: "approved" },
          { title: "Früher", due_date: "2026-11-01", status: "pending" },
        ],
      },
    };
    const view = buildPortalCaseView(withDeadlines as never);
    expect(view.frontmatter.deadlines.map((d) => d.title)).toEqual(["Früher", "Später"]);
  });
});

describe("portal document requests", () => {
  const base = {
    slug: "legal/document-requests/r1",
    frontmatter: {
      type: "document_request" as const,
      case_slug: "legal/cases/x",
      recipient_role: "client" as const,
      channel: "whatsapp" as const,
      status: "sent" as const,
      recipient_phone: "+4366012345",
      message_draft: "interner Entwurf",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      items: [
        { key: "a", label: "Vertrag", required: true, received_document_slug: "documents/y" },
        { key: "b", label: "Rechnung", required: false },
      ],
    },
  };

  it("shows only sent requests addressed to the client", () => {
    expect(isPortalVisibleRequest(base)).toBe(true);
    expect(
      isPortalVisibleRequest({ ...base, frontmatter: { ...base.frontmatter, status: "draft" } })
    ).toBe(false);
    expect(
      isPortalVisibleRequest({
        ...base,
        frontmatter: { ...base.frontmatter, recipient_role: "assistant" },
      })
    ).toBe(false);
  });

  it("returns an allowlisted shape without draft, phone or internal slugs", () => {
    const out = toPortalRequest(base);
    const json = JSON.stringify(out);
    expect(json).not.toContain("interner Entwurf");
    expect(json).not.toContain("+4366012345");
    expect(json).not.toContain("documents/y");
    expect(out.frontmatter.items).toEqual([
      { key: "a", label: "Vertrag", required: true, received: true },
      { key: "b", label: "Rechnung", required: false, received: false },
    ]);
  });

  it("drops the author of a questionnaire", () => {
    const out = toPortalQuestionnaire({
      id: "q1",
      title: "Fragen",
      fields: [{ key: "k", label: "L", type: "text" }],
      status: "sent",
      created_by: "user-123",
      created_at: "2026-09-01",
    });
    expect(JSON.stringify(out)).not.toContain("user-123");
    expect(out.id).toBe("q1");
  });
});
