import type { Meta, StoryObj } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreditsHealthCard } from "./credits-health-card";

// Mock fetch for stories
const mockFetch = (data: unknown, status = 200) => {
  globalThis.fetch = (() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
    } as Response)) as unknown as typeof fetch;
};

const withQueryClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
};

const meta: Meta<typeof CreditsHealthCard> = {
  title: "Admin/CreditsHealthCard",
  component: CreditsHealthCard,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Live Provider-Credits Health Widget. Pollt /api/health/credits alle 60s. " +
          "Zeigt Status pro Provider (ok/depleted/error/not_configured) mit Latency, " +
          "Fehler-Details und Auflad-Links. Rotes Banner bei Issues.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      return (
        <QueryClientProvider client={queryClient}>
          <div className="max-w-md">
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AllOk: Story = {
  render: () => {
    mockFetch({
      providers: {
        anthropic: { status: "ok", latencyMs: 42 },
        openrouter: { status: "ok", latencyMs: 128 },
      },
      allOk: true,
      checkedAt: new Date().toISOString(),
    });
    return withQueryClient(<CreditsHealthCard />);
  },
  parameters: {
    docs: {
      description: { story: "Alle Provider sind gesund. Grüne Status-Badges." },
    },
  },
};

export const AnthropicDepleted: Story = {
  render: () => {
    mockFetch(
      {
        providers: {
          anthropic: {
            status: "depleted",
            latencyMs: 50,
            error: "Credit balance too low",
          },
          openrouter: { status: "ok", latencyMs: 100 },
        },
        allOk: false,
        checkedAt: new Date().toISOString(),
      },
      503
    );
    return withQueryClient(<CreditsHealthCard />);
  },
  parameters: {
    docs: {
      description: {
        story:
          "Anthropic Credits leer. Rotes Banner mit Aktion-Anweisung. " +
          "'Aufladen →' Link zur Anthropic Billing Page.",
      },
    },
  },
};

export const OpenRouterError: Story = {
  render: () => {
    mockFetch(
      {
        providers: {
          anthropic: { status: "ok", latencyMs: 42 },
          openrouter: {
            status: "error",
            latencyMs: 10004,
            error: "Timeout (10s)",
          },
        },
        allOk: false,
        checkedAt: new Date().toISOString(),
      },
      503
    );
    return withQueryClient(<CreditsHealthCard />);
  },
  parameters: {
    docs: {
      description: {
        story:
          "OpenRouter hat einen Fehler (z.B. Timeout). Amber Status. " +
          "Aufladen-Link wird auch bei error gezeigt.",
      },
    },
  },
};

export const NotConfigured: Story = {
  render: () => {
    mockFetch({
      providers: {
        anthropic: { status: "not_configured", latencyMs: null },
        openrouter: { status: "not_configured", latencyMs: null },
      },
      allOk: true,
      checkedAt: new Date().toISOString(),
    });
    return withQueryClient(<CreditsHealthCard />);
  },
  parameters: {
    docs: {
      description: {
        story: "Keine API-Keys konfiguriert. Graue Status-Badges.",
      },
    },
  },
};

export const BothDepleted: Story = {
  render: () => {
    mockFetch(
      {
        providers: {
          anthropic: {
            status: "depleted",
            latencyMs: 50,
            error: "Credit balance too low",
          },
          openrouter: {
            status: "depleted",
            latencyMs: 80,
            error: "Insufficient credits",
          },
        },
        allOk: false,
        checkedAt: new Date().toISOString(),
      },
      503
    );
    return withQueryClient(<CreditsHealthCard />);
  },
  parameters: {
    docs: {
      description: {
        story: "Beide Provider leer. Kritischer Zustand — Pipeline komplett blockiert.",
      },
    },
  },
};

export const Loading: Story = {
  render: () => {
    // Never resolve → stays in loading state
    globalThis.fetch = (() => new Promise(() => {})) as unknown as typeof fetch;
    return withQueryClient(<CreditsHealthCard />);
  },
  parameters: {
    docs: {
      description: { story: "Loading-State mit Spinner und 'Provider werden geprüft…'" },
    },
  },
};

export const FetchError: Story = {
  render: () => {
    globalThis.fetch = (() =>
      Promise.reject(new Error("Network error"))) as unknown as typeof fetch;
    return withQueryClient(<CreditsHealthCard />);
  },
  parameters: {
    docs: {
      description: {
        story: "Fetch komplett fehlgeschlagen (z.B. Server nicht erreichbar).",
      },
    },
  },
};
