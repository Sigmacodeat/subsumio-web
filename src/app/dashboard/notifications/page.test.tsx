import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

const del = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/api", () => ({
  api: {
    notifications: {
      list: vi.fn(async () => ({
        notifications: [
          {
            id: "n1",
            type: "mention",
            data: { message: "Bitte Akte prüfen" },
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
      })),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      delete: (...a: unknown[]) => del(...(a as [])),
      deleteAllRead: vi.fn(),
    },
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/notifications",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("@/lib/realtime", () => ({ useRealtime: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/components/pwa/web-push-toggle", () => ({ WebPushToggle: () => null }));
vi.mock("@/lib/tracking", () => ({ tracking: new Proxy({}, { get: () => () => undefined }) }));

import NotificationCenterPage from "./page";

beforeEach(() => del.mockClear());

describe("Benachrichtigungen", () => {
  it("asks before deleting a single notification", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ConfirmProvider>
          <NotificationCenterPage />
        </ConfirmProvider>
      </QueryClientProvider>
    );
    const buttons = await screen.findAllByRole("button", { name: "notifications.aria_delete" });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText("Benachrichtigung löschen")).toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("n1"));
  });
});
