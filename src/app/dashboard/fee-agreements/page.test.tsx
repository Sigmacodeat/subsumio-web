// @vitest-environment jsdom
// UIS-3-14: a failed load shows an error with retry, never "no agreements".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const batchListPagesDetailed = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      batchListPagesDetailed: (...a: unknown[]) => batchListPagesDetailed(...a),
      listAllPages: vi.fn(async () => []),
    },
  },
}));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));
// Stable toast: the page reloads whenever `addToast` changes identity.
const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => toast }));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  const t = actual.createT("de");
  return { useLang: () => ({ lang: "de", t, setLang: vi.fn() }) };
});

import { D } from "@/content/dashboard";
import FeeAgreementsPage from "./page";

beforeEach(() => {
  batchListPagesDetailed.mockReset();
});

describe("fee agreements page", () => {
  it("shows a load error instead of the empty state", async () => {
    batchListPagesDetailed.mockResolvedValue({ results: {}, errors: ["fee_agreement"] });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FeeAgreementsPage />
      </QueryClientProvider>
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(D["fee.err_load"].de);
    expect(screen.queryByText(D["fee.empty"].de)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });
});
