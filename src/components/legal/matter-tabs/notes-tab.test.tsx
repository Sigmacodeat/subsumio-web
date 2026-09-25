import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotesTab } from "./notes-tab";

const listPages = vi.fn();
const getPages = vi.fn();
const deletePage = vi.fn();
const confirm = vi.fn();

vi.mock("@/lib/matter-detail-context", () => ({
  useMatterDetail: () => ({ caseData: { slug: "legal/cases/alt" } }),
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/queries/auth", () => ({ useMe: () => ({ data: { user: { name: "Anwalt" } } }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirm }));
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listPages: (...a: unknown[]) => listPages(...a),
      getPages: (...a: unknown[]) => getPages(...a),
      deletePage: (...a: unknown[]) => deletePage(...a),
    },
  },
}));

describe("NotesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPages.mockResolvedValue([
      {
        slug: "legal/notes/n1",
        title: "Telefonat",
        content: "",
        frontmatter: { case_slug: "legal/cases/alt", created_at: "2025-01-02T10:00:00Z" },
      },
    ]);
    getPages.mockResolvedValue({
      "legal/notes/n1": { slug: "legal/notes/n1", title: "Telefonat", content: "Vermerk X" },
    });
    deletePage.mockResolvedValue({});
  });

  it("shows the note text and loads the matter's notes server-side", async () => {
    render(<NotesTab />);
    expect(await screen.findByText("Vermerk X")).toBeInTheDocument();
    expect(listPages).toHaveBeenCalledWith({ type: "legal_note", caseSlug: "legal/cases/alt" });
    expect(getPages).toHaveBeenCalledWith(["legal/notes/n1"]);
  });

  it("asks before deleting and keeps the note when cancelled", async () => {
    confirm.mockResolvedValue(false);
    render(<NotesTab />);
    await screen.findByText("Vermerk X");
    await userEvent.click(screen.getByRole("button", { name: "common.delete" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(deletePage).not.toHaveBeenCalled();
  });

  it("a failed load shows an error with retry, not the empty state", async () => {
    listPages.mockRejectedValue(new Error("down"));
    render(<NotesTab />);
    expect(await screen.findByText("Notizen konnten nicht geladen werden.")).toBeInTheDocument();
    expect(screen.queryByText("mattertab.notes_empty")).not.toBeInTheDocument();
  });
});
