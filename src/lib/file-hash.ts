/**
 * Client-side content hashing for end-to-end upload integrity.
 *
 * The presigned / multipart upload path sends bytes browser → storage directly,
 * so the server never sees them in transit. To prove the stored file equals what
 * the user selected (Dropbox-style guarantee), the client declares a SHA-256 that
 * the engine re-verifies against the stored object at confirm.
 *
 * Two modes:
 * - `computeFileSha256`: SubtleCrypto one-shot, limited to 256 MB (memory-bounded).
 * - `computeFileSha256Streaming`: hash-wasm incremental, reads in 8 MB chunks,
 *   no size limit. Used for multipart uploads (>100 MB) where chunks are already
 *   in flight — the same slice can be fed to the hasher without extra reads.
 */

import { createSHA256 } from "hash-wasm";

export const DEFAULT_HASH_MAX_BYTES = 256 * 1024 * 1024; // 256 MB

/**
 * Compute the hex SHA-256 of a file, or null if it exceeds `maxBytes` or the
 * platform lacks SubtleCrypto (e.g. non-secure context). Never throws — hashing
 * is an integrity enhancement, not a hard dependency of the upload.
 */
export async function computeFileSha256(
  file: Blob,
  maxBytes: number = DEFAULT_HASH_MAX_BYTES
): Promise<string | null> {
  if (file.size > maxBytes) return null;
  const subtle =
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    "subtle" in globalThis.crypto &&
    globalThis.crypto.subtle;
  if (!subtle) return null;
  try {
    const buf = await file.arrayBuffer();
    const digest = await subtle.digest("SHA-256", buf);
    return bytesToHex(new Uint8Array(digest));
  } catch {
    return null;
  }
}

/**
 * Streaming SHA-256 hasher using hash-wasm. Reads the file in 8 MB chunks via
 * file.slice() — never materializes the full file in RAM. Works for any file size.
 * Used for files > 256 MB where SubtleCrypto would buffer the entire file.
 */
export async function computeFileSha256Streaming(
  file: Blob,
  chunkSize: number = 8 * 1024 * 1024
): Promise<string | null> {
  try {
    const hasher = await createSHA256();
    hasher.init();
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, file.size);
      const chunk = file.slice(offset, end);
      const buf = new Uint8Array(await chunk.arrayBuffer());
      hasher.update(buf);
    }
    return hasher.digest("hex");
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}
