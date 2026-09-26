import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force the in-memory fallback (no Postgres pool) so these tests exercise
// the exact code path used in local dev/tests, matching the pattern used by
// other lib tests in this codebase (e.g. src/lib/email/mailbox.test.ts).
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));

import {
  createSupportGrant,
  getActiveSupportGrant,
  listActiveSupportSessionsForOrg,
  revokeSupportGrants,
  endSupportSession,
  getActiveSupportSession,
  listSupportSessionsForOrg,
  startSupportSession,
  SUPPORT_SESSION_TTL_MS,
} from "./support-session";

/** A valid firm approval for `orgId` (7 days, read and write). */
async function grantFor(orgId: string, mode: "read" | "write" = "write", hours = 168) {
  const { grant } = await createSupportGrant({
    orgId,
    mode,
    hours,
    grantedById: `admin_${orgId}`,
    grantedByEmail: `admin@${orgId}.example`,
  });
  return grant;
}

describe("support-session", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a session that expires 60 minutes from now", async () => {
    const before = Date.now();
    const session = await startSupportSession({
      operatorId: "op_1",
      operatorEmail: "ops@subsumio.example",
      orgId: "org_a",
      grant: await grantFor("org_a"),
      orgName: "Kanzlei A",
      reason: "Ticket #123 — Mandant meldet Fehler beim Fristen-Export",
    });
    expect(session.orgId).toBe("org_a");
    expect(session.endedAt).toBeNull();
    const ttl = new Date(session.expiresAt).getTime() - new Date(session.startedAt).getTime();
    expect(ttl).toBe(SUPPORT_SESSION_TTL_MS);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(before);
  });

  it("getActiveSupportSession returns the session for that operator only", async () => {
    await startSupportSession({
      operatorId: "op_2",
      operatorEmail: "ops2@subsumio.example",
      orgId: "org_b",
      grant: await grantFor("org_b"),
      orgName: "Kanzlei B",
      reason: "Prüfung eines gemeldeten Datenfehlers",
    });
    expect(await getActiveSupportSession("op_2")).not.toBeNull();
    expect(await getActiveSupportSession("someone-else")).toBeNull();
  });

  it("starting a second session for the same operator ends the first", async () => {
    await startSupportSession({
      operatorId: "op_3",
      operatorEmail: "ops3@subsumio.example",
      orgId: "org_c",
      grant: await grantFor("org_c"),
      orgName: "Kanzlei C",
      reason: "Erste Sitzung zur Fehlersuche",
    });
    const second = await startSupportSession({
      operatorId: "op_3",
      operatorEmail: "ops3@subsumio.example",
      orgId: "org_d",
      grant: await grantFor("org_d"),
      orgName: "Kanzlei D",
      reason: "Zweite Sitzung, andere Kanzlei",
    });
    const active = await getActiveSupportSession("op_3");
    expect(active?.orgId).toBe("org_d");
    expect(active?.id).toBe(second.id);
  });

  it("endSupportSession ends the operator's own active session and is idempotent", async () => {
    await startSupportSession({
      operatorId: "op_4",
      operatorEmail: "ops4@subsumio.example",
      orgId: "org_e",
      grant: await grantFor("org_e"),
      orgName: "Kanzlei E",
      reason: "Wird gleich wieder beendet",
    });
    const ended = await endSupportSession("op_4");
    expect(ended?.endedAt).not.toBeNull();
    expect(await getActiveSupportSession("op_4")).toBeNull();

    // Ending again (nothing active) must not throw and must return null.
    expect(await endSupportSession("op_4")).toBeNull();
  });

  it("a session past its expiry is no longer considered active, even if never explicitly ended", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    await startSupportSession({
      operatorId: "op_5",
      operatorEmail: "ops5@subsumio.example",
      orgId: "org_f",
      grant: await grantFor("org_f"),
      orgName: "Kanzlei F",
      reason: "Läuft über die 60 Minuten hinaus, wird nie manuell beendet",
    });
    expect(await getActiveSupportSession("op_5")).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T11:00:01Z")); // 60:01 later
    expect(await getActiveSupportSession("op_5")).toBeNull();
  });

  it("listSupportSessionsForOrg returns only that org's sessions, most recent first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T09:00:00Z"));
    await startSupportSession({
      operatorId: "op_6",
      operatorEmail: "ops6@subsumio.example",
      orgId: "org_g",
      grant: await grantFor("org_g"),
      orgName: "Kanzlei G",
      reason: "Erster Zugriff auf Kanzlei G",
    });
    await endSupportSession("op_6");

    vi.setSystemTime(new Date("2026-02-01T09:05:00Z"));
    await startSupportSession({
      operatorId: "op_7",
      operatorEmail: "ops7@subsumio.example",
      orgId: "org_h",
      grant: await grantFor("org_h"),
      orgName: "Kanzlei H",
      reason: "Zugriff auf eine andere Kanzlei",
    });

    vi.setSystemTime(new Date("2026-02-01T09:10:00Z"));
    await startSupportSession({
      operatorId: "op_6",
      operatorEmail: "ops6@subsumio.example",
      orgId: "org_g",
      grant: await grantFor("org_g"),
      orgName: "Kanzlei G",
      reason: "Zweiter Zugriff auf Kanzlei G",
    });

    const forG = await listSupportSessionsForOrg("org_g");
    expect(forG).toHaveLength(2);
    expect(forG.every((s) => s.orgId === "org_g")).toBe(true);
    expect(forG[0].reason).toBe("Zweiter Zugriff auf Kanzlei G");
  });

  it("a session never outlives the firm approval it runs under", async () => {
    const grant = await grantFor("org_short", "read", 1);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(grant.expiresAt) - 10 * 60_000));
    const session = await startSupportSession({
      operatorId: "op_short",
      operatorEmail: "ops@subsumio.example",
      orgId: "org_short",
      orgName: "Kanzlei Kurz",
      reason: "Freigabe läuft in zehn Minuten ab",
      grant,
    });
    expect(session.expiresAt).toBe(grant.expiresAt);
    vi.setSystemTime(new Date(Date.parse(grant.expiresAt) + 1000));
    expect(await getActiveSupportSession("op_short")).toBeNull();
    expect(await getActiveSupportGrant("org_short")).toBeNull();
  });

  it("revoking the approval ends running sessions of that firm at once", async () => {
    const grant = await grantFor("org_rev");
    await startSupportSession({
      operatorId: "op_rev",
      operatorEmail: "ops@subsumio.example",
      orgId: "org_rev",
      orgName: "Kanzlei Widerruf",
      reason: "Laufende Sitzung vor dem Widerruf",
      grant,
    });
    expect(await listActiveSupportSessionsForOrg("org_rev")).toHaveLength(1);
    const { grants, endedSessions } = await revokeSupportGrants("org_rev", "admin@org_rev.example");
    expect(grants.map((g) => g.id)).toEqual([grant.id]);
    expect(endedSessions).toHaveLength(1);
    expect(await getActiveSupportSession("op_rev")).toBeNull();
    expect(await getActiveSupportGrant("org_rev")).toBeNull();
  });

  it("a new approval replaces the old one and ends sessions under the old scope", async () => {
    const first = await grantFor("org_repl", "write");
    await startSupportSession({
      operatorId: "op_repl",
      operatorEmail: "ops@subsumio.example",
      orgId: "org_repl",
      orgName: "Kanzlei Ersatz",
      reason: "Sitzung mit Schreibrecht",
      mode: "write",
      grant: first,
    });
    const { grant, replaced, endedSessions } = await createSupportGrant({
      orgId: "org_repl",
      mode: "read",
      hours: 24,
      grantedById: "admin",
      grantedByEmail: "admin@org_repl.example",
    });
    expect(replaced.map((g) => g.id)).toEqual([first.id]);
    expect(endedSessions).toHaveLength(1);
    expect((await getActiveSupportGrant("org_repl"))?.id).toBe(grant.id);
    expect(await getActiveSupportSession("op_repl")).toBeNull();
  });

  it("a session under another firm's approval is never active", async () => {
    const other = await grantFor("org_other");
    await startSupportSession({
      operatorId: "op_mismatch",
      operatorEmail: "ops@subsumio.example",
      orgId: "org_target",
      orgName: "Kanzlei Ziel",
      reason: "Freigabe gehört zu einer anderen Kanzlei",
      grant: other,
    });
    expect(await getActiveSupportSession("op_mismatch")).toBeNull();
  });

  it("rejects approvals longer than 7 days", async () => {
    await expect(
      createSupportGrant({
        orgId: "org_long",
        mode: "read",
        hours: 169,
        grantedById: "a",
        grantedByEmail: "a@example.test",
      })
    ).rejects.toThrow();
  });
});
