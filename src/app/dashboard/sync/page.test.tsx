// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const mockQueue = vi.hoisted(() => ({
  pendingCount: 0,
  pendingUploads: 0,
  conflictCount: 0,
  syncing: false,
  lastError: null as string | null,
  lastErrorAt: null as number | null,
  lastNotice: null as string | null,
  conflicts: [] as Array<{
    id: string;
    type: "createPage" | "updatePage" | "deletePage";
    payload: Record<string, unknown>;
    createdAt: string;
    conflicted?: boolean;
    conflictAt?: string;
  }>,
  syncPending: vi.fn(async () => {}),
  resolveConflict: vi.fn(async () => {}),
  resolveAllConflicts: vi.fn(async () => {}),
  clearNotice: vi.fn(),
  mutate: vi.fn(),
  refreshPending: vi.fn(async () => {}),
}));

vi.mock("@/lib/use-mutation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/use-mutation")>("@/lib/use-mutation");
  return {
    ...actual,
    useMutationQueue: () => mockQueue,
  };
});

const mockGetPage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  api: { brain: { getPage: (...a: unknown[]) => mockGetPage(...a) } },
}));

const mockConfirm = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => mockConfirm,
  ConfirmProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  return { useLang: () => ({ lang: "de", t: actual.createT("de"), setLang: vi.fn() }) };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import SyncPage from "./page";

const serverPage = {
  slug: "cases/neu",
  title: "Server-Titel",
  content: "server content",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  frontmatter: {},
};

