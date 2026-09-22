// @vitest-environment node

import { describe, test, expect, beforeEach } from "vitest";
import {
  computeFunnel,
  computeLeads,
  computeRecent,
  computeSegments,
  computeSummary,
  computeTimeseries,
  demoRangeFor,
  FUNNEL_STAGES,
} from "./analytics";
import {
  __resetMemoryDemoState,
  createDemoSessionRecord,
  loadDemoDataset,
  recordDemoEvent,
  updateDemoSession,
  type DemoEventRow,
  type DemoSession,
} from "./session";

const T0 = new Date("2026-10-01T10:00:00Z").getTime();
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

function sid(n: number, over: Partial<DemoSession> = {}): DemoSession {
  return {
    id: `s${n}`,
    sourceId: `demo-s-${n}`,
    persona: "lawyer",
    jurisdiction: "at",
    ref: null,
    questionsUsed: 0,
    questionsCap: 8,
    ingested: false,
    step: 0,
    email: null,
    convertedUserId: null,
    createdAt: at(0),
    expiresAt: at(60),
    lastSeenAt: at(0),
    deletedAt: null,
    ...over,
  };
}

function ev(s: string, event: DemoEventRow["event"], min: number, step?: number): DemoEventRow {
  return { sid: s, event, step: step ?? null, props: {}, createdAt: at(min) };
}

/**
 * Fixture cohort — 5 sessions exercising every funnel path:
 *  s1: full journey → signup (the ideal path)
 *  s2: drops after question (classic step-2 drop-off)
 *  s3: starts, ingests, skips the question stage (strict funnel must cut it)
 *  s4: starts only — pure bounce
 *  s5: gate lead, no signup yet
 */
const SESSIONS: DemoSession[] = [
  sid(1, {
    questionsUsed: 3,
    email: "a@kanzlei.example",
    convertedUserId: "u1",
    lastSeenAt: at(40),
  }),
  sid(2, { persona: "assistant", questionsUsed: 1 }),
  sid(3, { jurisdiction: "de", ref: "max", ingested: true }),
  sid(4),
  sid(5, { persona: "assistant", questionsUsed: 9, email: "b@firm.example", lastSeenAt: at(25) }),
];

const EVENTS: DemoEventRow[] = [
  ev("s1", "started", 0),
  ev("s1", "tour_step", 0, 0),
  ev("s1", "question", 2),
  ev("s1", "ingest", 6),
  ev("s1", "deadline_confirmed", 9),
  ev("s1", "tour_step", 10, 3),
  ev("s1", "cta", 11),
  ev("s1", "signup", 20),
  ev("s1", "gate", 8),
  ev("s2", "started", 0),
  ev("s2", "tour_step", 0, 0),
  ev("s2", "question", 3),
  ev("s3", "started", 0),
  ev("s3", "ingest", 5), // skipped question — strict funnel ends at stage 1
  ev("s4", "started", 0),
  ev("s4", "tour_skipped", 1),
  ev("s5", "started", 0),
  ev("s5", "question", 4),
  ev("s5", "gate", 15),
];

describe("computeFunnel — strict ordering", () => {
  const funnel = computeFunnel(SESSIONS, EVENTS);

  test("six stages in order with honest counts", () => {
    expect(funnel.map((f) => f.key)).toEqual([...FUNNEL_STAGES]);
    expect(funnel.map((f) => f.count)).toEqual([5, 3, 1, 1, 1, 1]);
    // s3 ingested but skipped "question" → strict funnel drops it there.
    // s1, s2, s5 asked a question; only s1 continued to ingest.
  });

  test("step + cumulative conversions", () => {
    expect(funnel[0].stepConvPct).toBeNull();
    expect(funnel[1].stepConvPct).toBe(60); // 3/5
    expect(funnel[2].stepConvPct).toBe(33.3); // 1/3
    expect(funnel[5].cumConvPct).toBe(20); // 1/5
  });

  test("median time-to-stage is computed from first occurrences", () => {
    expect(funnel[0].medianSecondsToReach).toBe(0);
    // question reached at +2min (s1), +3min (s2), +4min (s5) → median 180s
    expect(funnel[1].medianSecondsToReach).toBe(180);
  });
});

