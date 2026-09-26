/**
 * detected-deadline-entry.ts — turns a recognised deadline (POST
 * /api/legal/ai-deadlines) into the Akten-Frist the lawyer adopts.
 *
 * The entry is always "unreviewed" and marked as a KI suggestion; the
 * engine's calculation (Zustelldatum, Rechtsgrundlage, Vorfrist, Notfrist,
 * hints such as "Ferialsache prüfen") travels with it so the Fristenbuch and
 * the reviewer see how the date came about.
 */

import type { DetectedDeadline } from "@/lib/ai-deadline-detect";
import type { DeadlineEntry } from "@/lib/legal-types";

const CONFIDENCE_LABEL: Record<DetectedDeadline["confidence"], string> = {
  high: "Hohe Sicherheit",
  medium: "Prüfen",
  low: "Unsicher",
};

export function confidenceLabel(confidence: unknown): string {
  return typeof confidence === "string" && confidence in CONFIDENCE_LABEL
    ? CONFIDENCE_LABEL[confidence as DetectedDeadline["confidence"]]
    : "Prüfen";
}

/** Only a suggestion with a concrete date can become a Frist. */
export function canAdoptDetected(d: Pick<DetectedDeadline, "date">): boolean {
  return typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date);
}

export function deadlineEntryFromDetected(d: DetectedDeadline, now: Date): DeadlineEntry {
  if (!canAdoptDetected(d)) {
    throw new Error("detected deadline has no date — ask for the Zustelldatum first");
  }
  const b = d.berechnung;
  const note = [
    b
      ? `Berechnet ab Zustellung ${b.zustellungsdatum}${
          b.eingangsdatum ? ` (im ERV eingelangt ${b.eingangsdatum})` : ""
        }`
      : "",
    ...(b?.hinweise ?? []),
    d.rueckfrage ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: `dl-${now.getTime()}`,
    title: d.description,
    due_date: d.date!,
    type: "deadline",
    status: "pending",
    review_status: "unreviewed",
    // Marks it as a KI suggestion: alerts label it and send no external
    // notification until reviewed.
    source: "ai_detected",
    created_at: now.toISOString(),
    ...(b?.fristArt ? { rule_key: b.fristArt } : {}),
    ...(b?.rechtsgrundlage ? { law: b.rechtsgrundlage } : {}),
    ...(b ? { start_date: b.zustellungsdatum, vorfrist_date: b.vorfrist } : {}),
    ...(note ? { calculation_note: note } : {}),
    ...(b?.notfrist ? { is_notfrist: true, second_check_required: true } : {}),
  };
}
