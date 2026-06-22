/**
 * WhatsApp Business Outbound Gate (Paket 33, P1-SECR-003).
 *
 * Every business-initiated WhatsApp message must pass this gate before it is sent.
 * It encodes the three hard constraints the WhatsApp Business Platform and DSGVO /
 * Berufsrecht impose on proactive messaging:
 *
 *   1. Consent — no business-initiated message without an active opt-in for the scope.
 *   2. The 24h customer-service window — outside it, only approved templates (HSM)
 *      may be sent; inside it, free-form text is allowed.
 *   3. Quiet hours — non-urgent pushes are held during the recipient's quiet window.
 *
 * The decision function is PURE and deterministic (no I/O, no clock reads): callers
 * pass `now`, the last-inbound timestamp, consent state and the local hour, so the
 * whole matrix is unit-testable. Orchestration (loading consent/window, sending,
 * logging) lives in the guarded-send wrapper, not here.
 */

/** What a proactive message is for. Drives consent matching and urgency defaults. */
export type OutboundScope =
  | "daily_briefing"
  | "deadline_alert"
  | "approval_request"
  | "conflict_alert"
  | "new_document"
  | "client_reminder"
  | "appointment_reminder";

export type OutboundMessageKind = "freeform" | "template";

export interface QuietHours {
  /** Inclusive start hour [0..23] of the quiet window in the recipient's local time. */
  startHour: number;
  /** Exclusive end hour [0..23]. Windows may wrap midnight (e.g. 21 → 7). */
  endHour: number;
  /** The recipient's current local hour [0..23], computed by the caller. */
  localHour: number;
}

export interface OutboundEvaluation {
  now: Date;
  /** Last inbound message from this recipient, or null if none on record. */
  lastInboundAt: Date | null;
  /** Whether an active consent exists for {@link scope}. */
  hasConsent: boolean;
  scope: OutboundScope;
  /** Whether the prepared message is a free-form text or an approved template. */
  messageKind: OutboundMessageKind;
  /** Urgent messages bypass quiet hours (but never consent or the template rule). */
  urgent?: boolean;
  /** Optional quiet-hours policy; when omitted, quiet hours are not enforced. */
  quietHours?: QuietHours;
}

export type OutboundBlockReason = "no_consent" | "template_required" | "quiet_hours";

export interface OutboundDecision {
  decision: "send" | "block";
  /** True when the 24h window is closed → an approved template is mandatory. */
  mustUseTemplate: boolean;
  reason?: OutboundBlockReason;
}

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Is the 24h customer-service window still open for this recipient? */
export function isWindowOpen(now: Date, lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < WINDOW_MS;
}

/** Is `hour` inside the quiet window? Handles windows that wrap past midnight. */
export function isWithinQuietHours(q: QuietHours): boolean {
  const { startHour, endHour, localHour } = q;
  if (startHour === endHour) return false; // empty window
  if (startHour < endHour) return localHour >= startHour && localHour < endHour;
  // wraps midnight, e.g. 21 → 7
  return localHour >= startHour || localHour < endHour;
}

/**
 * Decide whether a business-initiated outbound message may be sent right now.
 * Pure and deterministic — see module docstring.
 */
export function evaluateOutbound(input: OutboundEvaluation): OutboundDecision {
  const windowOpen = isWindowOpen(input.now, input.lastInboundAt);
  const mustUseTemplate = !windowOpen;

  // 1. Consent is non-negotiable for business-initiated messages.
  if (!input.hasConsent) {
    return { decision: "block", mustUseTemplate, reason: "no_consent" };
  }

  // 2. Outside the 24h window only approved templates are permitted.
  if (mustUseTemplate && input.messageKind !== "template") {
    return { decision: "block", mustUseTemplate, reason: "template_required" };
  }

  // 3. Quiet hours hold non-urgent pushes.
  if (!input.urgent && input.quietHours && isWithinQuietHours(input.quietHours)) {
    return { decision: "block", mustUseTemplate, reason: "quiet_hours" };
  }

  return { decision: "send", mustUseTemplate };
}
