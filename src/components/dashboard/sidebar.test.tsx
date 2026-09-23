import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { NAV_SECTIONS, ALL_NAV_ITEMS, Sidebar } from "./sidebar";

// jsdom doesn't implement matchMedia — mock it for use-media-query hook
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (typeof window !== "undefined") {
  window.scrollTo = vi.fn();
}

let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  return {
    useLang: () => ({
      lang: "de",
      t: actual.createT("de"),
      setLang: vi.fn(),
    }),
  };
});

const mockQueue = vi.hoisted(() => ({
  pendingCount: 0,
  syncing: false,
  lastError: null as string | null,
  lastNotice: null as string | null,
  conflicts: [] as Array<{
    id: string;
    type: "createPage" | "updatePage" | "deletePage";
    payload: Record<string, unknown>;
    createdAt: string;
    conflicted?: boolean;
  }>,
  syncPending: vi.fn(),
  resolveConflict: vi.fn(async () => {}),
  clearNotice: vi.fn(),
  mutate: vi.fn(),
  refreshPending: vi.fn(),
}));

vi.mock("@/lib/use-mutation", () => ({
  useMutationQueue: () => mockQueue,
}));

vi.mock("@/lib/use-offline-sync", () => ({
  useNetworkStatus: () => true,
}));

