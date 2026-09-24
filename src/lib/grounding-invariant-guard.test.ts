// @vitest-environment node

import { describe, test, expect } from "vitest";
import { checkSource, scanRepository } from "../../scripts/check-grounding-invariant";
import { AI_BADGE_LABEL, AI_NOTICE } from "./ai-act";

describe("check-grounding-invariant — rule", () => {
  test("an AI call without hook/panel is a violation", () => {
    expect(checkSource("const r = await api.legal.translate(x); return <p>{r.text}</p>;")).toBe(
      "violation"
    );
  });

  test("GroundedOutputPanel satisfies it", () => {
    expect(checkSource("await api.query.think(q); <GroundedOutputPanel text={answer} />")).toBe(
      "ok"
    );
  });

  test("a CitationPanel without any grounding source does not", () => {
    expect(checkSource("await api.legal.deepAnalysis(x); <CitationPanel data={{}} />")).toBe(
      "violation"
    );
  });

  test("server-side gate result fed into the panel counts", () => {
    expect(
      checkSource(
        "const r = await api.legal.analyzeDocument(x); <CitationPanel data={{ grounding: r._grounding }} />"
      )
    ).toBe("ok");
  });

  test("an explicit, reasoned exemption is honoured; files without AI calls are ignored", () => {
    expect(checkSource("// grounding-exempt: only starts a job\napi.legal.caseScan(x)")).toBe(
      "exempt"
    );
    expect(checkSource("api.legal.fristen()")).toBe("no-ai");
  });
});

describe("check-grounding-invariant — Office add-ins", () => {
  const grounded = `fetch(\`\${API_BASE}/api/legal/ground\`); "${AI_BADGE_LABEL}"; "${AI_NOTICE}"`;

  test("an add-in /api/think call needs the ground route and the AI Act texts", () => {
    const call = "await fetch(`${API_BASE}/api/think`, { method: 'POST' });";
    expect(checkSource(call, "addin")).toBe("violation");
    expect(checkSource(`${call}\n${grounded}`, "addin")).toBe("ok");
  });

  test("a drifted AI notice text is a violation", () => {
    const call = "await apiPost('/api/legal/analyze', {});";
    expect(
      checkSource(`${call} fetch('/api/legal/ground'); "${AI_BADGE_LABEL}"; "KI-Entwurf"`, "addin")
    ).toBe("violation");
  });

  test("widened web patterns: research, portal chat, review-table ask, memo generate", () => {
    for (const call of [
      'fetch("/api/legal/research", {})',
      "csrfFetch(`/api/portal/chat`)",
      'fetch("/api/review-table/ask")',
      'fetch("/api/work-products/memo/generate")',
      'fetch("/api/legal/submission-review")',
    ]) {
      expect(checkSource(`${call}; return <p>{text}</p>;`), call).toBe("violation");
    }
  });
});

describe("check-grounding-invariant — this repository", () => {
  test("every UI surface (web + Office add-ins) that requests AI legal text is grounded", () => {
    const { aiSurfaces, violations } = scanRepository();
    expect(violations).toEqual([]);
    // The add-ins are scanned, not silently skipped.
    expect(aiSurfaces).toEqual(
      expect.arrayContaining(["word-addin/src/taskpane.ts", "outlook-addin/src/taskpane.ts"])
    );
  });
});
