// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const origEnv = { ...process.env };

describe("workos", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  // WorkOS module reads env vars at module load time, so we use dynamic imports
  async function freshImport() {
    vi.resetModules();
    return await import("./workos");
  }

  describe("isConfigured", () => {
    test("returns true when both API_KEY and CLIENT_ID are set", async () => {
      process.env.WORKOS_API_KEY = "sk_test";
      process.env.WORKOS_CLIENT_ID = "client_test";
      const { isConfigured } = await freshImport();
      expect(isConfigured()).toBe(true);
    });

    test("returns false when API_KEY is missing", async () => {
      delete process.env.WORKOS_API_KEY;
      process.env.WORKOS_CLIENT_ID = "client_test";
      const { isConfigured } = await freshImport();
      expect(isConfigured()).toBe(false);
    });

    test("returns false when CLIENT_ID is missing", async () => {
      process.env.WORKOS_API_KEY = "sk_test";
      delete process.env.WORKOS_CLIENT_ID;
      const { isConfigured } = await freshImport();
      expect(isConfigured()).toBe(false);
    });

    test("returns false when both are missing", async () => {
      delete process.env.WORKOS_API_KEY;
      delete process.env.WORKOS_CLIENT_ID;
      const { isConfigured } = await freshImport();
      expect(isConfigured()).toBe(false);
    });
  });

  describe("getAuthorizationUrl", () => {
    test("throws when CLIENT_ID is missing", async () => {
      delete process.env.WORKOS_CLIENT_ID;
      const { getAuthorizationUrl } = await freshImport();
      expect(() =>
        getAuthorizationUrl({ redirectUri: "https://app.com/callback" }),
      ).toThrow("WORKOS_CLIENT_ID missing");
    });

    test("returns correct URL with required params", async () => {
      process.env.WORKOS_CLIENT_ID = "client_123";
      const { getAuthorizationUrl } = await freshImport();
      const url = getAuthorizationUrl({ redirectUri: "https://app.com/callback" });
      expect(url).toContain("https://api.workos.com/user_management/authorize");
      expect(url).toContain("client_id=client_123");
      expect(url).toContain("redirect_uri=https%3A%2F%2Fapp.com%2Fcallback");
      expect(url).toContain("response_type=code");
    });

    test("includes state when provided", async () => {
      process.env.WORKOS_CLIENT_ID = "client_123";
      const { getAuthorizationUrl } = await freshImport();
      const url = getAuthorizationUrl({
        redirectUri: "https://app.com/callback",
        state: "random_state",
      });
      expect(url).toContain("state=random_state");
    });

    test("includes organization_id when provided", async () => {
      process.env.WORKOS_CLIENT_ID = "client_123";
      const { getAuthorizationUrl } = await freshImport();
      const url = getAuthorizationUrl({
        redirectUri: "https://app.com/callback",
        organizationId: "org_123",
      });
      expect(url).toContain("organization_id=org_123");
    });

    test("includes provider when provided", async () => {
      process.env.WORKOS_CLIENT_ID = "client_123";
      const { getAuthorizationUrl } = await freshImport();
      const url = getAuthorizationUrl({
        redirectUri: "https://app.com/callback",
        provider: "GoogleOAuth",
      });
      expect(url).toContain("provider=GoogleOAuth");
    });
  });

  describe("authenticateWithCode", () => {
    test("throws when API_KEY is missing", async () => {
      delete process.env.WORKOS_API_KEY;
      const { authenticateWithCode } = await freshImport();
      await expect(
        authenticateWithCode("code123", "https://app.com/callback"),
      ).rejects.toThrow("WORKOS_API_KEY missing");
    });

    test("returns auth response on success", async () => {
      process.env.WORKOS_API_KEY = "sk_test";
      process.env.WORKOS_CLIENT_ID = "client_test";
      const mockResponse = {
        user: {
          id: "user_1",
          email: "test@example.com",
          first_name: "Max",
          last_name: "Mustermann",
          email_verified: true,
        },
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      const { authenticateWithCode } = await freshImport();
      const result = await authenticateWithCode("code123", "https://app.com/callback");
      expect(result.user.email).toBe("test@example.com");
    });

    test("throws on non-200 response", async () => {
      process.env.WORKOS_API_KEY = "sk_test";
      process.env.WORKOS_CLIENT_ID = "client_test";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Invalid code" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );
      const { authenticateWithCode } = await freshImport();
      await expect(
        authenticateWithCode("bad_code", "https://app.com/callback"),
      ).rejects.toThrow("Invalid code");
    });

    test("throws with status when no error message in response", async () => {
      process.env.WORKOS_API_KEY = "sk_test";
      process.env.WORKOS_CLIENT_ID = "client_test";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("{}", { status: 401 }),
      );
      const { authenticateWithCode } = await freshImport();
      await expect(
        authenticateWithCode("code", "https://app.com/callback"),
      ).rejects.toThrow("401");
    });
  });

  describe("getUserProfile", () => {
    test("throws when API_KEY is missing", async () => {
      delete process.env.WORKOS_API_KEY;
      const { getUserProfile } = await freshImport();
      await expect(getUserProfile("user_1")).rejects.toThrow("WorkOS not configured");
    });

    test("returns profile on success", async () => {
      process.env.WORKOS_API_KEY = "sk_test";
      const mockProfile = {
        id: "user_1",
        email: "test@example.com",
        firstName: "Max",
        lastName: "Mustermann",
      };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockProfile), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      const { getUserProfile } = await freshImport();
      const result = await getUserProfile("user_1");
      expect(result.id).toBe("user_1");
      expect(result.email).toBe("test@example.com");
    });

    test("throws on non-200 response", async () => {
      process.env.WORKOS_API_KEY = "sk_test";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
      );
      const { getUserProfile } = await freshImport();
      await expect(getUserProfile("unknown")).rejects.toThrow("Not found");
    });
  });
});
