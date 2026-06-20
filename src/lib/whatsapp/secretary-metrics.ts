/**
 * Secretary eval gate (Paket 33, P1-SECR-006).
 *
 * Turns the proactive secretary from a marketing claim into a measurable product
 * gate. Computes — purely from audit events, no I/O — the four numbers the plan
 * pins for the WhatsApp × Superbrain USP:
 *
 *   - Consent compliance       MUST be 100% (no send without active consent)
 *   - Template-window violations  MUST be 0 (no free-form outside the 24h window)
 *   - Proactive precision       anti-spam signal (useful / rated), or null if unrated
 *   - Delivery vs block breakdown  operational health
 *
 * Source-leakage rate (= 0 for blocked matters) is covered by the permission-leak
 * tests on the inbound path (P0-SECR-002 / Paket 31), not derivable from outbound
 * audit, so it is asserted there rather than counted here.
 *
 * The function takes plain events so it is fully unit-testable; the API route maps
 * the audit log onto this shape.
 */

export interface SecretaryMetricEvent {
  action: string;
  details?: Record<string, unknown> | null;
}

export interface SecretaryMetrics {
  sent: number;
  blocked: number;
  /** sent / (sent + blocked); 0 when nothing was attempted. */
  deliveryRate: number;
  blockedByReason: Record<string, number>;
  /** Sent free-form outside the 24h window — a structural integrity breach. MUST be 0. */
  templateWindowViolations: number;
  /** Sent without recorded consent — a compliance breach. MUST be 0. */
  consentViolations: number;
  /** % consent compliance among sent messages; null when nothing was sent. */
  consentComplianceRate: number | null;
  /** From `whatsapp.briefing_feedback` events; null when nothing has been rated. */
  proactivePrecision: { rated: number; useful: number; precision: number } | null;
  /** True when both hard gates hold (no consent or template-window violations). */
  gatePass: boolean;
}

const SENT = "whatsapp.outbound_sent";
const BLOCKED = "whatsapp.outbound_blocked";
const FEEDBACK = "whatsapp.briefing_feedback";

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function computeSecretaryMetrics(events: SecretaryMetricEvent[]): SecretaryMetrics {
  let sent = 0;
  let blocked = 0;
  let templateWindowViolations = 0;
  let consentViolations = 0;
  let rated = 0;
  let useful = 0;
  const blockedByReason: Record<string, number> = {};

  for (const e of events) {
    const d = e.details ?? {};
    if (e.action === SENT) {
      sent++;
      const withinWindow = d.withinWindow === true;
      const kind = String(d.kind ?? "");
      if (!withinWindow && kind !== "template") templateWindowViolations++;
      if (d.hadConsent !== true) consentViolations++;
    } else if (e.action === BLOCKED) {
      blocked++;
      const reason = String(d.reason ?? "unknown");
      blockedByReason[reason] = (blockedByReason[reason] ?? 0) + 1;
    } else if (e.action === FEEDBACK) {
      rated++;
      if (d.useful === true) useful++;
    }
  }

  const attempted = sent + blocked;
  return {
    sent,
    blocked,
    deliveryRate: attempted === 0 ? 0 : round(sent / attempted),
    blockedByReason,
    templateWindowViolations,
    consentViolations,
    consentComplianceRate: sent === 0 ? null : round((sent - consentViolations) / sent),
    proactivePrecision: rated === 0 ? null : { rated, useful, precision: round(useful / rated) },
    gatePass: templateWindowViolations === 0 && consentViolations === 0,
  };
}
