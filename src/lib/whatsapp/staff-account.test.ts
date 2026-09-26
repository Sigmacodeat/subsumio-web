// @vitest-environment node
/**
 * W3-1 / W3-13: a firm WhatsApp number acts as its linked, active user account —
 * never as the firm. Engine calls made while it acts carry that person's
 * signed identity (userId + account role), so walls, matter teams and
 * document ACLs apply; without a linked active account there are no firm
 * commands at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/auth/store";
import type { WhatsAppIdentity } from "./types";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { resolveStaffAccount } = await import("./staff-account");
const { runAsEngineCaller, engineHeadersForBrain, engineHeadersForBrainWithMatterScope } =
  await import("@/lib/engine");

function identity(over: Partial<WhatsAppIdentity> = {}): WhatsAppIdentity {
  const now = "2026-09-24T10:00:00.000Z";
  return {
    id: "wa-1",
    orgId: "org-a",
    brainId: "brain-a",
    phone: "+436641234567",
    phoneHash: "h",
    userId: "u-lawyer",
    userLinked: true,
    name: "Konzipientin",
    role: "lawyer",
    matterScope: "all",
    status: "active",
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function user(over: Partial<User> = {}): User {
  return {
    id: "u-lawyer",
    email: "anwaeltin@kanzlei.example",
    name: "Anwältin B",
    role: "lawyer",
    orgId: "org-a",
    brainId: "personal-b",
    ...over,
  } as User;
}

const deps = (u: User | null, brain: string | null = "brain-a") => ({
  getUser: async () => u,
  firmBrainId: async () => brain,
});

function decodeToken(headers: Record<string, string>): Record<string, unknown> | null {
  const token = headers["x-subsumio-identity-token"];
  if (!token) return null;
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

describe("resolveStaffAccount", () => {
  it("acts as the linked account and takes the role from it", async () => {
    const res = await resolveStaffAccount(
      identity({ role: "lawyer" }),
      deps(user({ role: "assistant" }))
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sender.role).toBe("assistant");
    expect(res.sender.email).toBe("anwaeltin@kanzlei.example");
    expect(res.caller).toMatchObject({ userId: "u-lawyer", role: "assistant", brainId: "brain-a" });
  });

  it("denies a firm number without an explicitly linked account (older identities)", async () => {
    const res = await resolveStaffAccount(identity({ userLinked: undefined }), deps(user()));
    expect(res).toEqual({ ok: false, reason: "no_linked_account" });
  });

  it("W3-13: a deactivated account ends WhatsApp access", async () => {
    const res = await resolveStaffAccount(
      identity(),
      deps(user({ deactivatedAt: "2026-09-20T00:00:00.000Z" }))
    );
    expect(res).toEqual({ ok: false, reason: "account_inactive" });
    expect(await resolveStaffAccount(identity(), deps(null))).toEqual({
      ok: false,
      reason: "account_inactive",
    });
  });

  it("denies an account of another firm or a client account", async () => {
    expect(await resolveStaffAccount(identity(), deps(user(), "brain-other"))).toEqual({
      ok: false,
      reason: "wrong_firm",
    });
    expect(await resolveStaffAccount(identity(), deps(user({ role: "client_viewer" })))).toEqual({
      ok: false,
      reason: "role_not_staff",
    });
  });
});

describe("runAsEngineCaller", () => {
  const origKey = process.env.SUBSUMIO_WEB_API_KEY;
  beforeEach(() => {
    process.env.SUBSUMIO_WEB_API_KEY = "test-key";
  });
  afterEach(() => {
    if (origKey === undefined) delete process.env.SUBSUMIO_WEB_API_KEY;
    else process.env.SUBSUMIO_WEB_API_KEY = origKey;
  });

  it("signs every engine header for the firm brain with the person's identity", async () => {
    const res = await resolveStaffAccount(identity(), deps(user()));
    if (!res.ok) throw new Error("expected ok");
    const inside = await runAsEngineCaller(res.caller, async () => ({
      plain: engineHeadersForBrain("brain-a"),
      scoped: engineHeadersForBrainWithMatterScope("brain-a", ["legal/cases/a"]),
      otherBrain: engineHeadersForBrain("brain-b"),
    }));
    expect(decodeToken(inside.plain)).toMatchObject({
      sourceId: "brain-a",
      userId: "u-lawyer",
      role: "lawyer",
      matterScope: "all",
    });
    expect(decodeToken(inside.scoped)).toMatchObject({
      userId: "u-lawyer",
      matterScope: ["legal/cases/a"],
    });
    expect(decodeToken(inside.otherBrain)).toBeNull();
    // Outside the call chain nothing is signed.
    expect(decodeToken(engineHeadersForBrain("brain-a"))).toBeNull();
  });
});
