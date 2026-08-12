import { redirect } from "next/navigation";

/**
 * /dashboard/admin/pipeline → /dashboard/admin/corpus
 *
 * Die Pipeline-Seite wurde in den Corpus Command Center konsolidiert.
 * Der "Pipeline" Tab im Command Center bietet die gleiche Funktionalität
 * (Pause/Resume, Alerts, Re-Embed) plus Discovery-Gap-Report und
 * Clear-Alerts — alles an einem Ort.
 */
export const dynamic = "force-dynamic";

export default function PipelinePage() {
  redirect("/dashboard/admin/corpus");
}
