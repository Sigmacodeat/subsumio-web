// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { verifyDocusignConnectSignature, type EnvelopeRequest } from "./docusign";

describe("verifyDocusignConnectSignature", () => {
  const secret = "test-connect-secret";
  const rawBody = '{"test":"data"}';

  test("returns true for valid HMAC signature", () => {
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    expect(verifyDocusignConnectSignature(rawBody, expected, secret)).toBe(true);
  });

  test("returns false for invalid signature", () => {
    expect(verifyDocusignConnectSignature(rawBody, "wrong-signature", secret)).toBe(false);
  });

  test("returns false when signature header is null", () => {
    expect(verifyDocusignConnectSignature(rawBody, null, secret)).toBe(false);
  });

  test("returns false when signature header is empty string", () => {
    expect(verifyDocusignConnectSignature(rawBody, "", secret)).toBe(false);
  });

  test("returns false when secret is empty", () => {
    expect(verifyDocusignConnectSignature(rawBody, "some-sig", "")).toBe(false);
  });

  test("returns false for tampered body", () => {
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    expect(verifyDocusignConnectSignature('{"test":"tampered"}', expected, secret)).toBe(false);
  });

  test("returns false for signature of different length", () => {
    expect(verifyDocusignConnectSignature(rawBody, "short", secret)).toBe(false);
  });

  test("handles unicode body correctly", () => {
    const unicodeBody = '{"name":"Müller & Söhne"}';
    const expected = createHmac("sha256", secret).update(unicodeBody, "utf8").digest("base64");
    expect(verifyDocusignConnectSignature(unicodeBody, expected, secret)).toBe(true);
  });

  test("handles large body", () => {
    const largeBody = JSON.stringify({ data: "x".repeat(10000) });
    const expected = createHmac("sha256", secret).update(largeBody, "utf8").digest("base64");
    expect(verifyDocusignConnectSignature(largeBody, expected, secret)).toBe(true);
  });
});

describe("isConfigured", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  test("returns false when no env vars are set", async () => {
    delete process.env.DOCUSIGN_INTEGRATION_KEY;
    delete process.env.DOCUSIGN_SECRET_KEY;
    delete process.env.DOCUSIGN_ACCOUNT_ID;
    // Re-import to get fresh module-level values
    vi.resetModules();
    const { isConfigured: fresh } = await import("./docusign");
    expect(fresh()).toBe(false);
  });

  test("returns true when all env vars are set", async () => {
    process.env.DOCUSIGN_INTEGRATION_KEY = "test-ik";
    process.env.DOCUSIGN_SECRET_KEY = "test-secret";
    process.env.DOCUSIGN_ACCOUNT_ID = "test-account";
    vi.resetModules();
    const { isConfigured: fresh } = await import("./docusign");
    expect(fresh()).toBe(true);
  });

  test("returns false when only some env vars are set", async () => {
    process.env.DOCUSIGN_INTEGRATION_KEY = "test-ik";
    delete process.env.DOCUSIGN_SECRET_KEY;
    delete process.env.DOCUSIGN_ACCOUNT_ID;
    vi.resetModules();
    const { isConfigured: fresh } = await import("./docusign");
    expect(fresh()).toBe(false);
  });
});

describe("getAuthUrl", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.DOCUSIGN_INTEGRATION_KEY = "test-integration-key";
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.resetModules();
  });

  test("returns a valid URL string", async () => {
    vi.resetModules();
    const { getAuthUrl: fresh } = await import("./docusign");
    const url = fresh("https://app.example.com/callback");
    expect(typeof url).toBe("string");
    expect(url.startsWith("https://")).toBe(true);
  });

  test("includes response_type=code", async () => {
    vi.resetModules();
    const { getAuthUrl: fresh } = await import("./docusign");
    const url = new URL(fresh("https://app.example.com/callback"));
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  test("includes client_id from env", async () => {
    vi.resetModules();
    const { getAuthUrl: fresh } = await import("./docusign");
    const url = new URL(fresh("https://app.example.com/callback"));
    expect(url.searchParams.get("client_id")).toBe("test-integration-key");
  });

  test("includes redirect_uri", async () => {
    vi.resetModules();
    const { getAuthUrl: fresh } = await import("./docusign");
    const redirect = "https://app.example.com/docusign/callback";
    const url = new URL(fresh(redirect));
    expect(url.searchParams.get("redirect_uri")).toBe(redirect);
  });

  test("includes scope", async () => {
    vi.resetModules();
    const { getAuthUrl: fresh } = await import("./docusign");
    const url = new URL(fresh("https://app.example.com/callback"));
    expect(url.searchParams.get("scope")).toContain("signature");
  });

  test("includes state when provided", async () => {
    vi.resetModules();
    const { getAuthUrl: fresh } = await import("./docusign");
    const url = new URL(fresh("https://app.example.com/callback", "random-state-123"));
    expect(url.searchParams.get("state")).toBe("random-state-123");
  });

  test("state is URL-encoded to survive round-trip", async () => {
    vi.resetModules();
    const { getAuthUrl: fresh } = await import("./docusign");
    const state = "state+with/special=chars";
    const url = new URL(fresh("https://app.example.com/callback", state));
    expect(url.searchParams.get("state")).toBe(state);
  });

  test("omits state when not provided", async () => {
    vi.resetModules();
    const { getAuthUrl: fresh } = await import("./docusign");
    const url = new URL(fresh("https://app.example.com/callback"));
    expect(url.searchParams.has("state")).toBe(false);
  });
});

describe("EnvelopeRequest type", () => {
  test("can construct a valid envelope request", () => {
    const req: EnvelopeRequest = {
      emailSubject: "Please sign",
      emailBlurb: "Review and sign",
      documents: [{ documentBase64: "base64data", name: "contract.pdf", documentId: "1" }],
      recipients: {
        signers: [
          {
            email: "signer@example.com",
            name: "Signer Name",
            recipientId: "1",
            routingOrder: "1",
            tabs: {
              signHereTabs: [
                { documentId: "1", pageNumber: "1", xPosition: "100", yPosition: "200" },
              ],
            },
          },
        ],
      },
      status: "sent",
    };
    expect(req.emailSubject).toBe("Please sign");
    expect(req.recipients.signers).toHaveLength(1);
    expect(req.status).toBe("sent");
  });
});
