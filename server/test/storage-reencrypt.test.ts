/**
 * Re-encryption of originals stored before the at-rest key was set: dry run
 * by default, idempotent, resumable, verified by decryption before any
 * plaintext is replaced, and never leaves an object half-done.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { LocalStorage } from "../src/core/storage/local.ts";
import {
  decryptFile,
  isEncrypted,
  loadKeyring,
  type Keyring,
} from "../src/core/file-encryption.ts";
import { EncryptedStorage } from "../src/core/storage/encrypted.ts";
import {
  REENCRYPT_CURSOR_KEY,
  readReencryptStatus,
  reencryptObject,
  reencryptStoredFiles,
} from "../src/core/storage-reencrypt.ts";
import type { StorageBackend } from "../src/core/storage.ts";

let engine: PGLiteEngine;
let dir = "";
let backend: LocalStorage;
const keyring = loadKeyring({
  SUBSUMIO_STORAGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
}) as Keyring;
const originals = new Map<string, Buffer>();

async function addFile(sourceId: string, path: string, data: Buffer) {
  await backend.upload(path, data);
  originals.set(path, data);
  await engine.executeRaw(
    `INSERT INTO files (source_id, page_slug, filename, storage_path, mime_type, size_bytes, content_hash)
     VALUES ($1, $2, $3, $4, 'application/pdf', $5, $6)`,
    [sourceId, `documents/${path}`, `${path}.pdf`, path, data.byteLength, "h"]
  );
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await engine.executeRaw(`INSERT INTO sources (id, name) VALUES ('firm-a', 'a'), ('firm-b', 'b')
                           ON CONFLICT DO NOTHING`);
  dir = mkdtempSync(join(tmpdir(), "reenc-"));
  backend = new LocalStorage(dir);
  for (let i = 0; i < 5; i++) {
    await addFile(i < 3 ? "firm-a" : "firm-b", `clean/t/doc-${i}`, randomBytes(2048 + i));
  }
  // One object that is already encrypted, one row whose object is gone.
  const pre = new EncryptedStorage(backend, keyring);
  const already = randomBytes(900);
  await pre.upload("clean/t/already", already);
  originals.set("clean/t/already", already);
  await engine.executeRaw(
    `INSERT INTO files (source_id, page_slug, filename, storage_path, size_bytes, content_hash)
     VALUES ('firm-a', 'documents/already', 'a.pdf', 'clean/t/already', 900, 'h'),
            ('firm-a', 'documents/gone', 'g.pdf', 'clean/t/gone', 1, 'h')`
  );
}, 120_000);

afterAll(async () => {
  await engine?.disconnect();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("storage re-encryption", () => {
  test("dry run counts plaintext and writes nothing", async () => {
    const before = readFileSync(join(dir, "clean/t/doc-0"));
    const r = await reencryptStoredFiles({ engine, backend, keyring });
    expect(r.dryRun).toBe(true);
    expect(r.total).toBe(7);
    expect(r.plaintext).toBe(5);
    expect(r.alreadyEncrypted).toBe(1);
    expect(r.missing).toBe(1);
    expect(r.reencrypted).toBe(0);
    expect(r.complete).toBe(true);
    expect(readFileSync(join(dir, "clean/t/doc-0")).equals(before)).toBe(true);
    const status = await readReencryptStatus(engine);
    expect(status?.plaintext).toBe(5);
    expect(status?.total).toBe(7);
  }, 60_000);

  test("a limited run stops and the next run resumes after it", async () => {
    const first = await reencryptStoredFiles({ engine, backend, keyring, apply: true, limit: 2 });
    expect(first.scanned).toBe(2);
    expect(first.reencrypted).toBe(2);
    expect(first.complete).toBe(false);
    expect(Number(await engine.getConfig(REENCRYPT_CURSOR_KEY))).toBeGreaterThan(0);

    // A write-once (read-only) original is handled too.
    chmodSync(join(dir, "clean/t/doc-3"), 0o444);

    const rest = await reencryptStoredFiles({ engine, backend, keyring, apply: true });
    expect(rest.scanned).toBe(5);
    expect(rest.reencrypted).toBe(3);
    expect(rest.alreadyEncrypted).toBe(1);
    expect(rest.failed).toEqual([]);
    expect(rest.complete).toBe(true);

    for (const [path, data] of originals) {
      const stored = await backend.download(path);
      expect(isEncrypted(stored)).toBe(true);
      expect(decryptFile(stored, keyring).equals(data)).toBe(true);
    }
    // No side copies left behind.
    expect((await backend.list("clean")).filter((p) => p.endsWith(".reenc-verify"))).toEqual([]);
  }, 60_000);

  test("a repeated run is a no-op and the status shows no plaintext", async () => {
    const r = await reencryptStoredFiles({ engine, backend, keyring, apply: true });
    expect(r.reencrypted).toBe(0);
    expect(r.alreadyEncrypted).toBe(6);
    const dry = await reencryptStoredFiles({ engine, backend, keyring });
    expect(dry.plaintext).toBe(0);
    expect((await readReencryptStatus(engine))?.plaintext).toBe(0);
  }, 60_000);

  test("the plaintext stays when the written envelope does not verify", async () => {
    const data = randomBytes(512);
    const writes: string[] = [];
    // A backend that corrupts every write: nothing may replace the original.
    const corrupting: StorageBackend = {
      ...backend,
      upload: async (path: string, buf: Buffer) => {
        writes.push(path);
        const bad = Buffer.from(buf);
        bad[bad.length - 1] ^= 0xff;
        await backend.upload(path, bad);
      },
      download: (p: string) => backend.download(p),
      delete: (p: string) => backend.delete(p),
      exists: (p: string) => backend.exists(p),
      list: (p: string) => backend.list(p),
      getUrl: (p: string) => backend.getUrl(p),
    };
    await backend.upload("clean/t/fragile", data);
    await expect(reencryptObject(corrupting, keyring, "clean/t/fragile", data)).rejects.toThrow(
      /side copy does not verify/
    );
    expect(writes).toEqual(["clean/t/fragile.reenc-verify"]);
    expect((await backend.download("clean/t/fragile")).equals(data)).toBe(true);
    expect(await backend.exists("clean/t/fragile.reenc-verify")).toBe(false);
  }, 60_000);

  test("the original is restored when the replaced object does not verify", async () => {
    const data = randomBytes(700);
    await backend.upload("clean/t/restore", data);
    let n = 0;
    const flaky: StorageBackend = {
      upload: async (path: string, buf: Buffer) => {
        n++;
        // Second write (the replacement) is corrupted; the side copy and the
        // restore are written correctly.
        if (n === 2) {
          const bad = Buffer.from(buf);
          bad[bad.length - 1] ^= 0xff;
          return backend.upload(path, bad);
        }
        return backend.upload(path, buf);
      },
      download: (p: string) => backend.download(p),
      delete: (p: string) => backend.delete(p),
      exists: (p: string) => backend.exists(p),
      list: (p: string) => backend.list(p),
      getUrl: (p: string) => backend.getUrl(p),
    };
    await expect(reencryptObject(flaky, keyring, "clean/t/restore", data)).rejects.toThrow(
      /plaintext restored/
    );
    expect((await backend.download("clean/t/restore")).equals(data)).toBe(true);
  }, 60_000);

  test("a source-scoped run touches only that source", async () => {
    await addFile("firm-b", "clean/t/b-late", randomBytes(300));
    await addFile("firm-a", "clean/t/a-late", randomBytes(300));
    const r = await reencryptStoredFiles({
      engine,
      backend,
      keyring,
      apply: true,
      sourceId: "firm-b",
      restart: true,
    });
    expect(r.reencrypted).toBe(1);
    expect(isEncrypted(await backend.download("clean/t/b-late"))).toBe(true);
    expect(isEncrypted(await backend.download("clean/t/a-late"))).toBe(false);
  }, 60_000);
});
