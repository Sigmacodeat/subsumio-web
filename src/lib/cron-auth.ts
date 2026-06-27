/**
 * Shared cron auth guard — timing-safe Bearer token validation.
 * All cron endpoints must use this instead of raw string comparison.
 */

import { timingSafeCompare } from "@/lib/crypto-utils";
import type { NextRequest } from "next/server";

export function validateCronAuth(req: NextRequest): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "cron_not_configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${secret}`;
  if (!auth || !timingSafeCompare(auth, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null; // auth ok
}
