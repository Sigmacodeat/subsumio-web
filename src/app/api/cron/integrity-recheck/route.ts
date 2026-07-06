import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/integrity-recheck — daily rolling integrity re-verification.
 *
 * Re-hashes a batch of stored files (default 50) and compares against the
 * content_hash anchored in the files table. Detects silent storage corruption
 * or tampering (GoBD compliance). On mismatch, logs an alert.
 *
 * Rolling: checks oldest-first, batch_size per run. With 1000 files and
 * batch_size=50, a full cycle takes 20 days — sufficient for GoBD.
 */

export const GET = createCronHandler(async (req: NextRequest) => {
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  headers["x-subsumio-source"] = "law-de";

  const batchSize = req.nextUrl.searchParams.get("batch_size") ?? "50";

  const res = await fetch(`${ENGINE_URL}/api/admin/integrity-recheck`, {
    method: "POST",
    headers,
    body: JSON.stringify({ batch_size: parseInt(batchSize, 10) }),
    signal: AbortSignal.timeout(280_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`integrity-recheck failed: ${res.status} ${text}`);
  }

  const result = (await res.json()) as {
    checked: number;
    mismatches: number;
    mismatch_details?: Array<{
      filename: string;
      storage_path: string;
      expected: string;
      actual: string;
    }>;
  };

  console.info(
    `[cron:integrity-recheck] checked=${result.checked} mismatches=${result.mismatches}`
  );

  if (result.mismatches > 0 && result.mismatch_details) {
    for (const m of result.mismatch_details) {
      console.error(
        `[cron:integrity-recheck] CORRUPTION DETECTED: ${m.filename} at ${m.storage_path} — expected ${m.expected}, got ${m.actual}`
      );
    }
  }

  return Response.json(result);
});
