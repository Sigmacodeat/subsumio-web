// @vitest-environment jsdom
// UIS-1-10: toggles and "mark read" report a failed save instead of an
// unhandled rejection with no feedback.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const updatePage = vi.hoisted(() => vi.fn());
const batchListPagesDetailed = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/monitoring",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=alerts"),
}));
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      batchListPagesDetailed: (...a: unknown[]) => batchListPagesDetailed(...a),
      getPage: vi.fn(async () => {
        throw new Error("not found");
      }),
      updatePage: (...a: unknown[]) => updatePage(...a),
      createPage: vi.fn(),
      deletePage: vi.fn(),
    },
  },
}));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => vi.fn(async () => true),
  ConfirmProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  // Stable `t`: the page reloads whenever `t` changes identity.
  const t = actual.createT("de");
  return { useLang: () => ({ lang: "de", t, setLang: vi.fn() }) };
});

import MonitoringPage from "./page";

const alertPage = {
  slug: "legal/monitoring/alerts/a1",
  title: "Neue Entscheidung",
  type: "regulatory_alert",
  content: "",
  created_at: "2026-09-20T08:00:00Z",
  updated_at: "2026-09-20T08:00:00Z",
  frontmatter: {
    type: "regulatory_alert",
    monitor_id: "m1",
    monitor_topic: "Mietrecht",
    change_type: "new_judgement",
    severity: "high",
    source: "case-law",
    date: "2026-09-20",
    title: "Neue Entscheidung",
    read: false,
  },
};

beforeEach(() => {
  updatePage.mockReset();
  batchListPagesDetailed.mockReset().mockResolvedValue({
    results: { regulatory_monitor: [], regulatory_alert: [alertPage] },
    errors: [],
  });
});

describe("monitoring page", () => {
  it("shows an error when marking an alert as read fails", async () => {
    updatePage.mockRejectedValue(new Error("engine down"));
    render(<MonitoringPage />);
    const markRead = await screen.findByRole("button", { name: /Als gelesen markieren/ });
    fireEvent.click(markRead);
    await waitFor(() => expect(updatePage).toHaveBeenCalled());
    expect(await screen.findByText("Speichern fehlgeschlagen.")).toBeInTheDocument();
  });
});
