/**
 * Envelope encryption for original files at rest.
 *
 * Privileged client documents must not sit as plaintext on the engine-data
 * volume (DSGVO Art. 32, § 43e BRAO). This module encrypts each file with a
 * fresh random data-encryption-key (DEK, AES-256-GCM), then wraps that DEK with
 * a long-lived key-encryption-key (KEK) from the environment. Only the wrapped
 * DEK travels with the ciphertext — the KEK never touches disk.
 *
 * Key rotation: the header carries the KEK's key-id, so files encrypted under an
 * old key still decrypt as long as that key stays in the keyring (as a "retired"
 * key). New files always use the active key. Re-encrypting old files under the
 * new key is an optional background task — not required for correctness.
 *
 * Backward compatibility: `decryptFile` returns non-magic input unchanged, so
 * files written before encryption was enabled keep working. Enabling encryption
 * is therefore safe and non-destructive; only newly-written files are encrypted.
 *
 * Fail-closed: a misconfigured key (wrong length) throws at load time rather
 * than silently storing plaintext or corrupting data.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("SBXFENC1", "ascii"); // 8 bytes — file format marker
const VERSION = 1;
const ALG = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const NONCE_BYTES = 12; // GCM standard
const TAG_BYTES = 16; // GCM auth tag

export interface Keyring {
  activeKeyId: string;
  keys: Map<string, Buffer>; // key-id → 32-byte raw key (active + retired)
}

/** True when the buffer starts with the Subsumio encrypted-file magic. */
export function isEncrypted(buf: Buffer): boolean {
  return buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

function decodeKey(b64: string, id: string): Buffer {
  const k = Buffer.from(b64, "base64");
  if (k.length !== KEY_BYTES) {
    throw new Error(
      `storage encryption key '${id}' must be ${KEY_BYTES} bytes base64-encoded (got ${k.length}). ` +
        `Generate one with: openssl rand -base64 32`
    );
  }
  return k;
}

/**
 * Build the keyring from the environment, or return null when at-rest
 * encryption is not configured (callers then store plaintext, as before).
 *
 *   SUBSUMIO_STORAGE_ENCRYPTION_KEY           base64 32-byte active KEK (required to enable)
 *   SUBSUMIO_STORAGE_ENCRYPTION_KEY_ID        active key id (default "k1")
 *   SUBSUMIO_STORAGE_ENCRYPTION_RETIRED_KEYS  JSON {"<id>":"<base64 key>", ...} for rotation
 */
export function loadKeyring(env: Record<string, string | undefined> = process.env): Keyring | null {
  const active = env.SUBSUMIO_STORAGE_ENCRYPTION_KEY?.trim();
  if (!active) return null;
  const activeKeyId = env.SUBSUMIO_STORAGE_ENCRYPTION_KEY_ID?.trim() || "k1";
  const keys = new Map<string, Buffer>();
  keys.set(activeKeyId, decodeKey(active, activeKeyId));

  const retired = env.SUBSUMIO_STORAGE_ENCRYPTION_RETIRED_KEYS?.trim();
  if (retired) {
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(retired) as Record<string, string>;
    } catch {
      throw new Error("SUBSUMIO_STORAGE_ENCRYPTION_RETIRED_KEYS must be valid JSON {id:base64key}");
    }
    for (const [id, b64] of Object.entries(parsed)) {
      if (!keys.has(id)) keys.set(id, decodeKey(b64, id));
    }
  }
  return { activeKeyId, keys };
}

/** Encrypt a file with the keyring's active key. Output = header || ciphertext. */
export function encryptFile(plaintext: Buffer, keyring: Keyring): Buffer {
  const kek = keyring.keys.get(keyring.activeKeyId);
  if (!kek)
    throw new Error(`encryptFile: active key '${keyring.activeKeyId}' missing from keyring`);

  // 1. Encrypt the data with a fresh DEK.
  const dek = randomBytes(KEY_BYTES);
  const dataNonce = randomBytes(NONCE_BYTES);
  const dc = createCipheriv(ALG, dek, dataNonce);
  const ciphertext = Buffer.concat([dc.update(plaintext), dc.final()]);
  const dataTag = dc.getAuthTag();

  // 2. Wrap the DEK with the KEK.
  const dekNonce = randomBytes(NONCE_BYTES);
  const kc = createCipheriv(ALG, kek, dekNonce);
  const wrappedDek = Buffer.concat([kc.update(dek), kc.final(), kc.getAuthTag()]); // 32 + 16

  // 3. Assemble: MAGIC|ver|keyIdLen|keyId|dekNonce|wrappedLen|wrappedDek|dataNonce|dataTag|ct
  const keyId = Buffer.from(keyring.activeKeyId, "utf8");
  const header = Buffer.concat([
    MAGIC,
    Buffer.from([VERSION, keyId.length]),
    keyId,
    dekNonce,
    Buffer.from([wrappedDek.length]),
    wrappedDek,
    dataNonce,
    dataTag,
  ]);
  return Buffer.concat([header, ciphertext]);
}

/** Decrypt a Subsumio-encrypted file. Non-encrypted (legacy) input is returned as-is. */
export function decryptFile(buf: Buffer, keyring: Keyring): Buffer {
  if (!isEncrypted(buf)) return buf; // legacy plaintext — passthrough

  let off = MAGIC.length;
  const version = buf[off];
  off += 1;
  if (version !== VERSION) throw new Error(`decryptFile: unsupported format version ${version}`);

  const keyIdLen = buf[off];
  off += 1;
  const keyId = buf.subarray(off, off + keyIdLen).toString("utf8");
  off += keyIdLen;

  const dekNonce = buf.subarray(off, off + NONCE_BYTES);
  off += NONCE_BYTES;

  const wrappedLen = buf[off];
  off += 1;
  const wrappedDek = buf.subarray(off, off + wrappedLen);
  off += wrappedLen;

  const dataNonce = buf.subarray(off, off + NONCE_BYTES);
  off += NONCE_BYTES;
  const dataTag = buf.subarray(off, off + TAG_BYTES);
  off += TAG_BYTES;
  const ciphertext = buf.subarray(off);

  const kek = keyring.keys.get(keyId);
  if (!kek) {
    throw new Error(
      `decryptFile: key '${keyId}' not in keyring — a rotated/retired key is missing. ` +
        `Add it to SUBSUMIO_STORAGE_ENCRYPTION_RETIRED_KEYS to decrypt older files.`
    );
  }

  // Unwrap the DEK (GCM auth-tag verifies KEK + integrity).
  const wrappedCt = wrappedDek.subarray(0, wrappedDek.length - TAG_BYTES);
  const wrappedTag = wrappedDek.subarray(wrappedDek.length - TAG_BYTES);
  const kd = createDecipheriv(ALG, kek, dekNonce);
  kd.setAuthTag(wrappedTag);
  const dek = Buffer.concat([kd.update(wrappedCt), kd.final()]);

  // Decrypt the data (GCM auth-tag verifies integrity → tamper-evident).
  const dd = createDecipheriv(ALG, dek, dataNonce);
  dd.setAuthTag(dataTag);
  return Buffer.concat([dd.update(ciphertext), dd.final()]);
}
