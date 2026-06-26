import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { Sidebar } from "./sidebar";

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
      expect(screen.getByRole("button", { name: /Mandanten & Parteien/i })).toHaveAttribute(
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
      expect(screen.getByRole("button", { name: /Mandanten & Parteien/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });

    expect(screen.getByRole("link", { name: "Kontakte" })).toHaveAttribute(
      "href",
      "/dashboard/contacts"
    );

    fireEvent.click(screen.getByRole("button", { name: /Kommunikation/i }));
    expect(screen.getByRole("button", { name: /Mandanten & Parteien/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByRole("link", { name: "Kontakte" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kommunikation/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "/dashboard/whatsapp"
    );
  });
});
