/**
 * Chunked envelope encryption for large objects that must never be held in
 * memory as a whole (the firm export archive). Same key hierarchy as
 * file-encryption.ts — a fresh AES-256-GCM data key per object, wrapped with
 * the keyring's active key — but the data is sealed in 1 MiB chunks, each
 * with its own nonce and tag, so it can be written and read as a stream.
 *
 * Layout: MAGIC | ver | keyIdLen | keyId | dekNonce | wrappedLen | wrappedDek
 *         | baseNonce | { u32 plainLen | ciphertext | tag }*
 *
 * Every chunk authenticates its index and whether it is the last one (AAD),
 * so reordering, dropping or truncating chunks fails decryption.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";
import type { Keyring } from "./file-encryption.ts";

const MAGIC = Buffer.from("SBXSENC1", "ascii");
const VERSION = 1;
const ALG = "aes-256-gcm";
const NONCE = 12;
const TAG = 16;
export const STREAM_CHUNK_BYTES = 1024 * 1024;

function chunkNonce(base: Buffer, index: number): Buffer {
  const n = Buffer.from(base);
  const tail = n.readUInt32BE(NONCE - 4) ^ (index >>> 0);
  n.writeUInt32BE(tail >>> 0, NONCE - 4);
  return n;
}

function chunkAad(index: number, last: boolean): Buffer {
  const a = Buffer.alloc(9);
  a.writeBigUInt64BE(BigInt(index));
  a[8] = last ? 1 : 0;
  return a;
}

/** True when the buffer starts with the stream-envelope magic. */
export function isStreamEncrypted(head: Buffer): boolean {
  return head.length >= MAGIC.length && head.subarray(0, MAGIC.length).equals(MAGIC);
}

/** Transform: plaintext in, stream envelope out. */
export function createEncryptStream(keyring: Keyring): Transform {
  const kek = keyring.keys.get(keyring.activeKeyId);
  if (!kek) throw new Error(`stream encryption: active key '${keyring.activeKeyId}' missing`);
  const dek = randomBytes(32);
  const dekNonce = randomBytes(NONCE);
  const kc = createCipheriv(ALG, kek, dekNonce);
  const wrapped = Buffer.concat([kc.update(dek), kc.final(), kc.getAuthTag()]);
  const baseNonce = randomBytes(NONCE);
  const keyId = Buffer.from(keyring.activeKeyId, "utf8");
  const header = Buffer.concat([
    MAGIC,
    Buffer.from([VERSION, keyId.length]),
    keyId,
    dekNonce,
    Buffer.from([wrapped.length]),
    wrapped,
    baseNonce,
  ]);

  let pending: Buffer[] = [];
  let pendingLen = 0;
  let index = 0;
  let headerSent = false;

  const seal = (plain: Buffer, last: boolean): Buffer => {
    const c = createCipheriv(ALG, dek, chunkNonce(baseNonce, index));
    c.setAAD(chunkAad(index, last));
    const ct = Buffer.concat([c.update(plain), c.final()]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(plain.length);
    index++;
    return Buffer.concat([len, ct, c.getAuthTag()]);
  };

  return new Transform({
    transform(chunk: Buffer, _enc, cb: TransformCallback) {
      if (!headerSent) {
        this.push(header);
        headerSent = true;
      }
      pending.push(chunk);
      pendingLen += chunk.length;
      // Keep at least one byte back so the final chunk is always sealed as last.
      while (pendingLen > STREAM_CHUNK_BYTES) {
        const all = Buffer.concat(pending);
        this.push(seal(all.subarray(0, STREAM_CHUNK_BYTES), false));
        const rest = all.subarray(STREAM_CHUNK_BYTES);
        pending = [rest];
        pendingLen = rest.length;
      }
      cb();
    },
    flush(cb: TransformCallback) {
      if (!headerSent) this.push(header);
      this.push(seal(Buffer.concat(pending), true));
      pending = [];
      pendingLen = 0;
      cb();
    },
  });
}

/** Transform: stream envelope in, plaintext out. Fails on any tampering. */
export function createDecryptStream(keyring: Keyring): Transform {
  let buf: Buffer = Buffer.alloc(0);
  let dek: Buffer | null = null;
  let baseNonce: Buffer | null = null;
  let index = 0;
  let sawLast = false;

  const parseHeader = (): boolean => {
    if (buf.length < MAGIC.length + 2) return false;
    if (!isStreamEncrypted(buf)) throw new Error("stream decryption: not a stream envelope");
    let off = MAGIC.length;
    if (buf[off] !== VERSION) throw new Error(`stream decryption: unsupported version ${buf[off]}`);
    off += 1;
    const keyIdLen = buf[off]!;
    off += 1;
    if (buf.length < off + keyIdLen + NONCE + 1) return false;
    const keyId = buf.subarray(off, off + keyIdLen).toString("utf8");
    off += keyIdLen;
    const dekNonce = buf.subarray(off, off + NONCE);
    off += NONCE;
    const wrappedLen = buf[off]!;
    off += 1;
    if (buf.length < off + wrappedLen + NONCE) return false;
    const wrapped = buf.subarray(off, off + wrappedLen);
    off += wrappedLen;
    baseNonce = Buffer.from(buf.subarray(off, off + NONCE));
    off += NONCE;
    const kek = keyring.keys.get(keyId);
    if (!kek) throw new Error(`stream decryption: key '${keyId}' not in keyring`);
    const kd = createDecipheriv(ALG, kek, dekNonce);
    kd.setAuthTag(wrapped.subarray(wrapped.length - TAG));
    dek = Buffer.concat([kd.update(wrapped.subarray(0, wrapped.length - TAG)), kd.final()]);
    buf = buf.subarray(off);
    return true;
  };

  const open = (last: boolean): Buffer | null => {
    if (buf.length < 4) return null;
    const len = buf.readUInt32BE(0);
    const total = 4 + len + TAG;
    if (buf.length < total) return null;
    // Only the final chunk may be followed by nothing; decide "last" by
    // whether more bytes follow once the stream has ended.
    if (!last && buf.length === total) return null;
    const isLast = buf.length === total;
    const d = createDecipheriv(ALG, dek!, chunkNonce(baseNonce!, index));
    d.setAAD(chunkAad(index, isLast));
    d.setAuthTag(buf.subarray(4 + len, total));
    const plain = Buffer.concat([d.update(buf.subarray(4, 4 + len)), d.final()]);
    index++;
    if (isLast) sawLast = true;
    buf = buf.subarray(total);
    return plain;
  };

  return new Transform({
    transform(chunk: Buffer, _enc, cb: TransformCallback) {
      try {
        buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
        if (!dek && !parseHeader()) return cb();
        for (let p = open(false); p; p = open(false)) this.push(p);
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
    flush(cb: TransformCallback) {
      try {
        if (!dek && !parseHeader()) throw new Error("stream decryption: truncated header");
        for (let p = open(true); p; p = open(true)) this.push(p);
        if (!sawLast || buf.length > 0) throw new Error("stream decryption: truncated stream");
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
  });
}
