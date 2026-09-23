// @vitest-environment node

import { createHmac } from "node:crypto";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { verifyTwilioSignature } from "./twilio-verify";

const TOKEN = "test-auth-token-12345";
const URL = "https://app.example.com/api/sms/status";

function sign(url: string, params: Record<string, string>, token = TOKEN): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

const PARAMS = {
  MessageSid: "SM1234567890",
  MessageStatus: "delivered",
  To: "+436641234567",
  From: "+431234567",
};

describe("verifyTwilioSignature", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  test("gültige Signatur → true", () => {
    expect(verifyTwilioSignature(URL, PARAMS, sign(URL, PARAMS))).toBe(true);
  });

  test("Parameter-Reihenfolge ist egal (intern sortiert)", () => {
    const reordered: Record<string, string> = {};
    for (const k of Object.keys(PARAMS).reverse()) reordered[k] = PARAMS[k as keyof typeof PARAMS];
    expect(verifyTwilioSignature(URL, reordered, sign(URL, PARAMS))).toBe(true);
  });

  test("gefälschte Signatur → false", () => {
    expect(verifyTwilioSignature(URL, PARAMS, sign(URL, PARAMS, "anderes-token"))).toBe(false);
  });

  test("manipulierter Parameter → false", () => {
    const sig = sign(URL, PARAMS);
    expect(verifyTwilioSignature(URL, { ...PARAMS, MessageStatus: "failed" }, sig)).toBe(false);
  });

  test("URL-Mismatch (http statt https / anderer Host) → false", () => {
    const sig = sign(URL, PARAMS);
    expect(verifyTwilioSignature("http://app.example.com/api/sms/status", PARAMS, sig)).toBe(false);
  });

  test("fehlender Signatur-Header → false", () => {
    expect(verifyTwilioSignature(URL, PARAMS, null)).toBe(false);
  });

  test("ohne TWILIO_AUTH_TOKEN fail-closed → false", () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    expect(verifyTwilioSignature(URL, PARAMS, sign(URL, PARAMS))).toBe(false);
  });

  test("Längen-Mismatch wirft nicht (timingSafeEqual-Guard)", () => {
    expect(verifyTwilioSignature(URL, PARAMS, "kurz")).toBe(false);
  });
});
