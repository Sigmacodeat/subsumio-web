/**
 * Symmetric encryption for sensitive fields at rest (API keys, tokens).
 * Uses AES-256-GCM via Web Crypto API (Edge + Node compatible).
 *
 * Encryption key MUST be set via SIGMABRAIN_ENCRYPTION_KEY in production.
 * Without it, values are stored as-is (dev convenience, not for prod).
 */

import { EncryptionError } from "@/lib/errors";
import { env } from "@/lib/env";

const ENCRYPTION_KEY = env("SIGMABRAIN_ENCRYPTION_KEY");

export function isEncryptionEnabled(): boolean {
  if (process.env.NODE_ENV === "production" && !ENCRYPTION_KEY) {
    throw new EncryptionError("SIGMABRAIN_ENCRYPTION_KEY must be set in production for at-rest encryption.", {
      code: "ENCRYPTION_KEY_MISSING",
    });
  }
  return !!ENCRYPTION_KEY;
}

function getKeyBytes(): Uint8Array {
  const key = ENCRYPTION_KEY || "subsumio-dev-encryption-key-32chars!";
  const encoder = new TextEncoder();
  const bytes = encoder.encode(key);
  // Ensure exactly 32 bytes for AES-256
  const out = new Uint8Array(32);
  out.set(bytes.slice(0, 32));
  if (bytes.length < 32) {
    // Pad with zero bytes if key is shorter
    out.fill(0, bytes.length);
  }
  return out;
}

function getKeyArrayBuffer(): ArrayBuffer {
  const bytes = getKeyBytes();
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  return buf;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getKeyArrayBuffer(),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encrypt a plaintext string. Returns "sbenc:<base64>" marker format. */
export async function encrypt(plaintext: string | null | undefined): Promise<string | null> {
  if (!plaintext) return null;
  if (!ENCRYPTION_KEY) {
    // Dev mode: store with a marker so we can tell it's not encrypted
    return `sbplain:${plaintext}`;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + (ciphertext as ArrayBuffer).byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  // base64url encode
  const bin = Array.from(combined, (b) => String.fromCharCode(b)).join("");
  return `sbenc:${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/** Decrypt a string encrypted with encrypt(). Pass-through for null/undefined. */
export async function decrypt(ciphertext: string | null | undefined): Promise<string | null> {
  if (!ciphertext) return null;
  if (!ENCRYPTION_KEY) {
    // Dev mode: strip marker or return as-is
    if (ciphertext.startsWith("sbplain:")) return ciphertext.slice(8);
    return ciphertext;
  }
  if (!ciphertext.startsWith("sbenc:")) {
    // Legacy unencrypted value
    return ciphertext;
  }
  const payload = ciphertext.slice(6);
  try {
    // base64url decode
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (payload.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);

    const key = await importKey();
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return decoder.decode(decrypted);
  } catch {
    return null; // corrupted or wrong key
  }
}

/** Encrypt an object's sensitive fields in-place. */
export async function encryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
): Promise<T> {
  const result = { ...obj };
  for (const field of fields) {
    const val = result[field];
    if (typeof val === "string") {
      (result as Record<string, unknown>)[field as string] = await encrypt(val);
    }
  }
  return result;
}

/** Decrypt an object's sensitive fields in-place. */
export async function decryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
): Promise<T> {
  const result = { ...obj };
  for (const field of fields) {
    const val = result[field];
    if (typeof val === "string") {
      (result as Record<string, unknown>)[field as string] = await decrypt(val);
    }
  }
  return result;
}
