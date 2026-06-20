// P0-INFRA-001: env validation contract.
// Verifies validateEnv() reports missing required vars in production (fail-fast
// at startup) and only warns in development.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateEnv } from "@/lib/env-validate";

const REQUIRED = [
  "AUTH_SECRET",
  "SUBSUMIO_ENCRYPTION_KEY",
  "SUBSUMIO_API_URL",
  "SUBSUMIO_WEB_API_KEY",
  "SUBSUMIO_INTERNAL_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

describe("validateEnv", () => {
  const snapshot: Record<string, string | undefined> = {};
  const keys = [...REQUIRED, "NODE_ENV"];

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
    process.env.NODE_ENV = "production";
    for (const k of REQUIRED) delete process.env[k];

    const result = validateEnv();
    expect(result.ok).toBe(false);
    for (const k of REQUIRED) {
      expect(result.missing.some((m: string) => m.startsWith(k))).toBe(true);
    }
  });

  it("passes in production when all required vars are present", () => {
    process.env.NODE_ENV = "production";
    for (const k of REQUIRED) process.env[k] = "set";

    const result = validateEnv();
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("only warns (never blocks) in development", () => {
    process.env.NODE_ENV = "development";
    for (const k of REQUIRED) delete process.env[k];

    const result = validateEnv();
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
