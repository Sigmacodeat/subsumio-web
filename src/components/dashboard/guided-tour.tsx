"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createT, type Lang, type TFunc } from "@/content/dashboard";

// SSR-safe useLayoutEffect — falls back to useEffect during server rendering
// to avoid the "useLayoutEffect does nothing on the server" warning.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function useTourTranslation(): TFunc {
  const [lang, setLang] = useState<Lang>("de");
  useEffect(() => {
    const update = () => {
      const stored = localStorage.getItem("dashboard-lang");
      setLang(
        stored === "en" || stored === "de" || stored === "at" || stored === "ch" ? stored : "de"
      );
    };
    update();
    window.addEventListener("dashboard-lang-change", update);
    return () => window.removeEventListener("dashboard-lang-change", update);
  }, []);
  return useMemo(() => createT(lang), [lang]);
}

// ── Types ──────────────────────────────────────────────────────────────

export interface TourStep {
  /** CSS selector for the element to highlight. */
  target: string;
  /** Tooltip title. */
  title: string;
  /** Tooltip body text. */
  body: string;
  /** Placement relative to the target element. */
  placement?: "top" | "bottom" | "left" | "right" | "center";
  /** Optional: route to navigate to before showing this step. */
  route?: string;
  /** Optional: if false, skip this step on mobile (screen width < 768px). Default: true. */
  mobile?: boolean;
}

interface TourContextValue {
  startTour: () => void;
  closeTour: () => void;
  restartTour: () => void;
  isTourOpen: boolean;
  hasCompletedTour: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    return {
      startTour: () => {},
      closeTour: () => {},
      restartTour: () => {},
      isTourOpen: false,
      hasCompletedTour: true,
    };
  }
  return ctx;
}

// ── Tour Step Definitions ──────────────────────────────────────────────

function getTourSteps(t: TFunc): TourStep[] {
  return [
    {
      target: '[data-tour="sidebar"]',
      title: t("tour.step1.title"),
      body: t("tour.step1.body"),
      placement: "right",
    },
    {
      target: '[data-tour="topbar"]',
      title: t("tour.step2.title"),
      body: t("tour.step2.body"),
      placement: "bottom",
    },
    {
      target: '[data-tour="copilot-toggle"]',
      title: t("tour.step3.title"),
      body: t("tour.step3.body"),
      placement: "left",
      mobile: false,
    },
    {
      target: '[data-tour="quick-create"]',
      title: t("tour.step4.title"),
      body: t("tour.step4.body"),
      placement: "bottom",
    },
    {
      target: '[data-tour="stats-overview"]',
      title: t("tour.step5.title"),
      body: t("tour.step5.body"),
      placement: "bottom",
      route: "/dashboard",
    },
    {
      target: '[data-tour="deadlines-widget"]',
      title: t("tour.step6.title"),
      body: t("tour.step6.body"),
      placement: "right",
      route: "/dashboard/deadlines",
    },
    {
      target: '[data-tour="cases-list"]',
      title: t("tour.step7.title"),
      body: t("tour.step7.body"),
      placement: "right",
      route: "/dashboard/cases",
    },
    {
      target: '[data-tour="workflows-intro"]',
      title: t("tour.step8.title"),
      body: t("tour.step8.body"),
      placement: "bottom",
      route: "/dashboard/workflows",
    },
    {
      target: '[data-tour="workflows-templates"]',
      title: t("tour.step9.title"),
      body: t("tour.step9.body"),
      placement: "top",
      route: "/dashboard/workflows",
    },
    {
      target: '[data-tour="workflows-list"]',
      title: t("tour.step10.title"),
      body: t("tour.step10.body"),
      placement: "top",
      route: "/dashboard/workflows",
    },
    {
      target: '[data-tour="copilot-panel"]',
      title: t("tour.step11.title"),
      body: t("tour.step11.body"),
      placement: "left",
      mobile: false,
    },
    {
      target: '[data-tour="command-palette-hint"]',
      title: t("tour.step12.title"),
      body: t("tour.step12.body"),
      placement: "bottom",
      mobile: false,
    },
  ];
}

