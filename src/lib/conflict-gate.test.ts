// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { checkPartiesConflicts, requestConflictCheck } from "./conflict-gate";
import { engineCaseCreateDeps } from "./safe-case-create";

function engineAnswer(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

const hit = (assessment: string | undefined, slug: string) => ({
  slug,
  title: slug,
  role: "opponent",
  quelle: "case",
  matched_name: `Name ${slug}`,
  ...(assessment ? { assessment } : {}),
});

afterEach(() => vi.unstubAllGlobals());

describe("requestConflictCheck — fail-closed parsing of the engine answer", () => {
  it("an answer without severity throws (a check that did not run is no 'kein Konflikt')", async () => {
    engineAnswer({ matches: [] });
    await expect(requestConflictCheck({}, { name: "X" })).rejects.toThrow(/malformed/);
  });

  it("an unknown severity or missing matches throws", async () => {
    engineAnswer({ severity: "unknown", matches: [] });
    await expect(requestConflictCheck({}, { name: "X" })).rejects.toThrow(/malformed/);
    engineAnswer({ severity: "none" });
    await expect(requestConflictCheck({}, { name: "X" })).rejects.toThrow(/malformed/);
  });

  it("an HTTP error throws", async () => {
    engineAnswer({ error: "x" }, 502);
    await expect(requestConflictCheck({}, { name: "X" })).rejects.toThrow(/HTTP 502/);
  });

  it("a hit without assessment is treated as 'review', never dropped", async () => {
    engineAnswer({ severity: "low", matches: [hit(undefined, "a"), hit("bogus", "b")] });
    const res = await requestConflictCheck({}, { name: "X" });
    expect(res.matches.map((m) => m.assessment)).toEqual(["review", "review"]);
  });
});

describe("checkPartiesConflicts — only critical hits block", () => {
  it("review hits are reported but do not block; critical hits block", async () => {
    engineAnswer({
      severity: "critical",
      explanation: "",
      matches: [hit("critical", "c"), hit("review", "r"), hit("info", "i")],
    });
    const out = await checkPartiesConflicts({}, [
      { name: "Neue Mandantin", side: "client", ownContactSlugs: [] },
    ]);
    expect(out.checked).toBe(true);
    expect(out.matches?.map((m) => m.slug)).toEqual(["c", "r"]);
    expect(out.blocking.map((m) => m.slug)).toEqual(["c"]);
  });

  it("a malformed answer propagates as an error (the caller refuses the write)", async () => {
    engineAnswer({ matches: [hit("critical", "c")] });
    await expect(
      checkPartiesConflicts({}, [{ name: "X", side: "client", ownContactSlugs: [] }])
    ).rejects.toThrow();
  });
});

describe("engineCaseCreateDeps.conflictCheck — the case-create gate", () => {
  it("returns only critical hits (review/info do not block the creation)", async () => {
    engineAnswer({
      severity: "critical",
      matches: [hit("critical", "c"), hit("review", "r"), hit(undefined, "u")],
    });
    const blocking = await engineCaseCreateDeps({}).conflictCheck("X", "client", []);
    expect(blocking).toEqual([{ name: "Name c", slug: "c", type: "case" }]);
  });

  it("throws on an answer without severity", async () => {
    engineAnswer({ matches: [hit("critical", "c")] });
    await expect(engineCaseCreateDeps({}).conflictCheck("X", "client", [])).rejects.toThrow();
  });
});
