/**
 * Signed WhatsApp Flow tokens: the server mints the token when it sends a
 * Flow and binds it to the recipient's number, so a booking made through
 * the Flow knows who booked. The token round-trips through WhatsApp as
 * user-visible metadata — only the HMAC makes its content trustworthy.
 *
 * Format: `<kind>:v1.<base64url(json)>.<base64url(hmac)>`; the part before
 * the colon keeps the existing flow routing (`appointment:…`).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "./types";

export type FlowKind = "appointment" | "case_intake";

const TOKEN_TTL_MS = 14 * 86_400_000;

function secret(): string | null {
  return process.env.WHATSAPP_FLOW_TOKEN_SECRET || process.env.WHATSAPP_APP_SECRET || null;
}

function sign(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

/** Mints a signed token for `phone`; null when no signing secret is configured. */
export function createFlowToken(kind: FlowKind, phone: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(
    JSON.stringify({ p: normalizePhone(phone), e: now + TOKEN_TTL_MS })
  ).toString("base64url");
  return `${kind}:v1.${payload}.${sign(key, `${kind}.${payload}`)}`;
}

/** The recipient bound to a signed token, or null for unsigned/forged/expired tokens. */
export function verifyFlowToken(
  token: string | undefined,
  now = Date.now()
): { kind: FlowKind; phone: string } | null {
  const key = secret();
  if (!key || !token) return null;
  const m = /^(appointment|case_intake):v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return null;
  const [, kind, payload, sig] = m;
  const expected = Buffer.from(sign(key, `${kind}.${payload}`));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      p?: unknown;
      e?: unknown;
    };
    if (typeof data.p !== "string" || typeof data.e !== "number" || data.e < now) return null;
    return { kind: kind as FlowKind, phone: data.p };
  } catch {
    return null;
  }
}
