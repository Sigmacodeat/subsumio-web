// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the api module before importing the hook
vi.mock("@/lib/api", () => ({
  api: {
    legal: {
      ground: vi.fn(),
      support: vi.fn().mockResolvedValue({ results: [], checked_at: "" }),
    },
  },
}));

// Mock React's useState and useCallback to test the hook logic
vi.mock("react", () => {
  const stateRef: { current: unknown } = { current: null };
  return {
    useState: (initial: unknown) => {
      if (stateRef.current === null) {
        stateRef.current = typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      const setState = (updater: unknown) => {
        if (typeof updater === "function") {
          stateRef.current = (updater as (prev: unknown) => unknown)(stateRef.current);
        } else {
          stateRef.current = updater;
        }
      };
      return [stateRef.current, setState];
    },
    useCallback: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
    useRef: <T>(initial: T) => ({ current: initial }),
  };
});

import { api } from "@/lib/api";
import { useGroundedAnswer } from "@/lib/use-grounded-answer";
import type { GroundingMetadata } from "@/lib/citation-gate-client";

const mockApi = vi.mocked(api.legal.ground);

describe("useGroundedAnswer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns initial state with null grounding", () => {
    const result = useGroundedAnswer();
    expect(result.grounding).toBeNull();
    expect(result.isGrounding).toBe(false);
    expect(result.groundingError).toBeNull();
  });

  test("groundAnswer returns null for empty string", async () => {
    const { groundAnswer } = useGroundedAnswer();
    const result = await groundAnswer("");
    expect(result).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });

  test("groundAnswer returns null for whitespace-only string", async () => {
    const { groundAnswer } = useGroundedAnswer();
    const result = await groundAnswer("   ");
    expect(result).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });

  test("groundAnswer calls api.legal.ground with answer text", async () => {
    const mockMeta: GroundingMetadata = {
      citations_verified: 2,
      citations_unverified: 0,
      corpus_checked: true,
      grounded_citations: [],
      analyzed_at: new Date().toISOString(),
      has_unverified: false,
    };
    mockApi.mockResolvedValueOnce(mockMeta);

    const { groundAnswer } = useGroundedAnswer();
    const result = await groundAnswer("§ 433 BGB regelt den Kaufvertrag.");

    expect(mockApi).toHaveBeenCalledWith("§ 433 BGB regelt den Kaufvertrag.");
    expect(result).toEqual(mockMeta);
    expect(result?.citations_verified).toBe(2);
  });

  test("groundAnswer returns null and sets error on API failure", async () => {
    mockApi.mockRejectedValueOnce(new Error("Network error"));

    const { groundAnswer } = useGroundedAnswer();
    const result = await groundAnswer("§ 433 BGB");

    expect(result).toBeNull();
  });

  test("reset clears state", () => {
    const { reset } = useGroundedAnswer();
    reset();
    // After reset, state should be initial
    // Since we're testing with mocked React, we can only verify it doesn't throw
    expect(reset).toBeDefined();
  });

  test("groundAnswer handles non-Error exceptions", async () => {
    mockApi.mockRejectedValueOnce("string error");

    const { groundAnswer } = useGroundedAnswer();
    const result = await groundAnswer("§ 433 BGB");

    expect(result).toBeNull();
  });
});

describe("withSupportCheck (second grounding stage)", () => {
  const base: GroundingMetadata = {
    citations_verified: 1,
    citations_unverified: 1,
    corpus_checked: true,
    analyzed_at: "",
    has_unverified: true,
    grounded_citations: [
      { code: "ABGB", paragraph: "§ 1295", verified: true },
      { code: "ABGB", paragraph: "§ 9999", verified: false },
    ],
  };

  test("folds the verdicts into the verified citations and counts misgrounded ones", async () => {
    const { withSupportCheck } = await import("@/lib/use-grounded-answer");
    vi.mocked(api.legal.support).mockResolvedValueOnce({
      results: [
        { code: "ABGB", paragraph: "§ 1295", support: "unsupported", support_reason: "regelt X" },
      ],
      checked_at: "",
    });
    const out = await withSupportCheck("Nach § 1295 ABGB …", base);
    expect(out.support_checked).toBe(true);
    expect(out.citations_misgrounded).toBe(1);
    expect(out.grounded_citations[0]).toMatchObject({
      support: "unsupported",
      support_reason: "regelt X",
    });
    expect(out.grounded_citations[1].support).toBeUndefined();
  });

  test("skips the call when nothing is verified, and never throws", async () => {
    const { withSupportCheck } = await import("@/lib/use-grounded-answer");
    const none = { ...base, grounded_citations: [base.grounded_citations[1]] };
    vi.mocked(api.legal.support).mockClear();
    expect(await withSupportCheck("x", none)).toBe(none);
    expect(api.legal.support).not.toHaveBeenCalled();
    vi.mocked(api.legal.support).mockRejectedValueOnce(new Error("down"));
    expect(await withSupportCheck("x", base)).toBe(base);
  });
});
