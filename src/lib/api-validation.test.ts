import { describe, test, expect } from "vitest";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  validateRequest,
  validateQuery,
  loginSchema,
  passwordSchema,
  signupSchema,
  registerSchema,
  thinkSchema,
  uploadSchema,
} from "./api-validation";

function makeReq(body: unknown): NextRequest {
  const req = new Request("https://example.com/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return req as unknown as NextRequest;
}

describe("validateRequest", () => {
  const schema = z.object({ name: z.string(), age: z.number() });

  test("returns ok:true with data for valid body", async () => {
    const result = await validateRequest(makeReq({ name: "Test", age: 30 }), schema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("Test");
      expect(result.data.age).toBe(30);
    }
  });

  test("returns ok:false with 400 for invalid JSON", async () => {
    const req = new Request("https://example.com/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    }) as unknown as NextRequest;
    const result = await validateRequest(req, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      const body = await result.error.json();
      expect(body.code).toBe("invalid_json");
    }
  });

  test("returns ok:false with 400 for schema validation failure", async () => {
    const result = await validateRequest(makeReq({ name: 123 }), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      const body = await result.error.json();
      expect(body.code).toBe("validation_failed");
      expect(body.details.issues).toBeDefined();
    }
  });

  test("includes issue path and message in details", async () => {
    const result = await validateRequest(makeReq({ name: "Test" }), schema);
    if (!result.ok) {
      const body = await result.error.json();
      const issue = body.details.issues[0];
      expect(issue.path).toBeDefined();
      expect(issue.message).toBeDefined();
    }
  });
});

describe("validateQuery", () => {
  const schema = z.object({ page: z.string(), limit: z.string() });

  test("returns ok:true for valid params", () => {
    const params = new URLSearchParams({ page: "1", limit: "10" });
    const result = validateQuery(params, schema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.page).toBe("1");
    }
  });

  test("returns ok:false for missing required params", async () => {
    const params = new URLSearchParams({ page: "1" });
    const result = validateQuery(params, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(400);
      const body = await result.error.json();
      expect(body.code).toBe("validation_failed");
    }
  });

  test("handles empty params", () => {
    const params = new URLSearchParams();
    const result = validateQuery(params, schema);
    expect(result.ok).toBe(false);
  });
});

describe("loginSchema", () => {
  test("accepts valid login", () => {
    const result = loginSchema.safeParse({ email: "test@example.com", password: "secret" });
    expect(result.success).toBe(true);
  });

  test("accepts optional remember flag", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "secret",
      remember: true,
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-email", password: "secret" });
    expect(result.success).toBe(false);
  });

  test("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "test@example.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("passwordSchema", () => {
  test("accepts strong password", () => {
    expect(passwordSchema.safeParse("StrongPass1!").success).toBe(true);
  });

  test("rejects short password (< 12 chars)", () => {
    const result = passwordSchema.safeParse("Short1");
    expect(result.success).toBe(false);
  });

  test("rejects password without uppercase", () => {
    const result = passwordSchema.safeParse("alllowercase1");
    expect(result.success).toBe(false);
  });

  test("rejects password without lowercase", () => {
    const result = passwordSchema.safeParse("ALLUPPERCASE1");
    expect(result.success).toBe(false);
  });

  test("rejects password without digit", () => {
    const result = passwordSchema.safeParse("NoDigitsHere");
    expect(result.success).toBe(false);
  });

  test("rejects password > 200 chars", () => {
    const result = passwordSchema.safeParse("Aa1" + "x".repeat(200));
    expect(result.success).toBe(false);
  });
});

const ACCEPT = { acceptTerms: true, acceptDpa: true } as const;

describe("signupSchema", () => {
  test("rejects signup without accepting AGB/Datenschutz and AVV", () => {
    const base = { email: "test@example.com", password: "StrongPass1!" };
    expect(signupSchema.safeParse(base).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, acceptTerms: true }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, acceptDpa: true }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, acceptTerms: "true", acceptDpa: true }).success).toBe(
      false
    );
  });

  test("accepts valid signup with all fields", () => {
    const result = signupSchema.safeParse({
      ...ACCEPT,
      email: "test@example.com",
      password: "StrongPass1!",
      name: "Test User",
    });
    expect(result.success).toBe(true);
  });

  test("accepts minimal signup (email + password)", () => {
    const result = signupSchema.safeParse({
      ...ACCEPT,
      email: "test@example.com",
      password: "StrongPass1!",
    });
    expect(result.success).toBe(true);
  });

  test("accepts the active legal industry", () => {
    const result = signupSchema.safeParse({
      ...ACCEPT,
      email: "test@example.com",
      password: "StrongPass1!",
      locale: "de",
      industry: "legal",
    });
    expect(result.success).toBe(true);
  });

  test("rejects archived tax onboarding", () => {
    const result = signupSchema.safeParse({
      ...ACCEPT,
      email: "test@example.com",
      password: "StrongPass1!",
      industry: "tax",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid locale", () => {
    const result = signupSchema.safeParse({
      ...ACCEPT,
      email: "test@example.com",
      password: "StrongPass1!",
      locale: "fr",
    });
    expect(result.success).toBe(false);
  });

  test("accepts the active Austrian signup locale", () => {
    const result = signupSchema.safeParse({
      ...ACCEPT,
      email: "kanzlei@example.at",
      password: "SicheresPasswort123",
      name: "Kanzlei Wien",
      locale: "at",
    });

    expect(result.success).toBe(true);
  });
});

describe("registerSchema", () => {
  test("requires name (unlike signupSchema)", () => {
    const result = registerSchema.safeParse({
      ...ACCEPT,
      email: "test@example.com",
      password: "StrongPass1!",
    });
    expect(result.success).toBe(false);
  });

  test("accepts valid register with name", () => {
    const result = registerSchema.safeParse({
      ...ACCEPT,
      email: "test@example.com",
      password: "StrongPass1!",
      name: "Test User",
    });
    expect(result.success).toBe(true);
  });

  test("accepts optional referredBy", () => {
    const result = registerSchema.safeParse({
      ...ACCEPT,
      email: "test@example.com",
      password: "StrongPass1!",
      name: "Test",
      referredBy: "friend",
    });
    expect(result.success).toBe(true);
  });
});

describe("thinkSchema", () => {
  test("accepts minimal query", () => {
    const result = thinkSchema.safeParse({ query: "Was ist BGB § 280?" });
    expect(result.success).toBe(true);
  });

  test("accepts all optional fields", () => {
    const result = thinkSchema.safeParse({
      query: "test",
      context: "some context",
      citations: true,
      jurisdiction: "de",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty query", () => {
    expect(thinkSchema.safeParse({ query: "" }).success).toBe(false);
  });

  test("rejects query > 10000 chars", () => {
    expect(thinkSchema.safeParse({ query: "x".repeat(10001) }).success).toBe(false);
  });

  test("rejects invalid jurisdiction", () => {
    expect(thinkSchema.safeParse({ query: "test", jurisdiction: "us" }).success).toBe(false);
  });
});

describe("uploadSchema", () => {
  test("accepts valid filename", () => {
    expect(uploadSchema.safeParse({ filename: "test.pdf" }).success).toBe(true);
  });

  test("accepts optional contentType", () => {
    expect(
      uploadSchema.safeParse({ filename: "test.pdf", contentType: "application/pdf" }).success
    ).toBe(true);
  });

  test("rejects empty filename", () => {
    expect(uploadSchema.safeParse({ filename: "" }).success).toBe(false);
  });

  test("rejects filename > 255 chars", () => {
    expect(uploadSchema.safeParse({ filename: "x".repeat(256) }).success).toBe(false);
  });
});

describe("uiLanguageSchema", async () => {
  const { uiLanguageSchema } = await import("./api-validation");
  it("normalises the dashboard's regional variants to de and keeps en", () => {
    expect(uiLanguageSchema.parse("at")).toBe("de");
    expect(uiLanguageSchema.parse("ch")).toBe("de");
    expect(uiLanguageSchema.parse("de")).toBe("de");
    expect(uiLanguageSchema.parse("en")).toBe("en");
    expect(uiLanguageSchema.safeParse("fr").success).toBe(false);
  });
});
