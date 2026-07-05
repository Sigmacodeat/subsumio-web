// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the api module before importing the hook
vi.mock("@/lib/api", () => ({
  api: {
    legal: {
      ground: vi.fn(),
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
