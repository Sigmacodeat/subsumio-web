/**
 * Vier-Augen-Freigabe — Human-in-the-Loop-Kontrolle für KI-/Agenten-erzeugte
 * Aktionen, bevor sie wirksam werden.
 *
 * WARUM: Berufsrechtliche Letztverantwortung (Anwalt/StB) UND die EU-AI-Act-
 * Pflicht zur menschlichen Aufsicht (Annex III) verlangen, dass risikoreiche
 * Aktionen NICHT autonom wirksam werden. Ein zweiter Mensch gibt frei. Eine
 * eingereichte Aktion ist ein `agent_action`-Brain-Page mit status=pending;
 * erst die Freigabe macht den referenzierten Effekt (z. B. Entwurf →
 * freigegeben) wirksam.
 */

export type ActionType =
  | "document_finalize" // KI-Schriftsatz freigeben / versandfertig
  | "deadline_create"   // Frist notieren
  | "booking_create"    // Buchung / DATEV
  | "message_send";     // beA- / E-Mail-Versand vorbereiten

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface AgentActionFrontmatter {
  type: "agent_action";
  action_type: ActionType;
  status: ApprovalStatus;
  /** Wer die Aktion vorgeschlagen hat (Agent, Automation oder Nutzer). */
  proposed_by: string;
  /** Betroffene Brain-Page, deren Effekt die Freigabe wirksam macht. */
  target_slug?: string;
  /** Menschenlesbare Beschreibung für die Queue. */
  summary: string;
  proposed_at: string;
  decided_at?: string;
  decided_by?: string;
  reject_reason?: string;
}

/** Aktionstypen, die ZWINGEND eine zweite menschliche Freigabe brauchen. */
export const REQUIRES_APPROVAL: ReadonlySet<ActionType> = new Set<ActionType>([
  "document_finalize",
  "deadline_create",
  "booking_create",
  "message_send",
]);

export function requiresApproval(type: ActionType): boolean {
  return REQUIRES_APPROVAL.has(type);
}

export const ACTION_LABELS: Record<ActionType, string> = {
  document_finalize: "Schriftsatz freigeben",
  deadline_create: "Frist notieren",
  booking_create: "Buchung anlegen",
  message_send: "Nachricht versenden",
};

/**
 * Frontmatter für eine neu eingereichte, noch nicht entschiedene Aktion.
 * Rückgabe als `Record<string, unknown>`, damit sie direkt als
 * createPage-Frontmatter taugt; die Form entspricht `AgentActionFrontmatter`
 * (status="pending").
 */
export function agentActionFrontmatter(params: {
  action_type: ActionType;
  proposed_by: string;
  summary: string;
  target_slug?: string;
  at?: Date;
}): Record<string, unknown> {
  const fm: AgentActionFrontmatter = {
    type: "agent_action",
    action_type: params.action_type,
    status: "pending",
    proposed_by: params.proposed_by,
    target_slug: params.target_slug,
    summary: params.summary,
    proposed_at: (params.at ?? new Date()).toISOString(),
  };
  return { ...fm };
}
