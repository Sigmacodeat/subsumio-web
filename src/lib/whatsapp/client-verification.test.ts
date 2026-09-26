import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWhatsAppClientInvite,
  isCodeMessage,
  verifyWhatsAppClientCode,
  WhatsAppInviteConflictError,
} from "@/lib/whatsapp/client-verification";
import {
  getWhatsAppIdentityStore,
  __resetWhatsAppIdentityStoreForTests,
} from "@/lib/whatsapp/identity-store";
import {
  getWhatsAppConsentStore,
  hasActiveConsent,
  whatsAppTenantKeys,
  __resetWhatsAppConsentStoreForTests,
} from "@/lib/whatsapp/consent-store";
import { phoneHash } from "@/lib/whatsapp/verify";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";

function memoryFetch() {
  const pages = new Map<
    string,
    { slug: string; title?: string; type?: string; frontmatter: Record<string, unknown> }
  >();
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as {
        slug: string;
        title?: string;
        type?: string;
        frontmatter?: Record<string, unknown>;
        merge?: boolean;
      };
      const current = pages.get(body.slug);
      pages.set(body.slug, {
        slug: body.slug,
        title: body.title ?? current?.title,
        type: body.type ?? current?.type,
        frontmatter: body.merge
          ? { ...(current?.frontmatter ?? {}), ...(body.frontmatter ?? {}) }
          : (body.frontmatter ?? {}),
      });
      return new Response(JSON.stringify({ ok: true, slug: body.slug }), { status: 200 });
    }
    if (url.pathname === "/api/pages") {
      const type = url.searchParams.get("type");
      const result = Array.from(pages.values()).filter((page) => !type || page.type === type);
      return new Response(JSON.stringify({ pages: result }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, pages };
}

describe("WhatsApp client verification", () => {
  const origDataDir = process.env.SUBSUMIO_DATA_DIR;

  beforeEach(() => {
    process.env.SUBSUMIO_DATA_DIR = `/tmp/wa-client-verify-${Math.random().toString(36).slice(2)}`;
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    __resetWhatsAppIdentityStoreForTests();
    __resetWhatsAppConsentStoreForTests();
  });

  afterEach(() => {
    if (origDataDir === undefined) delete process.env.SUBSUMIO_DATA_DIR;
    else process.env.SUBSUMIO_DATA_DIR = origDataDir;
    __resetWhatsAppIdentityStoreForTests();
    __resetWhatsAppConsentStoreForTests();
  });

  it("creates an unverified client identity and verifies it with the returned code", async () => {
    const { fetchImpl } = memoryFetch();
    const invite = await createWhatsAppClientInvite({
      brainId: "brain-1",
      orgId: "org-1",
      phone: "+491701234567",
      caseSlug: "legal/cases/2026-014",
      clientName: "Max Mandant",
      now: new Date("2026-07-08T10:00:00.000Z"),
      fetchImpl,
    });

    expect(invite.identity.role).toBe("client");
    expect(invite.identity.verifiedAt).toBeNull();
    // Pending: the matter joins the scope only once the client confirms.
    expect(invite.identity.matterScope).toEqual([]);
    expect(invite.message).toContain(invite.code);

    const verification = await verifyWhatsAppClientCode({
      sender: invite.identity,
      text: invite.code,
      now: new Date("2026-07-08T10:05:00.000Z"),
      fetchImpl,
    });

    expect(verification.ok).toBe(true);
    expect(verification.caseSlug).toBe("legal/cases/2026-014");
    const stored = await getWhatsAppIdentityStore().getById(invite.identity.id);
    expect(stored?.verifiedAt).toBe("2026-07-08T10:05:00.000Z");
    expect(stored?.matterScope).toEqual(["legal/cases/2026-014"]);
  });

  it("rejects an invalid code without verifying the identity", async () => {
    const { fetchImpl } = memoryFetch();
    const invite = await createWhatsAppClientInvite({
      brainId: "brain-1",
      orgId: "org-1",
      phone: "+491701234567",
      caseSlug: "legal/cases/2026-014",
      fetchImpl,
    });

    const verification = await verifyWhatsAppClientCode({
      sender: invite.identity,
      text: "000000",
      fetchImpl,
    });

    expect(verification.ok).toBe(false);
    expect(verification.reason).toBe("invalid_code");
    const stored = await getWhatsAppIdentityStore().getById(invite.identity.id);
    expect(stored?.verifiedAt).toBeNull();
  });

  // W3-2 (a): the confirmed client has a firm-bound consent afterwards.
  it("records the client's WhatsApp consent for this firm on successful verification", async () => {
    const { fetchImpl } = memoryFetch();
    const invite = await createWhatsAppClientInvite({
      brainId: "brain-1",
      orgId: "org-1",
      phone: "0664 1234567",
      caseSlug: "legal/cases/2026-014",
      firmName: "Kanzlei Beispiel",
      fetchImpl,
    });
    expect(invite.message).toContain("Kanzlei Beispiel");
    expect(invite.message).toContain("STOPP");
    const hash = phoneHash("+436641234567");
    const store = getWhatsAppConsentStore();
    expect(
      await hasActiveConsent(store, whatsAppTenantKeys("brain-1", "org-1"), hash, "client_reminder")
    ).toBe(false);

    const res = await verifyWhatsAppClientCode({
      sender: invite.identity,
      text: invite.code,
      fetchImpl,
    });
    expect(res.ok).toBe(true);
    expect(
      await hasActiveConsent(store, whatsAppTenantKeys("brain-1", "org-1"), hash, "client_reminder")
    ).toBe(true);
    // Never for another firm.
    expect(
      await hasActiveConsent(store, whatsAppTenantKeys("brain-2", "org-2"), hash, "client_reminder")
    ).toBe(false);
    const [row] = await store.getByPhoneHash(whatsAppTenantKeys("brain-1", "org-1"), hash);
    expect(row.consentProof).toMatchObject({
      source: "client_code",
      case_slug: "legal/cases/2026-014",
    });
  });

  // W3-3: an invitation never takes over a number of another firm, a firm
  // member's number, or a blocked number.
  it("refuses numbers of another firm, of firm members and blocked numbers", async () => {
    const { fetchImpl } = memoryFetch();
    const now = new Date().toISOString();
    const base = (over: Partial<WhatsAppIdentity>): WhatsAppIdentity => ({
      id: `wa-${Math.random().toString(36).slice(2)}`,
      orgId: "org-1",
      brainId: "brain-1",
      phone: "",
      phoneHash: "",
      role: "client",
      matterScope: [],
      status: "active",
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
      ...over,
    });
    const store = getWhatsAppIdentityStore();
    await store.create(base({ orgId: "org-2", phoneHash: phoneHash("+436640000001") }));
    await store.create(base({ role: "lawyer", phoneHash: phoneHash("+436640000002") }));
    await store.create(base({ status: "suspended", phoneHash: phoneHash("+436640000003") }));

    const invite = (phone: string) =>
      createWhatsAppClientInvite({
        brainId: "brain-1",
        orgId: "org-1",
        phone,
        caseSlug: "legal/cases/2026-014",
        fetchImpl,
      });
    await expect(invite("+436640000001")).rejects.toMatchObject({ code: "phone_bound_other_firm" });
    await expect(invite("+436640000002")).rejects.toMatchObject({ code: "phone_bound_staff" });
    await expect(invite("+436640000003")).rejects.toBeInstanceOf(WhatsAppInviteConflictError);
    // Nothing was changed.
    expect((await store.getByPhoneHash(phoneHash("+436640000002")))?.role).toBe("lawyer");
    expect((await store.getByPhoneHash(phoneHash("+436640000003")))?.status).toBe("suspended");
    expect((await store.getByPhoneHash(phoneHash("+436640000001")))?.orgId).toBe("org-2");
  });

  // W3-10: several open invitations — the code of either one confirms it,
  // scopes add up, a typo does not burn the other invitation.
  it("checks the code against all open invitations and keeps confirmed matters", async () => {
    const { fetchImpl, pages } = memoryFetch();
    const first = await createWhatsAppClientInvite({
      brainId: "brain-1",
      orgId: "org-1",
      phone: "+436641234567",
      caseSlug: "legal/cases/akt-1",
      now: new Date(Date.now() - 1000),
      fetchImpl,
    });
    const second = await createWhatsAppClientInvite({
      brainId: "brain-1",
      orgId: "org-1",
      phone: "+436641234567",
      caseSlug: "legal/cases/akt-2",
      fetchImpl,
    });

    const wrong = await verifyWhatsAppClientCode({
      sender: first.identity,
      text: first.code === "111111" ? "222222" : "111111",
      fetchImpl,
    });
    expect(wrong.reason).toBe("invalid_code");
    expect([...pages.values()].every((p) => p.frontmatter.status === "pending")).toBe(true);

    // The OLDER invitation's code still works.
    const ok1 = await verifyWhatsAppClientCode({
      sender: first.identity,
      text: first.code,
      fetchImpl,
    });
    expect(ok1.caseSlug).toBe("legal/cases/akt-1");
    const verifiedIdentity = ok1.identity!;
    const ok2 = await verifyWhatsAppClientCode({
      sender: verifiedIdentity,
      text: `Code: ${second.code}`,
      fetchImpl,
    });
    expect(ok2.ok).toBe(true);
    const stored = await getWhatsAppIdentityStore().getById(first.identity.id);
    expect(stored?.matterScope).toEqual(["legal/cases/akt-1", "legal/cases/akt-2"]);
  });

  it("counts only messages that consist of the code as a code attempt", () => {
    expect(isCodeMessage("123456")).toBe(true);
    expect(isCodeMessage("Code: 123456")).toBe(true);
    expect(isCodeMessage(" 123456. ")).toBe(true);
    expect(isCodeMessage("Die Rechnung über 123456 Euro ist angekommen")).toBe(false);
    expect(isCodeMessage("Mein Aktenzeichen ist 123456")).toBe(false);
  });
});
