import { describe, it, expect } from "vitest";
import { computeSecretaryMetrics, type SecretaryMetricEvent } from "./secretary-metrics";

const sent = (details: Record<string, unknown>): SecretaryMetricEvent => ({
  action: "whatsapp.outbound_sent",
  details,
});
const blocked = (reason: string): SecretaryMetricEvent => ({
  action: "whatsapp.outbound_blocked",
  details: { reason },
});
const feedback = (useful: boolean): SecretaryMetricEvent => ({
  action: "whatsapp.briefing_feedback",
  details: { useful },
});

describe("computeSecretaryMetrics", () => {
  it("returns zeroed, passing metrics for no events", () => {
    const m = computeSecretaryMetrics([]);
    expect(m.sent).toBe(0);
    expect(m.deliveryRate).toBe(0);
    expect(m.consentComplianceRate).toBeNull();
    expect(m.proactivePrecision).toBeNull();
    expect(m.gatePass).toBe(true);
  });

  it("counts sent/blocked and computes delivery rate", () => {
    const m = computeSecretaryMetrics([
      sent({ withinWindow: true, kind: "freeform", hadConsent: true }),
      sent({ withinWindow: false, kind: "template", hadConsent: true }),
      blocked("no_consent"),
      blocked("quiet_hours"),
    ]);
    expect(m.sent).toBe(2);
    expect(m.blocked).toBe(2);
    expect(m.deliveryRate).toBe(0.5);
    expect(m.blockedByReason).toEqual({ no_consent: 1, quiet_hours: 1 });
  });

  it("compliant sends keep both hard gates green", () => {
    const m = computeSecretaryMetrics([
      sent({ withinWindow: true, kind: "freeform", hadConsent: true }),
      sent({ withinWindow: false, kind: "template", hadConsent: true }),
    ]);
    expect(m.templateWindowViolations).toBe(0);
    expect(m.consentViolations).toBe(0);
    expect(m.consentComplianceRate).toBe(1);
    expect(m.gatePass).toBe(true);
  });

  it("flags a template-window violation (free-form outside the window)", () => {
    const m = computeSecretaryMetrics([
      sent({ withinWindow: false, kind: "freeform", hadConsent: true }),
    ]);
    expect(m.templateWindowViolations).toBe(1);
    expect(m.gatePass).toBe(false);
  });

  it("flags a consent violation (sent without recorded consent)", () => {
    const m = computeSecretaryMetrics([
      sent({ withinWindow: true, kind: "freeform" }), // hadConsent missing
    ]);
    expect(m.consentViolations).toBe(1);
    expect(m.consentComplianceRate).toBe(0);
    expect(m.gatePass).toBe(false);
  });

  it("computes proactive precision from feedback", () => {
    const m = computeSecretaryMetrics([
      feedback(true),
      feedback(true),
      feedback(false),
      feedback(true),
    ]);
    expect(m.proactivePrecision).toEqual({ rated: 4, useful: 3, precision: 0.75 });
  });
});