// ── Tour Provider ──────────────────────────────────────────────────────

const STORAGE_KEY = "subsumio-tour-completed";

export function TourProvider({ children }: { children: ReactNode }) {
  const t = useTourTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setHasCompleted(stored === "true");
    } catch {
      // localStorage not available
    }
  }, []);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsOpen(true);
  }, []);

  const restartTour = useCallback(() => {
    setHasCompleted(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setCurrentStep(0);
    setIsOpen(true);
  }, []);

  const closeTour = useCallback(() => {
    setIsOpen(false);
  }, []);

  const completeTour = useCallback(() => {
    setIsOpen(false);
    setHasCompleted(true);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
  }, []);

  // Filter steps for mobile — skip steps with mobile: false on small screens
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const visibleSteps = useMemo(
    () => getTourSteps(t).filter((s) => s.mobile !== false || !isMobile),
    [isMobile, t]
  );

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      const maxIndex = visibleSteps.length - 1;
      if (prev >= maxIndex) {
        completeTour();
        return prev;
      }
      return prev + 1;
    });
  }, [completeTour, visibleSteps]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      setCurrentStep(Math.max(0, Math.min(index, visibleSteps.length - 1)));
    },
    [visibleSteps.length]
  );

  const skipTour = useCallback(() => {
    completeTour();
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      startTour,
      closeTour,
      restartTour,
      isTourOpen: isOpen,
      hasCompletedTour: hasCompleted,
    }),
    [startTour, closeTour, restartTour, isOpen, hasCompleted]
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {mounted && (
        <AnimatePresence>
          {isOpen && (
            <TourOverlay
              steps={visibleSteps}
              currentStep={currentStep}
              onNext={nextStep}
              onPrev={prevStep}
              onGoTo={goToStep}
              onClose={skipTour}
              onComplete={completeTour}
            />
          )}
        </AnimatePresence>
      )}
    </TourContext.Provider>
  );
}

// ── Spotlight SVG Overlay ──────────────────────────────────────────────

/**
 * SVG-based spotlight overlay: dims the entire screen except the target rect.
 * Uses an SVG <mask> with a white rect (visible) and a black rect (hidden)
 * to "cut out" the target area. The target stays fully visible while the
 * rest of the page is dimmed.
 *
 * The cutout MORPHS smoothly between steps — framer-motion animates the
 * x/y/width/height of the mask rect with spring physics so the spotlight
 * glides from one target to the next instead of jumping.
 *
 * AI-character visual layers:
 *  1. Solid ring — clean brand-color border around the target
 *  2. Soft glow — blurred duplicate of the ring for a halo effect
 *  3. Radar pulse — expanding ring that fades out (infinite repeat)
 *  4. Scan line — thin horizontal line sweeping across the cutout
 *
 * All layers morph in sync via the same spring config.
 */
