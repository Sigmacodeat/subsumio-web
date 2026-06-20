// P0-INFRA-002: cron auth guard + coverage guard.
// Verifies validateCronAuth's timing-safe Bearer check AND that every
// /api/cron/* route actually wires it in (no unprotected cron endpoint).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";

function request(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new NextRequest("https://subsumio.test/api/cron/deadlines", { headers });
}

describe("validateCronAuth", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = validateCronAuth(request("Bearer anything"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    await expect(res!.json()).resolves.toEqual({ error: "cron_not_configured" });
  });

  it("returns 401 when the Authorization header is missing", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = validateCronAuth(request());
    expect(res!.status).toBe(401);
    await expect(res!.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns 401 for a wrong bearer token", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(validateCronAuth(request("Bearer wrong"))!.status).toBe(401);
  });

  it("returns 401 for the right secret without the Bearer prefix", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(validateCronAuth(request("s3cr3t"))!.status).toBe(401);
  });

  it("passes (null) for a correct Bearer token", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(validateCronAuth(request("Bearer s3cr3t"))).toBeNull();
  });
});

describe("cron route coverage guard", () => {
  it("every /api/cron/* route imports and calls validateCronAuth", () => {
    const cronDir = join(process.cwd(), "src/app/api/cron");
    const routeFiles = readdirSync(cronDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(cronDir, d.name, "route.ts"));

    expect(routeFiles.length).toBeGreaterThan(0);

    for (const file of routeFiles) {
      const src = readFileSync(file, "utf8");
      // Routes can either call validateCronAuth directly or use createCronHandler
      // (which wraps validateCronAuth internally in api-handler.ts).
      const usesDirectAuth = src.includes('from "@/lib/cron-auth"') && src.includes("validateCronAuth(");
      const usesCronHandler = src.includes("createCronHandler");
      expect(
        usesDirectAuth || usesCronHandler,
        `${file} must either import+call validateCronAuth or use createCronHandler`,
      ).toBe(true);
    }
  });
});
