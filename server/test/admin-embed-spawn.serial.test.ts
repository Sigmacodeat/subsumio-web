/**
 * Admin surface contract after the legacy admin SPA was removed (admin/dist
 * no longer ships; src/admin-embedded.ts is an empty generated stub):
 *   - /admin/* page routes degrade to 404 (no embedded manifest, no
 *     cwd-relative admin/dist fallback in a foreign cwd)
 *   - /admin/api/* routes still resolve to real handlers — the auth
 *     challenge must NOT be swallowed by any SPA fallback
 *
 * Spawns `gbrain serve --http` from a fresh tmpdir so `process.cwd()/admin/dist`
 * cannot exist — the embedded-manifest branch is the one under test.
 *
 * No DATABASE_URL needed; PGLite is the engine. Serial because it binds
 * a TCP port and reads/writes a tmpdir.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Subprocess } from "bun";

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

interface ServeProc {
  proc: Subprocess;
  port: number;
  home: string;
  bootstrapToken: string;
  cleanup: () => Promise<void>;
}

function pickPort(): number {
  // High-random port. Collision is unlikely; test reruns get fresh ports.
  return 31000 + Math.floor(Math.random() * 4000);
}

async function spawnServer(): Promise<ServeProc> {
  const home = mkdtempSync(join(tmpdir(), "gbrain-admin-embed-"));
  mkdirSync(join(home, ".gbrain"), { recursive: true });
  writeFileSync(
    join(home, ".gbrain", "config.json"),
    JSON.stringify({
      engine: "pglite",
      database_path: join(home, ".gbrain", "brain.pglite"),
      embedding_dimensions: 1536,
    }) + "\n"
  );

  // Pin the bootstrap token via env so the test doesn't have to scrape it
  // out of the startup banner (and the banner stays predictable across
  // future formatting tweaks).
  const bootstrapToken = "test-bootstrap-token-aaaaaaaaaaaaaaaaaa"; // 41 chars
  const port = pickPort();

  // CRITICAL: cwd is the tmpdir, NOT the repo. This forces serve-http to
  // fall into the embedded-manifest branch because cwd/admin/dist does
  // not exist.
  const proc = Bun.spawn(
    [
      "bun",
      "run",
      `${REPO}/src/cli.ts`,
      "serve",
      "--http",
      "--port",
      String(port),
      "--bind",
      "127.0.0.1",
    ],
    {
      cwd: home,
      env: {
        ...process.env,
        DATABASE_URL: "",
        GBRAIN_DATABASE_URL: "",
        HOME: home,
        GBRAIN_HOME: home,
        GBRAIN_ADMIN_BOOTSTRAP_TOKEN: bootstrapToken,
        // Don't let test-process inherit any auth keys it doesn't need.
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
      },
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  // Wait for readiness by polling /health. Bun's readable streams don't
  // give us a synchronous "stderr line" API and the startup banner format
  // is allowed to drift; a /health probe is the contract that matters.
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const cleanup = async () => {
    try {
      proc.kill("SIGTERM");
    } catch {
      /* already exited */
    }
    // Give it 2s to exit cleanly, then SIGKILL.
    await Promise.race([proc.exited, new Promise((r) => setTimeout(r, 2000))]);
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  };

  if (!ready) {
    // Capture some diagnostics for the failure message before tearing down.
    const stderrText = await new Response(proc.stderr).text().catch(() => "");
    await cleanup();
    throw new Error(
      `serve --http never became ready on port ${port} after 30s. stderr: ${stderrText.slice(0, 2000)}`
    );
  }

  return { proc, port, home, bootstrapToken, cleanup };
}

describe("admin surface contract — SPA absent, API routes intact", () => {
  test("GET /admin/ returns 404 (admin SPA not embedded in this build)", async () => {
    const s = await spawnServer();
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/admin/`, {
        signal: AbortSignal.timeout(5000),
      });
      expect(res.status).toBe(404);
      const body = await res.text();
      expect(body).not.toContain('<div id="root">');
    } finally {
      await s.cleanup();
    }
  }, 90_000);

  test("GET /admin/agents (SPA deep link) also 404s — no stale fallback serving HTML", async () => {
    const s = await spawnServer();
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/admin/agents`, {
        signal: AbortSignal.timeout(5000),
      });
      expect(res.status).toBe(404);
      const body = await res.text();
      expect(body).not.toContain('<div id="root">');
    } finally {
      await s.cleanup();
    }
  }, 90_000);

  test("GET /admin/api/stats (API route) is NOT swallowed — returns auth challenge", async () => {
    const s = await spawnServer();
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/admin/api/stats`, {
        signal: AbortSignal.timeout(5000),
      });
      // No session cookie → 401/403 from requireAdmin, NOT 200 + HTML and
      // NOT the 404 the SPA routes now return.
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(404);
      const body = await res.text().catch(() => "");
      expect(body).not.toContain('<div id="root">');
    } finally {
      await s.cleanup();
    }
  }, 90_000);
});
