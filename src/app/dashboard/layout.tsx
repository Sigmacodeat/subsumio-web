"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { ensureRealtime } from "@/lib/realtime";
import { styleForIndustry } from "@/lib/industry-theme";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { KeyboardShortcuts } from "@/components/dashboard/keyboard-shortcuts";
import { DashboardGuide } from "@/components/dashboard/dashboard-guide";
import dynamic from "next/dynamic";

const CaseQuickCreateDialog = dynamic(() =>
  import("@/components/legal/CaseQuickCreateDialog").then((m) => m.CaseQuickCreateDialog)
);
const DeadlineQuickCreateDialog = dynamic(() =>
  import("@/components/legal/DeadlineQuickCreateDialog").then((m) => m.DeadlineQuickCreateDialog)
);
const InvoiceQuickCreateDialog = dynamic(() =>
  import("@/components/legal/InvoiceQuickCreateDialog").then((m) => m.InvoiceQuickCreateDialog)
);
const SignatureQuickCreateDialog = dynamic(() =>
  import("@/components/legal/SignatureQuickCreateDialog").then((m) => m.SignatureQuickCreateDialog)
);
const ClauseQuickCreateDialog = dynamic(() =>
  import("@/components/legal/ClauseQuickCreateDialog").then((m) => m.ClauseQuickCreateDialog)
);
const ContractQuickCreateDialog = dynamic(() =>
  import("@/components/legal/ContractQuickCreateDialog").then((m) => m.ContractQuickCreateDialog)
);
const CopilotSidebar = dynamic(
  () => import("@/components/chat/copilot-sidebar").then((m) => m.CopilotSidebar),
  { ssr: false }
);
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar, type Theme } from "@/components/dashboard/topbar";
import { MobileTabBar } from "@/components/dashboard/mobile-tab-bar";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { useBrainStats } from "@/lib/queries/brain";
import { useMe } from "@/lib/queries/auth";
import { useIsMediumScreen } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const stored = localStorage.getItem("subsumio-theme") as Theme | null;
    const next =
      stored ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(next);
  }, []);
  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem("subsumio-theme", next);
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(true);
  const isMediumScreen = useIsMediumScreen();
  const [globalQuickCreateOpen, setGlobalQuickCreateOpen] = useState(false);
  const [globalDeadlineCreateOpen, setGlobalDeadlineCreateOpen] = useState(false);
  const [globalInvoiceCreateOpen, setGlobalInvoiceCreateOpen] = useState(false);
  const [globalSignatureCreateOpen, setGlobalSignatureCreateOpen] = useState(false);
  const [globalClauseCreateOpen, setGlobalClauseCreateOpen] = useState(false);
  const [globalContractCreateOpen, setGlobalContractCreateOpen] = useState(false);

  // Auto-collapse sidebar when copilot opens on medium screens to maximize content space
  useEffect(() => {
    if (isMediumScreen && copilotOpen) {
      setCollapsed(true);
    }
  }, [isMediumScreen, copilotOpen]);

  // Persist copilot panel state
  useEffect(() => {
    const stored = localStorage.getItem("subsumio-copilot-open");
    if (stored !== null) setCopilotOpen(stored === "true");
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("subsumio-copilot-open", String(copilotOpen));
    } catch {}
  }, [copilotOpen]);
  const drawerRef = useRef<HTMLElement>(null);
  const { t } = useLang();
  const pathname = usePathname();
  const router = useRouter();
  const { reduceMotion, panelTransition: overlayTransition } = useDashboardMotion();

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
  // Real reachability signal (see /api/stats) — `undefined` while the first
  // load is still in flight, so the sidebar pill can show a neutral
  // "checking" state instead of flashing "Active" then "Offline".
  const brainReachable = statsQuery.data?.engine_reachable;
  const industry = meQuery.data?.user?.industry ?? null;
  const userName = meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? null;
  const userEmail = meQuery.data?.user?.email ?? null;

  // Body-scroll-lock when mobile drawer, copilot drawer, command palette or guide is open
  useEffect(() => {
    const checkOverlay = () => {
      const copilotMobileOpen =
        copilotOpen && typeof window !== "undefined" && window.innerWidth < 768;
      const anyOverlayOpen =
        mobileOpen || cmdOpen || guideOpen || shortcutsOpen || copilotMobileOpen;
      document.body.style.overflow = anyOverlayOpen ? "hidden" : "";
      document.body.dataset.overlay = anyOverlayOpen ? "open" : "closed";
    };
    checkOverlay();
    window.addEventListener("resize", checkOverlay);
    return () => {
      window.removeEventListener("resize", checkOverlay);
      document.body.style.overflow = "";
      document.body.dataset.overlay = "closed";
    };
  }, [mobileOpen, cmdOpen, guideOpen, shortcutsOpen, copilotOpen]);

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
    const handler = () => setGlobalQuickCreateOpen(true);
    window.addEventListener("subsumio:create-case", handler);
    return () => window.removeEventListener("subsumio:create-case", handler);
  }, []);

  useEffect(() => {
    const handler = () => setGlobalDeadlineCreateOpen(true);
    window.addEventListener("subsumio:create-deadline", handler);
    return () => window.removeEventListener("subsumio:create-deadline", handler);
  }, []);

  useEffect(() => {
    const handler = () => setGlobalInvoiceCreateOpen(true);
    window.addEventListener("subsumio:create-invoice", handler);
    return () => window.removeEventListener("subsumio:create-invoice", handler);
  }, []);

  useEffect(() => {
    const handler = () => setGlobalSignatureCreateOpen(true);
    window.addEventListener("subsumio:create-signature", handler);
    return () => window.removeEventListener("subsumio:create-signature", handler);
  }, []);

  useEffect(() => {
    const handler = () => setGlobalClauseCreateOpen(true);
    window.addEventListener("subsumio:create-clause", handler);
    return () => window.removeEventListener("subsumio:create-clause", handler);
  }, []);

  useEffect(() => {
    const handler = () => setGlobalContractCreateOpen(true);
    window.addEventListener("subsumio:create-contract", handler);
    return () => window.removeEventListener("subsumio:create-contract", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
        setShortcutsOpen(false);
        return;
      }
      if (e.shiftKey && e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        setCmdOpen(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "l") {
        e.preventDefault();
        toggleTheme();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "a") {
        e.preventDefault();
        router.push("/dashboard/chat");
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleTheme, router]);

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
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-[color:var(--brand-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[color:var(--ds-text)] focus:shadow-lg"
      >
        {t("layout.skip_to_content")}
      </a>
      <motion.div
        className={cn(
          "fixed inset-0 z-[45] bg-black/60 md:hidden",
          !mobileOpen && "pointer-events-none"
        )}
        initial={false}
        animate={{
          opacity: mobileOpen ? 1 : 0,
          backdropFilter: mobileOpen && !reduceMotion ? "blur(8px)" : "blur(0px)",
        }}
        transition={overlayTransition}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

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
        brainReachable={brainReachable}
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
          onGuideOpen={() => setGuideOpen(true)}
          copilotOpen={copilotOpen}
          onCopilotToggle={() => setCopilotOpen((v) => !v)}
        />

        <main
          id="main-content"
          role="main"
          className="dashboard-main-scroll flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0"
        >
          <div key={pathname} className="widget-fade-in flex min-h-0 flex-1 flex-col">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onToggleTheme={toggleTheme}
        onToggleSidebar={() => setCollapsed((c) => !c)}
      />
      <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <DashboardGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      <CopilotSidebar open={copilotOpen} onToggle={() => setCopilotOpen((v) => !v)} />

      <CaseQuickCreateDialog open={globalQuickCreateOpen} onOpenChange={setGlobalQuickCreateOpen} />

      <DeadlineQuickCreateDialog
        open={globalDeadlineCreateOpen}
        onOpenChange={setGlobalDeadlineCreateOpen}
      />

      <InvoiceQuickCreateDialog
        open={globalInvoiceCreateOpen}
        onOpenChange={setGlobalInvoiceCreateOpen}
      />

      <SignatureQuickCreateDialog
        open={globalSignatureCreateOpen}
        onOpenChange={setGlobalSignatureCreateOpen}
      />

      <ClauseQuickCreateDialog
        open={globalClauseCreateOpen}
        onOpenChange={setGlobalClauseCreateOpen}
      />

      <ContractQuickCreateDialog
        open={globalContractCreateOpen}
        onOpenChange={setGlobalContractCreateOpen}
      />

      {/* Mobile bottom tab bar — agency-level navigation */}
      <MobileTabBar
        onCopilotToggle={() => setCopilotOpen((v) => !v)}
        copilotOpen={copilotOpen}
        onMobileMenuOpen={() => setMobileOpen(true)}
        theme={theme}
        toggleTheme={toggleTheme}
        onGuideOpen={() => setGuideOpen(true)}
      />
    </div>
  );
}
