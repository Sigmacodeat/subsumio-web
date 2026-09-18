// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

const completeMock = vi.fn();
vi.mock("@/lib/engine-llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/engine-llm")>("@/lib/engine-llm");
  return { ...actual, engineComplete: (...a: unknown[]) => completeMock(...a) };
});
const readNormMock = vi.fn();
vi.mock("@/lib/legal-grounding", () => ({ readNorm: (...a: unknown[]) => readNormMock(...a) }));

import { checkSupport, claimFor } from "@/lib/support-check";
import type { GroundedCitation } from "@/lib/types";

describe("claimFor", () => {
  test("returns the sentence that cites the norm, not its neighbours", () => {
    const answer =
      "Der Mieter haftet. Nach § 1295 Abs. 1 ABGB haftet, wer schuldhaft Schaden zufügt. Das gilt auch hier.";
    expect(claimFor(answer, "§ 1295 ABGB")).toBeNull(); // "Abs. 1" sits between
    expect(claimFor(answer, "§ 1295 Abs. 1 ABGB")).toBe(
      "Nach § 1295 Abs. 1 ABGB haftet, wer schuldhaft Schaden zufügt."
    );
  });

  test("legal abbreviations do not end the sentence", () => {
    const answer =
      "Vorweg. Gem. § 879 ABGB iVm Z 1 lit. a ist die Klausel nichtig. Danach Schluss.";
    expect(claimFor(answer, "§ 879 ABGB")).toBe(
      "Gem. § 879 ABGB iVm Z 1 lit. a ist die Klausel nichtig."
    );
  });

  test("decisions are found in either spelling", () => {
    expect(claimFor("So OGH 1Ob49/01i zur Haftung.", "1 Ob 49/01i")).toBe(
      "So OGH 1Ob49/01i zur Haftung."
    );
  });
});

describe("checkSupport", () => {
  const verified: GroundedCitation[] = [
    { code: "ABGB", paragraph: "§ 1295", verified: true, jurisdiction: "at" },
    { code: "ABGB", paragraph: "§ 879", verified: true, jurisdiction: "at" },
    { code: "ABGB", paragraph: "§ 9999", verified: false },
  ];
  const answer =
    "Nach § 1295 ABGB haftet der Schädiger. Nach § 879 ABGB verjährt der Anspruch in drei Jahren.";

  beforeEach(() => {
    completeMock.mockReset();
    readNormMock.mockReset();
    readNormMock.mockImplementation(async (_c: string, p: string) => ({
      text:
        p === "§ 1295"
          ? "Jedermann ist berechtigt, Ersatz zu fordern."
          : "Verbotene Verträge sind nichtig.",
    }));
  });

  test("maps the model's verdicts back to the citations; unverified ones are not sent", async () => {
    completeMock.mockResolvedValue({
      text: JSON.stringify({
        results: [
          { id: "c0", verdict: "supported", reason: "Haftung aus Verschulden." },
          {
            id: "c1",
            verdict: "unsupported",
            reason: "§ 879 regelt Nichtigkeit, nicht Verjährung.",
          },
        ],
      }),
    });
    const out = await checkSupport({}, answer, verified);
    expect(out).toEqual([
      {
        code: "ABGB",
        paragraph: "§ 1295",
        support: "supported",
        support_reason: "Haftung aus Verschulden.",
      },
      {
        code: "ABGB",
        paragraph: "§ 879",
        support: "unsupported",
        support_reason: "§ 879 regelt Nichtigkeit, nicht Verjährung.",
      },
    ]);
    const prompt = completeMock.mock.calls[0][1].prompt as string;
    expect(prompt).toContain("Verbotene Verträge sind nichtig.");
    expect(prompt).not.toContain("§ 9999");
  });

  test("model down or nonsense → unchecked, never a guessed verdict", async () => {
    completeMock.mockResolvedValue(null);
    expect((await checkSupport({}, answer, verified)).map((r) => r.support)).toEqual([
      "unchecked",
      "unchecked",
    ]);
    completeMock.mockResolvedValue({ text: '{"results":[{"id":"c0","verdict":"maybe"}]}' });
    expect((await checkSupport({}, answer, verified))[0].support).toBe("unchecked");
  });

  test("no model call when no citation has both a statement and a source", async () => {
    readNormMock.mockResolvedValue(null);
    await checkSupport({}, answer, verified);
    expect(completeMock).not.toHaveBeenCalled();
  });
});
