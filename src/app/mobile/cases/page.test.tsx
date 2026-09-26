import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileCasesPage from "./page";

const listAllPages = vi.fn();
const search = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listAllPages: (...a: unknown[]) => listAllPages(...a),
      search: (...a: unknown[]) => search(...a),
    },
  },
}));

function matter(slug: string, title: string, fm: Record<string, unknown>) {
  return {
    slug,
    title,
    content: "",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    type: "legal_case",
    frontmatter: { type: "legal_case", ...fm },
  };
}

beforeEach(() => {
  listAllPages.mockReset();
  search.mockReset();
});

describe("mobile matter list", () => {
  it("lists the visible matters (legal_case) with client, not a full-text search", async () => {
    listAllPages.mockResolvedValue([
      matter("cases/a", "Akte A", { status: "open", client_name: "Mandant A" }),
      matter("cases/b", "Akte B", { status: "pending", client_name: "Mandant B" }),
      matter("cases/c", "Akte C", { status: "archived" }),
      { ...matter("notes/x", "Notiz", {}), type: "note", frontmatter: { type: "note" } },
    ]);
    render(<MobileCasesPage />);
    expect(await screen.findByText("Akte A")).toBeInTheDocument();
    expect(screen.getByText("Akte B")).toBeInTheDocument();
    expect(screen.getByText(/Mandant A/)).toBeInTheDocument();
    expect(screen.queryByText("Akte C")).not.toBeInTheDocument();
    expect(screen.queryByText("Notiz")).not.toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
    expect(listAllPages).toHaveBeenCalledWith(expect.objectContaining({ type: "legal_case" }));
  });

  it("the 'Offen' filter shows matters with status open", async () => {
    listAllPages.mockResolvedValue([
      matter("cases/a", "Akte A", { status: "open" }),
      matter("cases/b", "Akte B", { status: "pending" }),
      matter("cases/c", "Akte C", { status: "settled" }),
    ]);
    render(<MobileCasesPage />);
    await screen.findByText("Akte A");
    fireEvent.click(screen.getByRole("button", { name: "Offen" }));
    expect(screen.getByText("Akte A")).toBeInTheDocument();
    expect(screen.queryByText("Akte B")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abgeschlossen" }));
    expect(screen.getByText("Akte C")).toBeInTheDocument();
    expect(screen.queryByText("Akte A")).not.toBeInTheDocument();
  });

  it("a failed load shows an error with retry instead of 'Keine Akten'", async () => {
    listAllPages.mockRejectedValueOnce(new Error("offline"));
    listAllPages.mockResolvedValueOnce([matter("cases/a", "Akte A", { status: "open" })]);
    render(<MobileCasesPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("nicht geladen");
    expect(screen.queryByText("Keine Akten gefunden")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() => expect(screen.getByText("Akte A")).toBeInTheDocument());
  });
});
