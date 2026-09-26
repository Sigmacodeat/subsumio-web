import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The approvals page offers decision buttons only when the server would
// accept the decision: lawyer/admin, and not the person who proposed it.

const me = vi.hoisted(() => ({ user: { email: "anwalt@k.example", role: "lawyer" } }));

vi.mock("@/lib/queries/auth", () => ({ useMe: () => ({ data: me }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listAllPages: vi.fn(async () => [
        {
          slug: "agent-actions/a1",
          title: "Mandantennachricht",
          type: "agent_action",
          frontmatter: {
            action_type: "client_message_send",
            status: "pending",
            proposed_by: "sek@k.example",
            submitted_by: "sek@k.example",
            summary: "Nachricht an Mandant",
            proposed_at: "2026-09-25T10:00:00Z",
          },
        },
      ]),
    },
  },
}));

import ApprovalsPage from "./page";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ApprovalsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  me.user = { email: "anwalt@k.example", role: "lawyer" };
});

describe("ApprovalsPage — decision buttons follow the server rule", () => {
  it("a lawyer who did not propose the action may decide", async () => {
    renderPage();
    expect(await screen.findByText("approvals.approve_execute")).toBeInTheDocument();
  });

  it("the assistant sees that a lawyer decides", async () => {
    me.user = { email: "andere@k.example", role: "assistant" };
    renderPage();
    expect(await screen.findByText(/Wartet auf die Entscheidung/)).toBeInTheDocument();
    expect(screen.queryByText("approvals.approve_execute")).not.toBeInTheDocument();
  });

  it("the proposer does not decide their own action", async () => {
    me.user = { email: "sek@k.example", role: "lawyer" };
    renderPage();
    expect(await screen.findByText(/zweite Person/)).toBeInTheDocument();
    expect(screen.queryByText("approvals.approve_execute")).not.toBeInTheDocument();
  });
});
