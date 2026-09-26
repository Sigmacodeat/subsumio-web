import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isLLMDeadlineExtractionAvailable,
  hybridDeadlineDetection,
  extractDeadlinesWithLLM,
  dropUngroundedDates,
  readDeadlineList,
  clipForDeadlineModel,
  type LlmCallMeta,
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

  describe("reference date", () => {
    const item = (absolutes_datum: string | null, zustellungsdatum: string | null = null) => ({
      frist_key: null,
      frist_beschreibung: "Frist zur Stellungnahme",
      zustellungsdatum,
      absolutes_datum,
      tage_relativ: null,
      rechtsgrundlage: null,
      snippet: "spätestens am dritten Oktober dieses Jahres",
      confidence: "medium" as const,
    });

    test("the model is told the date the text refers to", async () => {
      mockComplete.mockResolvedValue(stubResult("[]"));
      await extractDeadlinesWithLLM("Frist bis dritten Oktober dieses Jahres", {
        headers: HEADERS,
        referenceDate: "2026-09-17T10:46:14.000Z",
      });
      expect(mockComplete.mock.calls[0][1].prompt).toContain("BEZUGSDATUM: 2026-09-17");
    });

    test("a guessed year is dropped instead of becoming a deadline", async () => {
      mockComplete.mockResolvedValue(stubResult(JSON.stringify([item("2024-10-03")])));
      const [d] = await extractDeadlinesWithLLM("spätestens am dritten Oktober dieses Jahres", {
        headers: HEADERS,
        referenceDate: "2026-09-17",
      });
      expect(d.date).toBeUndefined();
      expect(d.confidence).toBe("low");
    });

    test("keeps the reference year, the following year and years written in the text", () => {
      expect(dropUngroundedDates(item("2026-10-03"), "", "2026-09-17").absolutes_datum).toBe(
        "2026-10-03"
      );
      expect(dropUngroundedDates(item("2027-01-15"), "", "2026-12-20").absolutes_datum).toBe(
        "2027-01-15"
      );
      expect(
        dropUngroundedDates(item(null, "2024-03-15"), "zugestellt am 15.03.2024", "2026-09-17")
          .zustellungsdatum
      ).toBe("2024-03-15");
      expect(dropUngroundedDates(item("kein Datum"), "", "2026-09-17").absolutes_datum).toBeNull();
    });
  });

  describe("KI3-02: Ausgabeformat, Fehler, Kürzung, Bezugsdatum", () => {
    const berufung = {
      frist_key: "berufung",
      frist_beschreibung: "Berufungsfrist",
      zustellungsdatum: "2024-03-15",
      absolutes_datum: null,
      tage_relativ: null,
      rechtsgrundlage: null,
      snippet: "zugestellt am 15.03.2024",
      confidence: "medium",
    };
    const text = "Das Urteil wurde am 15.03.2024 zugestellt.";

    test("der Prompt verlangt ein Objekt mit Array-Feld „fristen“", async () => {
      mockComplete.mockResolvedValue(stubResult('{"fristen": []}'));
      await extractDeadlinesWithLLM(text, { headers: HEADERS, referenceDate: "2024-03-20" });
      expect(mockComplete.mock.calls[0][1].system).toContain('{"fristen": []}');
      expect(mockComplete.mock.calls[0][1].system).not.toContain("JSON-Array, jedes Element");
    });

    test("ein einzelnes Frist-Objekt (statt Array) wird nicht verworfen", async () => {
      mockComplete.mockResolvedValue(stubResult(JSON.stringify(berufung)));
      const result = await extractDeadlinesWithLLM(text, {
        headers: HEADERS,
        referenceDate: "2024-03-20",
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.suggestedTemplate).toBe("berufung");
    });

    test("{fristen: [...]} und nacktes Array werden gleich gelesen", () => {
      expect(readDeadlineList({ fristen: [berufung] })).toHaveLength(1);
      expect(readDeadlineList([berufung])).toHaveLength(1);
      expect(readDeadlineList({ deadlines: [berufung] })).toHaveLength(1);
      expect(readDeadlineList({ fristen: [] })).toEqual([]);
      expect(readDeadlineList({ antwort: "keine" })).toBeNull();
      expect(readDeadlineList(null)).toBeNull();
    });

    test("unlesbare Antwort ist „fehlgeschlagen“, nicht „keine Frist“", async () => {
      mockComplete.mockResolvedValue(stubResult("Ich habe keine Fristen gefunden."));
      const meta: LlmCallMeta = {};
      const result = await extractDeadlinesWithLLM(text, { headers: HEADERS, meta });
      expect(result).toEqual([]);
      expect(meta.status).toBe("failed");
      expect(meta.modelCalled).toBe(true);
    });

    test("keine Antwort des Gateways ist „fehlgeschlagen“", async () => {
      mockComplete.mockResolvedValue(null);
      const meta: LlmCallMeta = {};
      await extractDeadlinesWithLLM(text, { headers: HEADERS, meta });
      expect(meta.status).toBe("failed");
    });

    test("leere Liste ist ein gültiges Ergebnis", async () => {
      mockComplete.mockResolvedValue(stubResult('{"fristen": []}'));
      const meta: LlmCallMeta = {};
      await extractDeadlinesWithLLM(text, { headers: HEADERS, meta });
      expect(meta.status).toBe("ok");
    });

    test("langer Text: Schluss (Rechtsmittelbelehrung) bleibt drin, Auslassung wird gemeldet", async () => {
      const long = `${"A".repeat(20_000)} RECHTSMITTELBELEHRUNG: Berufung binnen vier Wochen.`;
      const clipped = clipForDeadlineModel(long);
      expect(clipped.omittedChars).toBeGreaterThan(0);
      expect(clipped.text).toContain("RECHTSMITTELBELEHRUNG");
      expect(clipped.text.length).toBeLessThan(10_100);

      mockComplete.mockResolvedValue(stubResult('{"fristen": []}'));
      const meta: LlmCallMeta = {};
      await extractDeadlinesWithLLM(long, { headers: HEADERS, meta });
      expect(mockComplete.mock.calls[0][1].prompt).toContain("RECHTSMITTELBELEHRUNG");
      expect(meta.omittedChars).toBe(clipped.omittedChars);
      expect(clipForDeadlineModel("kurz").omittedChars).toBe(0);
    });

    test("hybridDeadlineDetection gibt das Bezugsdatum an das Modell weiter", async () => {
      mockComplete.mockResolvedValue(stubResult('{"fristen": []}'));
      await hybridDeadlineDetection("Frist bis 15. April", [], HEADERS, {
        referenceDate: "2026-03-02",
      });
      expect(mockComplete.mock.calls[0][1].prompt).toContain("BEZUGSDATUM: 2026-03-02");
    });

    test("ein genanntes Fristende wird nicht als Zustelldatum weitergerechnet", async () => {
      mockComplete.mockResolvedValue(
        stubResult(
          JSON.stringify({
            fristen: [
              {
                ...berufung,
                zustellungsdatum: null,
                absolutes_datum: "2026-10-15",
                snippet: "Die Frist endet am 15.10.2026.",
              },
            ],
          })
        )
      );
      const [d] = await extractDeadlinesWithLLM("Die Frist endet am 15.10.2026.", {
        headers: HEADERS,
        referenceDate: "2026-09-26",
      });
      expect(d!.date).toBe("2026-10-15");
      expect(d!.fristResult).toBeUndefined();
    });

    test("Widerspruch zwischen genanntem Fristende und Berechnung wird angezeigt, nicht überschrieben", async () => {
      mockComplete.mockResolvedValue(
        stubResult(JSON.stringify({ fristen: [{ ...berufung, absolutes_datum: "2024-04-30" }] }))
      );
      const [d] = await extractDeadlinesWithLLM(text, {
        headers: HEADERS,
        referenceDate: "2024-03-20",
      });
      expect(d!.date).toBe("2024-04-30");
      expect(d!.confidence).toBe("medium");
      expect(d!.fristResult!.hinweise.join(" ")).toContain("Abweichung");
    });
  });
});
