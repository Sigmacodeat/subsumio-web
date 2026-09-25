// P0-INFRA-001: env validation contract.
// Verifies validateEnv() reports missing required vars in production (fail-fast
// at startup) and only warns in development.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { missingRequiredEnv, validateEnv } from "@/lib/env-validate";

const REQUIRED = [
  "AUTH_SECRET",
  "SUBSUMIO_ENCRYPTION_KEY",
  "SUBSUMIO_API_URL",
  "SUBSUMIO_WEB_API_KEY",
  "SUBSUMIO_INTERNAL_SECRET",
  "CRON_SECRET",
  "PORTAL_TOKEN_SECRET",
  "SUBSUMIO_AUTH_DATABASE_URL",
];

describe("validateEnv", () => {
  const snapshot: Record<string, string | undefined> = {};
  const keys = [...REQUIRED, "NODE_ENV", "NEXT_PUBLIC_SENTRY_DSN", "DATABASE_URL"];

  beforeEach(() => {
    for (const k of keys) snapshot[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of keys) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it("reports all required vars as missing in production when unset", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    for (const k of REQUIRED) delete process.env[k];

    const result = validateEnv();
    expect(result.ok).toBe(false);
    for (const k of REQUIRED) {
      expect(result.missing.some((m: string) => m.startsWith(k))).toBe(true);
    }
  });

  it("passes in production when all required vars are present", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    for (const k of REQUIRED) process.env[k] = "set";

    const result = validateEnv();
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("a missing CRON_SECRET fails production startup (QA-9)", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    for (const k of REQUIRED) process.env[k] = "set";
    delete process.env.CRON_SECRET;

    const result = validateEnv();
    expect(result.ok).toBe(false);
    expect(result.missing.some((m) => m.startsWith("CRON_SECRET"))).toBe(true);
    expect(missingRequiredEnv()).toEqual(["CRON_SECRET"]);
  });

  it("DATABASE_URL satisfies the auth-database requirement", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    for (const k of REQUIRED) process.env[k] = "set";
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    process.env.DATABASE_URL = "postgres://x";

    expect(validateEnv().ok).toBe(true);
    delete process.env.DATABASE_URL;
    expect(validateEnv().ok).toBe(false);
  });

  it("only warns (never blocks) in development", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
    for (const k of REQUIRED) delete process.env[k];

    const result = validateEnv();
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("checks the Sentry DSN name the code actually reads", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const result = validateEnv();
    expect(result.warnings).toContain("NEXT_PUBLIC_SENTRY_DSN not set (ok for dev)");
  });
});
