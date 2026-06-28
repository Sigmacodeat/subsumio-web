import { describe, test, expect } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  loadKeyring,
  encryptFile,
  decryptFile,
  isEncrypted,
  type Keyring,
} from "../src/core/file-encryption.ts";
import { EncryptedStorage } from "../src/core/storage/encrypted.ts";
import type { StorageBackend } from "../src/core/storage.ts";

function key(): string {
  return randomBytes(32).toString("base64");
}
function ring(activeKeyId = "k1", extra?: Record<string, string>): Keyring {
  return loadKeyring({
    SUBSUMIO_STORAGE_ENCRYPTION_KEY: key(),
    SUBSUMIO_STORAGE_ENCRYPTION_KEY_ID: activeKeyId,
    ...extra,
  })!;
}

describe("file-encryption", () => {
  test("round-trips arbitrary bytes", () => {
    const kr = ring();
    for (const size of [0, 1, 16, 1024, 100_000]) {
      const data = randomBytes(size);
      const enc = encryptFile(data, kr);
      expect(isEncrypted(enc)).toBe(true);
      expect(enc.equals(data)).toBe(false); // actually encrypted
      const dec = decryptFile(enc, kr);
      expect(dec.equals(data)).toBe(true);
    }
  });

  test("ciphertext differs each call (random DEK/nonce)", () => {
    const kr = ring();
    const data = Buffer.from("Mandanten-Schriftsatz");
    const a = encryptFile(data, kr);
    const b = encryptFile(data, kr);
    expect(a.equals(b)).toBe(false);
    expect(decryptFile(a, kr).equals(data)).toBe(true);
    expect(decryptFile(b, kr).equals(data)).toBe(true);
  });

  test("legacy plaintext passes through decrypt unchanged", () => {
    const kr = ring();
    const plain = Buffer.from("a pre-encryption file");
    expect(isEncrypted(plain)).toBe(false);
    expect(decryptFile(plain, kr).equals(plain)).toBe(true);
  });

  test("key rotation: old files decrypt via retired key, new files use active", () => {
    const oldKey = key();
    const krOld = loadKeyring({
      SUBSUMIO_STORAGE_ENCRYPTION_KEY: oldKey,
      SUBSUMIO_STORAGE_ENCRYPTION_KEY_ID: "k1",
    })!;
    const data = Buffer.from("akten/2024-vertrag.pdf bytes");
    const encOld = encryptFile(data, krOld);

    // Rotate: k2 active, k1 retired.
    const krNew = loadKeyring({
      SUBSUMIO_STORAGE_ENCRYPTION_KEY: key(),
      SUBSUMIO_STORAGE_ENCRYPTION_KEY_ID: "k2",
      SUBSUMIO_STORAGE_ENCRYPTION_RETIRED_KEYS: JSON.stringify({ k1: oldKey }),
    })!;
    // Old file still decrypts.
    expect(decryptFile(encOld, krNew).equals(data)).toBe(true);
    // New file is written under k2 and decrypts.
    const encNew = encryptFile(data, krNew);
    expect(decryptFile(encNew, krNew).equals(data)).toBe(true);
  });

  test("missing key for a file's key-id throws (not silent)", () => {
    const oldKey = key();
    const krOld = loadKeyring({
      SUBSUMIO_STORAGE_ENCRYPTION_KEY: oldKey,
      SUBSUMIO_STORAGE_ENCRYPTION_KEY_ID: "k1",
    })!;
    const enc = encryptFile(Buffer.from("x"), krOld);
    const krWithout = ring("k9"); // k1 not present
    expect(() => decryptFile(enc, krWithout)).toThrow(/key 'k1' not in keyring/);
  });

  test("tampering is detected (GCM auth tag)", () => {
    const kr = ring();
    const enc = encryptFile(randomBytes(2048), kr);
    enc[enc.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decryptFile(enc, kr)).toThrow();
  });

  test("loadKeyring returns null when unset, throws on wrong key length", () => {
    expect(loadKeyring({})).toBeNull();
    expect(() =>
      loadKeyring({ SUBSUMIO_STORAGE_ENCRYPTION_KEY: Buffer.from("too-short").toString("base64") })
    ).toThrow(/must be 32 bytes/);
  });
});

describe("EncryptedStorage decorator", () => {
  function memBackend(): { backend: StorageBackend; store: Map<string, Buffer> } {
    const store = new Map<string, Buffer>();
    const backend: StorageBackend = {
      upload: async (p, d) => void store.set(p, d),
      download: async (p) => store.get(p) ?? Buffer.alloc(0),
      delete: async (p) => void store.delete(p),
      exists: async (p) => store.has(p),
      list: async (prefix) => [...store.keys()].filter((k) => k.startsWith(prefix)),
      getUrl: async (p) => `mem://${p}`,
      createPresignedUpload: async () => null,
    };
    return { backend, store };
  }

  test("stores ciphertext on disk, returns plaintext on read", async () => {
    const { backend, store } = memBackend();
    const enc = new EncryptedStorage(backend, ring());
    const data = Buffer.from("privileged document body");
    await enc.upload("clean/t1/doc.pdf", data);

    const atRest = store.get("clean/t1/doc.pdf")!;
    expect(isEncrypted(atRest)).toBe(true); // on disk = ciphertext
    expect(atRest.equals(data)).toBe(false);

    const read = await enc.download("clean/t1/doc.pdf");
    expect(read.equals(data)).toBe(true); // caller sees plaintext
  });

  test("disables presigned uploads (would bypass encryption)", async () => {
    const { backend } = memBackend();
    const enc = new EncryptedStorage(backend, ring());
    expect(await enc.createPresignedUpload()).toBeNull();
  });
});
