// R11-10: typing a name in one go triggers ONE federated palette request
// (one quota unit) — not five searches per typing pause.
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  return { useLang: () => ({ lang: "de", t: actual.createT("de"), setLang: vi.fn() }) };
});
vi.mock("@/lib/use-recent-matters", () => ({ useRecentMatters: () => ({ recent: [] }) }));
vi.mock("@/lib/tracking", () => ({
  tracking: { features: { commandPaletteOpened: vi.fn() } },
}));
const searchPalette = vi.fn(async () => ({
  results: [],
  cases: [],
  contacts: [],
  deadlines: [],
  documents: [],
  failed: [],
}));
const search = vi.fn(async () => []);
vi.mock("@/lib/api", () => ({
  api: {
    searchPalette: (...a: unknown[]) => searchPalette(...(a as [])),
    search: (...a: unknown[]) => search(...(a as [])),
    brain: { search: (...a: unknown[]) => search(...(a as [])) },
  },
}));

import { CommandPalette, PALETTE_SEARCH_DEBOUNCE_MS } from "./command-palette";

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  vi.useRealTimers();
  searchPalette.mockClear();
  search.mockClear();
});

describe("command palette search", () => {
  it("typing 'Müller' in one go sends exactly one request", async () => {
    vi.useFakeTimers();
    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        onToggleTheme={vi.fn()}
        onToggleSidebar={vi.fn()}
        industry="legal"
        role="lawyer"
        jurisdiction="at"
      />
    );
    const input = document.querySelector("input") as HTMLInputElement;
    for (const partial of ["M", "Mü", "Mül", "Müll", "Mülle", "Müller"]) {
      fireEvent.change(input, { target: { value: partial } });
      await act(async () => {
        vi.advanceTimersByTime(120);
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(PALETTE_SEARCH_DEBOUNCE_MS + 50);
    });
    expect(searchPalette).toHaveBeenCalledTimes(1);
    expect(searchPalette.mock.calls[0][0]).toBe("Müller");
    expect(search).not.toHaveBeenCalled();
  });
});
