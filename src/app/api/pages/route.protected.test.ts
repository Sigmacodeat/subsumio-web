// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
// Generic page API vs. records that have their own route (OPS-7, OPS-18,
// OPS-13, GELD-7, AKT-8): the stored page decides, fail closed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Real at-rest encryption (read once at module load by src/lib/encryption.ts).
vi.hoisted(() => {
  process.env.SUBSUMIO_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
});

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/auth/store", () => ({ markOnboardingProgress: vi.fn() }));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  recordQuota: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireEngineContext } from "@/lib/engine";

const user = { id: "u1", email: "assistenz@kanzlei.example", role: "assistant", name: "A" };
const ctx = { headers: { "x-subsumio-source": "brain_a" }, brainId: "brain_a", plan: "team", user };

let stored: Record<string, unknown> | null = null;
let listed: unknown[] = [];
let writes: any[] = [];

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  user.role = "assistant";
  stored = null;
  listed = [];
  writes = [];
  vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        return Response.json({ slug: "x", success: true });
      }
      if (String(url).includes("/api/pages?")) return Response.json(listed);
      return stored ? Response.json(stored) : new Response("nf", { status: 404 });
    })
  );
});

describe("Kanzlei-Einstellungen (OPS-18)", () => {
  const settings = {
    slug: "legal/settings/kanzlei",
    type: "kanzlei_settings",
    frontmatter: { type: "kanzlei_settings", require2FA: true, smtpPassword: "legacy" },
  };

  it("an assistant cannot switch off 2FA or change the IBAN", async () => {
    stored = settings;
    const res = await post({
      slug: "legal/settings/kanzlei",
      merge: true,
      frontmatter: { require2FA: false },
    });
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it("an admin save stores the SMTP password encrypted, never as plaintext", async () => {
    user.role = "admin";
    stored = settings;
    const res = await post({
      slug: "legal/settings/kanzlei",
      title: "Kanzlei-Einstellungen",
      type: "kanzlei_settings",
      frontmatter: { type: "kanzlei_settings", smtpPassword: "neu-geheim", iban: "AT22" },
    });
    expect(res.status).toBe(200);
    const fm = writes[0].frontmatter;
    expect(fm.smtpPassword).toBeNull();
    expect(typeof fm.smtpPasswordEnc).toBe("string");
    expect(fm.smtpPasswordEnc).toMatch(/^sbenc:/);
    expect(JSON.stringify(writes[0])).not.toContain("neu-geheim");
  });

  it("a list read never returns the SMTP password", async () => {
    listed = [settings];
    const res = await GET(new NextRequest("http://localhost:3000/api/pages?type=kanzlei_settings"));
    const body = await res.json();
    expect(body[0].frontmatter).not.toHaveProperty("smtpPassword");
    expect(body[0].frontmatter.smtpPasswordSet).toBe(true);
  });
});

describe("KYC and conflict status (OPS-7)", () => {
  it("a generic merge cannot mark a KYC record verified", async () => {
    user.role = "admin";
    stored = {
      slug: "legal/kyc/k1",
      type: "kyc_verification",
      frontmatter: { status: "in_progress" },
    };
    const res = await post({
      slug: "legal/kyc/k1",
      merge: true,
      frontmatter: { status: "verified" },
    });
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it("a merge without type cannot clear a matter's conflict status", async () => {
    user.role = "lawyer";
    stored = {
      slug: "legal/cases/m1",
      type: "legal_case",
      frontmatter: { status: "active", conflict_status: "conflict_detected" },
    };
    const res = await post({
      slug: "legal/cases/m1",
      merge: true,
      frontmatter: { conflict_status: "conflict_cleared" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("protected_fields");
    expect(writes).toHaveLength(0);
  });
});

describe("Anderkonten (GELD-7)", () => {
  it("bookings cannot be rewritten through the page API", async () => {
    user.role = "admin";
    stored = {
      slug: "trust-accounts/1",
      type: "trust_account",
      frontmatter: { transactions: [{ id: "t1", amount: 100 }], current_balance: 100 },
    };
    const res = await post({
      slug: "trust-accounts/1",
      merge: true,
      frontmatter: { transactions: [], current_balance: 0 },
    });
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });
});

describe("Freigaben (OPS-13)", () => {
  it("a submitted approval is stored pending with the server-stamped submitter", async () => {
    const res = await post({
      slug: "legal/approvals/1",
      title: "Freigabe",
      type: "agent_action",
      frontmatter: { type: "agent_action", status: "pending", proposed_by: "KI" },
    });
    expect(res.status).toBe(200);
    expect(writes[0].frontmatter.status).toBe("pending");
    expect(writes[0].frontmatter.submitted_by).toBe(user.email);
  });

  it("an existing approval cannot be approved through the page API", async () => {
    user.role = "admin";
    stored = {
      slug: "legal/approvals/1",
      type: "agent_action",
      frontmatter: { status: "pending" },
    };
    const res = await post({
      slug: "legal/approvals/1",
      merge: true,
      frontmatter: { status: "approved" },
    });
    expect(res.status).toBe(403);
  });
});

describe("Legal Hold and deleting (AKT-8)", () => {
  it("an assistant cannot tombstone a document via a merge", async () => {
    stored = { slug: "legal/documents/d1", type: "document", frontmatter: { status: "active" } };
    const res = await post({
      slug: "legal/documents/d1",
      merge: true,
      frontmatter: { status: "tombstoned" },
    });
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it("legal_hold cannot be lifted via a merge", async () => {
    user.role = "admin";
    stored = { slug: "legal/cases/m1", type: "legal_case", frontmatter: { legal_hold: true } };
    const res = await post({
      slug: "legal/cases/m1",
      merge: true,
      frontmatter: { legal_hold: false },
    });
    expect(res.status).toBe(403);
  });

  it("an archived matter takes no merge (AKT-24)", async () => {
    user.role = "admin";
    stored = { slug: "legal/cases/m1", type: "legal_case", frontmatter: { status: "archived" } };
    const res = await post({ slug: "legal/cases/m1", merge: true, frontmatter: { notes: "x" } });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("case_archived");
  });
});
