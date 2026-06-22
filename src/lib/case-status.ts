/**
 * Case Status State Machine — formale Definition aller erlaubten
 * Status-Übergänge für Legal Cases (Akten).
 *
 * Stati (aus src/lib/schemas/case.ts):
 *   open      → Akte aktiv, in Bearbeitung
 *   pending   → Wartet auf Ereignis (Gericht, Gegner, Mandant)
 *   settled   → Verglichen/einvernehmlich beendet
 *   won       → Prozess gewonnen
 *   lost      → Prozess verloren
 *   appealed  → Berufung eingelegt
 *   dormant   → Ruht (keine aktive Bearbeitung)
 *
 * Übergänge sind berufsrechtlich sinnvoll:
 *   - Ein "won" Fall kann nur reopened werden, wenn er "appealed" wird
 *   - Ein "settled" Fall ist endgültig (kein Übergang zu won/lost)
 *   - "dormant" kann jederzeit reaktiviert werden
 *   - "appealed" geht zurück zu open (neue Instanz) oder won/lost
 */

export type CaseStatus =
  | "open"
  | "pending"
  | "settled"
  | "won"
  | "lost"
  | "appealed"
  | "dormant"
  | "archived";

export type CasePriority = "low" | "medium" | "high" | "critical";

/** Alle erlaubten Übergänge von → nach. */
const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ["pending", "settled", "won", "lost", "dormant"],
  pending: ["open", "settled", "won", "lost", "dormant"],
  settled: ["dormant"],
  won: ["appealed", "dormant"],
  lost: ["appealed", "dormant"],
  appealed: ["open", "won", "lost", "settled", "dormant"],
  dormant: ["open", "pending"],
  archived: ["open", "dormant"],
};

/** Terminal-Zustände (keine aktive Bearbeitung mehr). */
export const TERMINAL_STATUSES: readonly CaseStatus[] = ["settled", "won", "lost"];

/** Aktive Zustände (Bearbeitung läuft). */
export const ACTIVE_STATUSES: readonly CaseStatus[] = ["open", "pending", "appealed"];

export interface StatusTransitionResult {
  allowed: boolean;
  from: CaseStatus;
  to: CaseStatus;
  reason?: string;
}

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  const allowed = TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export function validateTransition(from: CaseStatus, to: CaseStatus): StatusTransitionResult {
  if (from === to) {
    return { allowed: true, from, to, reason: "no_change" };
  }

  if (canTransition(from, to)) {
    return { allowed: true, from, to };
  }

  return {
    allowed: false,
    from,
    to,
    reason: `transition_${from}_to_${to}_not_allowed`,
  };
}

export function getAllowedTransitions(from: CaseStatus): CaseStatus[] {
  return [...(TRANSITIONS[from] ?? [])];
}

export function isTerminal(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isActive(status: CaseStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** Human-readable Label je Status (DE). */
export const STATUS_LABELS_DE: Record<CaseStatus, string> = {
  open: "Offen",
  pending: "Wartend",
  settled: "Verglichen",
  won: "Gewonnen",
  lost: "Verloren",
  appealed: "Berufung",
  dormant: "Ruht",
  archived: "Archiviert",
};

/** Beschreibung des Übergangs für Audit-Log. */
export function transitionDescription(from: CaseStatus, to: CaseStatus): string {
  const labels: Record<CaseStatus, string> = STATUS_LABELS_DE;
  return `Aktenstatus: ${labels[from]} → ${labels[to]}`;
}

/** Prioritäts-Validierung mit Business-Logic. */
export function validatePriority(priority: string): CasePriority | null {
  const valid: CasePriority[] = ["low", "medium", "high", "critical"];
  return valid.includes(priority as CasePriority) ? (priority as CasePriority) : null;
}

/** Empfohlene Priorität basierend auf Status und Fristen. */
export function suggestPriority(
  status: CaseStatus,
  hasCriticalDeadline: boolean,
  daysToNextDeadline: number | null
): CasePriority {
  if (status === "appealed") return "high";
  if (status === "archived") return "low";
  if (hasCriticalDeadline) return "critical";
  if (daysToNextDeadline !== null && daysToNextDeadline <= 3) return "high";
  if (daysToNextDeadline !== null && daysToNextDeadline <= 14) return "medium";
  if (status === "dormant") return "low";
  return "medium";
}