describe("computeSummary", () => {
  const sum = computeSummary(SESSIONS, EVENTS);

  test("scorecards", () => {
    expect(sum.sessions).toBe(5);
    // engaged = any event beyond "started" → s1,s2,s3,s4(tour_skipped),s5
    expect(sum.engagedSessions).toBe(5);
    expect(sum.engagementPct).toBe(100);
    // completed = last tour step viewed OR cta/signup → only s1
    expect(sum.completedSessions).toBe(1);
    expect(sum.ctaClicks).toBe(1);
    expect(sum.gateLeads).toBe(2); // s1 (event+email) + s5
    expect(sum.signups).toBe(1);
    expect(sum.questions).toBe(13);
  });

  test("empty cohort — no division by zero", () => {
    const empty = computeSummary([], []);
    expect(empty.sessions).toBe(0);
    expect(empty.engagementPct).toBeNull();
    expect(empty.ctaCtrPct).toBeNull();
  });
});

describe("computeSegments", () => {
  test("persona split", () => {
    const rows = computeSegments(SESSIONS, EVENTS, "persona");
    expect(rows.map((r) => r.key)).toEqual(["lawyer", "assistant"]);
    expect(rows[0].sessions).toBe(3);
    expect(rows[1].sessions).toBe(2);
  });

  test("ref split attributes the sales link", () => {
    const rows = computeSegments(SESSIONS, EVENTS, "ref");
    const max = rows.find((r) => r.key === "max");
    const direct = rows.find((r) => r.key === "direkt");
    expect(max?.sessions).toBe(1);
    expect(direct?.sessions).toBe(4);
  });
});

describe("computeTimeseries", () => {
  test("day buckets are gapless and event-timed", () => {
    const range = demoRangeFor("24h", new Date("2026-10-01T23:00:00Z"));
    const ts = computeTimeseries(SESSIONS, EVENTS, range);
    expect(ts.length).toBeGreaterThanOrEqual(1);
    const day = ts.find((b) => b.day === "2026-10-01");
    expect(day?.sessions).toBe(5);
    expect(day?.signups).toBe(1);
    expect(day?.gateLeads).toBe(2);
    expect(day?.questions).toBe(3); // three "question" events (s1, s2, s5)
  });
});

describe("computeRecent / computeLeads", () => {
  test("recent sessions carry deepest stage + flags", () => {
    const recent = computeRecent(SESSIONS, EVENTS);
    expect(recent).toHaveLength(5);
    const s1 = recent.find((r) => r.sid === "s1")!;
    expect(s1.stage).toBe("signup");
    expect(s1.converted).toBe(true);
    expect(s1.gate).toBe(true);
    expect(s1.durationSec).toBe(40 * 60);
    expect(recent.find((r) => r.sid === "s3")!.stage).toBe("started"); // strict cut
  });

  test("leads are scored and sorted by intent", () => {
    const leads = computeLeads(SESSIONS, EVENTS);
    expect(leads).toHaveLength(2);
    expect(leads[0].sid).toBe("s1"); // converted → highest score
    expect(leads[0].score).toBeGreaterThan(leads[1].score);
    expect(leads[1].email).toBe("b@firm.example");
  });
});

describe("demoRangeFor", () => {
  test("previous window has equal length and abuts the current one", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    for (const key of ["24h", "7d", "30d", "90d"] as const) {
      const r = demoRangeFor(key, now);
      expect(r.prevTo.getTime()).toBe(r.from.getTime());
      expect(r.to.getTime() - r.from.getTime()).toBe(r.prevTo.getTime() - r.prevFrom.getTime());
    }
  });
});

describe("memory-store integration (loadDemoDataset)", () => {
  beforeEach(() => __resetMemoryDemoState());

  test("sessions + events round-trip through the memory fallback", async () => {
    const s = await createDemoSessionRecord("lawyer", "iphash", {
      jurisdiction: "de",
      ref: "max",
    });
    await recordDemoEvent(s.id, "question");
    await recordDemoEvent(s.id, "tour_step", { step: 0 });
    await recordDemoEvent(s.id, "tour_step", { step: 0 }); // dedupe
    await updateDemoSession(s.id, { email: "lead@x.example" });

    const { sessions, events } = await loadDemoDataset();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].jurisdiction).toBe("de");
    expect(sessions[0].ref).toBe("max");
    expect(events.map((e) => e.event)).toEqual(["started", "question", "tour_step"]);
    // Full pipeline produces a coherent funnel for this session.
    const funnel = computeFunnel(sessions, events);
    expect(funnel[0].count).toBe(1);
    expect(funnel[1].count).toBe(1);
    expect(funnel[2].count).toBe(0); // no ingest → strict funnel stops
    const leads = computeLeads(sessions, events);
    expect(leads[0].email).toBe("lead@x.example");
  });
});
