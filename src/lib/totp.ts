/**
 * TOTP (Time-based One-Time Password) für 2FA.
 * Nutzt WebCrypto API — keine externe Abhängigkeit.
 *
 * RFC 6238 / RFC 4226 kompatibel.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // Base32

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str: string): Uint8Array {
  const map = new Map(ALPHABET.split("").map((c, i) => [c, i]));
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of str.toUpperCase()) {
    const idx = map.get(c);
    if (idx === undefined) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** Generiert ein zufälliges Base32-Secret. */
export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

/** Erzeugt einen TOTP-Code aus einem Secret. */
export async function generateTOTP(secret: string, opts?: { time?: number; step?: number; digits?: number }): Promise<string> {
  const step = opts?.step ?? 30;
  const time = Math.floor((opts?.time ?? Date.now() / 1000) / step);
  const digits = opts?.digits ?? 6;

  const decoded = base32Decode(secret);
  const keyBytes = new Uint8Array(decoded);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const counter = new Uint8Array(8);
  let temp = time;
  for (let i = 7; i >= 0; i--) {
    counter[i] = temp & 0xff;
    temp >>= 8;
  }

  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = sig[sig.length - 1] & 0x0f;
  const code =
    ((sig[offset] & 0x7f) << 24 |
      (sig[offset + 1] & 0xff) << 16 |
      (sig[offset + 2] & 0xff) << 8 |
      (sig[offset + 3] & 0xff)) %
    Math.pow(10, digits);
  return code.toString().padStart(digits, "0");
}

/** Prüft einen TOTP-Code gegen ein Secret (mit ±1 Step-Toleranz). */
export async function verifyTOTP(token: string, secret: string): Promise<boolean> {
  const now = Date.now() / 1000;
  for (const offset of [-1, 0, 1]) {
    const expected = await generateTOTP(secret, { time: now + offset * 30 });
    if (expected === token) return true;
  }
  return false;
}

/** OTP-Auth-URL für QR-Code (otpauth://). */
export function otpAuthURL(secret: string, label: string, issuer = "SigmaBrain"): string {
  const params = new URLSearchParams({ secret, issuer });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}
