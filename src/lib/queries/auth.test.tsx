// @vitest-environment jsdom
// Logout and a change of person/firm clear the device's offline data, so a
// queue of the previous user is never replayed in the next account.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const offline = vi.hoisted(() => ({
  clearOfflineData: vi.fn(async () => {}),
  setOfflineOwner: vi.fn(async () => {}),
  offlineOwnerDiffersFromUser: vi.fn(() => false),
}));
vi.mock("@/lib/offline-store", () => offline);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/dashboard",
}));
vi.mock("@/lib/push-client", () => ({
  currentPushEndpoint: async () => null,
  unsubscribeCurrentPush: async () => {},
}));
vi.mock("@/lib/tracking", () => ({
  tracking: { auth: { logout: vi.fn() } },
  resetUser: vi.fn(),
}));
const apiMock = vi.hoisted(() => ({
  auth: {
    logout: vi.fn(async () => ({ ok: true })),
    me: vi.fn(async () => ({ user: { id: "u1" }, offlineScope: "u1:abc" })),
  },
}));
vi.mock("@/lib/api", () => ({ api: apiMock, isPublicRoute: () => false }));

import { useLogout, useMe } from "./auth";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("offline data follows the session", () => {
  it("logout deletes the offline data", async () => {
    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(offline.clearOfflineData).toHaveBeenCalledTimes(1);
  });

  it("the signed-in person's scope binds the offline store", async () => {
    renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(offline.setOfflineOwner).toHaveBeenCalledWith("u1:abc"));
  });
});
