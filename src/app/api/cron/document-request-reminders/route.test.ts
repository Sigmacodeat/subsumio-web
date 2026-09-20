// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sent = vi.hoisted(() => [] as Array<{ to: string; freeform: string }>);
const pages = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/cron-utils", () => ({
  getRecipientsByBrain: async () => new Map([["brain_a", [{ id: "u1", orgId: "org-1" }]]]),
  fetchPages: async () => pages,
}));
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
});
