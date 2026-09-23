// @vitest-environment node
import { describe, expect, it } from "vitest";
import { apiKeyHasScope, requiredApiKeyScope } from "./api-key-scopes";

describe("requiredApiKeyScope", () => {
  it("reads need read", () => {
    expect(requiredApiKeyScope("brain.read", "GET")).toBe("read");
    expect(requiredApiKeyScope("brain.read", "head")).toBe("read");
    expect(requiredApiKeyScope("settings.read", "GET")).toBe("read");
  });

  it("mutations need write", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(requiredApiKeyScope("brain.write", m)).toBe("write");
    }
    expect(requiredApiKeyScope("query.submit", "POST")).toBe("write");
  });

  it("admin and settings routes need admin — whatever the method", () => {
    expect(requiredApiKeyScope("admin.*", "GET")).toBe("admin");
    expect(requiredApiKeyScope("admin.data_export", "POST")).toBe("admin");
    expect(requiredApiKeyScope("brain.read", "GET", true)).toBe("admin");
    expect(requiredApiKeyScope("settings.write", "POST")).toBe("admin");
    expect(requiredApiKeyScope("team.role_change", "POST")).toBe("admin");
    expect(requiredApiKeyScope("billing.write", "POST")).toBe("admin");
    expect(requiredApiKeyScope("auth.2fa", "POST")).toBe("admin");
  });
});

describe("apiKeyHasScope", () => {
  it("orders scopes: admin ⊇ write ⊇ read", () => {
    expect(apiKeyHasScope(["read"], "read")).toBe(true);
    expect(apiKeyHasScope(["read"], "write")).toBe(false);
    expect(apiKeyHasScope(["read"], "admin")).toBe(false);
    expect(apiKeyHasScope(["write"], "read")).toBe(true);
    expect(apiKeyHasScope(["write"], "write")).toBe(true);
    expect(apiKeyHasScope(["write"], "admin")).toBe(false);
    expect(apiKeyHasScope(["admin"], "write")).toBe(true);
    expect(apiKeyHasScope(["read", "admin"], "admin")).toBe(true);
  });

  it("grants nothing for empty or unknown scopes", () => {
    expect(apiKeyHasScope([], "read")).toBe(false);
    expect(apiKeyHasScope(undefined, "read")).toBe(false);
    expect(apiKeyHasScope(["*", "superuser"], "read")).toBe(false);
  });
});