function SpotlightOverlay({
  rect,
  padding,
  onClick,
  reducedMotion,
}: {
  rect: DOMRect;
  padding: number;
  onClick?: () => void;
  reducedMotion?: boolean;
}) {
  const x = rect.left - padding;
  const y = rect.top - padding;
  const w = rect.width + padding * 2;
  const h = rect.height + padding * 2;
  const rx = 12;

  // Spring config: snappy but organic — feels like the spotlight "flows".
  // When prefers-reduced-motion is set, use instant transitions instead.
  const spring = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 260, damping: 28, mass: 0.8 };

  return (
    <motion.svg
      className="fixed inset-0 z-[100] h-full w-full cursor-default"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClick}
      aria-hidden="true"
    >
      <defs>
        {/* Mask: white = dimmed, black = cutout (target stays visible) */}
        <mask id="tour-spotlight-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <motion.rect
            initial={false}
            animate={{ x, y, width: w, height: h }}
            transition={spring}
            rx={rx}
            fill="black"
          />
        </mask>
        {/* Blur filter for the soft glow halo */}
        <filter id="tour-glow-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        {/* Clip path for the scan line — keeps it inside the cutout */}
        <clipPath id="tour-scan-clip">
          <motion.rect
            initial={false}
            animate={{ x, y, width: w, height: h }}
            transition={spring}
            rx={rx}
          />
        </clipPath>
      </defs>

      {/* Dimmed overlay with morphing cutout */}
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="black"
        opacity={0.5}
        mask="url(#tour-spotlight-mask)"
      />

      {/* Soft glow halo — blurred ring, breathing opacity */}
      <motion.rect
        initial={false}
        animate={{ x, y, width: w, height: h }}
        transition={spring}
        rx={rx}
        fill="none"
        stroke="var(--brand-primary)"
        strokeWidth={4}
        filter="url(#tour-glow-blur)"
        opacity={0.4}
      />

      {/* Solid ring around the cutout — morphs with the target */}
      <motion.rect
        initial={false}
        animate={{ x, y, width: w, height: h }}
        transition={spring}
        rx={rx}
        fill="none"
        stroke="var(--brand-primary)"
        strokeWidth={2}
        opacity={0.9}
      />

      {/* Radar pulse — expanding ring that fades out, repeats infinitely.
          Gives the "AI is scanning here" feel.
          Disabled when prefers-reduced-motion is set. */}
      {!reducedMotion && (
        <motion.rect
          initial={{ x, y, width: w, height: h, opacity: 0.5 }}
          animate={{
            x: [x, x - 10],
            y: [y, y - 10],
            width: [w, w + 20],
            height: [h, h + 20],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeOut",
            delay: 0.4,
          }}
          rx={rx}
          fill="none"
          stroke="var(--brand-primary)"
          strokeWidth={1.5}
        />
      )}

      {/* Scan line — thin horizontal line sweeping across the cutout.
          Clipped to the cutout shape. AI "analyzing" feel.
          Disabled when prefers-reduced-motion is set. */}
      {!reducedMotion && (
        <g clipPath="url(#tour-scan-clip)">
          <motion.line
            initial={{ y1: y, y2: y }}
            animate={{ y1: [y, y + h, y], y2: [y, y + h, y] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            x1={x}
            x2={x + w}
            stroke="var(--brand-primary)"
            strokeWidth={1}
            opacity={0.35}
          />
        </g>
      )}
    </motion.svg>
  );
}

// ── Arrow ──────────────────────────────────────────────────────────────

/**
 * Small SVG triangle pointing from the tooltip towards the target.
 * Uses SVG (not CSS borders) so the arrow has both a fill AND a stroke
 * that seamlessly matches the tooltip's border — no visible gap.
 */