describe("SyncPage", () => {
  beforeEach(() => {
    mockQueue.pendingCount = 0;
    mockQueue.pendingUploads = 0;
    mockQueue.conflicts = [];
    mockQueue.lastError = null;
    mockQueue.lastNotice = null;
    mockQueue.resolveConflict.mockClear();
    mockQueue.resolveAllConflicts.mockClear();
    mockGetPage.mockReset();
    mockConfirm.mockClear();
    mockConfirm.mockResolvedValue(true);
  });

  test("Empty-State ohne Konflikte", () => {
    render(<SyncPage />);
    expect(screen.getByText("Keine Sync-Konflikte")).toBeInTheDocument();
  });

  test("listet Konflikt mit Feld-Diff und Aktionen", async () => {
    mockQueue.conflicts = [
      {
        id: "m1",
        type: "updatePage",
        payload: { slug: "cases/neu", title: "Lokaler Titel" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    mockGetPage.mockResolvedValue(serverPage);
    render(<SyncPage />);

    expect(screen.getByText("cases/neu")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Lokaler Titel")).toBeInTheDocument());
    expect(screen.getByText("Server-Titel")).toBeInTheDocument();
    // updatePage → kein Kopie-Button
    expect(screen.queryByRole("button", { name: /Als Kopie speichern/ })).not.toBeInTheDocument();
    // Deutsche Bezeichnung statt interner Kennung; Link auf EIN Pfadsegment.
    expect(screen.getByText("Geändert")).toBeInTheDocument();
    expect(screen.queryByText("updatePage")).not.toBeInTheDocument();
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/dashboard/brain/cases%2Fneu");
  });

  test("keep-mine fragt vorher nach", async () => {
    mockQueue.conflicts = [
      {
        id: "m1",
        type: "updatePage",
        payload: { slug: "cases/neu" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    mockGetPage.mockResolvedValue(serverPage);
    render(<SyncPage />);

    await waitFor(() => expect(mockGetPage).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Meine Version senden/ }));
    await waitFor(() =>
      expect(mockQueue.resolveConflict).toHaveBeenCalledWith("m1", "keep-mine", undefined)
    );
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: "danger" }));
  });

  test("abgelehnte Bestätigung löst kein Überschreiben aus", async () => {
    mockConfirm.mockResolvedValue(false);
    mockQueue.conflicts = [
      {
        id: "m1",
        type: "updatePage",
        payload: { slug: "cases/neu" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    mockGetPage.mockResolvedValue(serverPage);
    render(<SyncPage />);

    await waitFor(() => expect(mockGetPage).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Meine Version senden/ }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockQueue.resolveConflict).not.toHaveBeenCalled();
  });

  test("rename öffnet Slug-Input und übergibt customSlug", async () => {
    mockQueue.conflicts = [
      {
        id: "m1",
        type: "createPage",
        payload: { slug: "cases/neu" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    mockGetPage.mockResolvedValue(serverPage);
    render(<SyncPage />);

    await waitFor(() => expect(mockGetPage).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Als Kopie speichern/ }));
    const input = await screen.findByRole("textbox");
    expect(input).toHaveValue("cases/neu-2");
    fireEvent.change(input, { target: { value: "cases/neu-mandant" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(mockQueue.resolveConflict).toHaveBeenCalledWith("m1", "rename", "cases/neu-mandant")
    );
  });

  test("Refetch-Button lädt Server-Version erneut", async () => {
    mockQueue.conflicts = [
      {
        id: "m1",
        type: "updatePage",
        payload: { slug: "cases/neu" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    mockGetPage.mockResolvedValue(serverPage);
    render(<SyncPage />);
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Server-Version neu laden" }));
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledTimes(2));
  });

  test("Server-Fehler zeigt Hinweis statt Diff", async () => {
    mockQueue.conflicts = [
      {
        id: "m1",
        type: "updatePage",
        payload: { slug: "cases/neu" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    mockGetPage.mockRejectedValue(new Error("boom"));
    render(<SyncPage />);
    await waitFor(() =>
      expect(screen.getByText(/Server-Version nicht abrufbar/)).toBeInTheDocument()
    );
  });

  test("Bulk-Bar erst ab 2 Konflikten, Confirm-Gate", async () => {
    mockQueue.conflicts = [
      {
        id: "m1",
        type: "updatePage",
        payload: { slug: "cases/a" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    mockGetPage.mockResolvedValue(serverPage);
    const { rerender } = render(<SyncPage />);
    // Nur 1 Konflikt → keine Bulk-Buttons
    expect(screen.queryByRole("button", { name: "Alle verwerfen" })).not.toBeInTheDocument();

    mockQueue.conflicts = [
      ...mockQueue.conflicts,
      {
        id: "m2",
        type: "updatePage",
        payload: { slug: "cases/b" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    rerender(<SyncPage />);
    fireEvent.click(screen.getByRole("button", { name: "Alle verwerfen" }));
    await waitFor(() => expect(mockQueue.resolveAllConflicts).toHaveBeenCalledWith("discard"));
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: "danger" }));
  });

  test("abgelehnter Bulk-Confirm löst nichts aus", async () => {
    mockConfirm.mockResolvedValue(false);
    mockQueue.conflicts = [
      {
        id: "m1",
        type: "updatePage",
        payload: { slug: "cases/a" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
      {
        id: "m2",
        type: "updatePage",
        payload: { slug: "cases/b" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    mockGetPage.mockResolvedValue(serverPage);
    render(<SyncPage />);
    fireEvent.click(screen.getByRole("button", { name: "Alle meine senden" }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockQueue.resolveAllConflicts).not.toHaveBeenCalled();
  });

  test("Konflikte sortiert: älteste zuerst", async () => {
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const recent = new Date(Date.now() - 1 * 86_400_000).toISOString();
    mockQueue.conflicts = [
      {
        id: "m-fresh",
        type: "updatePage",
        payload: { slug: "cases/fresh" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
        conflictAt: recent,
      },
      {
        id: "m-old",
        type: "updatePage",
        payload: { slug: "cases/old" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
        conflictAt: old,
      },
    ];
    mockGetPage.mockResolvedValue(serverPage);
    render(<SyncPage />);
    // async getPage-State-Updates abwarten, dann Reihenfolge prüfen
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledTimes(2));
    const slugs = screen.getAllByText(/^cases\//).map((el) => el.textContent);
    // cases/old (10d) muss vor cases/fresh (1d) stehen
    expect(slugs.indexOf("cases/old")).toBeLessThan(slugs.indexOf("cases/fresh"));
  });
});
