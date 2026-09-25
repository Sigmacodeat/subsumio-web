import { describe, it, expect } from "vitest";
import {
  evaluateOutbound,
  isWindowOpen,
  isWithinQuietHours,
  viennaLocalHour,
  WINDOW_MS,
  type OutboundEvaluation,
} from "./outbound-gate";

const NOW = new Date("2026-06-20T12:00:00.000Z");

function base(over: Partial<OutboundEvaluation> = {}): OutboundEvaluation {
  return {
    now: NOW,
    lastInboundAt: new Date(NOW.getTime() - 60_000), // 1 min ago → window open
    hasConsent: true,
    scope: "deadline_alert",
    messageKind: "freeform",
    ...over,
  };
}

describe("isWindowOpen", () => {
  it("is open just under 24h", () => {
    expect(isWindowOpen(NOW, new Date(NOW.getTime() - (WINDOW_MS - 1000)))).toBe(true);
  });
  it("is closed at exactly 24h", () => {
    expect(isWindowOpen(NOW, new Date(NOW.getTime() - WINDOW_MS))).toBe(false);
  });
  it("is closed with no inbound on record", () => {
    expect(isWindowOpen(NOW, null)).toBe(false);
  });
});

describe("isWithinQuietHours", () => {
  it("handles a normal daytime window", () => {
    expect(isWithinQuietHours({ startHour: 9, endHour: 17, localHour: 12 })).toBe(true);
    expect(isWithinQuietHours({ startHour: 9, endHour: 17, localHour: 8 })).toBe(false);
  });
  it("handles a window that wraps midnight (21 → 7)", () => {
    expect(isWithinQuietHours({ startHour: 21, endHour: 7, localHour: 23 })).toBe(true);
    expect(isWithinQuietHours({ startHour: 21, endHour: 7, localHour: 3 })).toBe(true);
    expect(isWithinQuietHours({ startHour: 21, endHour: 7, localHour: 12 })).toBe(false);
  });
  it("treats an empty window as never quiet", () => {
    expect(isWithinQuietHours({ startHour: 8, endHour: 8, localHour: 8 })).toBe(false);
  });
});

describe("evaluateOutbound", () => {
  it("sends free-form inside the open window with consent", () => {
    const d = evaluateOutbound(base());
    expect(d).toEqual({ decision: "send", mustUseTemplate: false });
  });

  it("blocks without consent regardless of window", () => {
    const d = evaluateOutbound(base({ hasConsent: false }));
    expect(d.decision).toBe("block");
    expect(d.reason).toBe("no_consent");
  });

  it("blocks free-form outside the window (template required)", () => {
    const d = evaluateOutbound(base({ lastInboundAt: null, messageKind: "freeform" }));
    expect(d.decision).toBe("block");
    expect(d.reason).toBe("template_required");
    expect(d.mustUseTemplate).toBe(true);
  });

  it("sends a template outside the window", () => {
    const d = evaluateOutbound(base({ lastInboundAt: null, messageKind: "template" }));
    expect(d).toEqual({ decision: "send", mustUseTemplate: true });
  });

  it("blocks non-urgent messages during quiet hours", () => {
    const d = evaluateOutbound(base({ quietHours: { startHour: 21, endHour: 7, localHour: 23 } }));
    expect(d.decision).toBe("block");
    expect(d.reason).toBe("quiet_hours");
  });

  it("lets urgent messages through quiet hours", () => {
    const d = evaluateOutbound(
      base({ urgent: true, quietHours: { startHour: 21, endHour: 7, localHour: 23 } })
    );
    expect(d.decision).toBe("send");
  });

  it("consent precedence: no_consent beats template_required and quiet_hours", () => {
    const d = evaluateOutbound(
      base({
        hasConsent: false,
        lastInboundAt: null,
        messageKind: "freeform",
        quietHours: { startHour: 21, endHour: 7, localHour: 23 },
      })
    );
    expect(d.reason).toBe("no_consent");
  });
});

describe("viennaLocalHour — quiet hours in the recipient's time, not the server's", () => {
  it("22:30 in Vienna (summer, 20:30 UTC) is inside 21–8", () => {
    const hour = viennaLocalHour(new Date("2026-07-01T20:30:00Z"));
    expect(hour).toBe(22);
    expect(isWithinQuietHours({ startHour: 21, endHour: 8, localHour: hour })).toBe(true);
  });

  it("07:30 in Vienna (summer, 05:30 UTC) is still quiet; 08:30 is not", () => {
    expect(viennaLocalHour(new Date("2026-07-01T05:30:00Z"))).toBe(7);
    expect(viennaLocalHour(new Date("2026-07-01T06:30:00Z"))).toBe(8);
  });

  it("winter time: 20:30 UTC is 21:30 in Vienna", () => {
    expect(viennaLocalHour(new Date("2026-01-15T20:30:00Z"))).toBe(21);
  });
});
