import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isLLMDeadlineExtractionAvailable,
  hybridDeadlineDetection,
} from "@/lib/llm-deadline-extract";
import { detectDeadlines, enrichAllDeadlines } from "@/lib/ai-deadline-detect";

// The LLM fallback goes through the engine gateway client; mock that, keep
// the JSON parser real.
vi.mock("@/lib/engine-llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/engine-llm")>()),
  engineComplete: vi.fn(),
  isEngineLLMAvailable: vi.fn(() => true),
}));
import { engineComplete, isEngineLLMAvailable } from "@/lib/engine-llm";

const mockComplete = vi.mocked(engineComplete);
const mockAvail = vi.mocked(isEngineLLMAvailable);
const HEADERS = { Authorization: "Bearer test", "x-subsumio-source": "brain_test" };
const stubResult = (text: string) => ({
  text,
  model: "stub",
  provider: "stub",
  stop_reason: "end",
  usage: { input_tokens: 1, output_tokens: 1 },
  latency_ms: 1,
});

beforeEach(() => {
  mockComplete.mockReset();
  mockAvail.mockReset();
  mockAvail.mockReturnValue(true);
});

afterEach(() => {
  mockComplete.mockReset();
});

describe("llm-deadline-extract", () => {
  describe("isLLMDeadlineExtractionAvailable", () => {
    test("mirrors the engine gateway availability", () => {
      mockAvail.mockReturnValue(false);
      expect(isLLMDeadlineExtractionAvailable()).toBe(false);
      mockAvail.mockReturnValue(true);
      expect(isLLMDeadlineExtractionAvailable()).toBe(true);
    });
  });

  describe("hybridDeadlineDetection", () => {
    test("returns regex-only results when the engine LLM is not available", async () => {
      mockAvail.mockReturnValue(false);

      const text = "Berufungsfrist. Zugestellt am 15.03.2024.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected, HEADERS);

      // Should not call LLM, should return regex results as-is
      expect(mockComplete).not.toHaveBeenCalled();
      expect(result).toEqual(regexDetected);
    });

    test("returns regex-only results when regex finds enough high-confidence deadlines", async () => {
      // Text with clear Berufung + Zustellungsdatum → regex finds high-confidence
      // Keep under 500 chars so LLM threshold (highConf < 3 && text > 500) is not triggered
      const text =
        "Berufungsfrist. Zugestellt am 15.03.2024. Klagebeantwortungsfrist. Zugestellt am 20.03.2024.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const highConf = regexDetected.filter((d) => d.confidence === "high");
      expect(highConf.length).toBeGreaterThanOrEqual(2);

      const result = await hybridDeadlineDetection(text, regexDetected, HEADERS);
      expect(mockComplete).not.toHaveBeenCalled();
      expect(result).toEqual(regexDetected);
    });

    test("calls LLM when regex finds 0 high-confidence deadlines", async () => {
      // Complex text without standard regex patterns
      const text =
        "Der Kläger hat binnen der sich aus § 401 Abs 1 ZPO ergebenden Frist zu reagieren. Die Parteien werden auf die Rechtsmittelbelehrung hingewiesen.";

      mockComplete.mockResolvedValueOnce(
        stubResult(
          JSON.stringify([
            {
              frist_key: "berufung",
              frist_beschreibung: "Berufungsfrist",
              zustellungsdatum: "2024-06-01",
              absolutes_datum: null,
              tage_relativ: null,
              rechtsgrundlage: "§ 464 Abs 1 ZPO",
              snippet: "binnen der sich aus § 401 Abs 1 ZPO ergebenden Frist",
              confidence: "medium",
            },
          ])
        )
      );

      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected, HEADERS);

      expect(mockComplete).toHaveBeenCalledTimes(1);
      const llmResults = result.filter((d) => d.matchedRule === "llm_fallback");
      expect(llmResults.length).toBeGreaterThan(0);
    });

    test("deduplicates LLM results that overlap with regex results", async () => {
      const text = "Berufungsfrist. Zugestellt am 15.03.2024.";

      mockComplete.mockResolvedValueOnce(
        stubResult(
          JSON.stringify([
            {
              frist_key: "berufung",
              frist_beschreibung: "Berufungsfrist",
              zustellungsdatum: "2024-03-15",
              absolutes_datum: null,
              tage_relativ: null,
              rechtsgrundlage: "§ 464 Abs 1 ZPO",
              snippet: "Berufungsfrist. Zugestellt am 15.03.2024.",
              confidence: "high",
            },
            {
              frist_key: "verjaehrung_kurz",
              frist_beschreibung: "Verjährungsfrist 3 Jahre",
              zustellungsdatum: null,
              absolutes_datum: "2024-01-15",
              tage_relativ: null,
              rechtsgrundlage: "§ 1489 ABGB",
              snippet: "Verjährung 3 Jahre ab Kenntnis",
              confidence: "low",
            },
          ])
        )
      );

      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      // Force LLM call by making text long and high-confidence count low
      const longText = text + " ".repeat(600);
      const result = await hybridDeadlineDetection(longText, regexDetected, HEADERS);

      // The Berufung should be deduplicated (same template + zustellungsdatum)
      const _llmResults = result.filter((d) => d.matchedRule === "llm_fallback");
      const berufs = result.filter((d) => d.suggestedTemplate === "berufung");
      // At most 1 Berufung from LLM (deduplicated)
      expect(berufs.filter((d) => d.matchedRule === "llm_fallback").length).toBe(0);
    });

    test("handles LLM API error gracefully", async () => {
      mockComplete.mockResolvedValueOnce(null);

      const text = "Ein komplexer Text ohne klare Regex-Muster.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected, HEADERS);

      // Should return regex results, not throw
      expect(result).toEqual(regexDetected);
    });

    test("handles LLM returning invalid JSON gracefully", async () => {
      mockComplete.mockResolvedValueOnce(stubResult("This is not valid JSON"));

      const text = "Ein komplexer Text ohne klare Regex-Muster.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected, HEADERS);

      expect(result).toEqual(regexDetected);
    });

    test("handles LLM returning empty array", async () => {
      mockComplete.mockResolvedValueOnce(stubResult("[]"));

      const text = "Ein komplexer Text ohne klare Regex-Muster.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected, HEADERS);

      expect(result).toEqual(regexDetected);
    });

    test("LLM result with frist_key gets frist-engine enrichment", async () => {
      mockComplete.mockResolvedValueOnce(
        stubResult(
          JSON.stringify([
            {
              frist_key: "berufung",
              frist_beschreibung: "Berufungsfrist",
              zustellungsdatum: "2024-03-15",
              absolutes_datum: null,
              tage_relativ: null,
              rechtsgrundlage: "§ 464 Abs 1 ZPO",
              snippet: "Rechtsmittelbelehrung weist auf vierwöchige Frist hin.",
              confidence: "medium",
            },
          ])
        )
      );

      const text =
        "Rechtsmittelbelehrung weist auf vierwöchige Frist hin. Zustellung erfolgte am 15.03.2024.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected, HEADERS);

      const llmResult = result.find((d) => d.matchedRule === "llm_fallback");
      expect(llmResult).toBeDefined();
      expect(llmResult!.fristResult).toBeDefined();
      expect(llmResult!.fristResult!.art.key).toBe("berufung");
      expect(llmResult!.fristResult!.fristende).toBe("2024-04-12");
      expect(llmResult!.confidence).toBe("high"); // Upgraded by frist-engine
    });
  });
});
