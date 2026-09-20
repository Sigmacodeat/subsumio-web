"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { useCspNonce } from "@/components/providers/csp-nonce";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init-script";
import { usePathname, useRouter } from "next/navigation";
import { ensureRealtime } from "@/lib/realtime";
const CommandPalette = dynamic(
  () => import("@/components/dashboard/command-palette").then((m) => m.CommandPalette),
  { ssr: false }
);
const KeyboardShortcuts = dynamic(
  () => import("@/components/dashboard/keyboard-shortcuts").then((m) => m.KeyboardShortcuts),
  { ssr: false }
);
const DashboardGuide = dynamic(
  () => import("@/components/dashboard/dashboard-guide").then((m) => m.DashboardGuide),
  { ssr: false }
);
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
const PracticeQuickCreateDialogs = dynamic(() =>
  import("@/components/legal/PracticeQuickCreateDialogs").then((m) => m.PracticeQuickCreateDialogs)
);
const NormReaderPanel = dynamic(
  () => import("@/components/legal/NormReaderPanel").then((m) => m.NormReaderPanel),
  { ssr: false }
);
const CopilotSidebar = dynamic(
  () => import("@/components/chat/copilot-sidebar").then((m) => m.CopilotSidebar),
  {
    ssr: false,
    // The panel chunk also loads while the panel is closed; a text placeholder
    // then showed up as a stray column next to the page.
    loading: () => null,
  }
);
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar, type Theme } from "@/components/dashboard/topbar";
import { MobileTabBar } from "@/components/dashboard/mobile-tab-bar";
import { MobileSyncBanner } from "@/components/mobile/mobile-sync-banner";
import { SupportSessionBanner } from "@/components/dashboard/support-session-banner";
import { TourProvider, useAutoStartTour } from "@/components/dashboard/guided-tour";
import { AnimatePresence } from "framer-motion";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { ErrorBoundary } from "@/components/error-boundary/error-boundary";
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
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener("subsumio:theme-change", notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener("subsumio:theme-change", notify);
    };
  }, []);
  const getSnapshot = useCallback((): Theme => {
    const stored = localStorage.getItem("subsumio-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, []);
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light" as Theme);
  const toggle = useCallback(() => {
    const next: Theme = getSnapshot() === "light" ? "dark" : "light";
    localStorage.setItem("subsumio-theme", next);
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event("subsumio:theme-change"));
  }, [getSnapshot]);
  return [theme, toggle];
}

type OverlayName =
  | "mobile"
  | "command"
  | "guide"
  | "shortcuts"
  | "copilot"
  | "case"
  | "deadline"
  | "invoice"
  | "signature"
  | "clause"
  | "contract";
type OverlayState = Record<OverlayName, boolean>;
const QUICK_OVERLAYS: OverlayName[] = [
  "case",
  "deadline",
  "invoice",
  "signature",
  "clause",
  "contract",
];

function useOverlayManager() {
  const [overlays, setOverlays] = useState<OverlayState>(() => ({
    mobile: false,
    command: false,
    guide: false,
    shortcuts: false,
    copilot: false,
    case: false,
    deadline: false,
    invoice: false,
    signature: false,
    clause: false,
    contract: false,
  }));
  const setOverlay = useCallback(
    (name: OverlayName, value: boolean | ((current: boolean) => boolean)) => {
      setOverlays((current) => ({
        ...current,
        [name]: typeof value === "function" ? value(current[name]) : value,
      }));
    },
    []
  );
  const closeAllOverlays = useCallback(
    () =>
      setOverlays(
        (current) =>
          Object.fromEntries(Object.keys(current).map((key) => [key, false])) as OverlayState
      ),
    []
  );
  const closeTopOverlay = useCallback(() => {
    setOverlays((current) => {
      const priority: OverlayName[] = [...QUICK_OVERLAYS]
        .reverse()
        .concat(["command", "shortcuts", "guide", "copilot", "mobile"]);
      const top = priority.find((name) => current[name]);
      return top ? { ...current, [top]: false } : current;
    });
  }, []);
  return { overlays, setOverlay, closeAllOverlays, closeTopOverlay };
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
  const { overlays, setOverlay, closeAllOverlays, closeTopOverlay } = useOverlayManager();
  const {
    mobile: mobileOpen,
    command: cmdOpen,
    guide: guideOpen,
    shortcuts: shortcutsOpen,
    copilot: copilotOpen,
    case: globalQuickCreateOpen,
    deadline: globalDeadlineCreateOpen,
    invoice: globalInvoiceCreateOpen,
    signature: globalSignatureCreateOpen,
    clause: globalClauseCreateOpen,
    contract: globalContractCreateOpen,
  } = overlays;
  const pathname = usePathname();
  // The assistant page already shows a full conversation: never render the
  // same conversation a second time in the side panel next to it.
  const copilotVisible = copilotOpen && pathname !== "/dashboard/chat";

  const setMobileOpen = useCallback(
    (value: boolean | ((v: boolean) => boolean)) => setOverlay("mobile", value),
    [setOverlay]
  );
  const setCmdOpen = useCallback(
    (value: boolean | ((v: boolean) => boolean)) => setOverlay("command", value),
    [setOverlay]
  );
  const setGuideOpen = useCallback(
    (value: boolean | ((v: boolean) => boolean)) => setOverlay("guide", value),
    [setOverlay]
  );
  const setShortcutsOpen = useCallback(
    (value: boolean | ((v: boolean) => boolean)) => setOverlay("shortcuts", value),
    [setOverlay]
  );
  const setCopilotOpen = useCallback(
    (value: boolean | ((v: boolean) => boolean)) => setOverlay("copilot", value),
    [setOverlay]
  );
  const setGlobalQuickCreateOpen = useCallback(
    (value: boolean) => setOverlay("case", value),
    [setOverlay]
  );
  const setGlobalDeadlineCreateOpen = useCallback(
    (value: boolean) => setOverlay("deadline", value),
    [setOverlay]
  );
  const setGlobalInvoiceCreateOpen = useCallback(
    (value: boolean) => setOverlay("invoice", value),
    [setOverlay]
  );
  const setGlobalSignatureCreateOpen = useCallback(
    (value: boolean) => setOverlay("signature", value),
    [setOverlay]
  );
  const setGlobalClauseCreateOpen = useCallback(
    (value: boolean) => setOverlay("clause", value),
    [setOverlay]
  );
  const setGlobalContractCreateOpen = useCallback(
    (value: boolean) => setOverlay("contract", value),
    [setOverlay]
  );
  // Mount-once gating for lazy overlays: the chunk downloads on first open,
  // then stays mounted so AnimatePresence exit animations keep working.
  const [overlaysMounted, setOverlaysMounted] = useState({
    command: false,
    guide: false,
    shortcuts: false,
  });
  useEffect(() => {
    setOverlaysMounted((m) => ({
      command: m.command || cmdOpen,
      guide: m.guide || guideOpen,
      shortcuts: m.shortcuts || shortcutsOpen,
    }));
  }, [cmdOpen, guideOpen, shortcutsOpen]);

  const [theme, toggleTheme] = useTheme();
  const cspNonce = useCspNonce();
  const statsQuery = useBrainStats();
  const meQuery = useMe();
  const isMediumScreen = useIsMediumScreen();
  const nativeFeatures = useNativeFeatures();
  useKeyboardAwareScroll();
  useNativeBackButton({
    isMobileOpen: mobileOpen,
    isCopilotOpen: copilotVisible,
    isCmdOpen: cmdOpen,
    isGuideOpen: guideOpen,
    isShortcutsOpen: shortcutsOpen,
    closeAll: closeAllOverlays,
  });
  const [presetCaseSlug, setPresetCaseSlug] = useState<string | undefined>(undefined);
  const copilotPersistenceReady = useRef(false);

  // Auto-collapse sidebar when copilot opens on medium screens to maximize content space
  useEffect(() => {
    if (isMediumScreen && copilotOpen) {
      setCollapsed(true);
    }
  }, [isMediumScreen, copilotOpen]);

  // Persist copilot panel state
  useEffect(() => {
    const stored = localStorage.getItem("subsumio-copilot-open-v2");
    // Default closed: on a 1440 px laptop an open panel leaves ~800 px for registers
    // and cuts table columns. Only wide monitors start with it open.
    setCopilotOpen(stored !== null ? stored === "true" : window.innerWidth >= 1680);
  }, [setCopilotOpen]);
  useEffect(() => {
    if (!copilotPersistenceReady.current) {
      copilotPersistenceReady.current = true;
      return;
    }
    try {
      localStorage.setItem("subsumio-copilot-open-v2", String(copilotOpen));
    } catch {}
  }, [copilotOpen]);
  useEffect(() => {
    const openCopilot = () => setCopilotOpen(true);
    window.addEventListener("subsumio:copilot:open", openCopilot);
    return () => window.removeEventListener("subsumio:copilot:open", openCopilot);
  }, [setCopilotOpen]);
  const drawerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const { t } = useLang();
  const router = useRouter();
  const { reduceMotion, panelTransition: overlayTransition } = useDashboardMotion();
  const [routeAnnouncement, setRouteAnnouncement] = useState("");

  const onboardingCompleted = meQuery.data?.user?.onboardingCompletedAt;
  const isOnboardingPage = pathname === "/dashboard/onboarding";
  const industry = meQuery.data?.user?.industry ?? null;
  const role = meQuery.data?.user?.role ?? null;
  const plan = meQuery.data?.user?.plan ?? null;
  const userName = meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? null;
  const userEmail = meQuery.data?.user?.email ?? null;
  const supportSession = meQuery.data?.supportSession ?? null;

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

  // Route change: move focus to <main> and announce page change for screen readers
  useEffect(() => {
    if (!pathname) return;
    const segment = pathname.split("/").filter(Boolean).pop() || "Dashboard";
    const label = segment.charAt(0).toUpperCase() + segment.slice(1);
    setRouteAnnouncement(`${label} geladen`);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const pages = statsQuery.data?.total_pages ?? 0;
  const entities = statsQuery.data?.total_entities ?? 0;
  // Real reachability signal (see /api/stats) — `undefined` while the first
  // load is still in flight, so the sidebar pill can show a neutral
  // "checking" state instead of flashing "Active" then "Offline".
  const brainReachable = statsQuery.data?.engine_reachable;

  // Body-scroll-lock when mobile drawer, copilot drawer, command palette or guide is open
  useEffect(() => {
    const checkOverlay = () => {
      const copilotMobileOpen =
        copilotVisible && typeof window !== "undefined" && window.innerWidth < 768;
      const anyOverlayOpen =
        mobileOpen ||
        cmdOpen ||
        guideOpen ||
        shortcutsOpen ||
        QUICK_OVERLAYS.some((name) => overlays[name]) ||
        copilotMobileOpen;
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
  }, [mobileOpen, cmdOpen, guideOpen, shortcutsOpen, copilotOpen, copilotVisible, overlays]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !Object.values(overlays).some(Boolean)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeTopOverlay();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [overlays, closeTopOverlay]);

  useEffect(() => {
    if (!Object.values(overlays).some(Boolean)) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let activeDialog: HTMLElement | null = null;
    const frame = requestAnimationFrame(() => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
      activeDialog = dialogs.item(dialogs.length - 1);
      const first = activeDialog?.querySelector<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !activeDialog) return;
      const focusable = Array.from(
        activeDialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trap);
      previouslyFocused?.focus();
    };
  }, [overlays]);

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

  // Swipe-to-close for mobile sidebar drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0]?.clientX ?? null;
      touchCurrentX.current = touchStartX.current;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      touchCurrentX.current = e.touches[0]?.clientX ?? touchStartX.current;
      const delta = touchCurrentX.current - touchStartX.current;
      if (delta < 0 && drawer) {
        drawer.style.transform = `translateX(${delta}px)`;
        drawer.style.transition = "none";
      }
    };
    const onTouchEnd = () => {
      if (touchStartX.current === null || touchCurrentX.current === null) return;
      const delta = touchCurrentX.current - touchStartX.current;
      drawer.style.transition = "";
      drawer.style.transform = "";
      if (delta < -80) {
        setMobileOpen(false);
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
      }
      touchStartX.current = null;
      touchCurrentX.current = null;
    };

    drawer.addEventListener("touchstart", onTouchStart, { passive: true });
    drawer.addEventListener("touchmove", onTouchMove, { passive: true });
    drawer.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      drawer.removeEventListener("touchstart", onTouchStart);
      drawer.removeEventListener("touchmove", onTouchMove);
      drawer.removeEventListener("touchend", onTouchEnd);
    };
  }, [mobileOpen, setMobileOpen]);

  useEffect(() => {
    ensureRealtime();
  }, []);

  useEffect(() => {
    const eventMap: Record<string, OverlayName> = {
      "subsumio:create-case": "case",
      "subsumio:quick-create": "case",
      "subsumio:create-deadline": "deadline",
      "subsumio:create-invoice": "invoice",
      "subsumio:create-signature": "signature",
      "subsumio:create-clause": "clause",
      "subsumio:create-contract": "contract",
    };
    const handlers = Object.entries(eventMap).map(([eventName, overlay]) => {
      const handler = (event: Event) => {
        const detail = (event as CustomEvent<{ caseSlug?: string }>).detail;
        setPresetCaseSlug(detail?.caseSlug);
        setOverlay(overlay, true);
      };
      window.addEventListener(eventName, handler);
      return { eventName, handler };
    });
    return () =>
      handlers.forEach(({ eventName, handler }) => window.removeEventListener(eventName, handler));
  }, [setOverlay]);

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
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setCopilotOpen((value) => !value);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setGuideOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        window.dispatchEvent(new Event("subsumio:open-notifications"));
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
  }, [
    toggleTheme,
    router,
    setCmdOpen,
    setShortcutsOpen,
    setCopilotOpen,
    setGuideOpen,
    setGlobalQuickCreateOpen,
    setGlobalDeadlineCreateOpen,
    setGlobalInvoiceCreateOpen,
    setGlobalSignatureCreateOpen,
    setGlobalContractCreateOpen,
  ]);

  // The support-session banner is `fixed` (not in flex flow) so it can't
  // disturb the app-shell's own internal scroll regions — the shell instead
  // gets a matching top offset while it's visible.
  const SUPPORT_BANNER_HEIGHT = 40;

  return (
    <div
      className="flex h-screen overflow-hidden bg-[color:var(--ds-bg)] text-[color:var(--ds-text)]"
      // Brand colours come from the theme tokens in globals.css (light: brand-600,
      // dark: brand-400). The legacy per-industry inline style pinned brand-500
      // for both themes — links were 2.8:1 on the dark surface.
      style={supportSession ? { paddingTop: SUPPORT_BANNER_HEIGHT } : undefined}
      data-industry={industry ?? "core"}
      data-app="dashboard"
      data-theme={theme}
      // theme-init.js sets data-theme on the DOM before hydration (no flash);
      // React resyncs via useTheme's mount effect. Suppress the expected
      // server(light)/client(stored) attribute mismatch warning on this node.
      suppressHydrationWarning
    >
      {supportSession && (
        <div className="fixed inset-x-0 top-0 z-[100]" style={{ height: SUPPORT_BANNER_HEIGHT }}>
          <SupportSessionBanner session={supportSession} />
        </div>
      )}
      {/* Prevent search engines from indexing authenticated dashboard pages.
          Defense-in-depth: robots.txt already blocks /dashboard, but this
          data attribute ensures noindex intent is documented. The actual
          meta tag is set via Next.js metadata API in the page exports. */}
      <meta name="robots" content="noindex, nofollow" />
      {/* Theme bootstrap runs while this element is being parsed (its parent
          node already exists), before hydration and first paint. Browsers
          blank the nonce attribute once a CSP is enforced, so React's dev
          hydration diff would otherwise report nonce "" vs the real value. */}
      <script
        nonce={cspNonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
      />
      {/* Skip-to-content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-[color:var(--brand-solid)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[color:var(--ds-text)] focus:shadow-lg"
      >
        {t("layout.skip_to_content")}
      </a>
      <motion.div
        className={cn("fixed inset-0 z-[45] md:hidden", !mobileOpen && "pointer-events-none")}
        initial={false}
        animate={{
          opacity: mobileOpen ? 1 : 0,
          backdropFilter: mobileOpen && !reduceMotion ? "blur(12px)" : "blur(0px)",
        }}
        transition={overlayTransition}
        onClick={() => {
          setMobileOpen(false);
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
        }}
        aria-hidden="true"
        style={{
          background: mobileOpen
            ? "linear-gradient(90deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)"
            : "rgba(0,0,0,0)",
        }}
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
        userName={userName}
        userEmail={userEmail}
        brainReachable={brainReachable}
        industry={industry}
        role={role}
        plan={plan}
        jurisdiction={meQuery.data?.user?.jurisdiction ?? null}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          theme={theme}
          toggleTheme={toggleTheme}
          mobileOpen={mobileOpen}
          onMobileMenuOpen={() => setMobileOpen(true)}
          onMobileMenuClose={() => setMobileOpen(false)}
          onGuideOpen={() => setGuideOpen(true)}
          copilotOpen={copilotOpen}
          onCopilotToggle={() => setCopilotOpen((v) => !v)}
          onCmdOpen={() => setCmdOpen(true)}
        />

        {/* Visually-hidden live region for screen reader route announcements */}
        <div aria-live="assertive" aria-atomic="true" className="sr-only">
          {routeAnnouncement}
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          ref={mainRef}
          className="dashboard-main-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto pb-[calc(3.75rem+env(safe-area-inset-bottom))] focus:outline-none md:pb-0"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              /* Page roots centre with mx-auto; as flex items that would make them
                 content-sized (phone overflow), so every direct child is forced to full width. */
              className="flex min-h-0 min-w-0 flex-1 flex-col [&>*]:w-full"
              /* Page change: the old page fades out quickly (120 ms, no movement),
                 the new one fades in with a 6 px rise (210 ms, ease-out) — the
                 Next.js view-transition guidance. Reduced motion: opacity only. */
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { duration: 0.21, ease: [0.22, 1, 0.36, 1] },
              }}
              exit={{ opacity: 0, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
            >
              {/* Gate children on the /api/me round-trip: until it resolves we
                  can't know whether the onboarding redirect fires, and the
                  page would flash dashboard chrome + content before being torn
                  away. Fail open on error so an API hiccup never blanks the app. */}
              {meQuery.isLoading ? (
                <PageSkeleton withStats />
              ) : (
                <ErrorBoundary>{children}</ErrorBoundary>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {(cmdOpen || overlaysMounted.command) && (
        <CommandPalette
          open={cmdOpen}
          onClose={() => setCmdOpen(false)}
          onToggleTheme={toggleTheme}
          onToggleSidebar={() => setCollapsed((c) => !c)}
          industry={industry}
          role={role}
          jurisdiction={meQuery.data?.user?.jurisdiction ?? null}
        />
      )}
      {(shortcutsOpen || overlaysMounted.shortcuts) && (
        <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      )}
      {(guideOpen || overlaysMounted.guide) && (
        <DashboardGuide
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          jurisdiction={meQuery.data?.user?.jurisdiction ?? null}
        />
      )}
      <CopilotSidebar open={copilotVisible} onToggle={() => setCopilotOpen((v) => !v)} />
      <NormReaderPanel />

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
            className="shrink-0 rounded-md p-0.5 text-[color:var(--ds-text-subtle)] transition-[color,transform] duration-[var(--ds-duration-fast)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.9] motion-reduce:transition-none"
            aria-label={t("common.close")}
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

      <CaseQuickCreateDialog open={globalQuickCreateOpen} onOpenChange={setGlobalQuickCreateOpen} />

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
      <PracticeQuickCreateDialogs />

      {/* Mobile bottom tab bar — agency-level navigation */}
      <MobileTabBar
        onCopilotToggle={() => setCopilotOpen((v) => !v)}
        copilotOpen={copilotOpen}
        onMobileMenuOpen={() => setMobileOpen(true)}
        theme={theme}
        toggleTheme={toggleTheme}
        onGuideOpen={() => setGuideOpen(true)}
        industry={industry}
        jurisdiction={meQuery.data?.user?.jurisdiction ?? null}
      />
    </div>
  );
}
