/**
 * Diktat-Loop (Dictation Workflow)
 * =================================
 * Recording (existing voice infrastructure) → Whisper transcription
 * → Correction queue (type: "dictation", status: transcribed→corrected→filed)
 * → Filed as draft/note in case.
 */

export type DictationStatus = "recording" | "transcribed" | "corrected" | "filed" | "failed";

export interface DictationEntry {
  id: string;
  case_slug?: string;
  lawyer_email: string;
  lawyer_name: string;
  audio_slug?: string;
  duration_seconds: number;
  language: string;
  transcript?: string;
  corrected_text?: string;
  filed_as_slug?: string;
  filed_as_type?: "draft" | "note" | "document";
  status: DictationStatus;
  transcribed_at?: string;
  corrected_at?: string;
  corrected_by?: string;
  filed_at?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export function createDictationEntry(input: {
  case_slug?: string;
  lawyer_email: string;
  lawyer_name: string;
  duration_seconds: number;
  language?: string;
}): DictationEntry {
  const now = new Date().toISOString();
  return {
    id: `dict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: input.case_slug,
    lawyer_email: input.lawyer_email,
    lawyer_name: input.lawyer_name,
    duration_seconds: input.duration_seconds,
    language: input.language ?? "de-DE",
    status: "recording",
    created_at: now,
    updated_at: now,
  };
}

export function transitionDictationStatus(
  entry: DictationEntry,
  newStatus: DictationStatus,
  data?: Partial<DictationEntry>
): DictationEntry {
  const now = new Date().toISOString();
  const transitions: Record<DictationStatus, DictationStatus[]> = {
    recording: ["transcribed", "failed"],
    transcribed: ["corrected", "failed"],
    corrected: ["filed", "failed"],
    filed: [],
    failed: [],
  };

  if (!transitions[entry.status]?.includes(newStatus)) {
    throw new Error(`invalid_transition:${entry.status}->${newStatus}`);
  }

  return {
    ...entry,
    ...data,
    status: newStatus,
    transcribed_at: newStatus === "transcribed" ? now : entry.transcribed_at,
    corrected_at: newStatus === "corrected" ? now : entry.corrected_at,
    filed_at: newStatus === "filed" ? now : entry.filed_at,
    updated_at: now,
  };
}

export function getPendingCorrections(entries: DictationEntry[]): DictationEntry[] {
  return entries.filter((e) => e.status === "transcribed");
}

export function formatDictationDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
