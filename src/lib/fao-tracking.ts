/**
 * FAO-Fortbildungs-Tracking (§ 15 FAO)
 * =====================================
 * Track 15-hour continuing education requirement per specialist title.
 * Upload proofs, annual status, Q4 warning.
 */

export interface ContinuingEducationEntry {
  id: string;
  lawyer_email: string;
  lawyer_name: string;
  specialist_title: string;
  date: string;
  hours: number;
  topic: string;
  provider: string;
  proof_document_slug?: string;
  status: "pending" | "verified" | "rejected";
  verified_by?: string;
  verified_at?: string;
  notes?: string;
  created_at: string;
}

export interface FAOAnnualStatus {
  lawyer_email: string;
  lawyer_name: string;
  specialist_title: string;
  year: number;
  required_hours: number;
  completed_hours: number;
  remaining_hours: number;
  entries: ContinuingEducationEntry[];
  status: "on_track" | "warning" | "critical" | "fulfilled";
}

export const FAO_REQUIRED_HOURS = 15;

export function createEducationEntry(input: {
  lawyer_email: string;
  lawyer_name: string;
  specialist_title: string;
  date: string;
  hours: number;
  topic: string;
  provider: string;
  proof_document_slug?: string;
  notes?: string;
}): ContinuingEducationEntry {
  const now = new Date().toISOString();
  return {
    id: `edu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lawyer_email: input.lawyer_email,
    lawyer_name: input.lawyer_name,
    specialist_title: input.specialist_title,
    date: input.date,
    hours: input.hours,
    topic: input.topic,
    provider: input.provider,
    proof_document_slug: input.proof_document_slug,
    status: "pending",
    created_at: now,
    notes: input.notes,
  };
}

export function computeAnnualStatus(
  lawyerEmail: string,
  lawyerName: string,
  specialistTitle: string,
  entries: ContinuingEducationEntry[],
  year: number
): FAOAnnualStatus {
  const yearEntries = entries.filter(
    (e) =>
      e.lawyer_email === lawyerEmail &&
      e.specialist_title === specialistTitle &&
      new Date(e.date).getFullYear() === year &&
      e.status !== "rejected"
  );

  const completedHours = yearEntries
    .filter((e) => e.status === "verified")
    .reduce((sum, e) => sum + e.hours, 0);

  const remainingHours = Math.max(0, FAO_REQUIRED_HOURS - completedHours);

  let status: FAOAnnualStatus["status"] = "on_track";
  if (completedHours >= FAO_REQUIRED_HOURS) {
    status = "fulfilled";
  } else {
    const now = new Date();
    const currentYear = now.getFullYear();
    if (year === currentYear) {
      const month = now.getMonth();
      if (month >= 9 && remainingHours > 5) {
        status = "critical";
      } else if (month >= 6 && remainingHours > 8) {
        status = "warning";
      }
    } else if (year < currentYear) {
      status = remainingHours > 0 ? "critical" : "fulfilled";
    }
  }

  return {
    lawyer_email: lawyerEmail,
    lawyer_name: lawyerName,
    specialist_title: specialistTitle,
    year,
    required_hours: FAO_REQUIRED_HOURS,
    completed_hours: completedHours,
    remaining_hours: remainingHours,
    entries: yearEntries,
    status,
  };
}
