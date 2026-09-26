/**
 * Full firm export: the ZIP writer and the stream envelope on their own, then
 * the whole path on a real PGLite brain — an admin starts the job, the job
 * builds the archive under the admin's matter scope with every original
 * byte-identical, the archive is sealed at rest, downloads once for that
 * admin only, and is gone afterwards or after expiry.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { randomBytes } from "node:crypto";
import JSZip from "jszip";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import { ZipStreamWriter, safeEntryName } from "../src/core/zip-stream.ts";
import { createDecryptStream, createEncryptStream } from "../src/core/stream-encryption.ts";
import { isEncrypted, loadKeyring, type Keyring } from "../src/core/file-encryption.ts";
import { createStorage, createRawStorage } from "../src/core/storage.ts";
import { makeFirmExportHandler } from "../src/core/minions/handlers/firm-export.ts";
import { FIRM_EXPORT_JOB, sweepFirmExports } from "../src/core/firm-export.ts";
import type { MinionJobContext } from "../src/core/minions/types.ts";

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer>) parts.push(Buffer.from(c));
  return Buffer.concat(parts);
}

async function zipOf(
  entries: Array<[string, Buffer, boolean]>,
  opts: { forceZip64?: boolean } = {}
): Promise<Buffer> {
  const out = new PassThrough();
  const done = collect(out);
  const zip = new ZipStreamWriter(out, opts);
  for (const [name, data, deflate] of entries) await zip.addBuffer(name, data, { deflate });
  await zip.finish();
  out.end();
  return done;
}

describe("zip writer", () => {
  const entries: Array<[string, Buffer, boolean]> = [
    ["pages/a.json", Buffer.from(JSON.stringify({ x: "ä".repeat(500) })), true],
    ["files/doc/Klage (1).pdf", randomBytes(70_000), false],
    ["leer.txt", Buffer.alloc(0), true],
  ];

  for (const forceZip64 of [false, true]) {
    test(`entries read back byte-identical${forceZip64 ? " (ZIP64 records)" : ""}`, async () => {
      const buf = await zipOf(entries, { forceZip64 });
      const zip = await JSZip.loadAsync(buf);
      for (const [name, data] of entries) {
        const f = zip.file(name);
        expect(f).not.toBeNull();
        expect(Buffer.from(await f!.async("uint8array")).equals(data)).toBe(true);
      }
    });
  }

  test("entry names cannot leave the archive root", () => {
    expect(safeEntryName("../../etc/passwd")).toBe("etc/passwd");
    expect(safeEntryName("/abs\\win/./x")).toBe("abs/win/x");
  });
});

describe("stream envelope", () => {
  const keyring = loadKeyring({
    SUBSUMIO_STORAGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  }) as Keyring;

  async function seal(data: Buffer): Promise<Buffer> {
    return collect(Readable.from([data]).pipe(createEncryptStream(keyring)));
  }
  async function open(data: Buffer, pieces = 7): Promise<Buffer> {
    const parts: Buffer[] = [];
    const step = Math.max(1, Math.ceil(data.length / pieces));
    for (let i = 0; i < data.length; i += step) parts.push(data.subarray(i, i + step));
    return collect(Readable.from(parts).pipe(createDecryptStream(keyring)));
  }

  test("round-trips empty, small and multi-chunk data", async () => {
    for (const size of [0, 10, 1024 * 1024, 2.5 * 1024 * 1024]) {
      const data = randomBytes(Math.floor(size));
      const sealed = await seal(data);
      expect(sealed.includes(data.subarray(0, 64)) && data.length > 0).toBe(false);
      expect((await open(sealed)).equals(data)).toBe(true);
    }
  });

  test("tampering and truncation fail", async () => {
    const sealed = await seal(randomBytes(3 * 1024 * 1024));
    const flipped = Buffer.from(sealed);
    flipped[flipped.length - 100] ^= 1;
    await expect(open(flipped)).rejects.toThrow();
    // Cutting off whole trailing chunks must not pass as a shorter file.
    await expect(open(sealed.subarray(0, 1024 * 1024 + 200))).rejects.toThrow();
  });
});

// ── End to end ──────────────────────────────────────────────────────────────

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-exp";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let home = "";
let releaseEnv: (() => void) | undefined;
const originals = new Map<string, Buffer>();

function headers(userId: string, role: string, extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-subsumio-api-key": SECRET,
    "x-subsumio-source": SOURCE,
    "x-subsumio-identity-token": createIdentityToken(
      { sourceId: SOURCE, matterScope: "all", userId, role },
      SECRET
    ),
    ...extra,
  };
}

async function putPage(h: Record<string, string>, body: Record<string, unknown>) {
  const res = await fetch(`${base}/api/pages`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
}

async function storeOriginal(slug: string, filename: string, data: Buffer) {
  const storage = await createStorage({
    backend: "local",
    bucket: "brain-files",
    localPath: join(home, ".gbrain", "files"),
  });
  const path = `clean/t/${slug}/${filename}`;
  await storage.upload(path, data);
  await engine.executeRaw(
    `INSERT INTO files (source_id, page_slug, filename, storage_path, mime_type, size_bytes, content_hash)
     VALUES ($1, $2, $3, $4, 'application/pdf', $5, 'h')`,
    [SOURCE, slug, filename, path, data.length]
  );
  originals.set(`files/${slug}/${filename}`, data);
}

async function startExport(userId = "u-admin"): Promise<number> {
  const res = await fetch(`${base}/api/firm-export`, {
    method: "POST",
    headers: headers(userId, "admin"),
    body: JSON.stringify({ web_brain_id: "brain-1" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: number }).id;
}

/** Run the job the way the worker does and record its result. */
async function runJob(id: number): Promise<Record<string, unknown>> {
  const rows = await engine.executeRaw<{ data: Record<string, unknown> }>(
    `SELECT data FROM minion_jobs WHERE id = $1`,
    [id]
  );
  const progress: unknown[] = [];
  const ctx = {
    id,
    name: FIRM_EXPORT_JOB,
    data: rows[0]!.data,
    attempts_made: 0,
    signal: new AbortController().signal,
    shutdownSignal: new AbortController().signal,
    updateProgress: async (p: unknown) => {
      progress.push(p);
    },
    updateTokens: async () => {},
    log: async () => {},
    isActive: async () => true,
    readInbox: async () => [],
  } as unknown as MinionJobContext;
  const result = await makeFirmExportHandler({ engine })(ctx);
  await engine.executeRaw(
    `UPDATE minion_jobs SET status = 'completed', result = $2, progress = $3, finished_at = now()
      WHERE id = $1`,
    [id, result, progress[progress.length - 1] ?? null]
  );
  return result;
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "firm-export-"));
  releaseEnv = setEnvForFile({
    SUBSUMIO_WEB_API_KEY: SECRET,
    GBRAIN_HOME: home,
    SUBSUMIO_STORAGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    R2_BUCKET: undefined,
  });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  const admin = headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" });
  await putPage(admin, {
    slug: "cases/offen",
    type: "legal_case",
    title: "Offen",
    content: "Akte",
    frontmatter: {},
  });
  await putPage(admin, {
    slug: "cases/gesperrt",
    type: "legal_case",
    title: "Gesperrt",
    content: "Akte",
    frontmatter: {},
  });
  for (const [slug, caseSlug] of [
    ["documents/klage", "cases/offen"],
    ["documents/vertrag", "cases/offen"],
    ["documents/geheim", "cases/gesperrt"],
  ] as const) {
    await putPage(admin, {
      slug,
      type: "document",
      title: slug,
      content: `Text ${slug}`,
      frontmatter: { case_slug: caseSlug },
    });
  }
  await putPage(admin, {
    slug: "legal/settings/kanzlei",
    type: "kanzlei_settings",
    title: "Einstellungen",
    content: "Einstellungen",
    frontmatter: { smtpPasswordEnc: "cipher", kanzleiName: "Muster" },
  });
  await storeOriginal("documents/klage", "klage.pdf", randomBytes(40_000));
  await storeOriginal("documents/vertrag", "vertrag.pdf", randomBytes(12_345));
  await storeOriginal("documents/geheim", "geheim.pdf", randomBytes(999));
  // The wall goes up last: the admin could not file into a walled matter.
  await putPage(admin, {
    slug: "cases/gesperrt",
    merge: true,
    frontmatter: { permissions: { blocked_users: ["u-admin"] } },
  });
  invalidateMatterAccess(SOURCE);
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
  if (home) rmSync(home, { recursive: true, force: true });
});

