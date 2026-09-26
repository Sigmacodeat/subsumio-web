// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const csrfFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/csrf", () => ({ csrfFetch }));

import { FirmExportPanel, progressPercent } from "./firm-export-panel";

function reply(exports: unknown[], status = 200) {
  return Promise.resolve(Response.json({ data: { exports } }, { status }));
}

beforeEach(() => {
  csrfFetch.mockReset();
});

describe("FirmExportPanel", () => {
  it("shows the progress of a running export", async () => {
    csrfFetch.mockImplementation(() =>
      reply([
        {
          id: 1,
          state: "running",
          own: true,
          created_at: "2099-01-01T00:00:00Z",
          finished_at: null,
          progress: { phase: "pages", pages_total: 200, pages_done: 50, files_done: 0 },
        },
      ])
    );
    render(<FirmExportPanel />);
    expect(await screen.findByText(/Einträge werden gepackt \(50 von 200\)/)).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.queryByText("Neuen Export anfordern")).toBeNull();
  });

  it("offers the single download of a ready export, with its expiry", async () => {
    csrfFetch.mockImplementation(() =>
      reply([
        {
          id: 2,
          state: "ready",
          own: true,
          created_at: "2099-01-01T00:00:00Z",
          finished_at: "2099-01-01T01:00:00Z",
          progress: { phase: "done", pages_total: 3, pages_done: 3, files_done: 2 },
          pages: 3,
          files: 2,
          complete: true,
          size_bytes: 2048,
          expires_at: "2099-01-02T01:00:00Z",
          download_url: "/api/data-export/full/download?token=abc",
          link_expires_at: "2099-01-02T01:00:00Z",
        },
      ])
    );
    render(<FirmExportPanel />);
    const link = await screen.findByRole("link", { name: /Export herunterladen/ });
    expect(link.getAttribute("href")).toBe("/api/data-export/full/download?token=abc");
    expect(screen.getByText(/Einmaliger Download bis/)).toBeTruthy();
  });

  it("starts a new export", async () => {
    csrfFetch.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.resolve(Response.json({ data: { export: { id: 3 } } }, { status: 202 }))
        : reply([])
    );
    render(<FirmExportPanel />);
    fireEvent.click(await screen.findByText("Neuen Export anfordern"));
    await waitFor(() =>
      expect(csrfFetch).toHaveBeenCalledWith("/api/data-export/full", { method: "POST" })
    );
  });

  it("percent follows the listed entries", () => {
    expect(
      progressPercent({
        id: 1,
        state: "running",
        own: true,
        created_at: "",
        finished_at: null,
        progress: { phase: "pages", pages_total: 4, pages_done: 1, files_done: 0 },
      })
    ).toBe(25);
  });
});
