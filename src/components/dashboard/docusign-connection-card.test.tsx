import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({
  addToast: vi.fn(),
  csrfFetch: vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ ok: true })),
  status: {} as Record<string, unknown>,
}));

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: m.addToast }) }));
vi.mock("@/lib/csrf", () => ({
  csrfFetch: (url: string, init?: RequestInit) => m.csrfFetch(url, init),
}));

import { DocusignConnectionCard } from "./docusign-connection-card";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/api/docusign/auth")
        ? Response.json({ authUrl: "https://account-d.docusign.com/oauth/auth?x=1" })
        : Response.json(m.status)
    )
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("DocusignConnectionCard (R8-11)", () => {
  it("shows the connected account and the environment", async () => {
    m.status = {
      configured: true,
      environment: "production",
      connected: true,
      expired: false,
      renewable: true,
      email: "anwalt@kanzlei.example",
    };
    render(<DocusignConnectionCard />);
    expect(await screen.findByText(/Verbunden als anwalt@kanzlei.example/)).toBeInTheDocument();
    expect(screen.getByText("Umgebung: Produktion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trennen/ })).toBeInTheDocument();
  });

  it("not connected → connect starts the existing OAuth flow", async () => {
    m.status = { configured: true, environment: "demo", connected: false };
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...original,
        set href(v: string) {
          assign(v);
        },
      },
    });
    render(<DocusignConnectionCard />);
    expect(await screen.findByText(/Nicht verbunden/)).toBeInTheDocument();
    expect(screen.getByText(/Test-Umgebung \(nicht rechtsverbindlich\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mit DocuSign verbinden/ }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://account-d.docusign.com/oauth/auth?x=1")
    );
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  it("disconnect posts to the disconnect route and reloads the status", async () => {
    m.status = { configured: true, environment: "production", connected: true, renewable: true };
    render(<DocusignConnectionCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Trennen/ }));
    await waitFor(() =>
      expect(m.csrfFetch).toHaveBeenCalledWith("/api/docusign/disconnect", { method: "POST" })
    );
    await waitFor(() =>
      expect(m.addToast).toHaveBeenCalledWith({ type: "success", title: "DocuSign getrennt" })
    );
  });

  it("expired without refresh token asks to reconnect", async () => {
    m.status = { configured: true, connected: true, expired: true, renewable: false };
    render(<DocusignConnectionCard />);
    expect(
      await screen.findByRole("button", { name: /DocuSign neu verbinden/ })
    ).toBeInTheDocument();
  });

  it("not configured shows the reason and no buttons", async () => {
    m.status = { configured: false, connected: false, reason: "demo_environment_in_production" };
    render(<DocusignConnectionCard />);
    expect(await screen.findByText(/nicht rechtsverbindlich/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
