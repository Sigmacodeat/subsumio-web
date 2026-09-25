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
vi.mock("@/lib/engine", () => ({
  engineHeadersForBrain: () => ({}),
  enginePatchPage: vi.fn(async () => new Response("{}")),
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
});
