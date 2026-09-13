import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force the in-memory fallback (no Postgres pool) so these tests exercise
// the exact code path used in local dev/tests, matching the pattern used by
// other lib tests in this codebase (e.g. src/lib/email/mailbox.test.ts).
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));

import {
  endSupportSession,
  getActiveSupportSession,
  listSupportSessionsForOrg,
  startSupportSession,
  SUPPORT_SESSION_TTL_MS,
} from "./support-session";

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
      orgName: "Kanzlei C",
      reason: "Erste Sitzung zur Fehlersuche",
    });
    const second = await startSupportSession({
      operatorId: "op_3",
      operatorEmail: "ops3@subsumio.example",
      orgId: "org_d",
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
      orgName: "Kanzlei G",
      reason: "Erster Zugriff auf Kanzlei G",
    });
    await endSupportSession("op_6");

    vi.setSystemTime(new Date("2026-02-01T09:05:00Z"));
    await startSupportSession({
      operatorId: "op_7",
      operatorEmail: "ops7@subsumio.example",
      orgId: "org_h",
      orgName: "Kanzlei H",
      reason: "Zugriff auf eine andere Kanzlei",
    });

    vi.setSystemTime(new Date("2026-02-01T09:10:00Z"));
    await startSupportSession({
      operatorId: "op_6",
      operatorEmail: "ops6@subsumio.example",
      orgId: "org_g",
      orgName: "Kanzlei G",
      reason: "Zweiter Zugriff auf Kanzlei G",
    });

    const forG = await listSupportSessionsForOrg("org_g");
    expect(forG).toHaveLength(2);
    expect(forG.every((s) => s.orgId === "org_g")).toBe(true);
    expect(forG[0].reason).toBe("Zweiter Zugriff auf Kanzlei G");
  });
});
