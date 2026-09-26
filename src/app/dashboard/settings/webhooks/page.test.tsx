import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({
  addToast: vi.fn(),
  csrfFetch: vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ data: {} })),
}));

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (key: string) => key, setLang: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: m.addToast }) }));
vi.mock("@/lib/csrf", () => ({
  csrfFetch: (url: string, init?: RequestInit) => m.csrfFetch(url, init),
}));

import WebhooksPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: {
          webhooks: [
            {
              id: "wh-1",
              url: "https://receiver.example/h",
              events: ["intake.new"],
              status: "disabled",
              created_at: "2099-01-01T00:00:00.000Z",
              disabled_reason: "auto_failures",
              disabled_at: "2099-01-02T00:00:00.000Z",
              disabled_failures: 10,
              disabled_last_error: "HTTP 503",
            },
          ],
        },
      })
    )
  );
});

describe("Webhooks settings — auto-disabled webhook", () => {
  it("explains the automatic switch-off and reactivates on request", async () => {
    render(<WebhooksPage />);
    expect(await screen.findByText(/Automatisch deaktiviert/)).toBeInTheDocument();
    expect(screen.getByText(/10 Zustellungen in Folge/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reaktivieren" }));
    await waitFor(() => expect(m.csrfFetch).toHaveBeenCalledTimes(1));
    const [url, init] = m.csrfFetch.mock.calls[0];
    expect(url).toBe("/api/webhooks/outgoing");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ id: "wh-1", action: "reactivate" });
    await waitFor(() =>
      expect(m.addToast).toHaveBeenCalledWith({ type: "success", title: "Webhook reaktiviert" })
    );
  });
});
