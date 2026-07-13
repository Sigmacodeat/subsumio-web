/**
 * T7.3 / WP7.3.1 — Encryption Key Rotation
 *
 * Provides re-encryption of all `sbenc:` values when the encryption key changes.
 * This is critical for compliance (key rotation policies) and security incidents.
 *
 * Flow:
 *   1. Decrypt all encrypted values with the old key
 *   2. Re-encrypt with the new key
 *   3. Update the environment variable
 *   4. Verify all values decrypt correctly with the new key
 *
 * The actual key swap is done at the infrastructure level (env var update +
 * restart). This module provides the re-encryption logic and verification.
 */

export interface KeyRotationResult {
  totalFields: number;
  rotated: number;
  skipped: number;
  errors: Array<{ field: string; error: string }>;
  verified: boolean;
}

export interface EncryptableField {
  table: string;
  column: string;
  idColumn: string;
  idValue: string | number;
  currentValue: string;
}

/**
 * Re-encrypt a single value from old key to new key.
 * Returns the new ciphertext or null if the value is not encrypted.
 */
export async function reEncryptValue(
  oldValue: string,
  oldKey: string,
  newKey: string
): Promise<string | null> {
  if (!oldValue) return null;
  if (!oldValue.startsWith("sbenc:")) {
    // Not encrypted (sbplain: or legacy) — encrypt with new key
    if (oldValue.startsWith("sbplain:")) {
      return await encryptWithKey(oldValue.slice(8), newKey);
    }
    // Legacy unencrypted — encrypt now
    return await encryptWithKey(oldValue, newKey);
  }

  // Decrypt with old key
  const plaintext = await decryptWithKey(oldValue, oldKey);
  if (plaintext === null) {
    throw new Error(`Failed to decrypt value with old key (possibly corrupted or wrong key)`);
  }

  // Re-encrypt with new key
  return await encryptWithKey(plaintext, newKey);
}

/**
 * Re-encrypt all fields in a batch.
 * Callers provide the list of encryptable fields (typically from a DB query).
 */
export async function rotateEncryptionKey(
  fields: EncryptableField[],
  oldKey: string,
  newKey: string
): Promise<KeyRotationResult> {
  const result: KeyRotationResult = {
    totalFields: fields.length,
    rotated: 0,
    skipped: 0,
    errors: [],
    verified: false,
  };

  for (const field of fields) {
    try {
      if (!field.currentValue) {
        result.skipped++;
        continue;
      }

      const newValue = await reEncryptValue(field.currentValue, oldKey, newKey);
      if (newValue === null) {
        result.skipped++;
        continue;
      }

      // Verify: decrypt with new key should give same plaintext
      const verified = await decryptWithKey(newValue, newKey);
      const originalPlaintext = await decryptWithKey(field.currentValue, oldKey);
      if (verified !== originalPlaintext) {
        result.errors.push({
          field: `${field.table}.${field.column}[${field.idValue}]`,
          error: "Verification failed: decrypted value mismatch after rotation",
        });
        continue;
      }

      result.rotated++;
    } catch (err) {
      result.errors.push({
        field: `${field.table}.${field.column}[${field.idValue}]`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  result.verified = result.errors.length === 0;
  return result;
}

// ── Key-specific encrypt/decrypt (bypasses module-level key) ─────────

async function getKeyBytes(key: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(key);
  const out = new Uint8Array(32);
  out.set(bytes.slice(0, 32));
  if (bytes.length < 32) {
    out.fill(0, bytes.length);
  }
  return out;
}

async function encryptWithKey(plaintext: string, key: string): Promise<string> {
  const keyBytes = await getKeyBytes(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    Buffer.from(keyBytes) as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: Buffer.from(iv) as unknown as ArrayBuffer },
    cryptoKey,
    encoder.encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + (ciphertext as ArrayBuffer).byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  const bin = Array.from(combined, (b) => String.fromCharCode(b)).join("");
  return `sbenc:${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

async function decryptWithKey(ciphertext: string, key: string): Promise<string | null> {
  if (!ciphertext || !ciphertext.startsWith("sbenc:")) {
    if (ciphertext?.startsWith("sbplain:")) return ciphertext.slice(8);
    return ciphertext ?? null;
  }
  const payload = ciphertext.slice(6);
  try {
    const b64 =
      payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (payload.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);

    const keyBytes = await getKeyBytes(key);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      Buffer.from(keyBytes) as unknown as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(iv) as unknown as ArrayBuffer },
      cryptoKey,
      Buffer.from(data) as unknown as ArrayBuffer
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/**
 * Generate a new 256-bit encryption key (base64-encoded, 44 chars).
 * Use this to create a new key for rotation.
 */
export function generateEncryptionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Validate that a key can decrypt existing encrypted values.
 * Returns true if all values decrypt successfully.
 */
export async function verifyKeyCanDecrypt(
  encryptedValues: string[],
  key: string
): Promise<{ valid: boolean; failures: string[] }> {
  const failures: string[] = [];
  for (const value of encryptedValues) {
    if (!value.startsWith("sbenc:")) continue;
    const decrypted = await decryptWithKey(value, key);
    if (decrypted === null) {
      failures.push(value.slice(0, 20) + "...");
    }
  }
  return { valid: failures.length === 0, failures };
}
