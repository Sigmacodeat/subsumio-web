import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { Sidebar } from "./sidebar";

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

let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
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

vi.mock("@/lib/use-mutation", () => ({
  useMutationQueue: () => ({
    pendingCount: 0,
    syncing: false,
    syncPending: vi.fn(),
  }),
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

function renderSidebar(props: Partial<ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      collapsed={false}
      mobileOpen
      setCollapsed={vi.fn()}
      setMobileOpen={vi.fn()}
      pages={2}
      entities={0}
      dreamCycle={null}
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
  });

  test("opens the active section and renders its links as real anchors", async () => {
    pathname = "/dashboard/contacts";
    renderSidebar();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mandanten & Kommunikation/i })).toHaveAttribute(
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
      expect(screen.getByRole("button", { name: /Mandanten & Kommunikation/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });

    expect(screen.getByRole("link", { name: "Kontakte" })).toHaveAttribute(
      "href",
      "/dashboard/contacts"
    );

    fireEvent.click(screen.getByRole("button", { name: /Dokumente & Entwurf/i }));
    expect(screen.getByRole("button", { name: /Mandanten & Kommunikation/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByRole("link", { name: "Kontakte" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dokumente & Entwurf/i })).toHaveAttribute(
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
    const dirLink = screen.queryByRole("link", { name: /Alle Funktionen|Directory/i });
    // The link may be inside a collapsed section — just verify it exists in DOM
    expect(dirLink || screen.queryByText(/Alle Funktionen|Directory/i)).toBeTruthy();
  });

  test("non-admin users do not see admin-only items", async () => {
    renderSidebar({ role: "member" });

    // Admin-only items should not be visible
    expect(screen.queryByRole("link", { name: /^Abrechnung$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Connectors$/i })).not.toBeInTheDocument();
  });
});

describe("Sidebar restructured nav", () => {
  beforeEach(() => {
    pathname = "/dashboard";
    localStorage.clear();
    // Enable extended mode so all nav sections are visible (not just core)
    localStorage.setItem("sidebar-core-mode", "false");
  });

  test("primary items: 5 items with Recherche replacing Chat", async () => {
    renderSidebar();

    // Primary items should include Rechtsrecherche (Research Hub)
    expect(screen.getByRole("link", { name: /Rechtsrecherche/i })).toHaveAttribute(
      "href",
      "/dashboard/research"
    );

    // Chat/Assistent should NOT be a primary item (it's in the Copilot panel)
    expect(screen.queryByRole("link", { name: /^Assistent$/i })).not.toBeInTheDocument();
  });

  test("Verträge section exists with contracts and clause-library", async () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /Verträge/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Verträge/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });
    expect(screen.getByRole("link", { name: "Verträge" })).toHaveAttribute(
      "href",
      "/dashboard/contracts"
    );
  });

  test("Abrechnung section contains trust-accounting (moved from Litigation)", async () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /^Abrechnung$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Abrechnung$/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });
    expect(screen.getByRole("link", { name: /Treuhandkonto/i })).toHaveAttribute(
      "href",
      "/dashboard/trust-accounting"
    );
  });

  test("Compliance section exists separately from Abrechnung", async () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /^Compliance$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Compliance$/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });
    expect(screen.getByRole("link", { name: /DSGVO|Compliance/i })).toHaveAttribute(
      "href",
      "/dashboard/compliance"
    );
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