function TourArrow({ placement }: { placement: TourStep["placement"] }) {
  const size = 9;
  const fill = "var(--ds-surface)";
  const stroke = "var(--ds-border)";

  if (!placement || placement === "center") return null;

  // SVG triangle points: tip faces the target, base sits on the tooltip edge
  const points: Record<string, string> = {
    top: `${size / 2},${size} 0,0 ${size},0`,        // tip down (tooltip above target)
    bottom: `${size / 2},0 0,${size} ${size},${size}`, // tip up (tooltip below target)
    left: `${size},${size / 2} 0,0 0,${size}`,        // tip right (tooltip left of target)
    right: `0,${size / 2} ${size},0 ${size},${size}`, // tip left (tooltip right of target)
  };

  const wrapperPos: Record<string, React.CSSProperties> = {
    top: { bottom: -(size - 1), left: "50%", transform: "translateX(-50%)" },
    bottom: { top: -(size - 1), left: "50%", transform: "translateX(-50%)" },
    left: { right: -(size - 1), top: "50%", transform: "translateY(-50%)" },
    right: { left: -(size - 1), top: "50%", transform: "translateY(-50%)" },
  };

  return (
    <div className="absolute z-[0]" style={wrapperPos[placement]}>
      <svg width={size} height={size} className="block">
        <polygon
          points={points[placement]}
          fill={fill}
          stroke={stroke}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── Tour Overlay Component ─────────────────────────────────────────────

interface TourOverlayProps {
  steps: TourStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onGoTo: (index: number) => void;
  onClose: () => void;
  onComplete: () => void;
}

function TourOverlay({
  steps,
  currentStep,
  onNext,
  onPrev,
  onGoTo,
  onClose,
  onComplete,
}: TourOverlayProps) {
  const t = useTourTranslation();
  const router = useRouter();
  const step = steps[currentStep];

  // All hooks must be called before any early return (Rules of Hooks).
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
  }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useRef(`tour-tooltip-${Date.now()}`).current;
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Respect prefers-reduced-motion — disable spring/infinite animations.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Guard: if step is undefined (e.g. after mobile filtering), skip to complete
  useEffect(() => {
    if (!step) {
      onComplete();
    }
  }, [step, onComplete]);

  // Reset target rect on step change — prevents the spotlight from
  // showing at the previous step's position while the new target loads.
  useEffect(() => {
    setTargetRect(null);
  }, [currentStep]);

  // Scroll lock — prevent body scroll while tour is active
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Navigate to route if step requires it — client-side navigation, no full reload
  useEffect(() => {
    if (!step) return;
    if (step.route) {
      router.push(step.route);
    }
  }, [step, step?.route, router]);

  // Scroll target into view once on step change (not on every rect update)
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const isInViewport =
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.left >= 0 &&
      rect.right <= window.innerWidth;
    if (!isInViewport) {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [step]);

  // Find target element + continuous scroll-following via rAF loop.
  // The rAF loop updates targetRect every frame so the spotlight tracks
  // the target during smooth scroll, layout shifts, and CSS animations.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    let rafId: number | undefined;
    let lastRect: DOMRect | null = null;

    const updateRect = () => {
      if (cancelled) return;
      const el = document.querySelector(step.target);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      // Only update state if the rect actually changed — avoids 60
      // unnecessary re-renders per second when the target is stationary.
      if (
        lastRect &&
        lastRect.left === rect.left &&
        lastRect.top === rect.top &&
        lastRect.width === rect.width &&
        lastRect.height === rect.height
      ) {
        return;
      }
      lastRect = rect;
      setTargetRect(rect);
    };

    // rAF loop — tracks the target during scroll, layout shifts, animations.
    const tick = () => {
      if (cancelled) return;
      updateRect();
      rafId = requestAnimationFrame(tick);
    };

    updateRect();
    rafId = requestAnimationFrame(tick);

    // MutationObserver catches DOM insertions (route transitions, async content)
    const observer = new MutationObserver(() => updateRect());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [step]);

  // Compute tooltip position based on placement.
  // useLayoutEffect runs synchronously after DOM mutation but before paint,
  // so the tooltip is positioned correctly on first render (no flash at 0,0).
  useIsoLayoutEffect(() => {
    if (!targetRect || !step) return;

    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const margin = 16;
    const placement = step.placement ?? "bottom";

    let top: number;
    let left: number;

    switch (placement) {
      case "top":
        top = targetRect.top - tooltipHeight - margin;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case "bottom":
        top = targetRect.bottom + margin;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.left - tooltipWidth - margin;
        break;
      case "right":
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.right + margin;
        break;
      case "center":
        top = window.innerHeight / 2 - tooltipHeight / 2;
        left = window.innerWidth / 2 - tooltipWidth / 2;
        break;
    }

    // Clamp to viewport with margin
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipHeight - margin));
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipWidth - margin));

    setTooltipPos({ top, left });
  }, [targetRect, step]);

  // Focus management — move focus into tooltip on step change
  useEffect(() => {
    tooltipRef.current?.focus();
  }, [currentStep]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowRight":
          e.preventDefault();
          onNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          onPrev();
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onNext, onPrev]);

  // Early return if step is undefined — prevents crash when all steps
  // are filtered out (e.g. on mobile). Must be AFTER all hooks.
  if (!step) return null;

  const isLastStep = currentStep >= steps.length - 1;
  const padding = 6;

  return createPortal(
    <>
      {/* SVG Spotlight overlay with cutout.
          Click-outside-to-close: the SVG catches clicks on the dimmed area.
          The cutout (masked-out) area has no painted pixels, so with
          pointer-events: visiblePainted (SVG default) clicks pass through
          to the target element below. */}
      {targetRect ? (
        <SpotlightOverlay
          rect={targetRect}
          padding={padding}
          onClick={onClose}
          reducedMotion={prefersReducedMotion}
        />
      ) : (
        <motion.div
          className="fixed inset-0 z-[100] bg-black/55"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Tooltip — glides smoothly between positions (no remount).
          Content cross-fades inside via AnimatePresence.
          Position is controlled via `animate` only (not `style`) to avoid
          conflicts between framer-motion's animation and React's inline style. */}
      <motion.div
        ref={tooltipRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${tooltipId}-title`}
        aria-describedby={`${tooltipId}-body`}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.92, top: tooltipPos.top, left: tooltipPos.left }}
        animate={{
          opacity: 1,
          scale: 1,
          top: tooltipPos.top,
          left: tooltipPos.left,
        }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{
          opacity: { duration: 0.2 },
          scale: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
          top: prefersReducedMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 260, damping: 28, mass: 0.8 },
          left: prefersReducedMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 260, damping: 28, mass: 0.8 },
        }}
        className="fixed z-[101] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
      >
        <TourArrow placement={step.placement} />

        {/* Content cross-fades on step change — title + body swap smoothly */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10">
                  <Sparkles size={16} className="brand-text" />
                </div>
                <h3
                  id={`${tooltipId}-title`}
                  className="text-sm font-semibold text-[color:var(--ds-text)]"
                >
                  {step.title}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={t("tour.close")}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <p
              id={`${tooltipId}-body`}
              className="mb-4 text-xs leading-relaxed text-[color:var(--ds-text-muted)]"
            >
              {step.body}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots — clickable to jump to step */}
        <div
          className="mb-4 flex items-center gap-1.5"
          role="tablist"
          aria-label={t("tour.progress_label")}
        >
          {steps.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === currentStep}
              aria-label={t("tour.step_label").replace("{current}", String(i + 1))}
              onClick={() => onGoTo(i)}
              className={`h-1.5 rounded-full transition-all duration-200 hover:opacity-80 ${
                i === currentStep
                  ? "w-6 bg-[color:var(--brand-primary)]"
                  : i < currentStep
                    ? "w-1.5 bg-[color:var(--brand-primary)]/50"
                    : "w-1.5 bg-[color:var(--ds-border)]"
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {t("tour.progress")
              .replace("{current}", String(currentStep + 1))
              .replace("{total}", String(steps.length))}
          </span>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <Button variant="ghost" size="sm" onClick={onPrev}>
                <ChevronLeft size={14} /> {t("tour.back")}
              </Button>
            )}
            {isLastStep ? (
              <Button variant="glow" size="sm" onClick={onComplete}>
                <CheckCircle2 size={14} /> {t("tour.finish")}
              </Button>
            ) : (
              <Button variant="glow" size="sm" onClick={onNext}>
                {t("tour.next")} <ChevronRight size={14} />
              </Button>
            )}
          </div>
        </div>

        {/* Skip link */}
        <button
          onClick={onClose}
          className="mt-3 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
        >
          {t("tour.skip")}
        </button>
      </motion.div>
    </>,
    document.body
  );
}

// ── Auto-Start Hook ────────────────────────────────────────────────────

/**
 * Auto-starts the tour on first dashboard visit after onboarding completion.
 * Call this in the dashboard layout.
 */
export function useAutoStartTour(onboardingCompleted: boolean | string | null) {
  const { startTour, hasCompletedTour, isTourOpen } = useTour();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!onboardingCompleted) return;
    if (hasCompletedTour) return;
    if (isTourOpen) return;

    // Small delay to let dashboard render
    const timer = setTimeout(() => {
      startTour();
    }, 800);

    return () => clearTimeout(timer);
  }, [mounted, onboardingCompleted, hasCompletedTour, isTourOpen, startTour]);
}
