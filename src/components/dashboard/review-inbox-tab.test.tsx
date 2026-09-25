import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addToast = vi.fn();
const csrfFetchMock = vi.fn();
const t = (k: string) => k;

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetchMock(...a) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t, lang: "de" }) }));
vi.mock("@/lib/realtime", () => ({ useRealtime: () => undefined }));

import { ReviewInboxTab } from "./review-inbox-tab";

const requestItem = {
  id: "r1",
  type: "document_request",
  title: "Unterlagen anfordern",
  caseSlug: "cases/a",
  caseTitle: "Akte A",
  pageSlug: "cases/a",
  requestSlug: "legal/document-requests/r1",
  status: "draft",
  createdAt: "2026-09-20T09:00:00Z",
  dueDate: null,
  source: null,
  urgency: null,
  deadlineType: null,
  law: null,
  confidence: null,
  sourceQuote: null,
  partyName: null,
  partyRole: null,
  factId: null,
  factStatement: null,
  factConfidence: null,
  arrayIndex: null,
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReviewInboxTab />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // api.reviewInbox.list goes through csrfFetch (GET) and gets the wrapped body.
  csrfFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/api/review-inbox") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify({ data: { items: [requestItem], total: 1 } }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ error: "Keine Berechtigung", code: "forbidden" }), {
      status: 403,
    });
  });
});

describe("ReviewInboxTab", () => {
  it("shows the items of the wrapped route response", async () => {
    renderTab();
    expect(await screen.findByText("Unterlagen anfordern")).toBeInTheDocument();
  });

  it("a refused write is reported as an error, never as success", async () => {
    renderTab();
    await screen.findByText("Unterlagen anfordern");
    await userEvent.click(screen.getByRole("button", { name: /Senden/ }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error", title: "Keine Berechtigung" })
      )
    );
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
    const write = csrfFetchMock.mock.calls.find(([u]) => u === "/api/document-requests");
    expect(write?.[1]).toMatchObject({ method: "PATCH" });
  });
});
