import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addToast = vi.fn();
const createPage = vi.fn(async () => ({}));
const listAllPages = vi.fn(async () => [{ slug: "cases/a", title: "Akte A" }]);
const t = (k: string) => k;
// jsdom has no ResizeObserver — the dialog/checkbox primitives need it.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t, lang: "de" }) }));
vi.mock("@/lib/offline-store", () => ({ isOnline: () => true, enqueueMutation: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    brain: {
      createPage: (...a: unknown[]) => createPage(...(a as [])),
      listAllPages: (...a: unknown[]) => listAllPages(...(a as [])),
    },
  },
}));

import { SignatureQuickCreateDialog } from "./SignatureQuickCreateDialog";

function fill() {
  fireEvent.change(document.getElementById("quick-sig-doc")!, { target: { value: "Vollmacht" } });
  fireEvent.change(document.getElementById("quick-sig-name")!, { target: { value: "Maria M" } });
  fireEvent.change(document.getElementById("quick-sig-email")!, {
    target: { value: "maria@example.at" },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("SignatureQuickCreateDialog", () => {
  it("without a matter the request cannot be created (it could never be sent)", async () => {
    render(<SignatureQuickCreateDialog open onOpenChange={() => {}} />);
    expect(await screen.findByLabelText(/Akte \*/)).toBeInTheDocument();
    fill();
    const submit = screen.getByRole("button", { name: /signature\.quick_create|btn_create|Erstellen/i });
    await waitFor(() => expect(submit).toBeDisabled());
    expect(createPage).not.toHaveBeenCalled();
  });

  it("stores the matter on the request, so it can be sent via the portal", async () => {
    render(<SignatureQuickCreateDialog open onOpenChange={() => {}} presetCaseSlug="cases/a" />);
    expect(screen.queryByLabelText(/Akte \*/)).not.toBeInTheDocument();
    fill();
    fireEvent.submit(document.getElementById("quick-sig-doc")!.closest("form")!);
    await waitFor(() => expect(createPage).toHaveBeenCalled());
    const payload = (createPage.mock.calls[0] as unknown as [{ frontmatter: { case_slug: string } }])[0];
    expect(payload.frontmatter.case_slug).toBe("cases/a");
  });
});
