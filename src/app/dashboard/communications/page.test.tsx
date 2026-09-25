import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addToast = vi.fn();
const csrfFetchMock = vi.fn();
const fetchMock = vi.fn();
const t = (k: string) => k;
const triageAction = vi.fn(async () => ({ ok: true }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetchMock(...a) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t, lang: "de" }) }));
vi.mock("@/lib/realtime", () => ({ useRealtime: () => undefined }));
vi.mock("@/lib/queries/sidebar-badges", () => ({ useSidebarBadges: () => ({ data: {} }) }));
vi.mock("@/components/dashboard/review-inbox-tab", () => ({ ReviewInboxTab: () => null }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: {
    reviewInbox: { list: vi.fn(async () => ({ items: [], total: 0 })) },
    brain: {
      batchListPagesDetailed: vi.fn(async () => ({ results: {}, errors: [] })),
      updatePage: vi.fn(),
    },
    whatsapp: { muted: vi.fn(async () => ({ count: 0, lastAt: null, snippets: [] })) },
    inbox: { markRead: vi.fn() },
    triage: { action: (...a: unknown[]) => triageAction(...(a as [])) },
    cases: { list: vi.fn(async () => []) },
  },
}));

import CommunicationsPage from "./page";

const mail = {
  id: "m1",
  direction: "inbound",
  subject: "Fristsetzung bis 30.09.2026 — dringend",
  text: "Bitte bis 30.09.2026 Stellung nehmen. Frist!",
  fromEmail: "gegner@example.at",
  createdAt: "2026-09-24T09:00:00Z",
  isRead: true,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CommunicationsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ data: { messages: [mail] } }), { status: 200 })
  );
  csrfFetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("Kommunikation — Postfach-Mails", () => {
  it("'als ungelesen markieren' sets the mail unread", async () => {
    renderPage();
    await screen.findByText(mail.subject);
    await userEvent.click(screen.getByRole("button", { name: /ungelesen/i }));
    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalled());
    const [url, init] = csrfFetchMock.mock.calls[0];
    expect(url).toBe("/api/email/messages/m1");
    expect(JSON.parse(String(init.body))).toEqual({ isRead: false });
  });

  it("offers no page-only triage actions on mailbox mails", async () => {
    renderPage();
    await screen.findByText(mail.subject);
    // The triage card is there (matter assignment works for mails) …
    expect(screen.getByRole("button", { name: /Akte zuweisen/ })).toBeInTheDocument();
    // … but no status actions that only exist for brain pages.
    expect(screen.queryByRole("button", { name: /Einordnung übernehmen/i })).toBeNull();
    expect(triageAction).not.toHaveBeenCalled();
  });

  it("a failed mailbox read is shown, not an empty mailbox", async () => {
    fetchMock.mockImplementation(async () => new Response("x", { status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/E-Mails konnten nicht geladen/);
  });
});
