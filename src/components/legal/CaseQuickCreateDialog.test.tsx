import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listAllPages: vi.fn(async () => []),
      createPage: vi.fn(async () => ({})),
    },
    legal: {
      conflictCheck: vi.fn(async () => ({
        severity: "none",
        explanation: "",
        matches: [],
        checked_cases: 0,
      })),
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({
    t: (key: string) => key,
    lang: "de",
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ me: null }),
}));

vi.mock("@/lib/offline-store", () => ({
  isOnline: () => true,
  enqueueMutation: vi.fn(async () => {}),
}));

// jsdom hat keinen ResizeObserver — Radix Select braucht ihn
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

import { CaseQuickCreateDialog } from "./CaseQuickCreateDialog";

function renderDialog() {
  return render(<CaseQuickCreateDialog open={true} onOpenChange={() => {}} />);
}

describe("CaseQuickCreateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders templates as an accessible radiogroup with 8 options", () => {
    renderDialog();
    const group = screen.getByRole("radiogroup", { name: "casesnew.quick_templates" });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(8);
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("marks the clicked template as checked and keeps single-select semantics", async () => {
    const user = userEvent.setup();
    renderDialog();

    const mietrecht = screen.getByRole("radio", { name: /casesnew\.template\.rental/ });
    await user.click(mietrecht);
    expect(mietrecht).toHaveAttribute("aria-checked", "true");

    const strafrecht = screen.getByRole("radio", { name: /casesnew\.template\.criminal/ });
    await user.click(strafrecht);
    expect(strafrecht).toHaveAttribute("aria-checked", "true");
    expect(mietrecht).toHaveAttribute("aria-checked", "false");
  });

  it("supports arrow-key navigation with roving tabindex (APG radiogroup)", async () => {
    const user = userEvent.setup();
    renderDialog();

    const radios = screen.getAllByRole("radio");
    // kein Template gewählt → nur das erste ist tabbable
    expect(radios[0]).toHaveAttribute("tabindex", "0");
    expect(radios[1]).toHaveAttribute("tabindex", "-1");

    radios[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveAttribute("tabindex", "0");
    expect(radios[0]).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{End}");
    expect(radios[7]).toHaveFocus();
    expect(radios[7]).toHaveAttribute("aria-checked", "true");

    await user.keyboard("{ArrowRight}");
    expect(radios[0]).toHaveFocus();
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
  });

  it("renders the create-another control as an accessible checkbox", () => {
    renderDialog();
    const checkbox = screen.getByRole("checkbox", { name: "casesnew.create_another" });
    expect(checkbox).toHaveAttribute("aria-checked", "false");
  });
});
