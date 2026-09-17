import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOpsHost, isPlatformOperator, operatorEmails } from "./platform-operator";

const operator = {
  email: "ops@subsumio.example",
  twoFactorEnabled: true,
  deactivatedAt: null,
};

describe("platform operator", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_OPERATOR_EMAILS", " Ops@Subsumio.example , second@subsumio.example ");
    vi.stubEnv("OPS_HOSTS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts an allowlisted, 2FA-enabled, active account (case-insensitive)", () => {
    expect(isPlatformOperator(operator)).toBe(true);
    expect(isPlatformOperator({ ...operator, email: "SECOND@subsumio.example" })).toBe(true);
    expect(operatorEmails().size).toBe(2);
  });

  it("is fail-closed when the allowlist is empty", () => {
    vi.stubEnv("PLATFORM_OPERATOR_EMAILS", "");
    expect(isPlatformOperator(operator)).toBe(false);
  });

  it("never treats a Kanzlei admin as operator just because of the role", () => {
    expect(isPlatformOperator({ email: "partner@kanzlei.example", twoFactorEnabled: true })).toBe(
      false
    );
  });

  it("requires active 2FA", () => {
    expect(isPlatformOperator({ ...operator, twoFactorEnabled: false })).toBe(false);
    expect(isPlatformOperator({ ...operator, twoFactorEnabled: undefined })).toBe(false);
  });

  it("rejects deactivated accounts and missing users", () => {
    expect(isPlatformOperator({ ...operator, deactivatedAt: "2026-09-01T00:00:00Z" })).toBe(false);
    expect(isPlatformOperator(null)).toBe(false);
    expect(isPlatformOperator({ twoFactorEnabled: true })).toBe(false);
  });

  it("serves the console only on ops hosts", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isOpsHost("ops.subsum.io")).toBe(true);
    expect(isOpsHost("OPS.subsum.io")).toBe(true);
    expect(isOpsHost("subsum.io")).toBe(false);
    expect(isOpsHost("ops.localhost:3000")).toBe(false);
    expect(isOpsHost(null)).toBe(false);
  });

  it("allows ops.localhost in development and honours OPS_HOSTS overrides", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isOpsHost("ops.localhost:3000")).toBe(true);
    vi.stubEnv("OPS_HOSTS", "ops.staging.subsum.io");
    expect(isOpsHost("ops.staging.subsum.io")).toBe(true);
    expect(isOpsHost("ops.subsum.io")).toBe(false);
  });
});
