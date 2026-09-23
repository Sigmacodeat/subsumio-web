// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

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
    useLang: () => ({ lang: "de", t: actual.createT("de"), setLang: vi.fn() }),
  };
});

vi.mock("@/components/dashboard/motion", () => {
  const MOTION_PROPS = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "whileTap",
    "whileHover",
    "variants",
    "layout",
    "layoutId",
  ]);
  const make = (tag: string) => {
    function MotionMock({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) {
      const Tag = tag as "div";
      const domProps = Object.fromEntries(
        Object.entries(props).filter(([k]) => !MOTION_PROPS.has(k))
      );
      return <Tag {...domProps}>{children}</Tag>;
    }
    return MotionMock;
  };
  return {
    motion: new Proxy({}, { get: (_t, prop) => make(typeof prop === "string" ? prop : "div") }),
    useDashboardMotion: () => ({
      reduceMotion: true,
      panelTransition: {},
      tapTransition: {},
    }),
  };
});

const mockBadges = vi.hoisted(() => ({
  data: {} as Record<string, { count: number; variant: "danger" | "warning" | "info" }>,
}));

vi.mock("@/lib/queries/sidebar-badges", () => ({
  useSidebarBadges: () => mockBadges,
}));

const mockQueue = vi.hoisted(() => ({
  conflictCount: 0,
}));

vi.mock("@/lib/use-mutation", () => ({
  useMutationQueue: () => mockQueue,
}));

vi.mock("@/lib/use-brain-selector", () => ({
  useBrainSelector: () => ({
    brains: [{ slug: "main", name: "Hauptmandat" }],
    activeBrain: { slug: "main", name: "Hauptmandat" },
    selectBrain: vi.fn(),
  }),
}));

// Sidebar-Nav-Konfiguration ist schwer (useResizable, Queries etc.) —
// minimal mocken: nur die Datenstruktur, die die Tab-Bar braucht.
vi.mock("@/components/dashboard/sidebar", async () => {
  const { GitMerge, Settings } =
    await vi.importActual<typeof import("lucide-react")>("lucide-react");
  return {
    DE_ONLY_HREFS: new Set<string>(),
    navForIndustry: () => ({
      sections: [
        {
          titleKey: "nav.section.firm",
          items: [
            { href: "/dashboard/sync", labelKey: "nav.sync", icon: GitMerge },
            { href: "/dashboard/settings", labelKey: "nav.settings", icon: Settings },
          ],
        },
      ],
      adminSection: { titleKey: "nav.section.admin", items: [] },
    }),
  };
});

import { MobileTabBar } from "./mobile-tab-bar";

function renderTabBar() {
  return render(
    <MobileTabBar
      onCopilotToggle={vi.fn()}
      copilotOpen={false}
      onMobileMenuOpen={vi.fn()}
      theme="light"
      toggleTheme={vi.fn()}
      onGuideOpen={vi.fn()}
      industry={null}
      jurisdiction={null}
    />
  );
}

describe("MobileTabBar", () => {
  beforeEach(() => {
    pathname = "/dashboard";
    mockQueue.conflictCount = 0;
    mockBadges.data = {};
  });

  test("Konflikt-Badge auf /dashboard/sync im More-Sheet", () => {
    mockQueue.conflictCount = 3;
    renderTabBar();
    // More-Sheet oeffnen — Tab-Bar-Button „Mehr"
    fireEvent.click(screen.getByRole("button", { name: /mehr/i }));
    const link = screen.getByRole("link", { name: /Synchronisation/i });
    expect(link).toHaveAttribute("href", "/dashboard/sync");
    expect(link.querySelector("[aria-label='3']")).not.toBeNull();
  });

  test("kein Badge ohne Konflikte", () => {
    renderTabBar();
    fireEvent.click(screen.getByRole("button", { name: /mehr/i }));
    const link = screen.getByRole("link", { name: /Synchronisation/i });
    expect(link.querySelector("[aria-label]")).toBeNull();
  });
});
