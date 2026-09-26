import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PowerOfAttorneyPage from "./page";

const addToast = vi.fn();
const csrfFetchMock = vi.fn();
const listAllPages = vi.fn();
let search = new URLSearchParams();
const t = (k: string) => k;

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetchMock(...a) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t, lang: "de" }) }));
vi.mock("@/lib/use-portal-visit-events", () => ({ usePortalVisitEvents: () => undefined }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  CASE_PICKER_MAX: 10_000,
  api: {
    brain: {
      listAllPages: (...a: unknown[]) => listAllPages(...a),
      listAllPagesDetailed: async (...a: unknown[]) => ({
        pages: await listAllPages(...a),
        capped: false,
      }),
    },
  },
}));

function poaPage(id: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    slug: `legal/poa/${id}`,
    title: id,
    frontmatter: {
      id,
      case_slug: "cases/a",
      client_name: `Mandant ${id}`,
      type: "general",
      scope: "Vertretung",
      status,
      created_at: "2026-09-01T00:00:00Z",
      ...extra,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
  listAllPages.mockImplementation(async ({ type }: { type: string }) =>
    type === "legal_case" ? [{ slug: "cases/a", title: "Akte A" }] : []
  );
});

describe("Vollmachten page", () => {
  it("a load error shows an error with retry, not the empty state", async () => {
    listAllPages.mockImplementation(async ({ type }: { type: string }) => {
      if (type === "power_of_attorney") throw new Error("down");
      return [];
    });
    render(<PowerOfAttorneyPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht geladen/);
    expect(screen.queryByText("poa.empty")).not.toBeInTheDocument();
  });

  it("offers send/sign only for open requests (not revoked, expired or signed)", async () => {
    listAllPages.mockImplementation(async ({ type }: { type: string }) =>
      type === "power_of_attorney"
        ? [
            poaPage("open", "sent"),
            poaPage("revoked", "revoked"),
            poaPage("expired", "expired"),
            poaPage("lapsed", "sent", { expires_at: "2020-01-01" }),
            poaPage("signed", "signed"),
          ]
        : []
    );
    render(<PowerOfAttorneyPage />);
    await screen.findByText("Mandant open");
    expect(screen.getAllByRole("button", { name: "poa.btn_sign_aria" })).toHaveLength(1);
  });

  it("creates a power of attorney through csrfFetch", async () => {
    search = new URLSearchParams("case_slug=cases/a&client_name=Maria");
    csrfFetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    render(<PowerOfAttorneyPage />);
    const scope = await waitFor(() => {
      const el = document.getElementById("poa-scope");
      if (!el) throw new Error("form not open");
      return el;
    });
    fireEvent.change(scope, { target: { value: "Prozessvertretung" } });
    await userEvent.click(screen.getByRole("button", { name: /poa.btn_save/ }));
    await waitFor(() =>
      expect(csrfFetchMock).toHaveBeenCalledWith(
        "/api/power-of-attorney",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });
});
