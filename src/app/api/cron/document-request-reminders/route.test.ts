// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sent = vi.hoisted(() => [] as Array<{ to: string; freeform: string }>);
const pages = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const cases = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cron-utils")>();
  return {
    activeStaffRecipients: actual.activeStaffRecipients,
    matterPermissionsBySlug: actual.matterPermissionsBySlug,
    recipientsForMatter: actual.recipientsForMatter,
    getRecipientsByBrain: async () =>
      new Map([
        [
          "brain_a",
          [
            { id: "u1", orgId: "org-1", role: "lawyer" },
            { id: "walled", orgId: "org-1", role: "assistant" },
            { id: "client", orgId: "org-1", role: "client_viewer" },
            { id: "gone", orgId: "org-1", role: "lawyer", deactivatedAt: "2026-01-01" },
          ],
        ],
      ]),
    fetchPages: async (_brain: string, type: string) => (type === "legal_case" ? cases : pages),
  };
});
vi.mock("@/lib/comments", () => ({ createDocumentRequestNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/whatsapp/proactive-send", () => ({
  sendProactiveMessage: vi.fn(async (m: { to: string; freeform: string }) => {
    sent.push(m);
    return { ok: true };
  }),
}));
const issueLink = vi.hoisted(() => vi.fn());
vi.mock("@/lib/portal-link-issue", () => ({
  issueRegisteredPortalLink: (...a: unknown[]) => issueLink(...a),
}));
vi.mock("@/lib/engine", () => ({
  engineHeadersForBrain: () => ({}),
  enginePatchPage: vi.fn(async () => new Response("{}")),
}));

const mails = vi.hoisted(
  () => [] as Array<{ to: string; subject: string; text?: string; html?: string }>
);
vi.mock("@/lib/firm-mail", () => ({
  sendFirmMail: vi.fn(async (_s: unknown, m: { to: string; subject: string }) => {
    mails.push(m);
    return { sent: true, via: "resend" };
  }),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: vi.fn(async () => ({ kanzleiName: "Kanzlei Muster" })),
}));

import { GET } from "./route";

const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
function request(slug: string, extra: Record<string, unknown> = {}) {
  return {
    slug,
    type: "document_request",
    frontmatter: {
      type: "document_request",
      case_slug: "cases/a",
      status: "sent",
      sent_at: tenDaysAgo,
      items: [{ key: "lohn", label: "Lohnzettel", required: true }],
      ...extra,
    },
  };
}

beforeEach(() => {
  sent.length = 0;
  mails.length = 0;
  pages.length = 0;
  cases.length = 0;
  cases.push({
    slug: "cases/a",
    type: "legal_case",
    frontmatter: { permissions: { blocked_users: ["walled"] } },
  });
});

describe("document request reminders", () => {
  it("sends the WhatsApp reminder to the request's own number only", async () => {
    pages.push(request("r1", { recipient_phone: "+436641234567" }), request("r2"));
    const res = await GET(new NextRequest("http://x/api/cron/document-request-reminders"));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("+436641234567");
    expect(sent[0]!.freeform).toContain("Lohnzettel");
  });

  it("notifies only active staff who may see the matter", async () => {
    const { createDocumentRequestNotification } = await import("@/lib/comments");
    vi.mocked(createDocumentRequestNotification).mockClear();
    pages.push(request("r1"));
    await GET(new NextRequest("http://x/api/cron/document-request-reminders"));
    const notified = vi
      .mocked(createDocumentRequestNotification)
      .mock.calls.map((c) => (c[0] as { userId: string }).userId);
    expect(notified).toEqual(["u1"]);
  });

  it("sends a freshly issued portal link, never one stored on the request", async () => {
    issueLink.mockReset();
    issueLink.mockResolvedValue("https://app.example/portal/frisch.token");
    pages.push(
      request("r1", {
        recipient_phone: "+436641234567",
        portal_url: "/portal/altes.token",
      })
    );
    await GET(new NextRequest("http://x/api/cron/document-request-reminders"));
    expect(issueLink).toHaveBeenCalledWith(
      expect.objectContaining({ brainId: "brain_a", caseSlug: "cases/a" })
    );
    expect(sent[0]!.freeform).toContain("https://app.example/portal/frisch.token");
    expect(sent[0]!.freeform).not.toContain("altes.token");
  });

  it("leaves the portal out when no link can be issued", async () => {
    issueLink.mockReset();
    issueLink.mockResolvedValue(null);
    pages.push(request("r1", { recipient_phone: "+436641234567", portal_link: true }));
    await GET(new NextRequest("http://x/api/cron/document-request-reminders"));
    expect(sent[0]!.freeform).not.toContain("Portal:");
  });

  it("also reminds by e-mail to the address the request was sent to", async () => {
    issueLink.mockReset();
    issueLink.mockResolvedValue("https://app.example/portal/frisch.token");
    pages.push(
      request("r1", {
        recipient_email: "mandant@example.at",
        recipient_phone: "+436641234567",
        portal_link: true,
      }),
      request("r2")
    );
    await GET(new NextRequest("http://x/api/cron/document-request-reminders"));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe("mandant@example.at");
    expect(mails[0]!.subject).toContain("Erinnerung");
    expect(mails[0]!.text).toContain("Lohnzettel");
    expect(mails[0]!.text).toContain("https://app.example/portal/frisch.token");
    expect(mails[0]!.text).toContain("Kanzlei Muster");
    // One registered link per reminder, shared by WhatsApp and e-mail.
    expect(issueLink).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
  });

  it("sends no e-mail without a stored address", async () => {
    pages.push(request("r1"));
    await GET(new NextRequest("http://x/api/cron/document-request-reminders"));
    expect(mails).toHaveLength(0);
  });
});
