// @vitest-environment node
/**
 * W3-1 / W3-13 / W3-2 (c): a firm number is registered for a named, active
 * member account (never for the administrator who registers it); clients
 * never get the matter scope "all"; the service consent of the member is
 * recorded with the administrator as source.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const users: Record<string, Record<string, unknown>> = {
  "u-admin": { id: "u-admin", email: "admin@k.example", role: "admin", orgId: "org-1" },
  "u-anna": {
    id: "u-anna",
    email: "anna@k.example",
    name: "Anna",
    role: "assistant",
    orgId: "org-1",
  },
  "u-gone": {
    id: "u-gone",
    email: "gone@k.example",
    role: "lawyer",
    orgId: "org-1",
    deactivatedAt: "2026-09-01T00:00:00Z",
  },
  "u-other": { id: "u-other", email: "o@x.example", role: "lawyer", orgId: "org-2" },
};

vi.mock("@/lib/api-handler", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...actual,
    createHandler:
      (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
      async (req: Request) =>
        handler(
          { brainId: "brain-1", user: { ...users["u-admin"], jurisdiction: "AT" } },
          await req.json()
        ),
  };
});
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async (id: string) => users[id] ?? null }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { POST } from "./route";
import { __resetWhatsAppIdentityStoreForTests } from "@/lib/whatsapp/identity-store";
import {
  getWhatsAppConsentStore,
  hasActiveConsent,
  whatsAppTenantKeys,
  __resetWhatsAppConsentStoreForTests,
} from "@/lib/whatsapp/consent-store";
import { phoneHash } from "@/lib/whatsapp/verify";

async function post(body: Record<string, unknown>) {
  const res = (await POST(
    new Request("http://localhost/api/whatsapp/identities", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never
  )) as Response;
  return { status: res.status, json: (await res.json()) as { identity: Record<string, unknown> } };
}

describe("POST /api/whatsapp/identities", () => {
  beforeEach(() => {
    process.env.SUBSUMIO_DATA_DIR = `/tmp/wa-identities-route-${Math.random().toString(36).slice(2)}`;
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    delete process.env.DATABASE_URL;
    __resetWhatsAppIdentityStoreForTests();
    __resetWhatsAppConsentStoreForTests();
  });
  afterEach(() => {
    __resetWhatsAppIdentityStoreForTests();
    __resetWhatsAppConsentStoreForTests();
  });

  test("a firm number belongs to the chosen member, with the member's role", async () => {
    const { status, json } = await post({
      phone: "0664 1111111",
      role: "lawyer",
      user_id: "u-anna",
    });
    expect(status).toBe(201);
    expect(json.identity).toMatchObject({ userId: "u-anna", userLinked: true, role: "assistant" });
    expect(json.identity.phoneHash).toBe(phoneHash("+436641111111"));
    expect(
      await hasActiveConsent(
        getWhatsAppConsentStore(),
        whatsAppTenantKeys("brain-1", "org-1"),
        phoneHash("+436641111111"),
        "approval_request"
      )
    ).toBe(true);
  });

  test("a firm number without a member, for a deactivated member or another firm is refused", async () => {
    expect((await post({ phone: "0664 2222222", role: "lawyer" })).status).toBe(400);
    expect((await post({ phone: "0664 2222222", role: "lawyer", user_id: "u-gone" })).status).toBe(
      404
    );
    expect((await post({ phone: "0664 2222222", role: "lawyer", user_id: "u-other" })).status).toBe(
      404
    );
  });

  test("a client number never gets the matter scope 'all'", async () => {
    const { json } = await post({ phone: "0664 3333333", role: "client", matter_scope: "all" });
    expect(json.identity.matterScope).toEqual([]);
    expect(json.identity.userId).toBeUndefined();
    expect(json.identity.verifiedAt).toBeNull();
  });
});
