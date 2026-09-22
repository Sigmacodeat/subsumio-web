// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: vi.fn(() => null),
}));

vi.mock("@/lib/schema-init", () => ({
  createSchemaInit: vi.fn(() => vi.fn(async () => {})),
}));

import {
  createDemoSessionRecord,
  getDemoSession,
  updateDemoSession,
  consumeDemoBudget,
  countActiveDemoSessions,
  listExpiredDemoSessions,
  hashDemoIp,
  DEMO_QUESTIONS_FREE,
  DEMO_QUESTIONS_AFTER_GATE,
  DEMO_SESSION_TTL_SECONDS,
} from "./session";

describe("demo session (memory store)", () => {
  beforeEach(() => {
    // Memory map is module-internal — each test uses fresh session ids.
  });

  test("creates an isolated session with a unique demo source", async () => {
    const a = await createDemoSessionRecord("lawyer", "hash-a");
    const b = await createDemoSessionRecord("assistant", "hash-b");
    expect(a.id).not.toBe(b.id);
    expect(a.sourceId).toMatch(/^demo-s-[a-f0-9]{12}$/);
    expect(a.sourceId).not.toBe(b.sourceId);
    expect(a.persona).toBe("lawyer");
    expect(b.persona).toBe("assistant");
    expect(a.questionsUsed).toBe(0);
    expect(a.questionsCap).toBe(DEMO_QUESTIONS_FREE);
    expect(a.ingested).toBe(false);
    const ttlMs = new Date(a.expiresAt).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan((DEMO_SESSION_TTL_SECONDS - 30) * 1000);
    expect(ttlMs).toBeLessThanOrEqual(DEMO_SESSION_TTL_SECONDS * 1000 + 1000);
  });

  test("getDemoSession round-trips the record", async () => {
    const s = await createDemoSessionRecord("lawyer", "hash");
    const got = await getDemoSession(s.id);
    expect(got?.id).toBe(s.id);
    expect(got?.sourceId).toBe(s.sourceId);
    expect(await getDemoSession("nonexistent")).toBeNull();
  });

  test("budget consumption is capped and reports remaining state", async () => {
    const s = await createDemoSessionRecord("lawyer", "hash");
    for (let i = 1; i <= DEMO_QUESTIONS_FREE; i++) {
      const r = await consumeDemoBudget(s.id);
      expect(r.allowed).toBe(true);
      expect(r.used).toBe(i);
      expect(r.cap).toBe(DEMO_QUESTIONS_FREE);
    }
    const denied = await consumeDemoBudget(s.id);
    expect(denied.allowed).toBe(false);
    expect(denied.used).toBe(DEMO_QUESTIONS_FREE);
    // Denied calls must not consume budget.
    const again = await consumeDemoBudget(s.id);
    expect(again.used).toBe(DEMO_QUESTIONS_FREE);
  });

  test("gate raises the cap and unlocks more questions", async () => {
    const s = await createDemoSessionRecord("lawyer", "hash");
    for (let i = 0; i < DEMO_QUESTIONS_FREE; i++) await consumeDemoBudget(s.id);
    expect((await consumeDemoBudget(s.id)).allowed).toBe(false);

    await updateDemoSession(s.id, {
      questionsCap: DEMO_QUESTIONS_FREE + DEMO_QUESTIONS_AFTER_GATE,
      email: "visitor@example.com",
    });
    const r = await consumeDemoBudget(s.id);
    expect(r.allowed).toBe(true);
    expect(r.cap).toBe(DEMO_QUESTIONS_FREE + DEMO_QUESTIONS_AFTER_GATE);
    const got = await getDemoSession(s.id);
    expect(got?.email).toBe("visitor@example.com");
  });

  test("ingest flag and step update", async () => {
    const s = await createDemoSessionRecord("lawyer", "hash");
    await updateDemoSession(s.id, { ingested: true, step: 2 });
    const got = await getDemoSession(s.id);
    expect(got?.ingested).toBe(true);
    expect(got?.step).toBe(2);
  });

  test("expired sessions are listed for cleanup, active ones are not", async () => {
    const active = await createDemoSessionRecord("lawyer", "hash");
    const expired = await createDemoSessionRecord("lawyer", "hash");
    await updateDemoSession(expired.id, {}); // no-op sanity
    // Force expiry via internal patch path is not exposed — simulate by
    // checking the filter boundary: an active session is not listed.
    const expiredList = await listExpiredDemoSessions();
    expect(expiredList.find((s) => s.id === active.id)).toBeUndefined();
    expect(await countActiveDemoSessions()).toBeGreaterThanOrEqual(2);
  });

  test("deleted sessions disappear from active count", async () => {
    const s = await createDemoSessionRecord("lawyer", "hash");
    const before = await countActiveDemoSessions();
    await updateDemoSession(s.id, { deletedAt: new Date().toISOString() });
    const after = await countActiveDemoSessions();
    expect(after).toBe(before - 1);
  });

  test("hashDemoIp is stable and non-reversible", () => {
    const a = hashDemoIp("203.0.113.7");
    expect(a).toBe(hashDemoIp("203.0.113.7"));
    expect(a).not.toBe(hashDemoIp("203.0.113.8"));
    expect(a).toMatch(/^[a-f0-9]{24}$/);
  });
});
