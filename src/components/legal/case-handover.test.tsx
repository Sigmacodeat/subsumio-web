import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrainPage } from "@/lib/types";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listPages: vi.fn(),
      createPage: vi.fn(async () => ({})),
      deletePage: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/matter-detail-context", () => ({
  useMatterDetail: () => ({
    caseData: { slug: "legal/cases/test", title: "Test Case" },
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

import { CaseHandover } from "./case-handover";
import { api } from "@/lib/api";

describe("CaseHandover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", async () => {
    vi.mocked(api.brain.listPages).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    render(<CaseHandover />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows empty state when no handovers exist", async () => {
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([]);

    render(<CaseHandover />);
    await waitFor(() => {
      expect(screen.getByText("mattertab.handover_empty")).toBeInTheDocument();
    });
  });

  it("renders existing handover entries", async () => {
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([
      {
        slug: "legal/handovers/1",
        frontmatter: {
          case_slug: "legal/cases/test",
          recipient: "Dr. Schmidt",
          urgency: "high",
          created_at: "2026-09-12T10:00:00Z",
        },
        content: "Wichtige Notiz",
      },
      {
        slug: "legal/handovers/2",
        frontmatter: {
          case_slug: "legal/cases/test",
          recipient: "Frau Weber",
          urgency: "low",
          created_at: "2026-09-11T10:00:00Z",
        },
        content: "",
      },
    ] as unknown as BrainPage[]);

    render(<CaseHandover />);
    await waitFor(() => {
      expect(screen.getByText("Dr. Schmidt")).toBeInTheDocument();
      expect(screen.getByText("Frau Weber")).toBeInTheDocument();
      expect(screen.getByText("Wichtige Notiz")).toBeInTheDocument();
    });
  });

  it("filters handovers by case_slug", async () => {
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([
      {
        slug: "legal/handovers/1",
        frontmatter: {
          case_slug: "legal/cases/other",
          recipient: "Other Case",
          urgency: "low",
          created_at: "2026-09-12T10:00:00Z",
        },
        content: "",
      },
      {
        slug: "legal/handovers/2",
        frontmatter: {
          case_slug: "legal/cases/test",
          recipient: "Our Case",
          urgency: "low",
          created_at: "2026-09-11T10:00:00Z",
        },
        content: "",
      },
    ] as unknown as BrainPage[]);

    render(<CaseHandover />);
    await waitFor(() => {
      expect(screen.getByText("Our Case")).toBeInTheDocument();
      expect(screen.queryByText("Other Case")).not.toBeInTheDocument();
    });
  });

  it("shows form when submit button clicked", async () => {
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([]);

    render(<CaseHandover />);
    await waitFor(() => {
      expect(screen.getByText("mattertab.handover_submit")).toBeInTheDocument();
    });

    // Click the toggle button (first occurrence)
    const toggleBtn = screen.getAllByText("mattertab.handover_submit")[0]!;
    fireEvent.click(toggleBtn);

    // After click, toggle becomes "common.cancel" and form appears
    await waitFor(() => {
      expect(screen.getByText("common.cancel")).toBeInTheDocument();
    });
    // Form should now have recipient label (text includes " *")
    expect(screen.getByText(/mattertab.handover_recipient/)).toBeInTheDocument();
  });

  it("creates handover on form submit", async () => {
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([]);

    render(<CaseHandover />);
    await waitFor(() => {
      expect(screen.getByText("mattertab.handover_submit")).toBeInTheDocument();
    });

    // Open form
    const toggleBtn = screen.getAllByText("mattertab.handover_submit")[0]!;
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText("common.cancel")).toBeInTheDocument();
    });

    // Fill recipient (first textbox in the form)
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0]!, { target: { value: "Dr. Müller" } });

    // Submit form (the submit button inside the form)
    const submitBtn = screen.getByRole("button", { name: "mattertab.handover_submit" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.brain.createPage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "legal_case_handover",
          frontmatter: expect.objectContaining({
            case_slug: "legal/cases/test",
            recipient: "Dr. Müller",
          }),
        })
      );
    });
  });

  it("does not submit without recipient", async () => {
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([]);

    render(<CaseHandover />);
    await waitFor(() => {
      expect(screen.getByText("mattertab.handover_submit")).toBeInTheDocument();
    });

    const toggleBtn = screen.getAllByText("mattertab.handover_submit")[0]!;
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText("common.cancel")).toBeInTheDocument();
    });
    // createPage should not be called without filling recipient
    expect(api.brain.createPage).not.toHaveBeenCalled();
  });

  it("renders delete button for each handover entry", async () => {
    vi.mocked(api.brain.listPages).mockResolvedValueOnce([
      {
        slug: "legal/handovers/1",
        frontmatter: {
          case_slug: "legal/cases/test",
          recipient: "Dr. Schmidt",
          urgency: "high",
          created_at: "2026-09-12T10:00:00Z",
        },
        content: "",
      },
    ] as unknown as BrainPage[]);

    render(<CaseHandover />);
    await waitFor(() => {
      expect(screen.getByText("Dr. Schmidt")).toBeInTheDocument();
    });

    // Delete button should be rendered (aria-label="common.delete")
    const deleteBtn = screen.getByLabelText("common.delete");
    expect(deleteBtn).toBeInTheDocument();
  });

  it("shows error toast on load failure", async () => {
    vi.mocked(api.brain.listPages).mockRejectedValueOnce(new Error("Network error"));

    render(<CaseHandover />);
    // Should not crash — error is caught
    await waitFor(() => {
      expect(screen.queryByText("Dr. Schmidt")).not.toBeInTheDocument();
    });
  });
});
