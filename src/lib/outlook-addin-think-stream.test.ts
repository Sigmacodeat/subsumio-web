// @vitest-environment node
/**
 * The Outlook add-in's "Frage an das Brain" reads the engine's /api/think
 * stream: `{chunk}` events, `{final_answer}` after verification, `[DONE]`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createThinkStreamParser } from "../../outlook-addin/src/think-stream";

const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

describe("Outlook add-in think stream", () => {
  it("assembles the answer from chunks split across packets; [DONE] is not text", () => {
    const stream =
      ev({ chunk: "Die Frist " }) +
      ev({ chunk: "beträgt 14 Tage (§ 464 ZPO)." }) +
      ev({ citations: [], warnings: [] }) +
      ev({ usage: { calls: 1 } }) +
      "data: [DONE]\n\n";
    const parser = createThinkStreamParser();
    // Feed in awkward slices: mid-JSON, mid-line.
    for (let i = 0; i < stream.length; i += 7) parser.push(stream.slice(i, i + 7));
    parser.end();
    expect(parser.state.answer).toBe("Die Frist beträgt 14 Tage (§ 464 ZPO).");
    expect(parser.state.answer).not.toContain("[DONE]");
    expect(parser.state.answer).not.toContain("{");
    expect(parser.state.done).toBe(true);
  });

  it("final_answer replaces the streamed draft", () => {
    const parser = createThinkStreamParser();
    parser.push(ev({ chunk: "Entwurf mit falschem Zitat" }));
    parser.push(ev({ final_answer: "Geprüfte Antwort", citations: [] }));
    parser.push("data: [DONE]\n\n");
    expect(parser.state.answer).toBe("Geprüfte Antwort");
    expect(parser.state.revised).toBe(true);
  });

  it("keeps the server's grounding and reports a stream error", () => {
    const parser = createThinkStreamParser();
    parser.push(ev({ grounding: { citations_verified: 2, citations_unverified: 0 } }));
    parser.push(ev({ error: "Modell nicht erreichbar" }));
    parser.end();
    expect(parser.state.grounding?.citations_verified).toBe(2);
    expect(parser.state.error).toBe("Modell nicht erreichbar");
    expect(parser.state.answer).toBe("");
  });

  it("the taskpane uses the parser and passes the server grounding on", () => {
    const src = readFileSync(
      path.join(process.cwd(), "outlook-addin", "src", "taskpane.ts"),
      "utf8"
    );
    expect(src).toContain("createThinkStreamParser()");
    expect(src).not.toMatch(/parsed\.content \|\| parsed\.text \|\| parsed\.delta/);
    expect(src).toMatch(/showAiNoticeAndGround\("queryNotice", answer, grounding\)/);
  });
});
