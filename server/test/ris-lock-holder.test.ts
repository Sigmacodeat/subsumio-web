import { describe, expect, test } from "bun:test";
import { heartbeatFresh, holderAlive, scriptName } from "../scripts/ris-lock.ts";

/**
 * The RIS lock is what keeps us to one connection, which the OGD rules
 * require. It failed because the holder check compared paths: Bun records an
 * absolute path in argv while the process was launched relative, so every
 * live holder looked dead and every new job stole the lock. Three fetchers
 * ran at once on 2026-09-20.
 */
describe("scriptName", () => {
  test("reduces Bun's absolute argv path to the file name", () => {
    expect(scriptName("/app/scripts/fetch-entscheidungstexte.ts --court ogh")).toBe(
      "fetch-entscheidungstexte.ts"
    );
  });

  test("a relative launch yields the same name — that is the whole point", () => {
    const stored = "/app/scripts/fetch-at-landesrecht-xml.ts --page 261 --to-page 540";
    const live = "bun scripts/fetch-at-landesrecht-xml.ts --page 261 --to-page 540";
    expect(live.includes(scriptName(stored))).toBe(true);
  });

  test("a different script is still recognised as different", () => {
    const stored = "/app/scripts/fetch-at-landesrecht-xml.ts --page 1";
    const live = "bun scripts/reconcile-ris.ts";
    expect(live.includes(scriptName(stored))).toBe(false);
  });

  test("survives an empty or odd command without throwing", () => {
    expect(scriptName("")).toBe("");
    expect(scriptName("   ")).toBe("");
    expect(scriptName("bun")).toBe("bun");
  });
});

/**
 * `/tmp` is private per container: a lock written inside `engine` was
 * invisible to `corpus-pipeline`, so a manual re-fetch ran there ALONGSIDE
 * the judikatur court fetch for several minutes on 2026-09-21 before either
 * process noticed the other. PID liveness cannot fix that on its own —
 * `process.kill(pid, 0)` throws identically for "really dead" and for
 * "alive, but in a PID namespace we can't see" — so a holder invisible to
 * us must be judged by whether it is still heartbeating, not assumed dead.
 */
describe("holderAlive", () => {
  test("our own PID, with a matching command, is alive", () => {
    expect(
      holderAlive({
        pid: process.pid,
        acquired_at: Date.now(),
        heartbeat_at: Date.now(),
        command: process.argv.slice(1).join(" ") || "bun test",
      })
    ).toBe(true);
  });

  test("a PID invisible to us is judged by its heartbeat, not declared dead", () => {
    // 999999999 exists in no process's namespace — the same shape a live
    // cross-container holder has from here: unreachable, not dead.
    const ghostPid = 999999999;
    const fresh = holderAlive({
      pid: ghostPid,
      acquired_at: Date.now() - 60_000,
      heartbeat_at: Date.now(),
      command: "bun scripts/fetch-entscheidungstexte.ts --court ogh",
    });
    expect(fresh).toBe(true);

    const stale = holderAlive({
      pid: ghostPid,
      acquired_at: Date.now() - 60 * 60_000,
      heartbeat_at: Date.now() - 10 * 60_000,
      command: "bun scripts/fetch-entscheidungstexte.ts --court ogh",
    });
    expect(stale).toBe(false);
  });
});

describe("heartbeatFresh", () => {
  test("recent heartbeat is fresh", () => {
    expect(heartbeatFresh(Date.now() - 1000, Date.now())).toBe(true);
  });

  test("a heartbeat older than the grace period is stale", () => {
    expect(heartbeatFresh(Date.now() - 6 * 60_000, Date.now())).toBe(false);
  });

  test("grace period is configurable, for a caller that wants a tighter check", () => {
    expect(heartbeatFresh(Date.now() - 5000, Date.now(), 1000)).toBe(false);
    expect(heartbeatFresh(Date.now() - 500, Date.now(), 1000)).toBe(true);
  });
});
