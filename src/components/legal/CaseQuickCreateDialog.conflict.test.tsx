import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

const online = { value: true };

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listAllPages: vi.fn(async () => [
        {
          slug: "kontakte/anna",
          title: "Anna Beispiel",
          frontmatter: { name: "Anna Beispiel", role: "client" },
        },
        {
          slug: "kontakte/widget",
          title: "Widget GmbH",
          frontmatter: { name: "Widget GmbH", role: "opponent" },
        },
      ]),
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (key: string) => key, lang: "de" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ me: { email: "anwalt@kanzlei.example" } }),
}));
vi.mock("@/lib/offline-store", () => ({
  isOnline: () => online.value,
  enqueueMutation: vi.fn(async () => {}),
}));

// Native <select> stand-in for the Radix Select (jsdom cannot drive it).
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: ReactNode;
  }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

import { CaseQuickCreateDialog } from "./CaseQuickCreateDialog";
import { api } from "@/lib/api";
import { enqueueMutation } from "@/lib/offline-store";

async function fillAndSubmit(opts: { client?: string; opponent?: string } = {}) {
  render(<CaseQuickCreateDialog open={true} onOpenChange={() => {}} onCreated={() => {}} />);
  fireEvent.change(document.getElementById("quick-title") as HTMLInputElement, {
    target: { value: "Mietrecht Beispiel" },
  });
  const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
  if (opts.client) {
    await waitFor(() => expect(selects[0]!.querySelectorAll("option").length).toBeGreaterThan(1));
    fireEvent.change(selects[0]!, { target: { value: opts.client } });
  }
  if (opts.opponent) {
    await waitFor(() => expect(selects[1]!.querySelectorAll("option").length).toBeGreaterThan(1));
    fireEvent.change(selects[1]!, { target: { value: opts.opponent } });
  }
  fireEvent.click(screen.getByRole("button", { name: /casesnew\.btn_create/ }));
}

describe("CaseQuickCreateDialog — conflict check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    online.value = true;
  });

  it("OPS-5: offline create records the conflict check as pending, never 'clear'", async () => {
    online.value = false;
    await fillAndSubmit();
    await waitFor(() => expect(enqueueMutation).toHaveBeenCalled());
    const payload = vi.mocked(enqueueMutation).mock.calls[0]![0].payload as {
      frontmatter: { mandate_acceptance: { conflict_check: Record<string, unknown> } };
    };
    const cc = payload.frontmatter.mandate_acceptance.conflict_check;
    expect(cc.status).toBe("pending");
    expect(cc.performed_at).toBeUndefined();
    expect(cc.performed_by).toBeUndefined();
    expect(api.legal.conflictCheck).not.toHaveBeenCalled();
  });

  it("OPS-1: checks the client on the client side and the opponent on the opponent side", async () => {
    await fillAndSubmit({ client: "kontakte/anna", opponent: "kontakte/widget" });
    await waitFor(() => expect(api.brain.createPage).toHaveBeenCalled());
    expect(vi.mocked(api.legal.conflictCheck).mock.calls).toEqual([
      ["Anna Beispiel", "client"],
      ["Widget GmbH", "opponent"],
    ]);
    const payload = vi.mocked(api.brain.createPage).mock.calls[0]![0] as unknown as {
      frontmatter: { mandate_acceptance: { conflict_check: { status: string } } };
    };
    // the record is filled by the server when the matter is written
    expect(payload.frontmatter.mandate_acceptance.conflict_check.status).toBe("pending");
  });

  it("a critical result blocks the create", async () => {
    vi.mocked(api.legal.conflictCheck).mockResolvedValueOnce({
      name: "Anna Beispiel",
      severity: "critical",
      explanation: "Gegnerseite",
      matches: [],
      checked_cases: 0,
      disclaimer: "",
    });
    await fillAndSubmit({ client: "kontakte/anna" });
    await waitFor(() => expect(api.legal.conflictCheck).toHaveBeenCalled());
    expect(api.brain.createPage).not.toHaveBeenCalled();
  });

  it("no party selected: the title is not misused as a party name", async () => {
    await fillAndSubmit();
    await waitFor(() => expect(api.brain.createPage).toHaveBeenCalled());
    expect(api.legal.conflictCheck).not.toHaveBeenCalled();
  });
});