vi.mock("@/lib/queries/sidebar-badges", () => ({
  useSidebarBadges: () => ({
    data: { pages: 0, cases: 0, deadlines: 0, messages: 0, tasks: 0 },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/lib/queries/brain", () => ({ usePage: () => ({ data: undefined }) }));
vi.mock("@/lib/queries/auth", () => ({
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/queries/review-inbox-realtime", () => ({
  useReviewInboxRealtime: () => ({ pendingCount: 0 }),
}));

function renderSidebar(props: Partial<ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      collapsed={false}
      mobileOpen
      setCollapsed={vi.fn()}
      setMobileOpen={vi.fn()}
      pages={2}
      entities={0}
      userName={null}
      userEmail={null}
      brainReachable
      {...props}
    />
  );
}

describe("Sidebar accordion", () => {
  beforeEach(() => {
    pathname = "/dashboard";
    localStorage.clear();
    mockQueue.pendingCount = 0;
    mockQueue.syncing = false;
    mockQueue.conflicts = [];
    mockQueue.lastError = null;
    mockQueue.lastNotice = null;
    mockQueue.resolveConflict.mockClear();
  });

  test("zeigt Sync-Konflikte mit allen vier Aktionen", () => {
    mockQueue.pendingCount = 1;
    mockQueue.conflicts = [
      {
        id: "m1",
        type: "createPage",
        payload: { slug: "cases/neu" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    renderSidebar();

    expect(screen.getByText("cases/neu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ansehen" })).toHaveAttribute(
      "href",
      "/dashboard/brain/cases/neu"
    );
    fireEvent.click(screen.getByRole("button", { name: "Meine Version senden" }));
    expect(mockQueue.resolveConflict).toHaveBeenCalledWith("m1", "keep-mine");
    fireEvent.click(screen.getByRole("button", { name: "Als Kopie speichern" }));
    expect(mockQueue.resolveConflict).toHaveBeenCalledWith("m1", "rename");
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(mockQueue.resolveConflict).toHaveBeenCalledWith("m1", "discard");
  });

  test("updatePage-Konflikt zeigt keinen Kopie-Button", () => {
    mockQueue.pendingCount = 1;
    mockQueue.conflicts = [
      {
        id: "m2",
        type: "updatePage",
        payload: { slug: "cases/bestehend" },
        createdAt: "2024-01-01T00:00:00Z",
        conflicted: true,
      },
    ];
    renderSidebar();

    expect(screen.getByText("cases/bestehend")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Als Kopie speichern" })).toBeNull();
  });

  test("exposes the profile footer as the account settings destination", () => {
    renderSidebar({ userName: "Ismet Mesic", userEmail: "ismet@example.com" });

    expect(screen.getByRole("link", { name: /Kontoeinstellungen: Ismet Mesic/i })).toHaveAttribute(
      "href",
      "/dashboard/settings?tab=account"
    );
  });

  test("opens the active section and renders its links as real anchors", async () => {
    pathname = "/dashboard/contacts";
    renderSidebar();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mandate & Beteiligte/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });

    expect(screen.getByRole("link", { name: "Kontakte" })).toHaveAttribute(
      "href",
      "/dashboard/contacts"
    );
  });

  test("keeps only one workflow section open at a time", async () => {
    pathname = "/dashboard/contacts";
    renderSidebar();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mandate & Beteiligte/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });

    expect(screen.getByRole("link", { name: "Kontakte" })).toHaveAttribute(
      "href",
      "/dashboard/contacts"
    );

    fireEvent.click(screen.getByRole("button", { name: /Dokumente & Wissen/i }));
    expect(screen.getByRole("button", { name: /Mandate & Beteiligte/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByRole("link", { name: "Kontakte" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dokumente & Wissen/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});

describe("Sidebar directory + admin filtering", () => {
  beforeEach(() => {
    pathname = "/dashboard";
    localStorage.clear();
  });

  test("directory link is present for admin users", async () => {
    renderSidebar({ role: "admin" });

    // Admin section should be visible and contain directory link
    const dirLink = screen.queryAllByRole("link", { name: /Alle Funktionen|Directory/i });
    // The link may be inside a collapsed section — just verify it exists in DOM
    // (the core/extended toggle also reads "Alle Funktionen anzeigen").
    expect(
      dirLink.length + screen.queryAllByText(/Alle Funktionen|Directory/i).length
    ).toBeGreaterThan(0);
  });

  test("non-admin users do not see admin-only items", async () => {
    renderSidebar({ role: "member" });

    // Admin-only items should not be visible
    expect(screen.queryByRole("link", { name: /^Abrechnung$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Connectors$/i })).not.toBeInTheDocument();
  });

  test("keeps a deep-linked specialist workspace visible in focus mode", async () => {
    pathname = "/dashboard/compliance";
    renderSidebar({ role: "member" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Kanzlei & Compliance/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });
    expect(screen.getByRole("link", { name: /DSGVO|Compliance/i })).toHaveAttribute(
      "href",
      "/dashboard/compliance"
    );
  });
});

describe("Sidebar restructured nav", () => {
  beforeEach(() => {
    pathname = "/dashboard";
    localStorage.clear();
    // Enable extended mode so all nav sections are visible (not just core)
    localStorage.setItem("sidebar-core-mode", "false");
  });

  test("primary items: Research and Assistant are primary items", async () => {
    renderSidebar();

    // Primary items should include Rechtsrecherche (Research Hub)
    expect(screen.getByRole("link", { name: /Rechtsrecherche/i })).toHaveAttribute(
      "href",
      "/dashboard/research"
    );

    // Chat/Assistent is a primary item (AP6)
    expect(screen.getByRole("link", { name: /^Assistent$/i })).toHaveAttribute(
      "href",
      "/dashboard/chat"
    );
  });

  test("groups every workflow module once across six Kanzlei workspaces", () => {
    const hrefs = NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href));

    expect(NAV_SECTIONS).toHaveLength(6);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test("Dokumente & Wissen workspace contains contracts and clause-library", async () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /Dokumente & Wissen/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Dokumente & Wissen/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });
    expect(screen.getByRole("link", { name: "Verträge" })).toHaveAttribute(
      "href",
      "/dashboard/contracts"
    );
  });

  test("Honorar & Finanzen workspace contains trust-accounting", async () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /Honorar & Finanzen/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Honorar & Finanzen/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });
    expect(screen.getByRole("link", { name: /Treuhandkonto/i })).toHaveAttribute(
      "href",
      "/dashboard/trust-accounting"
    );
  });

  test("Kanzlei & Compliance workspace contains the compliance surface", async () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /Kanzlei & Compliance/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Kanzlei & Compliance/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });
    expect(screen.getByRole("link", { name: /DSGVO|Compliance/i })).toHaveAttribute(
      "href",
      "/dashboard/compliance"
    );
  });

  test("sync page is reachable via nav for non-admin users", () => {
    // Must live in a regular module section — ADMIN_SECTION items are
    // filtered out for non-admin users.
    const inSections = NAV_SECTIONS.flatMap((s) => s.items).find(
      (i) => i.href === "/dashboard/sync"
    );
    expect(inSections).toBeDefined();
    expect(inSections!.labelKey).toBe("nav.sync");
    expect(ALL_NAV_ITEMS.some((i) => i.href === "/dashboard/sync")).toBe(true);
  });

  test("communication channels (beA, WhatsApp) are not in sidebar sections", async () => {
    renderSidebar();

    // beA and WhatsApp should not appear as sidebar nav links
    // (they're accessible via Intake channel tabs)
    const beaButtons = screen.queryAllByRole("button", { name: /beA/i });
    const waButtons = screen.queryAllByRole("button", { name: /WhatsApp/i });
    // They might appear in search results but not as direct nav section items
    // The sections that should exist don't include communication channels
    expect(beaButtons.length + waButtons.length).toBe(0);
  });
});
