// @vitest-environment node

/**
 * Smoke test for the standalone WebDAV/CalDAV bridge (scripts/dav-server.ts).
 * Spawns the real process on a random port and asserts liveness + DAV
 * discovery — protects the script from refactor breakage (it is not covered
 * by route checks since it runs outside Next.js).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const PORT = 14199;
const BASE = `http://127.0.0.1:${PORT}`;
const SCRIPT = path.resolve(__dirname, "../../scripts/dav-server.ts");

let proc: ChildProcess;

async function waitForListen(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("dav-server did not start");
}

describe("dav-server smoke", () => {
  beforeAll(async () => {
    proc = spawn("bunx", ["tsx", SCRIPT], {
      env: {
        ...process.env,
        DAV_PORT: String(PORT),
        DAV_BIND: "127.0.0.1",
        // Upstream does not exist — health/OPTIONS must work without it.
        SUBSUMIO_WEB_URL: "http://127.0.0.1:1",
      },
      stdio: "ignore",
    });
    await waitForListen();
  }, 20_000);

  afterAll(() => {
    proc?.kill("SIGTERM");
  });

  it("answers GET /health without auth", async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("answers OPTIONS with DAV compliance header", async () => {
    const res = await fetch(BASE, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("dav")).toContain("calendar-access");
    expect(res.headers.get("allow")).toContain("PROPFIND");
  });

  it("requires Basic auth on DAV paths", async () => {
    const res = await fetch(`${BASE}/dokumente/`, { method: "PROPFIND" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic");
  });

  it("rejects write methods", async () => {
    const res = await fetch(`${BASE}/dokumente/x.md`, { method: "PUT" });
    expect(res.status).toBe(405);
  });
});
