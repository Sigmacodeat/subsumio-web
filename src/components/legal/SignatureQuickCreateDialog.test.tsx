import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createPage = vi.fn(async (_payload: unknown) => ({}));

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listAllPages: vi.fn(async () => [
        {
          slug: "legal/cases/mueller",
          title: "Mueller ./. Stadt",
          frontmatter: { status: "open", case_number: "12 Cm 34/26" },
          created_at: "2026-01-01T00:00:00Z",
        },
      ]),
      listPages: vi.fn(async () => []),
      createPage: (payload: unknown) => createPage(payload),
    },
  },
}));

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ t: (key: string) => key, lang: "de" }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("@/lib/offline-store", () => ({
  isOnline: () => true,
  enqueueMutation: vi.fn(async () => {}),
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

import { SignatureQuickCreateDialog } from "./SignatureQuickCreateDialog";

function renderDialog(presetCaseSlug?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SignatureQuickCreateDialog open={true} onOpenChange={() => {}} presetCaseSlug={presetCaseSlug} />
    </QueryClientProvider>
  );
}

describe("SignatureQuickCreateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers a matter picker when no case is preset, and stores case_slug", async () => {
    renderDialog();
    // The picker only becomes interactive once the matter list loaded.
    const select = await screen.findByLabelText(/signature\.quick_case/);
    await waitFor(() => expect(select).not.toBeDisabled());

    fireEvent.change(select, { target: { value: "legal/cases/mueller" } });
    fireEvent.change(screen.getByLabelText(/signature\.quick_document/), {
      target: { value: "Vollmacht" },
    });
    fireEvent.change(screen.getByLabelText(/signature\.quick_recipient/), {
      target: { value: "Maria Mandantin" },
    });
    fireEvent.change(screen.getByLabelText(/signature\.quick_email/), {
      target: { value: "maria@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /signature\.quick_save/ }));
    await waitFor(() => expect(createPage).toHaveBeenCalled());
    const payload = createPage.mock.calls[0][0] as unknown as {
      frontmatter: Record<string, unknown>;
    };
    expect(payload.frontmatter.case_slug).toBe("legal/cases/mueller");
  });

  it("blocks saving without a matter — such a request could never be sent", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/signature\.quick_document/), {
      target: { value: "Vollmacht" },
    });
    fireEvent.change(screen.getByLabelText(/signature\.quick_recipient/), {
      target: { value: "Maria Mandantin" },
    });
    fireEvent.change(screen.getByLabelText(/signature\.quick_email/), {
      target: { value: "maria@example.com" },
    });
    const save = screen.getByRole("button", { name: /signature\.quick_save/ });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(createPage).not.toHaveBeenCalled();
  });

  it("hides the picker when the matter is preset and uses the preset slug", async () => {
    renderDialog("legal/cases/preset");
    expect(screen.queryByLabelText(/signature\.quick_case/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/signature\.quick_document/), {
      target: { value: "NDA" },
    });
    fireEvent.change(screen.getByLabelText(/signature\.quick_recipient/), {
      target: { value: "Max" },
    });
    fireEvent.change(screen.getByLabelText(/signature\.quick_email/), {
      target: { value: "max@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /signature\.quick_save/ }));
    await waitFor(() => expect(createPage).toHaveBeenCalled());
    const payload = createPage.mock.calls[0][0] as unknown as {
      frontmatter: Record<string, unknown>;
    };
    expect(payload.frontmatter.case_slug).toBe("legal/cases/preset");
  });
});
