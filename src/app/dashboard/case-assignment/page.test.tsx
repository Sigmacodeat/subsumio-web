import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CaseAssignmentPage from "./page";

const listAllPages = vi.fn();
const csrfFetch = vi.fn();
const team = {
  data: { members: [{ id: "m1", email: "ohne.name@kanzlei.at", role: "lawyer" }] },
  isError: false,
  refetch: vi.fn(),
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ lang: "de", t: (k: string) => k }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/components/dashboard/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/lib/queries/settings", () => ({ useTeam: () => team }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));
vi.mock("@/lib/api", () => ({
  api: { brain: { listAllPages: (...a: unknown[]) => listAllPages(...a) } },
}));

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CaseAssignmentPage />
    </QueryClientProvider>
  );
}

function matters(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    slug: `legal/cases/a${i}`,
    title: `Akte ${i}`,
    frontmatter: { status: "open" },
  }));
}

describe("Aktenzuweisung", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    csrfFetch.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  it("assigns a member that has no display name (by e-mail)", async () => {
    listAllPages.mockResolvedValue(matters(1));
    renderPage();
    const select = await screen.findByLabelText("Sachbearbeiter für Akte 0");
    await userEvent.selectOptions(select, "ohne.name@kanzlei.at");
    expect(csrfFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(csrfFetch.mock.calls[0]![1].body));
    expect(body.frontmatter.own_lawyer_id).toBe("ohne.name@kanzlei.at");
  });

  it("shows all matters of a group on request, not only the first 10", async () => {
    listAllPages.mockResolvedValue(matters(12));
    renderPage();
    await screen.findByText("Akte 0");
    expect(screen.queryByText("Akte 11")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Alle anzeigen/ }));
    expect(screen.getByText("Akte 11")).toBeInTheDocument();
  });

  it("a failed load is an error with retry, not 'Keine aktiven Akten'", async () => {
    listAllPages.mockRejectedValue(new Error("down"));
    renderPage();
    expect(await screen.findByText("Zuweisungen konnten nicht geladen werden")).toBeInTheDocument();
    expect(screen.queryByText("Keine aktiven Akten")).not.toBeInTheDocument();
  });
});
