// @vitest-environment jsdom
// Kanzleiprofil (UIS-0-1): a failed read shows an error and offers no save —
// defaults are never written over the firm's real data.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const loadStrict = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());

vi.mock("@/lib/kanzlei-settings", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/kanzlei-settings")>("@/lib/kanzlei-settings");
  return {
    ...actual,
    loadKanzleiSettingsStrict: (...a: unknown[]) => loadStrict(...a),
    loadKanzleiSettings: vi.fn(async () => actual.DEFAULT_KANZLEI_SETTINGS),
    saveKanzleiSettings: (...a: unknown[]) => save(...a),
  };
});
vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ data: { user: { jurisdiction: "AT" } } }),
}));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));
vi.mock("@/components/dashboard/brain-learning-card", () => ({ BrainLearningCard: () => null }));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  return { useLang: () => ({ lang: "de", t: actual.createT("de"), setLang: vi.fn() }) };
});

import KanzleiSettingsPage from "./page";

beforeEach(() => vi.clearAllMocks());

describe("Kanzleiprofil", () => {
  test("a failed read shows an error and no form to save", async () => {
    loadStrict.mockRejectedValue(new Error("HTTP 503"));
    render(<KanzleiSettingsPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /speichern/i })).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  test("a successful read shows the stored data", async () => {
    const { normalizeKanzleiSettings } = await import("@/lib/kanzlei-settings");
    loadStrict.mockResolvedValue(normalizeKanzleiSettings({ kanzleiName: "Kanzlei A" }));
    render(<KanzleiSettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Kanzlei A")).toBeTruthy());
  });
});
