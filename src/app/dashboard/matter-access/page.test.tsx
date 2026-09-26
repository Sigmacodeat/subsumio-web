// @vitest-environment jsdom
// UIS-0-18: revoking a colleague's access to a matter asks first.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const csrfFetch = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("case=legal/cases/m1"),
}));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => confirmMock,
  ConfirmProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ lang: "de", t: (k: string) => k }) }));

import MatterAccessPage from "./page";

const access = {
  case_slug: "legal/cases/m1",
  title: "Akte M1",
  permissions: {
    visibility: "restricted",
    allowed_users: ["u1"],
    grants: [{ user_id: "u2", level: "read", granted_by: "u1", granted_at: "2026-09-01" }],
  },
  my_level: "write",
  can_manage: true,
  can_grant: true,
  me: "u1",
  members: [
    { id: "u1", name: "Anwältin", email: "a@example.at", role: "lawyer" },
    { id: "u2", name: "Kollege", email: "k@example.at", role: "lawyer" },
  ],
  audit: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: access }))
  );
  csrfFetch.mockResolvedValue(Response.json({ data: { ok: true } }));
});

describe("matter access page", () => {
  it("does not revoke when the confirmation is cancelled", async () => {
    confirmMock.mockResolvedValue(false);
    render(<MatterAccessPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Zurücknehmen" }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(confirmMock.mock.calls[0][0].message).toContain("Kollege");
    expect(csrfFetch).not.toHaveBeenCalled();
  });

  it("revokes after confirmation", async () => {
    confirmMock.mockResolvedValue(true);
    render(<MatterAccessPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Zurücknehmen" }));
    await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
    const body = JSON.parse(csrfFetch.mock.calls[0][1].body);
    expect(body.grants).toEqual([]);
  });
});
