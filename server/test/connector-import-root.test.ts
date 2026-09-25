/**
 * Folder connectors (ADVOKAT / beA import) of a firm read only below that
 * firm's import root `<SUBSUMIO_CONNECTOR_IMPORT_ROOT>/<source_id>`. Several
 * firms share the engine host: `..`, symlinks out of the root, other firms'
 * folders and arbitrary host paths are refused at configuration time and
 * skipped at scan time.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import {
  resolveTenantWatchDir,
  tenantWatchDirAllowed,
} from "../src/core/ingestion/connectors/import-root.ts";
import { AdvokatImportConnector } from "../src/core/ingestion/connectors/advokat-import.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "import-root-")));
const ROOT = join(TMP, "imports");
const ENV = { SUBSUMIO_CONNECTOR_IMPORT_ROOT: ROOT } as NodeJS.ProcessEnv;
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

beforeAll(async () => {
  mkdirSync(join(ROOT, "firm-a", "akten", "2026-001"), { recursive: true });
  writeFileSync(join(ROOT, "firm-a", "akten", "2026-001", "brief.txt"), "Schreiben A");
  mkdirSync(join(ROOT, "firm-b", "akten", "2026-777"), { recursive: true });
  writeFileSync(join(ROOT, "firm-b", "akten", "2026-777", "geheim.txt"), "Schreiben B");
  mkdirSync(join(TMP, "host-data"), { recursive: true });
  writeFileSync(join(TMP, "host-data", "config.json"), "{}");
  // A symlink inside firm-a's root that points at firm-b's folder.
  symlinkSync(join(ROOT, "firm-b"), join(ROOT, "firm-a", "link-to-b"));

  releaseEnv = setEnvForFile({
    SUBSUMIO_WEB_API_KEY: SECRET,
    SUBSUMIO_CONNECTOR_IMPORT_ROOT: ROOT,
    SUBSUMIO_ENCRYPTION_KEY: "connector-test-key-that-is-long-enough-for-aes",
  });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET, requireTenant: true });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
  rmSync(TMP, { recursive: true, force: true });
});

describe("resolveTenantWatchDir", () => {
  test("paths inside the firm's own root are accepted (absolute or relative)", () => {
    const abs = resolveTenantWatchDir(join(ROOT, "firm-a", "akten"), "firm-a", ENV);
    expect(abs).toEqual({
      ok: true,
      watchDir: join(ROOT, "firm-a", "akten"),
      root: join(ROOT, "firm-a"),
    });
    const rel = resolveTenantWatchDir("akten", "firm-a", ENV);
    expect(rel.ok && rel.watchDir).toBe(join(ROOT, "firm-a", "akten"));
  });

  test("other firms, host paths, `..` and symlinks out are refused", () => {
    const outside = [
      join(ROOT, "firm-b"),
      join(ROOT, "firm-a", "..", "firm-b"),
      "../firm-b",
      join(TMP, "host-data"),
      "/",
      ROOT,
      join(ROOT, "firm-a", "link-to-b"),
      "link-to-b",
    ];
    for (const p of outside) {
      expect(resolveTenantWatchDir(p, "firm-a", ENV)).toEqual({
        ok: false,
        reason: "outside_import_root",
      });
    }
  });

  test("a firm without an import folder, or the default source, gets nothing", () => {
    expect(resolveTenantWatchDir("akten", "firm-c", ENV)).toEqual({
      ok: false,
      reason: "import_root_missing",
    });
    expect(resolveTenantWatchDir("akten", "default", ENV).ok).toBe(false);
  });

  test("stored configurations are re-checked at scan time", () => {
    expect(tenantWatchDirAllowed(join(ROOT, "firm-b"), "firm-a", ENV)).toBe(false);
    expect(tenantWatchDirAllowed(join(ROOT, "firm-a", "akten"), "firm-a", ENV)).toBe(true);
    // Operator-configured connectors without a tenant keep their directory.
    expect(tenantWatchDirAllowed(join(TMP, "host-data"), undefined, ENV)).toBe(true);
  });
});

describe("AdvokatImportConnector scan", () => {
  test("a firm-bound connector whose stored dir lies outside its root imports nothing", async () => {
    const connector = new AdvokatImportConnector({
      filters: { watch_dir: join(ROOT, "firm-b") },
      tenant_source_id: "firm-a",
    });
    const { items } = await connector.fetchDelta();
    expect(items).toHaveLength(0);
  });

  test("inside its root it imports, and never follows a symlink out", async () => {
    const connector = new AdvokatImportConnector({
      filters: { watch_dir: join(ROOT, "firm-a") },
      tenant_source_id: "firm-a",
    });
    const { items } = await connector.fetchDelta();
    const paths = items.map((i) => (i as unknown as { relativePath: string }).relativePath);
    expect(paths).toContain("akten/2026-001/brief.txt");
    expect(paths.some((p) => p.includes("geheim"))).toBe(false);
  });
});

describe("POST /api/connectors/advokat-import/configure", () => {
  const configure = (source: string, watch_dir: string) =>
    fetch(`${base}/api/connectors/advokat-import/configure`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-subsumio-api-key": SECRET,
        "x-subsumio-source": source,
      },
      body: JSON.stringify({ watch_dir }),
    });

  test("paths outside the firm's import root answer 400 invalid_watch_dir", async () => {
    for (const p of [
      join(TMP, "host-data"),
      join(ROOT, "firm-b"),
      join(ROOT, "firm-a", "..", "firm-b"),
      join(ROOT, "firm-a", "link-to-b"),
      "/",
    ]) {
      const res = await configure("firm-a", p);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("invalid_watch_dir");
    }
  });

  test("a folder inside the firm's import root is accepted", async () => {
    const res = await configure("firm-a", "akten");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { watch_dir: string; tenant_source_id: string };
    expect(body.watch_dir).toBe(join(ROOT, "firm-a", "akten"));
    expect(body.tenant_source_id).toBe("firm-a");
  });
});
