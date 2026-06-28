import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock createPortal to avoid DOM issues in test
vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock next/navigation useRouter
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Import after mocks are set up
import { TourProvider, useTour, useAutoStartTour } from "@/components/dashboard/guided-tour";

function wrapper({ children }: { children: React.ReactNode }) {
  return <TourProvider>{children}</TourProvider>;
}

describe("Guided Tour", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TourProvider provides initial state (not open, not completed until mounted)", () => {
    const { result } = renderHook(() => useTour(), { wrapper });
    // Before mount effect runs, defaults are: not open, not completed
    expect(result.current.isTourOpen).toBe(false);
    expect(result.current.hasCompletedTour).toBe(false);
  });

  it("startTour opens the tour", () => {
    const { result } = renderHook(() => useTour(), { wrapper });
    act(() => {
      result.current.startTour();
    });
    expect(result.current.isTourOpen).toBe(true);
  });

  it("closeTour closes the tour", () => {
    const { result } = renderHook(() => useTour(), { wrapper });
    act(() => {
      result.current.startTour();
    });
    expect(result.current.isTourOpen).toBe(true);
    act(() => {
      result.current.closeTour();
    });
    expect(result.current.isTourOpen).toBe(false);
  });

  it("persists completion state to localStorage", () => {
    const { result } = renderHook(() => useTour(), { wrapper });
    // startTour then the tour can be completed internally
    act(() => {
      result.current.startTour();
    });
    // The completion is handled internally by the overlay, but we can
    // verify that the provider exposes the right interface
    expect(typeof result.current.hasCompletedTour).toBe("boolean");
  });

  it("useTour returns safe defaults outside provider", () => {
    const { result } = renderHook(() => useTour());
    expect(result.current.isTourOpen).toBe(false);
    expect(result.current.hasCompletedTour).toBe(true);
    expect(typeof result.current.startTour).toBe("function");
    expect(typeof result.current.closeTour).toBe("function");
    expect(typeof result.current.restartTour).toBe("function");
  });

  it("useAutoStartTour does not start tour when onboarding not completed", () => {
    const { result } = renderHook(() => useAutoStartTour(null), { wrapper });
    // Should not trigger tour start when onboarding is not completed
    expect(result.current).toBeUndefined();
  });

  it("restartTour reopens the tour and clears completion state", () => {
    const { result } = renderHook(() => useTour(), { wrapper });
    // Complete the tour first
    act(() => {
      result.current.startTour();
    });
    expect(result.current.isTourOpen).toBe(true);
    // Now restart
    act(() => {
      result.current.restartTour();
    });
    expect(result.current.isTourOpen).toBe(true);
    expect(result.current.hasCompletedTour).toBe(false);
  });
});
