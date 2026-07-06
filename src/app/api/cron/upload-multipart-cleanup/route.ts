import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/upload-multipart-cleanup — hourly cleanup of stale S3/R2
 * multipart uploads.
 *
 * Aborts in-progress multipart uploads older than 24 hours to prevent
 * storage cost leaks from abandoned uploads (tab close, crash, etc.).
 * Safe to run frequently — only touches uploads past the TTL.
 */

export const GET = createCronHandler(async (_req: NextRequest) => {
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  headers["x-subsumio-source"] = "law-de";

  const res = await fetch(`${ENGINE_URL}/api/upload/multipart-cleanup`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(100_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`multipart-cleanup failed: ${res.status} ${text}`);
  }

  const result = (await res.json()) as {
    total_in_progress: number;
    stale: number;
    aborted: number;
    message?: string;
  };

  console.info(
    `[cron:multipart-cleanup] in_progress=${result.total_in_progress} stale=${result.stale} aborted=${result.aborted}`
  );

  return Response.json(result);
});
