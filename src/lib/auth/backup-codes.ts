/**
 * 2FA Backup/Recovery Codes.
 *
 * Generates single-use recovery codes that can be used instead of a TOTP code
 * when the user loses access to their authenticator device. Codes are stored
 * as SHA-256 hashes — the plaintext is shown only once at generation time.
 *
 * Format: XXXX-XXXX-XXXX (12 alphanumeric chars, 4 groups of 4, no ambiguous chars)
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
const CODE_COUNT = 10;

function randomChar(): string {
  return ALPHABET[crypto.getRandomValues(new Uint8Array(1))[0] % ALPHABET.length];
}

/** Generate a single backup code in the format XXXX-XXXX-XXXX. */
function generateCode(): string {
  const chars = Array.from({ length: 12 }, randomChar);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

/** Generate N backup codes and return them as plaintext strings. */
export function generateBackupCodes(count: number = CODE_COUNT): string[] {
  return Array.from({ length: count }, generateCode);
}

/** Hash a backup code with SHA-256 for storage. */
export async function hashBackupCode(code: string): Promise<string> {
  const normalized = code.trim().toUpperCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hash all backup codes for storage. Returns array of hashes in same order. */
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map(hashBackupCode));
}

/**
 * Verify a backup code against the stored hashes.
 * Returns the index of the matching code (so it can be consumed), or -1 if no match.
 * Normalizes input (trims, uppercases) before comparison.
 */
export async function verifyBackupCode(
  input: string,
  storedHashes: string[],
): Promise<number> {
  const hash = await hashBackupCode(input);
  return storedHashes.indexOf(hash);
}
