import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePipelineStatus } from "./use-pipeline-status";

vi.mock("@/lib/api", () => ({
  api: {
    upload: {
      status: vi.fn(),
    },
  },
}));

import { api } from "@/lib/api";

const mockStatus = vi.mocked(api.upload.status);

beforeEach(() => {
  mockStatus.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePipelineStatus", () => {
  it("returns idle status when slug is null", () => {
    const { result } = renderHook(() => usePipelineStatus(null));
    expect(result.current.status).toBe("idle");
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it("polls and transitions to ready_to_query", async () => {
    mockStatus
      .mockResolvedValueOnce({
        slug: "doc/1",
        status: "processing" as const,
        readiness: "processing",
        extraction_status: "processing",
      })
      .mockResolvedValueOnce({
        slug: "doc/1",
        status: "ready_to_query" as const,
        readiness: "indexed",
        extraction_status: "ready",
      });

    const { result } = renderHook(() => usePipelineStatus("doc/1", { intervalMs: 50 }));

    await waitFor(() => {
      expect(result.current.status).toBe("ready_to_query");
    });
    expect(result.current.readiness).toBe("indexed");
  });

  it("stops polling after terminal status (failed)", async () => {
    mockStatus.mockResolvedValue({
      slug: "doc/2",
      status: "failed" as const,
      readiness: "failed",
      extraction_status: "failed",
      extraction_error_code: "password_required",
    });

    const { result } = renderHook(() => usePipelineStatus("doc/2", { intervalMs: 50 }));

    await waitFor(() => {
      expect(result.current.status).toBe("failed");
    });
    expect(result.current.extractionErrorCode).toBe("password_required");

    const callsAfterTerminal = mockStatus.mock.calls.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(mockStatus.mock.calls.length).toBe(callsAfterTerminal);
  });

  it("handles poll errors gracefully", async () => {
    mockStatus.mockRejectedValue(new Error("network_error"));

    const { result } = renderHook(() => usePipelineStatus("doc/3", { intervalMs: 50 }));

    await waitFor(() => {
      expect(result.current.status).toBe("failed");
    });
    expect(result.current.error).toBe("network_error");
  });
});
