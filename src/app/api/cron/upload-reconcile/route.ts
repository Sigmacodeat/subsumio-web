import { NextRequest, NextResponse } from "next/server";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { createCronHandler } from "@/lib/api-handler";
import { getRecipientsByBrain } from "@/lib/cron-utils";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Upload-Reconcile-Sweeper — schließt die stillen Blackholes der Upload-Kette.
 *
 * Hintergrund: Es gibt Pfade, auf denen ein Dokument erfolgreich extrahiert wird,
 * aber NIE eine Post-Upload-Analyse-Task erzeugt bekommt:
 *   - Der SSE-Confirm-Pfad großer Dateien feuert die Task erst beim `done`-Event;
 *     bricht der Client vorher ab, entsteht keine Task.
 *   - Der synchrone Enqueue kann bei Engine-Last per Timeout scheitern.
 *   - Ein `pending`-Dokument, dessen Task nie erzeugt wurde, wird vom
 *     analysis-retry-Cron nicht erfasst (der filtert nur `status === "failed"`).
 *
 * Dieser Sweeper findet extraktions-fertige Dokumente, deren `analysis_status`
 * fehlt oder seit über GRACE_MINUTES auf `pending` steht, und re-enqueued sie in
 * die persistente Outbox. `enqueueAllPostUploadTasks` ist idempotent nach
 * (doc_slug, task_type) — eine bereits pending Task bleibt unangetastet, also ist
 * ein Re-Enqueue gefahrlos.
 *
 * Ausgeschlossen (bewusst): `completed` (fertig analysiert), `failed`/`retrying`
 * (analysis-retry-Cron zuständig), `deferred`/`permanently_failed`.
 *
 * Läuft alle 10 Minuten. GRACE_MINUTES verhindert Kollision mit dem normalen
 * 2-Minuten-Drain: nur Dokumente, die deutlich zu lange feststecken, werden
 * angefasst.
 */

export const GRACE_MINUTES = 15;
const EXTRACTION_READY = new Set(["ready", "partial", "text_layer", "ocr_complete"]);

export interface DocPage {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
}

function minutesSince(isoStr: unknown): number {
  if (typeof isoStr !== "string" || !isoStr) return Infinity;
  const then = new Date(isoStr).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / (1000 * 60);
}

async function listDocuments(brainId: string): Promise<DocPage[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=document&limit=500`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as DocPage[]) : [];
  } catch {
    return [];
  }
}

/** A document that is extraction-ready but has no live analysis tracking. */
export function isStuck(doc: DocPage): boolean {
  const fm = doc.frontmatter ?? {};
  const extraction = String(fm.extraction_status ?? "");
  if (!EXTRACTION_READY.has(extraction)) return false;

  const analysis = fm.analysis_status;
  // Missing status → task was never created (the blackhole).
  if (analysis === undefined || analysis === null || analysis === "") {
    // Only sweep once the document has settled, so we don't race a normal drain
    // that is about to enqueue it.
    const age = Math.min(
      minutesSince(fm.uploaded_at),
      minutesSince(fm.extraction_completed_at),
      minutesSince(fm.created_at)
    );
    return age >= GRACE_MINUTES;
  }
  // Stuck on "pending" well past the point the 2-min drain should have run it.
  if (analysis === "pending") {
    const age = Math.min(minutesSince(fm.analysis_queued_at), minutesSince(fm.uploaded_at));
    return age >= GRACE_MINUTES;
  }
  // Anything else (completed / failed / retrying / queued / deferred /
  // permanently_failed) is tracked elsewhere — leave it alone.
  return false;
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const recipientsByBrain = await getRecipientsByBrain();

  let brainsChecked = 0;
  let reenqueued = 0;
  let stampedPending = 0;
  const errors: string[] = [];

  for (const [brainId] of recipientsByBrain) {
    brainsChecked++;
    const docs = await listDocuments(brainId);
    const stuck = docs.filter(isStuck);

    for (const doc of stuck) {
      const fm = doc.frontmatter ?? {};
      const caseSlug = typeof fm.case_slug === "string" ? fm.case_slug : undefined;
      const headers = engineHeadersForBrain(brainId);

      // Stamp pending if the status is missing, so the document becomes visible
      // and is picked up by the analysis-retry cron should the drain fail too.
      if (fm.analysis_status === undefined || fm.analysis_status === null) {
        const patch = await enginePatchPage(headers, {
          slug: doc.slug,
          frontmatter: {
            analysis_status: "pending",
            analysis_queued_at: new Date().toISOString(),
            analysis_reconciled_by: "upload-reconcile-sweeper",
          },
        });
        if (patch.ok) stampedPending++;
        else errors.push(`stamp ${doc.slug}: HTTP ${patch.status}`);
      }

      // Re-inject into the persistent outbox (idempotent by doc_slug+task_type).
      try {
        await enqueueAllPostUploadTasks({
          doc_slug: doc.slug,
          case_slug: caseSlug,
          brain_id: brainId,
          doc_title: doc.title,
          doc_size: typeof fm.doc_size === "number" ? fm.doc_size : undefined,
          uploaded_at: typeof fm.uploaded_at === "string" ? fm.uploaded_at : undefined,
        });
        reenqueued++;
      } catch (err) {
        errors.push(`reenqueue ${doc.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    brains_checked: brainsChecked,
    reenqueued,
    stamped_pending: stampedPending,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
});
