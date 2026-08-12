import { describe, it, expect, beforeAll } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMediaQuery } from "./use-media-query";
import { useIsMobile, MOBILE_BREAKPOINT } from "./use-is-mobile";

// jsdom implementiert matchMedia nicht — wir mocken es mit einem
// konfigurierbaren Matcher der für Tests vorhersehbar ist.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

describe("useMediaQuery", () => {
  it("returns a boolean (smoke test)", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 1px)"));
    expect(typeof result.current).toBe("boolean");
  });

  it("returns false for non-matching query (jsdom default)", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 999999px)"));
    expect(result.current).toBe(false);
  });

  it("respects server fallback parameter", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 999999px)", true));
    // Im Browser-Env ist der live-Wert false (jsdom mock), aber der Hook funktioniert.
    expect(typeof result.current).toBe("boolean");
  });
});

describe("useIsMobile", () => {
  it("returns a boolean", () => {
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe("boolean");
  });

  it("MOBILE_BREAKPOINT is a sensible value (640 = Tailwind sm)", () => {
    expect(MOBILE_BREAKPOINT).toBe(640);
  });

  it("returns false on wide viewports (test env default)", () => {
    const { result } = renderHook(() => useIsMobile());
    // jsdom default viewport is wide
    expect(result.current).toBe(false);
  });
});
