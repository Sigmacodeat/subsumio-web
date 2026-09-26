// @vitest-environment jsdom
// Team page (UIS-4-1): a failed load is an error with retry, never the
// "create a team" form; a refused invite shows the server's reason.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const orgState = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
const inviteMutateAsync = vi.hoisted(() => vi.fn());
const refetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/queries/settings", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries/settings")>("@/lib/queries/settings");
  const idle = { mutateAsync: vi.fn(), isPending: false };
  return {
    ApiMutationError: actual.ApiMutationError,
    useOrg: () => ({ ...orgState.current, refetch }),
    useCreateOrg: () => idle,
    useInviteMemberOrg: () => ({ mutateAsync: inviteMutateAsync, isPending: false }),
    useRemoveMemberOrg: () => idle,
    useLeaveOrg: () => idle,
  };
});
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => vi.fn(async () => true),
  ConfirmProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  return { useLang: () => ({ lang: "de", t: actual.createT("de"), setLang: vi.fn() }) };
});

import { ApiMutationError } from "@/lib/queries/settings";
import TeamPage from "./page";

beforeEach(() => {
  inviteMutateAsync.mockReset();
  refetch.mockReset();
});

describe("team page", () => {
  it("shows a load error with retry instead of the create form", () => {
    orgState.current = { isLoading: false, isError: true, data: undefined };
    render(<TeamPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Das Team konnte nicht geladen werden.");
    expect(screen.queryByText("Erstellen")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("reports a refused invite instead of 'invitation sent'", async () => {
    orgState.current = {
      isLoading: false,
      isError: false,
      data: {
        org: { id: "o1", name: "Kanzlei Beispiel", ownerId: "u1" },
        members: [{ id: "u1", name: "Inhaberin", email: "i@example.at", isOwner: true }],
        isOwner: true,
      },
    };
    inviteMutateAsync.mockRejectedValue(
      new ApiMutationError("Bereits Mitglied", "already_member", 409)
    );
    render(<TeamPage />);
    fireEvent.change(screen.getByPlaceholderText("kollegin@kanzlei.at"), {
      target: { value: "k@example.at" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Einladen" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("invites with the chosen role; the least privileged staff role is preselected", async () => {
    orgState.current = {
      isLoading: false,
      isError: false,
      data: {
        org: { id: "o1", name: "Kanzlei Beispiel", ownerId: "u1" },
        members: [{ id: "u1", name: "Inhaberin", email: "i@example.at", isOwner: true }],
        isOwner: true,
      },
    };
    inviteMutateAsync.mockReset();
    inviteMutateAsync.mockResolvedValue({ ok: true });
    render(<TeamPage />);
    const roleSelect = screen.getByLabelText("Rolle im Team") as HTMLSelectElement;
    expect(roleSelect.value).toBe("assistant");
    expect([...roleSelect.options].map((o) => o.value)).not.toContain("admin");
    fireEvent.change(roleSelect, { target: { value: "client_viewer" } });
    fireEvent.change(screen.getByPlaceholderText("kollegin@kanzlei.at"), {
      target: { value: "m@example.at" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Einladen" }));
    await waitFor(() =>
      expect(inviteMutateAsync).toHaveBeenCalledWith({ email: "m@example.at", role: "client_viewer" })
    );
  });
});
