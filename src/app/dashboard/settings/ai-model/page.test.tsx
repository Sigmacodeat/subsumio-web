import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelProfileResponse } from "@/lib/model-profile-types";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (key: string) => key, lang: "de" }) }));

const mutate = vi.fn();
const reset = vi.fn();
let queryState: { isLoading: boolean; isError: boolean; data?: ModelProfileResponse };
let mutationState: { isPending: boolean; isError: boolean; error: unknown };

vi.mock("@/lib/queries/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries/settings")>()),
  useModelProfile: () => ({ ...queryState, refetch: vi.fn() }),
  useUpdateModelProfile: () => ({ ...mutationState, mutate, reset }),
}));

import AIModelSettingsPage from "./page";
import { ModelProfileSaveError } from "@/lib/queries/settings";

const HAIKU = "anthropic:claude-haiku-4-5";
const SONNET = "anthropic:claude-sonnet-5";
const OPUS = "anthropic:claude-opus-5";

function view(overrides: Partial<ModelProfileResponse> = {}): ModelProfileResponse {
  return {
    profile: {
      areas: {
        chat: "auto",
        erfassung: "auto",
        analyse: "auto",
        fristen: "auto",
        entwuerfe: "auto",
        qualitaet: "auto",
      },
      updated_at: null,
      updated_by: null,
    },
    areas: [
      {
        id: "erfassung",
        floor: "utility",
        locked: false,
        choice: "auto",
        options: [
          { choice: "auto", models: [HAIKU, SONNET] },
          { choice: "utility", models: [HAIKU] },
          { choice: "reasoning", models: [SONNET] },
          { choice: "deep", models: [OPUS] },
        ],
      },
      {
        id: "fristen",
        floor: "reasoning",
        locked: false,
        choice: "auto",
        options: [
          { choice: "auto", models: [SONNET] },
          { choice: "reasoning", models: [SONNET] },
          { choice: "deep", models: [OPUS] },
        ],
      },
      {
        id: "qualitaet",
        floor: "deep",
        locked: true,
        choice: "auto",
        options: [{ choice: "auto", models: [OPUS] }],
      },
    ],
    pricing: {
      [HAIKU]: { input: 1, output: 5 },
      [SONNET]: { input: 2, output: 10 },
      [OPUS]: { input: 5, output: 25 },
    },
    updatedByName: null,
    canEdit: true,
    ...overrides,
  };
}

function area(titleKey: string) {
  return screen.getByText(titleKey).closest("fieldset") as HTMLElement;
}

function radio(fieldset: HTMLElement, value: string): HTMLInputElement {
  const found = within(fieldset)
    .getAllByRole<HTMLInputElement>("radio")
    .find((r) => r.value === value);
  if (!found) throw new Error(`no radio "${value}"`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryState = { isLoading: false, isError: false, data: view() };
  mutationState = { isPending: false, isError: false, error: null };
});

describe("AI model settings page", () => {
  it("shows every area with real model names, price levels and the floor", () => {
    render(<AIModelSettingsPage />);
    const erfassung = area("settings.aimodel.area.erfassung.title");
    expect(within(erfassung).getByText("Claude Haiku 4.5")).toBeInTheDocument();
    expect(within(erfassung).getByText("Claude Opus 5")).toBeInTheDocument();
    // Opus costs 5x Haiku on the canonical price table.
    expect(within(erfassung).getAllByText("settings.aimodel.price_factor")).toHaveLength(3);

    const fristen = area("settings.aimodel.area.fristen.title");
    expect(within(fristen).queryByText("Claude Haiku 4.5")).not.toBeInTheDocument();
    expect(within(fristen).getByText("settings.aimodel.floor_note")).toBeInTheDocument();
  });

  it("locks quality control", () => {
    render(<AIModelSettingsPage />);
    const q = area("settings.aimodel.area.qualitaet.title");
    expect(within(q).getByText("settings.aimodel.locked_badge")).toBeInTheDocument();
    for (const radio of within(q).getAllByRole("radio")) expect(radio).toBeDisabled();
  });

  it("saves only the areas that actually changed", () => {
    render(<AIModelSettingsPage />);
    const fristen = area("settings.aimodel.area.fristen.title");
    fireEvent.click(radio(fristen, "deep"));
    const erfassung = area("settings.aimodel.area.erfassung.title");
    fireEvent.click(radio(erfassung, "utility"));
    expect(screen.getByText("settings.aimodel.unsaved_many")).toBeInTheDocument();
    // Back to the stored value — no longer a change.
    fireEvent.click(radio(erfassung, "auto"));

    expect(screen.getByText("settings.aimodel.unsaved_one")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /settings.aimodel.btn_save/ }));
    expect(mutate).toHaveBeenCalledWith({ fristen: "deep" }, expect.anything());
  });

  it("is read-only for non-admins", () => {
    queryState.data = view({ canEdit: false });
    render(<AIModelSettingsPage />);
    expect(screen.getByText("settings.aimodel.readonly")).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.queryByRole("button", { name: /btn_save/ })).not.toBeInTheDocument();
  });

  it("explains a floor rejection from the server", () => {
    mutationState = {
      isPending: false,
      isError: true,
      error: new ModelProfileSaveError(400, "below_floor", "below"),
    };
    render(<AIModelSettingsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("settings.aimodel.error_below_floor");
  });

  it("offers a retry when loading fails", () => {
    queryState = { isLoading: false, isError: true };
    render(<AIModelSettingsPage />);
    expect(screen.getByText("settings.aimodel.error_load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "settings.aimodel.retry" })).toBeInTheDocument();
  });
});
