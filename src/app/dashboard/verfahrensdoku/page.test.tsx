// @vitest-environment jsdom
// Verfahrensdokumentation (UIS-0-15): after a failed read, saving is locked so
// the stored document is never overwritten with blanks.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getPage = vi.hoisted(() => vi.fn());
const updatePage = vi.hoisted(() => vi.fn());
const loadStrict = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ApiRequestError: actual.ApiRequestError,
    api: { brain: { getPage: (...a: unknown[]) => getPage(...a), updatePage } },
  };
});
vi.mock("@/lib/kanzlei-settings", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/kanzlei-settings")>("@/lib/kanzlei-settings");
  return { ...actual, loadKanzleiSettingsStrict: (...a: unknown[]) => loadStrict(...a) };
});
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  return { useLang: () => ({ lang: "de", t: actual.createT("de"), setLang: vi.fn() }) };
});

import { ApiRequestError } from "@/lib/api";
import { normalizeKanzleiSettings } from "@/lib/kanzlei-settings";
import VerfahrensdokuPage from "./page";

const saveButton = () => screen.getByRole("button", { name: /Im Kanzleiwissen speichern/ });

beforeEach(() => {
  vi.clearAllMocks();
  loadStrict.mockResolvedValue(normalizeKanzleiSettings({ kanzleiName: "Kanzlei A" }));
});

describe("Verfahrensdokumentation", () => {
  test("a failed read of the stored document locks saving and says so", async () => {
    getPage.mockRejectedValue(new ApiRequestError("boom", 503));
    render(<VerfahrensdokuPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });

  test("a failed read of the firm data locks saving too", async () => {
    loadStrict.mockRejectedValue(new Error("HTTP 500"));
    getPage.mockRejectedValue(new ApiRequestError("nf", 404));
    render(<VerfahrensdokuPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });

  test("a document that does not exist yet (404) can be written", async () => {
    getPage.mockRejectedValue(new ApiRequestError("nf", 404));
    render(<VerfahrensdokuPage />);
    await waitFor(() => expect((saveButton() as HTMLButtonElement).disabled).toBe(false));
  });

  test("the stored document wins over the firm data", async () => {
    getPage.mockResolvedValue({
      frontmatter: { verfahrensdoku_input: { kanzleiName: "Gespeicherter Name" } },
    });
    render(<VerfahrensdokuPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Gespeicherter Name")).toBeTruthy());
  });
});
