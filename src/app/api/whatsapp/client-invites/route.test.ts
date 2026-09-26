// @vitest-environment node
/**
 * W3-3 / W3-14: a client invitation needs access to the matter (read with
 * the inviting person's identity), an open matter, and hands the code only to
 * the client (Business template) or — without a template — to a lawyer/admin.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "lawyer",
  access: "ok" as "ok" | "blocked" | "not_found",
  caseStatus: "active",
  template: undefined as string | undefined,
  createInvite: vi.fn(),
  sendTemplate: vi.fn(async () => ({ messageId: "m1" })),
}));

vi.mock("@/lib/api-handler", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...actual,
    createHandler:
      (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
      async (req: Request) =>
        handler(
          {
            brainId: "brain-1",
            headers: { "x-subsumio-source": "brain-1" },
            user: {
              id: "u-1",
              email: "u@k.example",
              role: state.role,
              orgId: "org-1",
              jurisdiction: "AT",
            },
          },
          await req.json()
        ),
  };
});
vi.mock("@/lib/email/case-link", () => ({
  caseAccessForUser: vi.fn(async () => state.access),
  caseAccessAllowed: (a: string) => a === "ok",
}));
vi.mock("@/lib/page-write-guards", () => ({
  readCurrentPage: vi.fn(async () => ({
    kind: "found",
    page: { type: "legal_case", frontmatter: { status: state.caseStatus } },
  })),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: vi.fn(async () => ({ kanzleiName: "Kanzlei Beispiel" })),
}));
vi.mock("@/lib/auth/store", () => ({ getOrgStore: () => ({ getById: async () => null }) }));
vi.mock("@/lib/whatsapp/send", () => ({ sendWhatsAppTemplate: state.sendTemplate }));
vi.mock("@/lib/whatsapp/client-verification", async (orig) => {
  const actual = await orig<typeof import("@/lib/whatsapp/client-verification")>();
  return { ...actual, createWhatsAppClientInvite: state.createInvite };
});

import { POST } from "./route";
import { WhatsAppInviteConflictError } from "@/lib/whatsapp/client-verification";

function post() {
  return POST(
    new Request("http://localhost/api/whatsapp/client-invites", {
      method: "POST",
      body: JSON.stringify({ phone: "0664 1234567", caseSlug: "legal/cases/akt-1" }),
    }) as never
  ) as Promise<Response>;
}

describe("POST /api/whatsapp/client-invites", () => {
  beforeEach(() => {
    state.role = "lawyer";
    state.access = "ok";
    state.caseStatus = "active";
    delete process.env.WHATSAPP_CLIENT_INVITE_TEMPLATE;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    state.createInvite.mockReset();
    state.createInvite.mockResolvedValue({
      inviteSlug: "legal/whatsapp-client-invites/x",
      identity: {
        id: "wa-1",
        role: "client",
        matterScope: [],
        status: "active",
        verifiedAt: null,
        phoneHash: "h",
        phone: "+436641234567",
      },
      code: "123456",
      expiresAt: "2026-09-27T10:00:00.000Z",
      message: "Kanzlei Beispiel … 123456",
    });
    state.sendTemplate.mockClear();
  });

  test("refuses a matter the inviting person cannot access", async () => {
    state.access = "blocked";
    const res = await post();
    expect(res.status).toBe(404);
    expect(state.createInvite).not.toHaveBeenCalled();
  });

  test("refuses an archived matter", async () => {
    state.caseStatus = "archived";
    expect((await post()).status).toBe(409);
    expect(state.createInvite).not.toHaveBeenCalled();
  });

  test("without a template, staff other than lawyer/admin never see a code", async () => {
    state.role = "assistant";
    const res = await post();
    expect(res.status).toBe(403);
    expect(state.createInvite).not.toHaveBeenCalled();
  });

  test("a lawyer gets the invitation text (with firm name and code) to hand over", async () => {
    const res = await post();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toContain("123456");
    expect(state.createInvite).toHaveBeenCalledWith(
      expect.objectContaining({ firmName: "Kanzlei Beispiel", defaultCountry: "AT" })
    );
  });

  test("with a template configured the code goes to the client only", async () => {
    process.env.WHATSAPP_CLIENT_INVITE_TEMPLATE = "mandant_code";
    process.env.WHATSAPP_ACCESS_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "p";
    state.role = "assistant";
    const res = await post();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.delivered).toBe("whatsapp_template");
    expect(body.message).toBeUndefined();
    expect(state.sendTemplate).toHaveBeenCalledWith(
      "+436641234567",
      expect.objectContaining({ name: "mandant_code" })
    );
  });

  test("a number bound elsewhere is answered with 409", async () => {
    state.createInvite.mockRejectedValue(
      new WhatsAppInviteConflictError("phone_bound_staff", "gehört zu einem Kanzleikonto")
    );
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("phone_bound_staff");
  });
});
