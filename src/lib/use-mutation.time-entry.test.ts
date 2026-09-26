// @vitest-environment jsdom
// Offline mobile time entries are replayed through POST /api/time — the same
// billable entry the desktop creates.
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("./offline-store", () => ({
  isOnline: vi.fn(() => true),
  enqueueMutation: vi.fn(async () => {}),
  getPendingMutations: vi.fn(async () => []),
  removeMutation: vi.fn(async () => {}),
  setMutationConflicted: vi.fn(async () => {}),
  setOfflineErrorReporter: vi.fn(),
  getPendingFileUploads: vi.fn(async () => []),
  removeFileUpload: vi.fn(async () => {}),
  incrementFileUploadRetries: vi.fn(async () => {}),
  incrementMutationRetries: vi.fn(async () => {}),
}));
vi.mock("./api", () => ({
  ApiRequestError: class extends Error {},
  api: { brain: { createPage: vi.fn(), getPage: vi.fn() }, upload: { file: vi.fn() } },
}));
const csrfFetch = vi.fn();
vi.mock("./csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));

import { useMutationQueue, __resetMutationQueueForTests } from "./use-mutation";
import { getPendingMutations, incrementMutationRetries, removeMutation } from "./offline-store";
import { api } from "./api";

const entry = {
  id: "m1",
  type: "createTimeEntry" as const,
  payload: { case_slug: "cases/a", description: "Telefonat", minutes: 15, billable: true },
  createdAt: "2026-09-26T08:00:00Z",
};

async function sync() {
  __resetMutationQueueForTests();
  vi.mocked(getPendingMutations).mockResolvedValueOnce([]).mockResolvedValueOnce([entry]);
  vi.mocked(getPendingMutations).mockResolvedValue([]);
  const { result } = renderHook(() => useMutationQueue());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  await act(async () => {
    await result.current.syncPending();
  });
}

describe("offline time entry replay", () => {
  it("posts the queued entry to /api/time and removes it", async () => {
    vi.clearAllMocks();
    csrfFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    await sync();
    expect(csrfFetch).toHaveBeenCalledWith(
      "/api/time",
      expect.objectContaining({ method: "POST", body: JSON.stringify(entry.payload) })
    );
    expect(removeMutation).toHaveBeenCalledWith("m1");
    expect(api.brain.createPage).not.toHaveBeenCalled();
  });

  it("keeps the entry for a retry when the server refuses it", async () => {
    vi.clearAllMocks();
    csrfFetch.mockResolvedValue(new Response("{}", { status: 500 }));
    await sync();
    expect(removeMutation).not.toHaveBeenCalled();
    expect(incrementMutationRetries).toHaveBeenCalledWith("m1");
  });
});
