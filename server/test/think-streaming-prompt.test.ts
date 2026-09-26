/**
 * The streamed answer (the web chat) must get the same legal rules and caller
 * instructions as the JSON path — only the JSON schema is swapped for the
 * plain-text format. Legal mode speaks as a law firm's assistant.
 */
import { describe, it, expect } from "bun:test";
import { buildStreamingSystemPrompt, buildThinkSystemPrompt } from "../src/core/think/prompt.ts";

const legal = () =>
  buildThinkSystemPrompt({ intent: "general", legalMode: true, jurisdiction: "AT" } as never);

describe("streaming system prompt", () => {
  it("keeps legal-mode rules and caller instructions, drops only the JSON schema", () => {
    const st = buildStreamingSystemPrompt(`${legal()}\n\n## CALLER INSTRUCTIONS\nPERSONA-X`, true);
    expect(st).toContain("LEGAL MODE ACTIVE");
    expect(st).toContain("PERSONA-X");
    expect(st).not.toContain("Output schema:");
    expect(st).not.toContain("Output MUST be valid JSON");
    expect(st).toContain("plain text (NOT JSON)");
  });

  it("legal mode uses the law-firm role and allows suggested next steps", () => {
    const p = legal();
    expect(p).toContain("legal research assistant of a DACH law firm");
    expect(p).toContain('"never instruct the user" rule does not apply');
  });
});
