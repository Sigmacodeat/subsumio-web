import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWhatsAppClientInvite,
  verifyWhatsAppClientCode,
} from "@/lib/whatsapp/client-verification";
import {
  getWhatsAppIdentityStore,
  __resetWhatsAppIdentityStoreForTests,
} from "@/lib/whatsapp/identity-store";

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
  });

  afterEach(() => {
    if (origDataDir === undefined) delete process.env.SUBSUMIO_DATA_DIR;
    else process.env.SUBSUMIO_DATA_DIR = origDataDir;
    __resetWhatsAppIdentityStoreForTests();
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
    expect(invite.identity.matterScope).toEqual(["legal/cases/2026-014"]);
    expect(invite.message).toContain(invite.code);

    const verification = await verifyWhatsAppClientCode({
      sender: invite.identity,
      text: `Mein Code ist ${invite.code}`,
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
});
