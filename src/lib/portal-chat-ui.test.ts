import { describe, expect, it } from "vitest";
import { buildEscalationMessage, portalErrorText, PORTAL_MESSAGE_MAX } from "./portal-chat-ui";

describe("portal escalation message", () => {
  it("three 2,000-character answers still fit the message limit", () => {
    const long = "A".repeat(2_000);
    const msg = buildEscalationMessage([
      { role: "user", text: "Frage 1" },
      { role: "bot", text: long },
      { role: "user", text: "Frage 2" },
      { role: "bot", text: long },
      { role: "user", text: "Frage 3" },
      { role: "bot", text: long },
    ]);
    expect(msg.length).toBeLessThanOrEqual(PORTAL_MESSAGE_MAX);
    expect(msg.startsWith("[Eskalation aus Portal-Chat]")).toBe(true);
    // The newest part is kept, older parts are marked as shortened.
    expect(msg).toContain("Frage 3");
    expect(msg).toContain("gekürzt");
  });

  it("a short chat is forwarded completely", () => {
    const msg = buildEscalationMessage([
      { role: "user", text: "Wann ist die Verhandlung?" },
      { role: "bot", text: "Am 3. Oktober." },
    ]);
    expect(msg).toBe(
      "[Eskalation aus Portal-Chat]\n\nMandant: Wann ist die Verhandlung?\nBot: Am 3. Oktober."
    );
  });

  it("a single over-long message is shortened, not dropped", () => {
    const msg = buildEscalationMessage([{ role: "user", text: "B".repeat(9_000) }]);
    expect(msg.length).toBeLessThanOrEqual(PORTAL_MESSAGE_MAX);
    expect(msg).toContain("Mandant: BBB");
  });
});

describe("portal error text", () => {
  it("shows the route's German error text (e.g. a 429 daily limit)", () => {
    expect(
      portalErrorText(
        { error: "Für heute sind keine weiteren Fragen möglich.", code: "daily_limit_reached" },
        "Fallback"
      )
    ).toBe("Für heute sind keine weiteren Fragen möglich.");
    expect(portalErrorText({ message: "Zu viele Anfragen" }, "Fallback")).toBe("Zu viele Anfragen");
  });

  it("falls back for machine codes or unreadable bodies", () => {
    expect(portalErrorText({ error: "validation_failed" }, "Fallback")).toBe("Fallback");
    expect(portalErrorText(null, "Fallback")).toBe("Fallback");
  });
});
