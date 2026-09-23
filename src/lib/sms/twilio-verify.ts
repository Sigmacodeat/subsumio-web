import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Twilio request signature (X-Twilio-Signature):
 * base64(HMAC-SHA1(authToken, requestUrl + sorted POST params)).
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Fail closed: without TWILIO_AUTH_TOKEN no callback is trusted.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null
): boolean {
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!authToken || !signatureHeader) return false;

  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  const given = Buffer.from(signatureHeader, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
