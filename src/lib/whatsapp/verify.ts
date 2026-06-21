import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhone, type WhatsAppSenderBinding } from "./types";

export function verifyWebhookChallenge(
  searchParams: URLSearchParams
): { ok: true; challenge: string } | { ok: false; status: number; error: string } {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expected) return { ok: false, status: 503, error: "whatsapp_verify_token_not_configured" };
  if (mode !== "subscribe" || token !== expected || !challenge) {
    return { ok: false, status: 403, error: "verification_failed" };
  }
  return { ok: true, challenge };
}

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // Fail closed by default. Local development can opt into the bypass
    // explicitly via WHATSAPP_SKIP_SIGNATURE_CHECK=true — an unset
    // NODE_ENV (e.g. a misconfigured staging deploy) must never be treated
    // as "safe to skip verification".
    if (
      process.env.WHATSAPP_SKIP_SIGNATURE_CHECK === "true" &&
      process.env.NODE_ENV !== "production"
    ) {
      return true;
    }
    return false;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const given = Buffer.from(signatureHeader, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export function phoneHash(phone: string): string {
  return createHash("sha256").update(normalizePhone(phone)).digest("hex");
}

export function loadAllowedSenders(): WhatsAppSenderBinding[] {
  const raw = process.env.WHATSAPP_ALLOWED_SENDERS_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as WhatsAppSenderBinding[];
      return parsed
        .filter((item) => item.phone && item.brainId)
        .map((item) => ({ ...item, phone: normalizePhone(item.phone) }));
    } catch {
      return [];
    }
  }

  const phone = process.env.WHATSAPP_ALLOWED_PHONE;
  const brainId = process.env.WHATSAPP_DEFAULT_BRAIN_ID;
  if (phone && brainId) {
    return [
      {
        phone: normalizePhone(phone),
        brainId,
        name: process.env.WHATSAPP_DEFAULT_USER_NAME || "WhatsApp Anwalt",
        role: "lawyer",
      },
    ];
  }
  return [];
}

export function resolveSender(phone: string): WhatsAppSenderBinding | null {
  const normalized = normalizePhone(phone);
  return loadAllowedSenders().find((sender) => sender.phone === normalized) ?? null;
}
