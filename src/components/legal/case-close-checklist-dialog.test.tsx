import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock api before importing the component
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      getPage: vi.fn(),
      listPages: vi.fn(async () => []),
    },
  },
}));

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/legal-types", () => ({
  caseFrontmatter: (page: { frontmatter?: Record<string, unknown> }) =>
    (page.frontmatter ?? {}) as Record<string, unknown>,
}));

import { CaseCloseChecklistDialog } from "./case-close-checklist-dialog";
import { api } from "@/lib/api";

describe("CaseCloseChecklistDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner while fetching checklist", async () => {
    vi.mocked(api.brain.getPage).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    render(
      <CaseCloseChecklistDialog
        open={true}
        onOpenChange={() => {}}
        caseSlug="legal/cases/test"
        caseTitle="Test Case"
        onConfirmArchive={() => {}}
      />
    );

    // Multiple role="status" elements (outer + spinner) — use getAllByRole
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("shows all-passed message when checklist has no blockers or warnings", async () => {
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      frontmatter: {
        time_entries: [{ billed: true, billable: true }],
        expenses: [{ billed: true, billable: true }],
        deadlines: [{ status: "done" }],
        document_requests: [{ status: "fulfilled" }],
      },
    });
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([
      { frontmatter: { case_slugs: ["legal/cases/test"], status: "paid" } },
    ]);

    render(
      <CaseCloseChecklistDialog
        open={true}
        onOpenChange={() => {}}
        caseSlug="legal/cases/test"
        caseTitle="Test"
        onConfirmArchive={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("cases.close_checklist_all_passed")).toBeInTheDocument();
    });
  });

  it("shows blockers and force-archive checkbox when blockers exist", async () => {
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      frontmatter: {
        time_entries: [{ billed: false, billable: true }],
        expenses: [],
        deadlines: [],
        document_requests: [],
      },
    });
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([]);

    render(
      <CaseCloseChecklistDialog
        open={true}
        onOpenChange={() => {}}
        caseSlug="legal/cases/test"
        caseTitle="Test"
        onConfirmArchive={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("cases.close_checklist_has_blockers")).toBeInTheDocument();
    });
    // Force archive checkbox visible
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    // Archive button disabled until force-archive checked
    const archiveBtn = screen.getByText("cases.btn_archive").closest("button");
    expect(archiveBtn).toBeDisabled();
  });

  it("enables archive button when force-archive is checked", async () => {
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      frontmatter: {
        time_entries: [{ billed: false, billable: true }],
        expenses: [],
        deadlines: [],
        document_requests: [],
      },
    });
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([]);

    render(
      <CaseCloseChecklistDialog
        open={true}
        onOpenChange={() => {}}
        caseSlug="legal/cases/test"
        caseTitle="Test"
        onConfirmArchive={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("checkbox")).toBeInTheDocument();
    });

    const archiveBtn = screen.getByText("cases.btn_archive").closest("button");
    expect(archiveBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      expect(archiveBtn).not.toBeDisabled();
    });
  });

  it("calls onConfirmArchive and closes dialog when archive button clicked", async () => {
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      frontmatter: {
        time_entries: [{ billed: true, billable: true }],
        expenses: [],
        deadlines: [],
        document_requests: [],
      },
    });
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([]);

    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CaseCloseChecklistDialog
        open={true}
        onOpenChange={onOpenChange}
        caseSlug="legal/cases/test"
        caseTitle="Test"
        onConfirmArchive={onConfirm}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("cases.btn_archive")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("cases.btn_archive"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when cancel button clicked", async () => {
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      frontmatter: {},
    });
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([]);

    const onOpenChange = vi.fn();

    render(
      <CaseCloseChecklistDialog
        open={true}
        onOpenChange={onOpenChange}
        caseSlug="legal/cases/test"
        caseTitle="Test"
        onConfirmArchive={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("cases.btn_cancel")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("cases.btn_cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows warning banner when only warnings exist (no blockers)", async () => {
    // Open document requests → warning (not blocker)
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      frontmatter: {
        time_entries: [{ billed: true, billable: true }],
        expenses: [{ billed: true, billable: true }],
        deadlines: [{ status: "done" }],
        document_requests: [{ status: "pending" }], // pending → warning
      },
    });
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([
      { frontmatter: { case_slugs: ["legal/cases/test"], status: "paid" } },
    ]);

    render(
      <CaseCloseChecklistDialog
        open={true}
        onOpenChange={() => {}}
        caseSlug="legal/cases/test"
        caseTitle="Test"
        onConfirmArchive={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("cases.close_checklist_warnings")).toBeInTheDocument();
    });
    // No force-archive checkbox when only warnings
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    // Archive button enabled (no blockers)
    const archiveBtn = screen.getByText("cases.btn_archive").closest("button");
    expect(archiveBtn).not.toBeDisabled();
  });

  it("handles API failure gracefully (allows archive)", async () => {
    vi.mocked(api.brain.getPage).mockRejectedValueOnce(new Error("Engine unreachable"));

    render(
      <CaseCloseChecklistDialog
        open={true}
        onOpenChange={() => {}}
        caseSlug="legal/cases/test"
        caseTitle="Test"
        onConfirmArchive={() => {}}
      />
    );

    await waitFor(() => {
      // On error, checklist is empty (no blockers) → archive allowed
      expect(screen.getByText("cases.close_checklist_all_passed")).toBeInTheDocument();
    });
  });

  it("does not load checklist when dialog is closed", async () => {
    render(
      <CaseCloseChecklistDialog
        open={false}
        onOpenChange={() => {}}
        caseSlug="legal/cases/test"
        caseTitle="Test"
        onConfirmArchive={() => {}}
      />
    );

    expect(api.brain.getPage).not.toHaveBeenCalled();
  });

  it("handles missing caseSlug gracefully", async () => {
    render(
      <CaseCloseChecklistDialog
        open={true}
        onOpenChange={() => {}}
        caseSlug=""
        caseTitle="Test"
        onConfirmArchive={() => {}}
      />
    );

    // Should not call API when caseSlug is empty
    expect(api.brain.getPage).not.toHaveBeenCalled();
  });
});
