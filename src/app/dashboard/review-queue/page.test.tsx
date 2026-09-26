import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReviewQueuePage from "./page";

const addToast = vi.fn();
const updatePage = vi.fn();
const batchListPages = vi.fn();
const authMe = vi.fn();

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      // The page pages through every type (listAllPages); the mock serves
      // the per-type record the tests set up.
      listAllPages: ({ type }: { type: string }) =>
        batchListPages().then((results: Record<string, unknown[]>) => results[type] ?? []),
      updatePage: (...a: unknown[]) => updatePage(...a),
    },
    auth: { me: () => authMe() },
  },
}));

function doc(slug: string, extra: Record<string, unknown> = {}) {
  return {
    slug,
    title: slug,
    type: "document_draft",
    frontmatter: { review_status: "pending", ...extra },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMe.mockResolvedValue({ user: { email: "anwalt@kanzlei.at" } });
  updatePage.mockResolvedValue({ slug: "x", success: true });
});

describe("ReviewQueue page", () => {
  it("lists pending documents with approve/reject actions", async () => {
    batchListPages.mockResolvedValue({
      document_draft: [doc("drafts/eins"), doc("drafts/zwei", { review_status: "approved" })],
    });
    render(<ReviewQueuePage />);
    expect(await screen.findByText("drafts/eins")).toBeInTheDocument();
    expect(screen.getByText("drafts/zwei")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /review_queue\.approve/ }).length).toBeGreaterThan(
      0
    );
  });

  it("approving writes review_status + reviewed_at + reviewed_by and reloads", async () => {
    batchListPages.mockResolvedValue({ document_draft: [doc("drafts/eins")] });
    render(<ReviewQueuePage />);
    const btn = await screen.findByRole("button", { name: /review_queue\.approve/ });
    // Wait until the session resolved so reviewed_by is populated.
    await waitFor(() => expect(authMe).toHaveBeenCalled());
    await userEvent.click(btn);
    await waitFor(() => expect(updatePage).toHaveBeenCalled());
    const call = updatePage.mock.calls[0]![0] as {
      slug: string;
      frontmatter: Record<string, unknown>;
    };
    expect(call.slug).toBe("drafts/eins");
    expect(call.frontmatter.review_status).toBe("approved");
    expect(call.frontmatter.reviewed_at).toBeTruthy();
    expect(call.frontmatter.reviewed_by).toBe("anwalt@kanzlei.at");
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("shows an error toast when the status update fails", async () => {
    batchListPages.mockResolvedValue({ document_draft: [doc("drafts/eins")] });
    updatePage.mockRejectedValueOnce(new Error("engine down"));
    render(<ReviewQueuePage />);
    const btn = await screen.findByRole("button", { name: /review_queue\.approve/ });
    await userEvent.click(btn);
    await waitFor(() => expect(screen.getByText(/konnte nicht aktualisiert/)).toBeInTheDocument());
  });

  it("a matter that was never put up for review is not listed as pending", async () => {
    batchListPages.mockResolvedValue({
      legal_case: [{ slug: "legal/cases/a", title: "Akte A", type: "legal_case", frontmatter: {} }],
      document_draft: [doc("drafts/eins")],
    });
    render(<ReviewQueuePage />);
    expect(await screen.findByText("drafts/eins")).toBeInTheDocument();
    expect(screen.queryByText("Akte A")).not.toBeInTheDocument();
  });

  it("a failed load shows the error, not an empty queue", async () => {
    batchListPages.mockRejectedValue(new Error("down"));
    render(<ReviewQueuePage />);
    expect(await screen.findByText(/konnten nicht geladen werden/)).toBeInTheDocument();
  });

  it("shows the empty state when nothing needs review", async () => {
    batchListPages.mockResolvedValue({});
    render(<ReviewQueuePage />);
    expect(await screen.findByText("Keine offenen Freigaben")).toBeInTheDocument();
  });
});
