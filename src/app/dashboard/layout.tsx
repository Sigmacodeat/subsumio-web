"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { ensureRealtime } from "@/lib/realtime";
import { styleForIndustry } from "@/lib/industry-theme";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar, type Theme } from "@/components/dashboard/topbar";
import { useBrainStats } from "@/lib/queries/brain";
import { useMe } from "@/lib/queries/auth";
import { useLang } from "@/lib/use-lang";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const stored = localStorage.getItem("gbrain-theme") as Theme | null;
    const next =
      stored ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(next);
  }, []);
  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem("gbrain-theme", next);
      } catch {}
      return next;
    });
  };
  return [theme, toggle];
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const statsQuery = useBrainStats();
  const meQuery = useMe();
  const [cmdOpen, setCmdOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const { t } = useLang();
  const pathname = usePathname();
  const router = useRouter();

  const onboardingCompleted = meQuery.data?.user?.onboardingCompletedAt;
  const isOnboardingPage = pathname === "/dashboard/onboarding";

  useEffect(() => {
    if (meQuery.isLoading || !meQuery.data?.user) return;
    if (!onboardingCompleted && !isOnboardingPage) {
      router.replace("/dashboard/onboarding");
    }
    if (onboardingCompleted && isOnboardingPage) {
      router.replace("/dashboard");
    }
  }, [onboardingCompleted, isOnboardingPage, meQuery.isLoading, meQuery.data?.user, router]);

  const pages = statsQuery.data?.total_pages ?? 0;
  const entities = statsQuery.data?.total_entities ?? 0;
  const dreamCycle = statsQuery.data?.dream_cycle_last ?? null;
  const industry = meQuery.data?.user?.industry ?? null;
  const userName = meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? null;
  const userEmail = meQuery.data?.user?.email ?? null;

  // Body-scroll-lock when mobile drawer or command palette is open
  useEffect(() => {
    if (mobileOpen || cmdOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen, cmdOpen]);

  // Focus-trap for mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusable = drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];

    // Move focus into drawer
    requestAnimationFrame(() => firstEl.focus());

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    drawer.addEventListener("keydown", handler);
    return () => drawer.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  useEffect(() => {
    ensureRealtime();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      className="flex h-screen overflow-hidden bg-[color:var(--ds-bg)]"
      style={styleForIndustry(industry)}
      data-industry={industry ?? "core"}
      data-app="dashboard"
      data-theme={theme}
    >
      <Script src="/theme-init.js" strategy="beforeInteractive" />
      {/* Skip-to-content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-[color:var(--brand-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
      >
        {t("layout.skip_to_content")}
      </a>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        ref={drawerRef}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        setCollapsed={setCollapsed}
        setMobileOpen={setMobileOpen}
        pages={pages}
        entities={entities}
        dreamCycle={dreamCycle}
        userName={userName}
        userEmail={userEmail}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          theme={theme}
          toggleTheme={toggleTheme}
          userName={userName}
          userEmail={userEmail}
          mobileOpen={mobileOpen}
          onMobileMenuOpen={() => setMobileOpen(true)}
          onMobileMenuClose={() => setMobileOpen(false)}
        />

        <main id="main-content" role="main" className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onToggleTheme={toggleTheme}
        onToggleSidebar={() => setCollapsed((c) => !c)}
      />
    </div>
  );
}
