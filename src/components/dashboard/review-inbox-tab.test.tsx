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

describe("ReviewInboxTab — case scan results", () => {
  const scanItem = {
    ...requestItem,
    id: "agent-runs/supervisor-7",
    type: "case_scan_finding",
    title: "Fall-Scan: Akte A",
    description: "KI-Prüfergebnis zur Akte — anwaltlich zu prüfen, bevor etwas übernommen wird.",
    pageSlug: "agent-runs/supervisor-7",
    requestSlug: null,
    status: "unreviewed",
  };

  beforeEach(() => {
    csrfFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/review-inbox")) {
        return new Response(JSON.stringify({ data: { items: [scanItem], total: 1 } }), {
          status: 200,
        });
      }
      if (u.includes("/api/pages/agent-runs/supervisor-7") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (u.includes("/api/pages/agent-runs/supervisor-7")) {
        return new Response(
          JSON.stringify({
            slug: "agent-runs/supervisor-7",
            title: "Agent-Analyse #7",
            content:
              "## Plan\nx\n\n## Ergebnis\nBefund: Frist nach § 464 ZPO prüfen.\n\n## Specialist-Ergebnisse\nroh",
          }),
          { status: 200 }
        );
      }
      if (u.includes("/api/legal/ground")) {
        return new Response(
          JSON.stringify({
            citations_total: 1,
            citations_verified: 0,
            citations_unverified: 1,
            grounded_citations: [],
          }),
          { status: 200 }
        );
      }
      return new Response("{}", { status: 404 });
    });
  });

  it("shows the finding with grounding, only on request", async () => {
    renderTab();
    await screen.findByText("Fall-Scan: Akte A");
    expect(screen.queryByText(/Befund: Frist/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Ergebnis anzeigen/ }));
    expect(await screen.findByText(/Befund: Frist nach § 464 ZPO prüfen\./)).toBeInTheDocument();
    expect(screen.queryByText("roh")).not.toBeInTheDocument();
    expect(screen.getByText(/anwaltlich zu prüfen\. Nichts davon wurde/)).toBeInTheDocument();
    await waitFor(() =>
      expect(csrfFetchMock.mock.calls.some(([u]) => String(u).includes("/api/legal/ground"))).toBe(
        true
      )
    );
  });

  it("marking it reviewed changes only the result page's review state", async () => {
    renderTab();
    await screen.findByText("Fall-Scan: Akte A");
    await userEvent.click(screen.getByRole("button", { name: /Geprüft/ }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }))
    );
    const write = csrfFetchMock.mock.calls.find(
      ([u, i]) => String(u).includes("/api/pages/") && (i as RequestInit)?.method === "PATCH"
    );
    const body = JSON.parse(String((write?.[1] as RequestInit).body)) as {
      frontmatter: Record<string, unknown>;
      merge: boolean;
    };
    expect(body.merge).toBe(true);
    expect(Object.keys(body.frontmatter).sort()).toEqual(["review_status", "reviewed_at"]);
    expect(body.frontmatter.review_status).toBe("reviewed");
  });
});
