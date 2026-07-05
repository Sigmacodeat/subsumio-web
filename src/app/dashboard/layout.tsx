"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { ensureRealtime } from "@/lib/realtime";
import { styleForIndustry } from "@/lib/industry-theme";
import { redirectForIndustry } from "@/lib/industry-guards";
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
const TaxQuickCreateDialog = dynamic(() =>
  import("@/components/tax/TaxQuickCreateDialog").then((m) => m.TaxQuickCreateDialog)
);
const CopilotSidebar = dynamic(
  () => import("@/components/chat/copilot-sidebar").then((m) => m.CopilotSidebar),
  { ssr: false }
);
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar, type Theme } from "@/components/dashboard/topbar";
import { MobileTabBar } from "@/components/dashboard/mobile-tab-bar";
import { MobileSyncBanner } from "@/components/mobile/mobile-sync-banner";
import { TourProvider, useAutoStartTour } from "@/components/dashboard/guided-tour";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { useBrainStats } from "@/lib/queries/brain";
import { useMe } from "@/lib/queries/auth";
import { useIsMediumScreen } from "@/lib/use-media-query";
import { useNativeFeatures } from "@/lib/use-native-features";
import { useNativeBackButton } from "@/lib/use-native-back-button";
import { useKeyboardAwareScroll } from "@/lib/use-mobile-keyboard";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { identifyUser } from "@/lib/tracking";

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
  return (
    <TourProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </TourProvider>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
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
  const nativeFeatures = useNativeFeatures();
  useKeyboardAwareScroll();
  useNativeBackButton({
    isMobileOpen: mobileOpen,
    isCopilotOpen: copilotOpen,
    isCmdOpen: cmdOpen,
    isGuideOpen: guideOpen,
    isShortcutsOpen: shortcutsOpen,
    closeAll: () => {
      setMobileOpen(false);
      setCopilotOpen(false);
      setCmdOpen(false);
      setGuideOpen(false);
      setShortcutsOpen(false);
    },
  });
  const [globalQuickCreateOpen, setGlobalQuickCreateOpen] = useState(false);
  const [globalDeadlineCreateOpen, setGlobalDeadlineCreateOpen] = useState(false);
  const [globalInvoiceCreateOpen, setGlobalInvoiceCreateOpen] = useState(false);
  const [globalSignatureCreateOpen, setGlobalSignatureCreateOpen] = useState(false);
  const [globalClauseCreateOpen, setGlobalClauseCreateOpen] = useState(false);
  const [globalContractCreateOpen, setGlobalContractCreateOpen] = useState(false);
  const [presetCaseSlug, setPresetCaseSlug] = useState<string | undefined>(undefined);

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
  const industry = meQuery.data?.user?.industry ?? null;
  const role = meQuery.data?.user?.role ?? null;
  const plan = meQuery.data?.user?.plan ?? null;
  const userName = meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? null;
  const userEmail = meQuery.data?.user?.email ?? null;

  // Auto-start guided tour on first dashboard visit after onboarding
  useAutoStartTour(onboardingCompleted);

  useEffect(() => {
    if (meQuery.isLoading || !meQuery.data?.user) return;
    const u = meQuery.data.user;
    identifyUser(u.id, {
      email: u.email,
      name: u.name,
      role: u.role,
      plan: u.plan,
      industry: u.industry,
    });
    if (!onboardingCompleted && !isOnboardingPage) {
      router.replace("/dashboard/onboarding");
    }
    if (onboardingCompleted && isOnboardingPage) {
      router.replace("/dashboard");
    }
  }, [onboardingCompleted, isOnboardingPage, meQuery.isLoading, meQuery.data?.user, router]);

  // Industry route guard — redirect tax users away from legal-only pages and vice versa
  useEffect(() => {
    if (meQuery.isLoading || !meQuery.data?.user) return;
    const redirect = redirectForIndustry(pathname, industry);
    if (redirect) {
      router.replace(redirect);
    }
  }, [pathname, industry, meQuery.isLoading, meQuery.data?.user, router]);

  const pages = statsQuery.data?.total_pages ?? 0;
  const entities = statsQuery.data?.total_entities ?? 0;
  const dreamCycle = statsQuery.data?.dream_cycle_last ?? null;
  // Real reachability signal (see /api/stats) — `undefined` while the first
  // load is still in flight, so the sidebar pill can show a neutral
  // "checking" state instead of flashing "Active" then "Offline".
  const brainReachable = statsQuery.data?.engine_reachable;

  // Body-scroll-lock when mobile drawer, copilot drawer, command palette or guide is open
  useEffect(() => {
    const checkOverlay = () => {
      const copilotMobileOpen =
        copilotOpen && typeof window !== "undefined" && window.innerWidth < 1024;
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
    window.addEventListener("subsumio:quick-create", handler);
    return () => {
      window.removeEventListener("subsumio:create-case", handler);
      window.removeEventListener("subsumio:quick-create", handler);
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { caseSlug?: string } | undefined;
      setPresetCaseSlug(detail?.caseSlug);
      setGlobalDeadlineCreateOpen(true);
    };
    window.addEventListener("subsumio:create-deadline", handler);
    return () => window.removeEventListener("subsumio:create-deadline", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { caseSlug?: string } | undefined;
      setPresetCaseSlug(detail?.caseSlug);
      setGlobalInvoiceCreateOpen(true);
    };
    window.addEventListener("subsumio:create-invoice", handler);
    return () => window.removeEventListener("subsumio:create-invoice", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { caseSlug?: string } | undefined;
      setPresetCaseSlug(detail?.caseSlug);
      setGlobalSignatureCreateOpen(true);
    };
    window.addEventListener("subsumio:create-signature", handler);
    return () => window.removeEventListener("subsumio:create-signature", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { caseSlug?: string } | undefined;
      setPresetCaseSlug(detail?.caseSlug);
      setGlobalClauseCreateOpen(true);
    };
    window.addEventListener("subsumio:create-clause", handler);
    return () => window.removeEventListener("subsumio:create-clause", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { caseSlug?: string } | undefined;
      setPresetCaseSlug(detail?.caseSlug);
      setGlobalContractCreateOpen(true);
    };
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
      // Quick-create shortcuts (single key, no modifiers, only when not typing)
      // WCAG 2.1.4: Single-key shortcuts must be disableable
      const target = e.target as HTMLElement;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable;
      const singleKeyShortcutsEnabled =
        typeof window === "undefined" || localStorage.getItem("single-key-shortcuts") !== "false";
      if (
        !isTyping &&
        singleKeyShortcutsEnabled &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        const key = e.key.toLowerCase();
        if (key === "n") {
          e.preventDefault();
          setGlobalQuickCreateOpen(true);
          return;
        }
        if (key === "d") {
          e.preventDefault();
          setGlobalDeadlineCreateOpen(true);
          return;
        }
        if (key === "i") {
          e.preventDefault();
          setGlobalInvoiceCreateOpen(true);
          return;
        }
        if (key === "s") {
          e.preventDefault();
          setGlobalSignatureCreateOpen(true);
          return;
        }
        if (key === "c") {
          e.preventDefault();
          setGlobalContractCreateOpen(true);
          return;
        }
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
      // theme-init.js sets data-theme on the DOM before hydration (no flash);
      // React resyncs via useTheme's mount effect. Suppress the expected
      // server(light)/client(stored) attribute mismatch warning on this node.
      suppressHydrationWarning
    >
      {/* Prevent search engines from indexing authenticated dashboard pages.
          Defense-in-depth: robots.txt already blocks /dashboard, but this
          meta tag ensures noindex even if robots.txt is bypassed or removed. */}
      <meta name="robots" content="noindex, nofollow" />
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

      <MobileSyncBanner />

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
        industry={industry}
        role={role}
        plan={plan}
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
          onCmdOpen={() => setCmdOpen(true)}
        />

        <main
          id="main-content"
          role="main"
          className="dashboard-main-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0"
        >
          <div key={pathname} className="widget-fade-in flex min-h-0 min-w-0 flex-1 flex-col">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onToggleTheme={toggleTheme}
        onToggleSidebar={() => setCollapsed((c) => !c)}
        industry={industry}
        role={role}
      />
      <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <DashboardGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      <CopilotSidebar open={copilotOpen} onToggle={() => setCopilotOpen((v) => !v)} />

      {/* Push notification toast (native app only) */}
      {nativeFeatures.pushNotification && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={overlayTransition}
          className="fixed top-[env(safe-area-inset-top)] left-1/2 z-[60] flex max-w-sm -translate-x-1/2 items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 shadow-2xl"
          role="alert"
        >
          <div className="flex-1">
            {nativeFeatures.pushNotification.title && (
              <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                {nativeFeatures.pushNotification.title}
              </p>
            )}
            {nativeFeatures.pushNotification.body && (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {nativeFeatures.pushNotification.body}
              </p>
            )}
          </div>
          <button
            onClick={nativeFeatures.clearPushNotification}
            className="shrink-0 text-[color:var(--ds-text-subtle)] transition-colors hover:text-[color:var(--ds-text)]"
            aria-label="Schließen"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </motion.div>
      )}

      {industry === "tax" ? (
        <TaxQuickCreateDialog
          open={globalQuickCreateOpen}
          onOpenChange={setGlobalQuickCreateOpen}
        />
      ) : (
        <CaseQuickCreateDialog
          open={globalQuickCreateOpen}
          onOpenChange={setGlobalQuickCreateOpen}
        />
      )}

      {industry !== "tax" && (
        <>
          <DeadlineQuickCreateDialog
            open={globalDeadlineCreateOpen}
            onOpenChange={setGlobalDeadlineCreateOpen}
            presetCaseSlug={presetCaseSlug}
          />

          <InvoiceQuickCreateDialog
            open={globalInvoiceCreateOpen}
            onOpenChange={setGlobalInvoiceCreateOpen}
            presetCaseSlug={presetCaseSlug}
          />

          <SignatureQuickCreateDialog
            open={globalSignatureCreateOpen}
            onOpenChange={setGlobalSignatureCreateOpen}
            presetCaseSlug={presetCaseSlug}
          />

          <ClauseQuickCreateDialog
            open={globalClauseCreateOpen}
            onOpenChange={setGlobalClauseCreateOpen}
            presetCaseSlug={presetCaseSlug}
          />

          <ContractQuickCreateDialog
            open={globalContractCreateOpen}
            onOpenChange={setGlobalContractCreateOpen}
            presetCaseSlug={presetCaseSlug}
          />
        </>
      )}

      {/* Mobile bottom tab bar — agency-level navigation */}
      <MobileTabBar
        onCopilotToggle={() => setCopilotOpen((v) => !v)}
        copilotOpen={copilotOpen}
        onMobileMenuOpen={() => setMobileOpen(true)}
        theme={theme}
        toggleTheme={toggleTheme}
        onGuideOpen={() => setGuideOpen(true)}
        industry={industry}
      />
    </div>
  );
}
