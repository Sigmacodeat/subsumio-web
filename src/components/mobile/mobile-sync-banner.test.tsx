// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
    retries?: number;
  }>,
  syncPending: vi.fn(async () => {}),
  resolveConflict: vi.fn(async () => {}),
  clearNotice: vi.fn(),
  mutate: vi.fn(),
  refreshPending: vi.fn(async () => {}),
}));

vi.mock("@/lib/use-mutation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/use-mutation")>("@/lib/use-mutation");
  return { ...actual, useMutationQueue: () => mockQueue };
});

const mockOnline = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/use-offline-sync", () => ({
  useNetworkStatus: () => mockOnline.value,
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

import { MobileSyncBanner } from "./mobile-sync-banner";

const conflict = (id: string, slug: string, type: "createPage" | "updatePage" = "updatePage") => ({
  id,
  type,
  payload: { slug },
  createdAt: "2024-01-01T00:00:00Z",
  conflicted: true,
});

describe("MobileSyncBanner", () => {
  beforeEach(() => {
    mockOnline.value = true;
    mockQueue.pendingCount = 0;
    mockQueue.pendingUploads = 0;
    mockQueue.conflictCount = 0;
    mockQueue.conflicts = [];
    mockQueue.lastError = null;
    mockQueue.lastErrorAt = null;
    mockQueue.lastNotice = null;
    mockQueue.syncing = false;
    mockQueue.resolveConflict.mockClear();
    mockQueue.syncPending.mockClear();
    mockConfirm.mockClear();
    mockConfirm.mockResolvedValue(true);
  });

  test("rendert nichts wenn online + leer", () => {
    const { container } = render(<MobileSyncBanner />);
    expect(container.firstChild).toBeNull();
  });

  test("Konflikt-Titel zeigt Anzahl (Plural)", () => {
    mockQueue.conflicts = [conflict("m1", "cases/a"), conflict("m2", "cases/b")];
    render(<MobileSyncBanner />);
    expect(screen.getByText(/2 Sync-Konflikte/)).toBeInTheDocument();
  });

  test("Konflikt-Titel Singular bei einem", () => {
    mockQueue.conflicts = [conflict("m1", "cases/a")];
    render(<MobileSyncBanner />);
    expect(screen.getByText(/1 Sync-Konflikt —/)).toBeInTheDocument();
  });

  test("Konflikt-Block hat role=alert (assertive Ansage)", () => {
    mockQueue.conflicts = [conflict("m1", "cases/a")];
    render(<MobileSyncBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("1 Sync-Konflikt");
  });

  test("keep-mine fragt per Confirm nach", async () => {
    mockQueue.conflicts = [conflict("m1", "cases/a")];
    render(<MobileSyncBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Meine Version senden" }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    await waitFor(() => expect(mockQueue.resolveConflict).toHaveBeenCalledWith("m1", "keep-mine"));
  });

  test("discard fragt per Confirm nach (destruktiv)", async () => {
    mockQueue.conflicts = [conflict("m1", "cases/a")];
    render(<MobileSyncBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: "danger" }))
    );
    await waitFor(() => expect(mockQueue.resolveConflict).toHaveBeenCalledWith("m1", "discard"));
  });

  test("abgelehntes Confirm löst nichts aus", async () => {
    mockConfirm.mockResolvedValue(false);
    mockQueue.conflicts = [conflict("m1", "cases/a")];
    render(<MobileSyncBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockQueue.resolveConflict).not.toHaveBeenCalled();
  });

  test("rename ohne Confirm direkt (nicht-destruktiv)", async () => {
    mockQueue.conflicts = [conflict("m1", "cases/a", "createPage")];
    render(<MobileSyncBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Als Kopie speichern" }));
    await waitFor(() => expect(mockQueue.resolveConflict).toHaveBeenCalledWith("m1", "rename"));
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  test("pendingCount + Sync-Button triggert syncPending", async () => {
    mockQueue.pendingCount = 3;
    render(<MobileSyncBanner />);
    fireEvent.click(screen.getByRole("button", { name: /Jetzt syncen/ }));
    await waitFor(() => expect(mockQueue.syncPending).toHaveBeenCalled());
  });

  test("lastError rendert danger-Banner mit Alter + role=alert", () => {
    mockQueue.lastError = "Netzwerkfehler";
    mockQueue.lastErrorAt = Date.now() - 60_000;
    render(<MobileSyncBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("Netzwerkfehler");
    expect(screen.getByText(/seit/)).toBeInTheDocument();
  });

  test("lastNotice rendert success-Banner mit Dismiss + role=status", () => {
    mockQueue.lastNotice = "Kopie gespeichert als cases/neu-2";
    render(<MobileSyncBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("Kopie gespeichert als cases/neu-2");
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(mockQueue.clearNotice).toHaveBeenCalled();
  });

  test("dismissed-Reset: neue pending Änderung zeigt Banner wieder", () => {
    mockQueue.lastError = "Netzwerkfehler";
    mockQueue.lastErrorAt = Date.now();
    const { rerender } = render(<MobileSyncBanner />);
    // Fehler-Banner dismissen
    const alert = screen.getByRole("alert");
    fireEvent.click(within(alert).getAllByRole("button")[0]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Neue Änderung kommt in die Queue → Banner muss wieder auftauchen
    mockQueue.pendingCount = 1;
    rerender(<MobileSyncBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("Netzwerkfehler");
  });

  test("+n weitere verlinkt auf /dashboard/sync", () => {
    mockQueue.conflicts = [
      conflict("m1", "cases/a"),
      conflict("m2", "cases/b"),
      conflict("m3", "cases/c"),
      conflict("m4", "cases/d"),
      conflict("m5", "cases/e"),
    ];
    render(<MobileSyncBanner />);
    const link = screen.getByRole("link", { name: /weitere/ });
    expect(link).toHaveAttribute("href", "/dashboard/sync");
  });
});
