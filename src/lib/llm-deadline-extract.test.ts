import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { isLLMDeadlineExtractionAvailable, hybridDeadlineDetection } from "@/lib/llm-deadline-extract";
import { detectDeadlines, enrichAllDeadlines } from "@/lib/ai-deadline-detect";

// Mock fetch and env
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("llm-deadline-extract", () => {
  describe("isLLMDeadlineExtractionAvailable", () => {
    test("returns false without API key", () => {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_API_KEY_FALLBACK;
      expect(isLLMDeadlineExtractionAvailable()).toBe(false);
    });

    test("returns true with OPENROUTER_API_KEY", () => {
      process.env.OPENROUTER_API_KEY = "sk-test-key";
      expect(isLLMDeadlineExtractionAvailable()).toBe(true);
    });

    test("returns true with OPENROUTER_API_KEY_FALLBACK", () => {
      delete process.env.OPENROUTER_API_KEY;
      process.env.OPENROUTER_API_KEY_FALLBACK = "sk-fallback-key";
      expect(isLLMDeadlineExtractionAvailable()).toBe(true);
    });
  });

  describe("hybridDeadlineDetection", () => {
    test("returns regex-only results when LLM key not available", async () => {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_API_KEY_FALLBACK;

      const text = "Berufungsfrist. Zugestellt am 15.03.2024.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected);

      // Should not call LLM, should return regex results as-is
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual(regexDetected);
    });

    test("returns regex-only results when regex finds enough high-confidence deadlines", async () => {
      process.env.OPENROUTER_API_KEY = "sk-test-key";

      // Text with clear Berufung + Zustellungsdatum → regex finds high-confidence
      // Keep under 500 chars so LLM threshold (highConf < 3 && text > 500) is not triggered
      const text = "Berufungsfrist. Zugestellt am 15.03.2024. Klagebeantwortungsfrist. Zugestellt am 20.03.2024.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const highConf = regexDetected.filter((d) => d.confidence === "high");
      expect(highConf.length).toBeGreaterThanOrEqual(2);

      const result = await hybridDeadlineDetection(text, regexDetected);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual(regexDetected);
    });

    test("calls LLM when regex finds 0 high-confidence deadlines", async () => {
      process.env.OPENROUTER_API_KEY = "sk-test-key";

      // Complex text without standard regex patterns
      const text = "Der Kläger hat binnen der sich aus § 401 Abs 1 ZPO ergebenden Frist zu reagieren. Die Parteien werden auf die Rechtsmittelbelehrung hingewiesen.";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify([
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
              ]),
            },
          }],
        }),
      });

      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const llmResults = result.filter((d) => d.matchedRule === "llm_fallback");
      expect(llmResults.length).toBeGreaterThan(0);
    });

    test("deduplicates LLM results that overlap with regex results", async () => {
      process.env.OPENROUTER_API_KEY = "sk-test-key";

      const text = "Berufungsfrist. Zugestellt am 15.03.2024.";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify([
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
              ]),
            },
          }],
        }),
      });

      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      // Force LLM call by making text long and high-confidence count low
      const longText = text + " ".repeat(600);
      const result = await hybridDeadlineDetection(longText, regexDetected);

      // The Berufung should be deduplicated (same template + zustellungsdatum)
      const llmResults = result.filter((d) => d.matchedRule === "llm_fallback");
      const berufs = result.filter((d) => d.suggestedTemplate === "berufung");
      // At most 1 Berufung from LLM (deduplicated)
      expect(berufs.filter((d) => d.matchedRule === "llm_fallback").length).toBe(0);
    });

    test("handles LLM API error gracefully", async () => {
      process.env.OPENROUTER_API_KEY = "sk-test-key";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Rate Limited",
        json: async () => ({}),
      });

      const text = "Ein komplexer Text ohne klare Regex-Muster.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected);

      // Should return regex results, not throw
      expect(result).toEqual(regexDetected);
    });

    test("handles LLM returning invalid JSON gracefully", async () => {
      process.env.OPENROUTER_API_KEY = "sk-test-key";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: "This is not valid JSON",
            },
          }],
        }),
      });

      const text = "Ein komplexer Text ohne klare Regex-Muster.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected);

      expect(result).toEqual(regexDetected);
    });

    test("handles LLM returning empty array", async () => {
      process.env.OPENROUTER_API_KEY = "sk-test-key";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: "[]",
            },
          }],
        }),
      });

      const text = "Ein komplexer Text ohne klare Regex-Muster.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected);

      expect(result).toEqual(regexDetected);
    });

    test("LLM result with frist_key gets frist-engine enrichment", async () => {
      process.env.OPENROUTER_API_KEY = "sk-test-key";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify([
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
              ]),
            },
          }],
        }),
      });

      const text = "Rechtsmittelbelehrung weist auf vierwöchige Frist hin. Zustellung erfolgte am 15.03.2024.";
      const regexDetected = enrichAllDeadlines(detectDeadlines(text), text);
      const result = await hybridDeadlineDetection(text, regexDetected);

      const llmResult = result.find((d) => d.matchedRule === "llm_fallback");
      expect(llmResult).toBeDefined();
      expect(llmResult!.fristResult).toBeDefined();
      expect(llmResult!.fristResult!.art.key).toBe("berufung");
      expect(llmResult!.fristResult!.fristende).toBe("2024-04-12");
      expect(llmResult!.confidence).toBe("high"); // Upgraded by frist-engine
    });
  });
});
