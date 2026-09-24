import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TimeSuggestionsPage from "./page";

const createPage = vi.fn();
const timeCreate = vi.fn();
const mockFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      createPage: (...a: unknown[]) => createPage(...a),
      listAllPages: vi
        .fn()
        .mockResolvedValue([{ slug: "legal/cases/a", title: "Akte A", frontmatter: {} }]),
    },
    time: { create: (...a: unknown[]) => timeCreate(...a) },
  },
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ data: { user: { email: "me@example.com" } } }),
}));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));

const suggestion = (id: string, extra: Record<string, unknown>) => ({
  id,
  user_email: "me@example.com",
  date: "2026-09-19",
  start_time: "09:00",
  end_time: "09:45",
  duration_minutes: 45,
  description: "Schriftsatz",
  activity_type: "drafting",
  activity_ids: [],
  status: "suggested",
  confidence: "high",
  created_at: "2026-09-19T20:00:00Z",
  ...extra,
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TimeSuggestionsPage />
    </QueryClientProvider>
  );
}

function stubSuggestions(items: unknown[]) {
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes("/api/time-suggestions")) {
      return Promise.resolve(Response.json({ data: { suggestions: items } }));
    }
    return Promise.resolve(Response.json({ data: { enabled: true } }));
  });
  vi.stubGlobal("fetch", mockFetch);
}

describe("time suggestions", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    createPage.mockReset().mockResolvedValue({});
    timeCreate.mockReset().mockResolvedValue({ id: "t1" });
  });

  it("hides colleagues' suggestions", async () => {
    stubSuggestions([
      suggestion("mine", { case_slug: "legal/cases/a" }),
      suggestion("theirs", { user_email: "colleague@example.com", description: "Fremd" }),
    ]);
    renderPage();
    expect(await screen.findByText("Schriftsatz")).toBeInTheDocument();
    expect(screen.queryByText("Fremd")).not.toBeInTheDocument();
  });

  it("books the corrected values and records the change", async () => {
    stubSuggestions([suggestion("s1", { case_slug: "legal/cases/a" })]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /vor dem Übernehmen ändern/ }));
    fireEvent.change(screen.getByLabelText("Minuten"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Tätigkeit"), { target: { value: "Klage entworfen" } });
    fireEvent.click(screen.getByRole("button", { name: /Übernehmen/ }));
    await waitFor(() => expect(timeCreate).toHaveBeenCalled());
    expect(timeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        minutes: 30,
        description: "Klage entworfen",
        case_slug: "legal/cases/a",
      })
    );
    await waitFor(() => expect(createPage).toHaveBeenCalled());
    const fm = createPage.mock.calls[0][0].frontmatter;
    expect(fm.status).toBe("modified");
    expect(fm.time_entry_id).toBe("t1");
    expect(fm.original).toMatchObject({ duration_minutes: 45, description: "Schriftsatz" });
  });

  it("requires a matter before booking a suggestion without one", async () => {
    stubSuggestions([suggestion("s2", {})]);
    renderPage();
    const book = await screen.findByRole("button", { name: /Übernehmen/ });
    expect(book).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Bitte eine Akte wählen.");
  });
});
