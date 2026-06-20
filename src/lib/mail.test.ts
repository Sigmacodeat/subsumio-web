// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { isMailConfigured, sendMail, siteUrl } from "./mail";

describe("isMailConfigured", () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  test("returns true when RESEND_API_KEY is set", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    expect(isMailConfigured()).toBe(true);
  });

  test("returns false when RESEND_API_KEY is not set", () => {
    delete process.env.RESEND_API_KEY;
    expect(isMailConfigured()).toBe(false);
  });
});

describe("siteUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  test("returns NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    expect(siteUrl()).toBe("https://app.example.com");
  });

  test("returns NEXT_PUBLIC_SITE_URL when APP_URL not set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example.com";
    expect(siteUrl()).toBe("https://site.example.com");
  });

  test("defaults to localhost:3000", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("sendMail", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  test("returns sent:false when RESEND_API_KEY not set", async () => {
    const result = await sendMail({ to: "test@example.com", subject: "Test", text: "Hello" });
    expect(result.sent).toBe(false);
    expect(result.error).toBe("mail_not_configured");
  });

  test("returns sent:true on successful API call", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await sendMail({ to: "test@example.com", subject: "Test", text: "Hello" });
    expect(result.sent).toBe(true);
    expect(result.id).toBe("email-123");
  });

  test("returns sent:false on non-200 response", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Bad Request", { status: 400 }),
    );
    const result = await sendMail({ to: "test@example.com", subject: "Test", text: "Hello" });
    expect(result.sent).toBe(false);
    expect(result.error).toBe("provider_400");
  });

  test("returns sent:false on network error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    const result = await sendMail({ to: "test@example.com", subject: "Test", text: "Hello" });
    expect(result.sent).toBe(false);
    expect(result.error).toBe("network");
  });

  test("sends HTML body when provided", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    await sendMail({ to: "test@example.com", subject: "Test", html: "<p>Hello</p>" });
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(callBody.html).toBe("<p>Hello</p>");
  });

  test("does not include text when only html is provided", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    await sendMail({ to: "test@example.com", subject: "Test", html: "<p>Hello world</p>" });
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(callBody.html).toBe("<p>Hello world</p>");
    expect(callBody.text).toBeUndefined();
  });

  test("includes derived text when neither text nor html is provided", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    await sendMail({ to: "test@example.com", subject: "Test" });
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(callBody.text).toBe("");
  });

  test("includes cc, bcc, and replyTo when provided", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    await sendMail({
      to: "a@example.com",
      cc: "b@example.com",
      bcc: "c@example.com",
      subject: "Test",
      text: "Hello",
      replyTo: "d@example.com",
    });
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(callBody.cc).toBe("b@example.com");
    expect(callBody.bcc).toBe("c@example.com");
    expect(callBody.reply_to).toBe("d@example.com");
  });

  test("handles array recipients", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    await sendMail({ to: ["a@example.com", "b@example.com"], subject: "Test", text: "Hello" });
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(callBody.to).toEqual(["a@example.com", "b@example.com"]);
  });

  test("includes custom headers when provided", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    await sendMail({
      to: "a@example.com",
      subject: "Test",
      text: "Hello",
      headers: { "X-Custom": "value" },
    });
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(callBody.headers).toEqual({ "X-Custom": "value" });
  });
});
