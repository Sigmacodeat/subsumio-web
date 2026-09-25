import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import BrainPage from "./page";

const listPages = vi.fn();
const search = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k }) }));
vi.mock("@/components/dashboard/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listPages: (...a: unknown[]) => listPages(...a),
      search: (...a: unknown[]) => search(...a),
    },
  },
}));

describe("Kanzleiwissen", () => {
  it("a failed search is shown as an error, not as 'no hits'", async () => {
    listPages.mockResolvedValue([
      { slug: "wiki/a", title: "Eintrag A", type: "note", frontmatter: {} },
    ]);
    search.mockRejectedValue(new Error("down"));
    render(<BrainPage />);
    await screen.findByText("Eintrag A");
    await userEvent.type(screen.getAllByRole("textbox")[0]!, "Miete");
    expect(await screen.findByText(/Die Suche ist gerade nicht erreichbar/)).toBeInTheDocument();
    expect(screen.queryByText("brain.no_results")).not.toBeInTheDocument();
  });
});