describe("firm export end to end", () => {
  let exportId = 0;
  let archivePath = "";

  test("only an admin may start it; a second start returns the running job", async () => {
    const lawyer = await fetch(`${base}/api/firm-export`, {
      method: "POST",
      headers: headers("u-lawyer", "lawyer"),
      body: "{}",
    });
    expect(lawyer.status).toBe(403);
    exportId = await startExport();
    const again = await fetch(`${base}/api/firm-export`, {
      method: "POST",
      headers: headers("u-admin", "admin"),
      body: "{}",
    });
    const body = (await again.json()) as { id: number; existing: boolean };
    expect(body.id).toBe(exportId);
    expect(body.existing).toBe(true);
  }, 60_000);

  test("the job builds a sealed archive under the admin's scope", async () => {
    const result = await runJob(exportId);
    archivePath = String(result.storage_path);
    expect(result.encrypted).toBe(true);
    expect(result.files).toBe(2);
    expect(result.complete).toBe(true);
    const raw = await createRawStorage({
      backend: "local",
      bucket: "brain-files",
      localPath: join(home, ".gbrain", "files"),
    });
    const head = (await raw.download(archivePath)).subarray(0, 8).toString("ascii");
    expect(head).toBe("SBXSENC1");

    const status = await fetch(`${base}/api/firm-export/${exportId}`, {
      headers: headers("u-admin", "admin"),
    });
    const view = (await status.json()) as { state: string; expires_at: string };
    expect(view.state).toBe("ready");
    const ttl = Date.parse(view.expires_at) - Date.now();
    expect(ttl).toBeGreaterThan(23 * 3600_000);
    expect(ttl).toBeLessThanOrEqual(24 * 3600_000);
  }, 120_000);

  test("another admin cannot download it", async () => {
    const res = await fetch(`${base}/api/firm-export/${exportId}/download`, {
      headers: headers("u-other-admin", "admin"),
    });
    expect(res.status).toBe(403);
  }, 60_000);

  test("the requester downloads it once: complete, originals byte-identical, walls kept", async () => {
    const res = await fetch(`${base}/api/firm-export/${exportId}/download`, {
      headers: headers("u-admin", "admin"),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
    for (const [path, data] of originals) {
      const f = zip.file(path);
      if (path.includes("geheim")) {
        expect(f).toBeNull();
        continue;
      }
      expect(Buffer.from(await f!.async("uint8array")).equals(data)).toBe(true);
    }
    expect(zip.file("pages/documents/klage.json")).not.toBeNull();
    expect(zip.file("pages/documents/geheim.json")).toBeNull();
    expect(zip.file("pages/cases/gesperrt.json")).toBeNull();
    const settings = await zip.file("pages/legal/settings/kanzlei.json")!.async("string");
    expect(settings).not.toContain("smtpPasswordEnc");
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as {
      complete: boolean;
      files: number;
    };
    expect(manifest.complete).toBe(true);
    expect(manifest.files).toBe(2);

    const second = await fetch(`${base}/api/firm-export/${exportId}/download`, {
      headers: headers("u-admin", "admin"),
    });
    expect(second.status).toBe(410);
    const raw = await createRawStorage({
      backend: "local",
      bucket: "brain-files",
      localPath: join(home, ".gbrain", "files"),
    });
    expect(await raw.exists(archivePath)).toBe(false);
  }, 120_000);

  test("an expired export answers 410 and the sweep deletes its archive", async () => {
    const id = await startExport();
    const result = await runJob(id);
    await engine.executeRaw(
      `UPDATE minion_jobs SET result = result || jsonb_build_object('expires_at', $2::text) WHERE id = $1`,
      [id, new Date(Date.now() - 1000).toISOString()]
    );
    const res = await fetch(`${base}/api/firm-export/${id}/download`, {
      headers: headers("u-admin", "admin"),
    });
    expect(res.status).toBe(410);
    const raw = await createRawStorage({
      backend: "local",
      bucket: "brain-files",
      localPath: join(home, ".gbrain", "files"),
    });
    expect(await raw.exists(String(result.storage_path))).toBe(true);
    const sweep = await sweepFirmExports(engine, raw);
    expect(sweep.deleted).toBeGreaterThanOrEqual(1);
    expect(await raw.exists(String(result.storage_path))).toBe(false);
    // Each finished export is announced once.
    expect(sweep.finished.map((f) => f.id)).toContain(id);
    expect((await sweepFirmExports(engine, raw)).finished).toEqual([]);
  }, 120_000);

  test("the sweep endpoint refuses calls that carry a user identity", async () => {
    const res = await fetch(`${base}/api/firm-export/sweep`, {
      method: "POST",
      headers: headers("u-admin", "admin"),
    });
    expect(res.status).toBe(403);
  }, 60_000);

  test("stored originals stay encrypted at rest", async () => {
    const raw = await createRawStorage({
      backend: "local",
      bucket: "brain-files",
      localPath: join(home, ".gbrain", "files"),
    });
    expect(isEncrypted(await raw.download("clean/t/documents/klage/klage.pdf"))).toBe(true);
  });
});
