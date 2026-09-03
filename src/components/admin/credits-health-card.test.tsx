import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock fetch before importing the component
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

// Import after mock setup
import { CreditsHealthCard } from "./credits-health-card";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const okResponse: CreditsHealthResult = {
  providers: {
    anthropic: { status: "ok", latencyMs: 42 },
    openrouter: { status: "ok", latencyMs: 100 },
  },
  allOk: true,
  checkedAt: "2024-01-01T00:00:00.000Z",
};

const depletedResponse: CreditsHealthResult = {
  providers: {
    anthropic: { status: "depleted", latencyMs: 50, error: "Credit balance too low" },
    openrouter: { status: "ok", latencyMs: 100 },
  },
  allOk: false,
  checkedAt: "2024-01-01T00:00:00.000Z",
};

const errorResponse: CreditsHealthResult = {
  providers: {
    anthropic: { status: "error", latencyMs: null, error: "Timeout (10s)" },
    openrouter: { status: "ok", latencyMs: 100 },
  },
  allOk: false,
  checkedAt: "2024-01-01T00:00:00.000Z",
};

const notConfiguredResponse: CreditsHealthResult = {
  providers: {
    anthropic: { status: "not_configured", latencyMs: null },
    openrouter: { status: "not_configured", latencyMs: null },
  },
  allOk: true,
  checkedAt: "2024-01-01T00:00:00.000Z",
};

interface ProviderHealth {
  status: "ok" | "depleted" | "error" | "not_configured";
  latencyMs: number | null;
  error?: string;
}

interface CreditsHealthResult {
  providers: Record<string, ProviderHealth>;
  allOk: boolean;
  checkedAt: string;
}

function mockFetchResponse(data: CreditsHealthResult, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response);
}

describe("CreditsHealthCard", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading state initially", () => {
    // Never resolve the fetch
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    renderWithQueryClient(<CreditsHealthCard />);
    expect(screen.getByText(/Provider werden geprüft/i)).toBeInTheDocument();
  });

  it("renders all providers as OK when healthy", async () => {
    mockFetchResponse(okResponse);
    renderWithQueryClient(<CreditsHealthCard />);
    await waitFor(() => {
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
      expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    });
    expect(screen.getByText("Alle OK")).toBeInTheDocument();
    // Latency shown for ok providers
    expect(screen.getByText("42ms")).toBeInTheDocument();
    expect(screen.getByText("100ms")).toBeInTheDocument();
  });

  it("renders depleted status with error message and topup link", async () => {
    mockFetchResponse(depletedResponse, 503);
    renderWithQueryClient(<CreditsHealthCard />);
    await waitFor(() => {
      expect(screen.getByText("Credit balance too low")).toBeInTheDocument();
    });
    expect(screen.getByText("Problem erkannt")).toBeInTheDocument();
    // Topup link for anthropic
    const topupLink = screen.getByText("Aufladen →");
    expect(topupLink).toHaveAttribute("href", "https://console.anthropic.com/settings/billing");
    expect(topupLink).toHaveAttribute("target", "_blank");
    expect(topupLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders error status with error message", async () => {
    mockFetchResponse(errorResponse, 503);
    renderWithQueryClient(<CreditsHealthCard />);
    await waitFor(() => {
      expect(screen.getByText("Timeout (10s)")).toBeInTheDocument();
    });
    expect(screen.getByText("Problem erkannt")).toBeInTheDocument();
  });

  it("renders not_configured status", async () => {
    mockFetchResponse(notConfiguredResponse);
    renderWithQueryClient(<CreditsHealthCard />);
    await waitFor(() => {
      expect(screen.getAllByText("Nicht konfiguriert")).toHaveLength(2);
    });
    expect(screen.getByText("Alle OK")).toBeInTheDocument();
  });

  it("shows action banner when providers have issues", async () => {
    mockFetchResponse(depletedResponse, 503);
    renderWithQueryClient(<CreditsHealthCard />);
    await waitFor(() => {
      expect(screen.getByText(/Aktion erforderlich/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Mindestens ein Provider hat keine Credits mehr/i)).toBeInTheDocument();
  });

  it("does not show action banner when all OK", async () => {
    mockFetchResponse(okResponse);
    renderWithQueryClient(<CreditsHealthCard />);
    await waitFor(() => {
      expect(screen.getByText("Alle OK")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Aktion erforderlich/i)).not.toBeInTheDocument();
  });

  it("refresh button triggers refetch", async () => {
    const user = userEvent.setup();
    mockFetchResponse(okResponse);
    renderWithQueryClient(<CreditsHealthCard />);
    await waitFor(() => {
      expect(screen.getByText("Alle OK")).toBeInTheDocument();
    });
    // Second fetch for refetch
    mockFetchResponse(okResponse);
    const refreshButton = screen.getByLabelText("Aktualisieren");
    await user.click(refreshButton);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it("renders error state when fetch fails completely", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const { _container } = renderWithQueryClient(<CreditsHealthCard />);
    // Wait for query to settle (isError state)
    await waitFor(
      () => {
        expect(screen.getByText(/Health-Check fehlgeschlagen/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("does not show topup link for ok providers", async () => {
    mockFetchResponse(okResponse);
    renderWithQueryClient(<CreditsHealthCard />);
    await waitFor(() => {
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
    });
    expect(screen.queryByText("Aufladen →")).not.toBeInTheDocument();
  });

  it("shows topup link for error providers too", async () => {
    mockFetchResponse(errorResponse, 503);
    renderWithQueryClient(<CreditsHealthCard />);
    await waitFor(() => {
      expect(screen.getByText("Timeout (10s)")).toBeInTheDocument();
    });
    const topupLinks = screen.getAllByText("Aufladen →");
    // Only anthropic has error, openrouter is ok
    expect(topupLinks).toHaveLength(1);
    expect(topupLinks[0]).toHaveAttribute("href", "https://console.anthropic.com/settings/billing");
  });
});
