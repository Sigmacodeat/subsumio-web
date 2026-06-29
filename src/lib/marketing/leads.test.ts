// @vitest-environment node

import { describe, test, expect } from "vitest";
import { summarizeLead } from "./leads";

describe("summarizeLead", () => {
  test("includes product, plan and score", () => {
    const summary = summarizeLead({
      email: "lead@example.com",
      lang: "de",
      path: "/pricing",
      industry: "law",
      product: "Copilot",
      plan: "team",
      leadScore: "high",
      fields: { size: "10", seats: "5" },
      transcript: [{ role: "user", content: "Ich brauche 5 Seats." }],
    });
    expect(summary).toContain("Copilot");
    expect(summary).toContain("team");
    expect(summary).toContain("high");
  });

  test("includes qualification fields", () => {
    const summary = summarizeLead({
      email: "lead@example.com",
      lang: "de",
      path: "/pricing",
      industry: "law",
      product: "Copilot",
      plan: "team",
      leadScore: "high",
      fields: { size: "10", seats: "5" },
      transcript: [],
    });
    expect(summary).toContain("Qualification: size: 10, seats: 5");
  });

  test("marks incomplete qualification when no fields", () => {
    const summary = summarizeLead({
      email: "lead@example.com",
      lang: "de",
      path: "/pricing",
      industry: "law",
      product: "Copilot",
      plan: "team",
      leadScore: "high",
      fields: {},
      transcript: [],
    });
    expect(summary).toContain("Qualification: not complete");
  });

  test("truncates latest user ask", () => {
    const longAsk = "a".repeat(300);
    const summary = summarizeLead({
      email: "lead@example.com",
      lang: "de",
      path: "/pricing",
      industry: "law",
      product: "Copilot",
      plan: "team",
      leadScore: "high",
      fields: {},
      transcript: [
        { role: "assistant", content: "Hi" },
        { role: "user", content: longAsk },
      ],
    });
    expect(summary).toContain("Latest ask:");
    expect(summary.length).toBeLessThan(longAsk.length + 200);
  });
});
