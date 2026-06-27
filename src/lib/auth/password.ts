// Password hashing with Node's built-in scrypt — no external dependencies.
// Server-only (Node runtime). Format: "s2:<salt-hex>:<hash-hex>"

import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt);
  return `s2:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "s2" || !saltHex || !hashHex) return false;
  const hash = await scryptAsync(password, Buffer.from(saltHex, "hex"));
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
