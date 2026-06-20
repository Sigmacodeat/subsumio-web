// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock @tanstack/react-query
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: null, isLoading: false })),
}));

// Mock useMe from queries/auth
vi.mock("@/lib/queries/auth", () => ({
  useMe: vi.fn(() => ({ data: null })),
}));

import { useLang, setDashboardLang } from "./use-lang";

describe("useLang", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.lang = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.lang = "";
  });

  test("defaults to 'de' when no preferences set", async () => {
    const { result } = renderHook(() => useLang());
    await waitFor(() => {
      expect(result.current.lang).toBe("de");
    });
  });

  test("uses localStorage override when set to 'en'", async () => {
    localStorage.setItem("dashboard-lang", "en");
    const { result } = renderHook(() => useLang());
    await waitFor(() => {
      expect(result.current.lang).toBe("en");
    });
  });

  test("uses localStorage override when set to 'de'", async () => {
    localStorage.setItem("dashboard-lang", "de");
    const { result } = renderHook(() => useLang());
    await waitFor(() => {
      expect(result.current.lang).toBe("de");
    });
  });

  test("ignores invalid localStorage values", async () => {
    localStorage.setItem("dashboard-lang", "fr");
    const { result } = renderHook(() => useLang());
    await waitFor(() => {
      expect(result.current.lang).toBe("de");
    });
  });

  test("uses html lang attribute when set to 'en'", async () => {
    document.documentElement.lang = "en";
    const { result } = renderHook(() => useLang());
    await waitFor(() => {
      expect(result.current.lang).toBe("en");
    });
  });

  test("uses html lang attribute when set to 'de'", async () => {
    document.documentElement.lang = "de";
    const { result } = renderHook(() => useLang());
    await waitFor(() => {
      expect(result.current.lang).toBe("de");
    });
  });

  test("returns t function", async () => {
    const { result } = renderHook(() => useLang());
    await waitFor(() => {
      expect(typeof result.current.t).toBe("function");
    });
  });

  test("t function returns a string for known keys", async () => {
    const { result } = renderHook(() => useLang());
    await waitFor(() => {
      expect(result.current.lang).toBe("de");
    });
    const translated = result.current.t("nav.overview" as any);
    expect(typeof translated).toBe("string");
    expect(translated.length).toBeGreaterThan(0);
  });

  test("localStorage takes priority over html lang", async () => {
    localStorage.setItem("dashboard-lang", "en");
    document.documentElement.lang = "de";
    const { result } = renderHook(() => useLang());
    await waitFor(() => {
      expect(result.current.lang).toBe("en");
    });
  });
});

describe("setDashboardLang", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
  });

  test("persists to localStorage", () => {
    setDashboardLang("en");
    expect(localStorage.getItem("dashboard-lang")).toBe("en");
  });

  test("sets document.documentElement.lang", () => {
    setDashboardLang("de");
    expect(document.documentElement.lang).toBe("de");
  });

  test("handles 'en'", () => {
    setDashboardLang("en");
    expect(localStorage.getItem("dashboard-lang")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  test("handles 'de'", () => {
    setDashboardLang("de");
    expect(localStorage.getItem("dashboard-lang")).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  test("overwrites previous value", () => {
    setDashboardLang("en");
    setDashboardLang("de");
    expect(localStorage.getItem("dashboard-lang")).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });
});
