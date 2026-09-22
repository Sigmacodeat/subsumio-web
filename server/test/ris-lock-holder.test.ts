import { describe, expect, test } from "bun:test";
import { heartbeatFresh } from "../scripts/ris-lock.ts";

/**
 * ris-lock.ts moved from a file under a "shared" filesystem path to one row
 * in Postgres on 2026-09-22, because "shared" never meant "writable by
 * both": server/deploy/netcup/docker-compose.yml mounts /data rw in
 * `engine` but ro in `corpus-pipeline`, and /law-corpus the other way
 * around. Every RIS fetch running in corpus-pipeline — almost all of them —
 * sat in acquireRisLock()'s retry loop forever, unable to ever create the
 * lock file, indistinguishable in its own logs from a lock genuinely held
 * by someone else.
 *
 * The claim itself (tryClaim, an atomic INSERT ... ON CONFLICT ... WHERE
 * stale) and acquireRisLock/releaseRisLock need a live Postgres connection,
 * so they're exercised on the server rather than here — this repo's local
 * dev database is off-limits (see project memory: server-only, no local
 * DB). heartbeatFresh is the one piece of staleness logic worth pinning as
 * pure, exactly as it was for the file-based lock; only what "recent"
 * means for a heartbeat changed containers, not the meaning of the check.
 */
describe("heartbeatFresh", () => {
  test("a heartbeat from just now is fresh", () => {
    expect(heartbeatFresh(Date.now(), Date.now())).toBe(true);
  });

  test("a heartbeat older than the grace period is stale", () => {
    expect(heartbeatFresh(Date.now() - 6 * 60_000, Date.now())).toBe(false);
  });

  test("exactly at the boundary is stale, not fresh — the grace period is exclusive", () => {
    const now = Date.now();
    expect(heartbeatFresh(now - 5 * 60_000, now, 5 * 60_000)).toBe(false);
  });

  test("grace period is configurable, for a caller that wants a tighter check", () => {
    expect(heartbeatFresh(Date.now() - 5000, Date.now(), 1000)).toBe(false);
    expect(heartbeatFresh(Date.now() - 500, Date.now(), 1000)).toBe(true);
  });

  test("a heartbeat that is somehow in the future is still fresh, not a crash", () => {
    expect(heartbeatFresh(Date.now() + 10_000, Date.now())).toBe(true);
  });
});
