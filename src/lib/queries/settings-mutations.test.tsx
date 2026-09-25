// @vitest-environment jsdom
// Team, ACL-group and SCIM mutations reject on an error status (UIS-4-1,
// UIS-3-6, UIS-5-7): `.then((r) => r.json())` alone resolved on 4xx/5xx, so a
// failed change was reported as a success.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const csrfFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));

import {
  ApiMutationError,
  jsonOrThrow,
  useCreateOrg,
  useDeleteAclGroup,
  useInviteMemberOrg,
  useLeaveOrg,
  useRemoveMemberOrg,
} from "./settings";
import { useScimSync } from "./scim";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function failWith(status: number, code: string, error: string) {
  csrfFetch.mockImplementation(async () => Response.json({ error, code }, { status }));
}

beforeEach(() => {
  csrfFetch.mockReset();
});

describe("jsonOrThrow", () => {
  it("carries the machine-readable code of an apiError body", async () => {
    const err = await jsonOrThrow(
      Response.json({ error: "Keine freien Plätze", code: "no_seats_left" }, { status: 409 })
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiMutationError);
    expect((err as ApiMutationError).code).toBe("no_seats_left");
    expect((err as ApiMutationError).status).toBe(409);
    expect((err as Error).message).toBe("Keine freien Plätze");
  });
});

describe("team mutations", () => {
  it("invite rejects when the server refuses", async () => {
    failWith(409, "already_member", "Bereits Mitglied");
    const { result } = renderHook(() => useInviteMemberOrg(), { wrapper });
    await expect(result.current.mutateAsync("a@example.at")).rejects.toMatchObject({
      code: "already_member",
    });
  });

  it("create, remove and leave reject on an error status", async () => {
    failWith(500, "internal", "Fehler");
    const create = renderHook(() => useCreateOrg(), { wrapper }).result;
    const remove = renderHook(() => useRemoveMemberOrg(), { wrapper }).result;
    const leave = renderHook(() => useLeaveOrg(), { wrapper }).result;
    await expect(create.current.mutateAsync("Kanzlei")).rejects.toBeInstanceOf(ApiMutationError);
    await expect(remove.current.mutateAsync("u1")).rejects.toBeInstanceOf(ApiMutationError);
    await expect(leave.current.mutateAsync()).rejects.toBeInstanceOf(ApiMutationError);
  });

  it("invite resolves with the body on success", async () => {
    csrfFetch.mockResolvedValue(Response.json({ ok: true, devJoinUrl: "https://x/join" }));
    const { result } = renderHook(() => useInviteMemberOrg(), { wrapper });
    await expect(result.current.mutateAsync("a@example.at")).resolves.toEqual({
      ok: true,
      devJoinUrl: "https://x/join",
    });
  });
});

describe("ACL group delete", () => {
  it("rejects when the group was not deleted", async () => {
    failWith(403, "forbidden", "Keine Berechtigung");
    const { result } = renderHook(() => useDeleteAclGroup(), { wrapper });
    await expect(result.current.mutateAsync("g1")).rejects.toThrow("Keine Berechtigung");
  });
});

describe("SCIM sync", () => {
  it("rejects a failed sync instead of reporting it as done", async () => {
    failWith(500, "sync_failed", "Sync fehlgeschlagen");
    const { result } = renderHook(() => useScimSync(), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toThrow("Sync fehlgeschlagen");
  });
});
