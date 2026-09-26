import { createHash } from "node:crypto";

/**
 * Binds a signature to the exact text that was signed: SHA-256 over the
 * document body as stored (UTF-8, unmodified). The portal shows the client
 * this hash's text; the signature records it; a later edit of the signed
 * document is refused by the write guards.
 */
export const SIGNED_DOCUMENT_HASH_ALGORITHM = "sha256";

export function signedDocumentHash(content: string | null | undefined): string {
  return createHash("sha256")
    .update(content ?? "", "utf8")
    .digest("hex");
}

export function isDocumentHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
