// @vitest-environment jsdom
// UIS-3-6 (ACL part): removing a member asks first, a failed group delete is
// reported, and a failed load is not shown as "no groups".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  groups: {} as Record<string, unknown>,
}));
const removeMember = vi.hoisted(() => vi.fn());
const deleteGroup = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const addToast = vi.hoisted(() => vi.fn());
const refetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/queries/settings", () => ({
  useAclGroups: () => ({ ...state.groups, refetch }),
  useCreateAclGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAclGroup: () => ({ mutateAsync: deleteGroup, isPending: false }),
  useAclGroupMembers: (id?: string) => ({
    data: id ? [{ user_id: "u2", created_at: "2026-09-01" }] : [],
    isLoading: false,
  }),
  useAddAclGroupMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveAclGroupMember: () => ({ mutateAsync: removeMember, isPending: false }),
  useTeam: () => ({ data: { members: [{ id: "u2", name: "Kollegin", email: "k@example.at" }] } }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => confirmMock,
  ConfirmProvider: ({ children }: { children: ReactNode }) => children,
}));

import { AclSettings } from "./acl-settings";

const group = { id: "g1", name: "Familienrecht", member_count: 1, created_at: "2026-09-01" };

beforeEach(() => {
  vi.clearAllMocks();
  state.groups = { data: [group], isLoading: false, isError: false };
});

describe("AclSettings", () => {
  it("asks before removing a member and keeps the member on cancel", async () => {
    confirmMock.mockResolvedValue(false);
    render(<AclSettings />);
    fireEvent.click(screen.getByText("Familienrecht"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Kollegin aus der Gruppe entfernen" })
    );
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("removes the member after confirmation", async () => {
    confirmMock.mockResolvedValue(true);
    removeMember.mockResolvedValue({});
    render(<AclSettings />);
    fireEvent.click(screen.getByText("Familienrecht"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Kollegin aus der Gruppe entfernen" })
    );
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith({ groupId: "g1", userId: "u2" }));
  });

  it("reports a failed group delete", async () => {
    confirmMock.mockResolvedValue(true);
    deleteGroup.mockRejectedValue(new Error("Keine Berechtigung"));
    render(<AclSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Gruppe Familienrecht löschen" }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error", description: "Keine Berechtigung" })
      )
    );
  });

  it("shows a load error with retry, not 'no groups'", () => {
    state.groups = { data: undefined, isLoading: false, isError: true };
    render(<AclSettings />);
    expect(screen.getByRole("alert")).toHaveTextContent("Gruppen konnten nicht geladen werden");
    expect(screen.queryByText("Noch keine Gruppen angelegt")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(refetch).toHaveBeenCalled();
  });
});
