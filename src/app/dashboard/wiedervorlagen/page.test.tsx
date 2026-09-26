import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const requested: string[] = [];
const followUps = Array.from({ length: 250 }, (_, i) => ({
  slug: `legal/follow-ups/wv-${i}`,
  title: `Wiedervorlage ${i}`,
  type: "legal_follow_up",
  frontmatter: { type: "legal_follow_up", date: "2026-11-01", completed: false },
}));

/** Engine-like listing: at most 100 rows per request, offset paging. */
function listResponse(url: string): Response {
  const u = new URL(url, "http://localhost");
  const type = u.searchParams.get("type");
  const limit = Math.min(Number(u.searchParams.get("limit") ?? 50), 100);
  const offset = Number(u.searchParams.get("offset") ?? 0);
  const rows = type === "legal_follow_up" ? followUps : [];
  return Response.json(rows.slice(offset, offset + limit));
}

vi.mock("@/lib/csrf", () => ({
  csrfFetch: vi.fn(async (url: string) => {
    requested.push(String(url));
    return listResponse(String(url));
  }),
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import WiedervorlagenPage from "./page";

beforeEach(() => {
  requested.length = 0;
});

describe("Wiedervorlagen", () => {
  it("lists every follow-up, not only the first 100/200 last-edited ones", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WiedervorlagenPage />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText("Wiedervorlage 249")).toBeInTheDocument());
    expect(screen.getByText("Wiedervorlage 0")).toBeInTheDocument();
    expect(screen.queryByText(/Es werden nur die ersten/)).not.toBeInTheDocument();
    // Matters for the titles are paged too (no 200 cap via search).
    expect(requested.some((u) => u.includes("type=legal_case"))).toBe(true);
  });
});
