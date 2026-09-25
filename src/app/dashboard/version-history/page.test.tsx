import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VersionHistoryPage from "./page";

const getPage = vi.fn();
const listPages = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      getPage: (...a: unknown[]) => getPage(...a),
      listPages: (...a: unknown[]) => listPages(...a),
    },
  },
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));
vi.mock("@/components/dashboard/page-header", () => ({ PageHeader: () => null }));

describe("Versionsverlauf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPages.mockResolvedValue([{ slug: "docs/brief", title: "Brief" }]);
    getPage.mockResolvedValue({ slug: "docs/brief", title: "Brief", frontmatter: {} });
  });

  it("asks the server for this entry's audit trail and reports failed loads", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).startsWith("/api/audit")
        ? new Response("{}", { status: 503 })
        : new Response("{}", { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<VersionHistoryPage />);
    await userEvent.type(screen.getByRole("textbox"), "Brief{Enter}");

    expect(
      await screen.findByText(/Die Versionen konnten nicht geladen werden/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Das Änderungsprotokoll konnte nicht geladen werden/)
    ).toBeInTheDocument();
    const auditCall = fetchMock.mock.calls.find(([u]) => String(u).startsWith("/api/audit"));
    expect(String(auditCall![0])).toContain("entityId=docs%2Fbrief");
  });
});
