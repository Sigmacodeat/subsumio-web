import { NextRequest, NextResponse } from "next/server";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { createCronHandler } from "@/lib/api-handler";
import { getRecipientsByBrain } from "@/lib/cron-utils";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Retry-Cron für fehlgeschlagene Dokument-Analysen (Dead Letter Queue).
 *
 * Scannt alle Brains nach Dokumenten mit `analysis_status: "failed"` und
 * re-triggered die Analyse. Exponentieller Backoff über `analysis_retry_count`
 * im Frontmatter:
 *   - Retry 1: nach 1 Stunde
 *   - Retry 2: nach 4 Stunden
 *   - Retry 3: nach 16 Stunden
 *   - Max 3 Retries, danach `analysis_status: "permanently_failed"`
 *
 * Läuft stündlich. Der Cron prüft nur Dokumente deren `analysis_failed_at`
 * ausreichend weit in der Vergangenheit liegt (Backoff-Fenster).
 */

const MAX_RETRIES = 3;
const BACKOFF_HOURS = [1, 4, 16];

interface FailedDoc {
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
}

async function listFailedDocuments(brainId: string): Promise<FailedDoc[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=document&limit=500`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return (data as FailedDoc[]).filter((p) => {
      const fm = p.frontmatter ?? {};
      return fm.analysis_status === "failed";
    });
  } catch {
    return [];
  }
}

function hoursSince(isoStr: string): number {
  const then = new Date(isoStr).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / (1000 * 60 * 60);
}

function shouldRetry(doc: FailedDoc): { retry: boolean; attempt: number; waitHours: number } {
  const fm = doc.frontmatter;
  const retryCount = typeof fm.analysis_retry_count === "number" ? fm.analysis_retry_count : 0;
  const failedAt = typeof fm.analysis_failed_at === "string" ? fm.analysis_failed_at : "";

  if (retryCount >= MAX_RETRIES) {
    return { retry: false, attempt: retryCount, waitHours: 0 };
  }

  const attempt = retryCount; // 0-indexed → next retry is attempt+1
  const requiredWait = BACKOFF_HOURS[Math.min(attempt, BACKOFF_HOURS.length - 1)];
  const elapsed = hoursSince(failedAt);

  if (elapsed >= requiredWait) {
    return { retry: true, attempt: attempt + 1, waitHours: requiredWait };
  }
  return { retry: false, attempt, waitHours: requiredWait - elapsed };
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const recipientsByBrain = await getRecipientsByBrain();
  const internalSecret = env("SUBSUMIO_INTERNAL_SECRET");

  let brainsChecked = 0;
  let retried = 0;
  let permanentlyFailed = 0;
  let skippedWaiting = 0;
  const errors: string[] = [];

  for (const [brainId] of recipientsByBrain) {
    brainsChecked++;
    if (!internalSecret) {
      errors.push("SUBSUMIO_INTERNAL_SECRET not configured — cannot re-trigger analysis");
      continue;
    }

    const failedDocs = await listFailedDocuments(brainId);
    if (failedDocs.length === 0) continue;

    for (const doc of failedDocs) {
      const { retry, attempt } = shouldRetry(doc);

      if (!retry) {
        if (attempt >= MAX_RETRIES) {
          // Mark as permanently failed so we stop checking
          try {
            await enginePatchPage(
              engineHeadersForBrain(brainId),
              {
                slug: doc.slug,
                frontmatter: {
                  analysis_status: "permanently_failed",
                  analysis_permanent_failure_at: new Date().toISOString(),
                },
              },
              { timeoutMs: 15_000 }
            );
            permanentlyFailed++;
          } catch (err) {
            errors.push(
              `Failed to mark ${doc.slug} as permanently failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        } else {
          skippedWaiting++;
        }
        continue;
      }

      // Update retry count before firing the analysis to prevent concurrent
      // cron runs from double-triggering.
      try {
        await enginePatchPage(
          engineHeadersForBrain(brainId),
          {
            slug: doc.slug,
            frontmatter: {
              analysis_status: "retrying",
              analysis_retry_count: attempt,
              analysis_retry_at: new Date().toISOString(),
            },
          },
          { timeoutMs: 15_000 }
        );
      } catch (err) {
        errors.push(
          `Failed to update retry state for ${doc.slug}: ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }

      // Fire the analysis endpoint — this is a Next.js route, not an engine route
      try {
        const res = await fetch("http://localhost:3000/api/legal/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": internalSecret,
            "x-subsumio-source": brainId,
          },
          body: JSON.stringify({
            document_slug: doc.slug,
            brain_id: brainId,
          }),
          signal: AbortSignal.timeout(300_000),
        });

        if (!res.ok) {
          // Revert to failed state with updated timestamp
          await enginePatchPage(
            engineHeadersForBrain(brainId),
            {
              slug: doc.slug,
              frontmatter: {
                analysis_status: "failed",
                analysis_failed_at: new Date().toISOString(),
                analysis_error: `Retry ${attempt}: HTTP ${res.status}`,
              },
            },
            { timeoutMs: 15_000 }
          );
          errors.push(`Retry ${attempt} for ${doc.slug}: HTTP ${res.status}`);
        } else {
          retried++;
        }
      } catch (err) {
        // Network/timeout error — revert to failed state
        const errMsg = err instanceof Error ? err.message : String(err);
        try {
          await enginePatchPage(
            engineHeadersForBrain(brainId),
            {
              slug: doc.slug,
              frontmatter: {
                analysis_status: "failed",
                analysis_failed_at: new Date().toISOString(),
                analysis_error: `Retry ${attempt}: ${errMsg}`,
              },
            },
            { timeoutMs: 15_000 }
          );
        } catch {
          // Best-effort revert
        }
        errors.push(`Retry ${attempt} for ${doc.slug}: ${errMsg}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    brains_checked: brainsChecked,
    retried,
    permanently_failed: permanentlyFailed,
    skipped_waiting: skippedWaiting,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
});
