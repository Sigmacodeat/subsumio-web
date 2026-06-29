"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  /** Optional: wait for selector to appear before showing (for async content). */
  waitFor?: string;
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

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar"]',
    title: "Navigation",
    body: "Hier findest du alle Hauptbereiche: Akten, Fristen, Dokumente, Kontakte und mehr. Die Sidebar lässt sich mit Cmd+B einklappen.",
    placement: "right",
  },
  {
    target: '[data-tour="topbar"]',
    title: "Top-Leiste",
    body: "Schnellzugriff auf Command Palette (Cmd+K), Theme-Umschaltung, Guide und deinen Account.",
    placement: "bottom",
  },
  {
    target: '[data-tour="copilot-toggle"]',
    title: "KI-Copilot",
    body: "Der Copilot ist dein direkter Zugang zur KI. Stelle Fragen zu Akten, lasse Schriftsätze entwerfen oder Fristen prüfen — alles ohne das Dashboard zu verlassen.",
    placement: "left",
    mobile: false,
  },
  {
    target: '[data-tour="quick-create"]',
    title: "Schnellerstellung",
    body: "Erstelle neue Akten, Fristen, Rechnungen, Verträge oder Klauseln mit einem Klick. Oder nutze das Tastatur-Shortcut Cmd+N.",
    placement: "bottom",
  },
  {
    target: '[data-tour="stats-overview"]',
    title: "Übersicht",
    body: "Hier siehst du die wichtigsten Kennzahlen: Seiten im Brain, Entitäten, letzter Dream-Cycle und ob die Engine erreichbar ist.",
    placement: "bottom",
    route: "/dashboard",
  },
  {
    target: '[data-tour="deadlines-widget"]',
    title: "Fristen-Management",
    body: "Kritische Fristen werden automatisch erkannt und farbcodiert angezeigt. Exportiere geprüfte Fristen als Kalender-Datei.",
    placement: "right",
    route: "/dashboard/deadlines",
  },
  {
    target: '[data-tour="cases-list"]',
    title: "Akten-Übersicht",
    body: "Alle deine Akten an einem Ort. Jede Akte enthält Mandant, Gegner, Fristen, Dokumente und den Akten-Graphen.",
    placement: "right",
    route: "/dashboard/cases",
  },
  {
    target: '[data-tour="copilot-panel"]',
    title: "Copilot-Panel",
    body: "Der Copilot bleibt geöffnet während du arbeitest. Stelle Fragen, lasse analysieren oder entwerfen — kontextbezogen zur aktuellen Akte.",
    placement: "left",
    mobile: false,
  },
  {
    target: '[data-tour="command-palette-hint"]',
    title: "Command Palette",
    body: "Mit Cmd+K öffnest du die Command Palette — suche nach Akten, Dokumenten, Kontakten oder führe Aktionen aus, ohne zu navigieren.",
    placement: "bottom",
    mobile: false,
  },
];

// ── Tour Provider ──────────────────────────────────────────────────────

const STORAGE_KEY = "subsumio-tour-completed";

export function TourProvider({ children }: { children: ReactNode }) {
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
    () => TOUR_STEPS.filter((s) => s.mobile !== false || !isMobile),
    [isMobile]
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

  const skipTour = useCallback(() => {
    completeTour();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {mounted && isOpen && (
        <TourOverlay
          steps={visibleSteps}
          currentStep={currentStep}
          onNext={nextStep}
          onPrev={prevStep}
          onClose={skipTour}
          onComplete={completeTour}
        />
      )}
    </TourContext.Provider>
  );
}

// ── Tour Overlay Component ─────────────────────────────────────────────

interface TourOverlayProps {
  steps: TourStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onComplete: () => void;
}

function TourOverlay({
  steps,
  currentStep,
  onNext,
  onPrev,
  onClose,
  onComplete,
}: TourOverlayProps) {
  const router = useRouter();
  const step = steps[currentStep];

  // Guard: if step is undefined (e.g. after mobile filtering), skip to complete
  useEffect(() => {
    if (!step) {
      onComplete();
    }
  }, [step, onComplete]);

  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
  }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useRef(`tour-tooltip-${Date.now()}`).current;
  const [retryCount, setRetryCount] = useState(0);

  // Navigate to route if step requires it — client-side navigation, no full reload
  useEffect(() => {
    if (step.route) {
      router.push(step.route);
    }
  }, [step.route, router]);

  // Scroll target element into view once found
  useEffect(() => {
    if (!targetRect) return;
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
  }, [targetRect, step.target]);

  // Find target element and compute positions
  useEffect(() => {
    let cancelled = false;

    const findTarget = () => {
      if (cancelled) return;

      const el = document.querySelector(step.target);
      if (!el) {
        // Retry up to 10 times with 200ms delay (for async content / route transitions)
        if (retryCount < 10) {
          setTimeout(() => setRetryCount((c) => c + 1), 200);
        }
        return;
      }

      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      setRetryCount(0);
    };

    findTarget();

    // Recompute on resize / scroll
    window.addEventListener("resize", findTarget);
    window.addEventListener("scroll", findTarget, true);

    // Poll for target until found, then stop
    let interval: ReturnType<typeof setInterval> | undefined;
    if (!document.querySelector(step.target)) {
      interval = setInterval(findTarget, 500);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("resize", findTarget);
      window.removeEventListener("scroll", findTarget, true);
      if (interval) clearInterval(interval);
    };
  }, [step.target, retryCount]);

  // Compute tooltip position based on placement
  useEffect(() => {
    if (!targetRect) return;

    const tooltip = tooltipRef.current;
    const tooltipWidth = tooltip?.offsetWidth ?? 320;
    const tooltipHeight = tooltip?.offsetHeight ?? 200;
    const margin = 12;
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

    // Clamp to viewport
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipHeight - margin));
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipWidth - margin));

    setTooltipPos({ top, left });
  }, [targetRect, step.placement]);

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

  const isLastStep = currentStep >= steps.length - 1;
  const highlightStyle = targetRect
    ? {
        top: targetRect.top - 4,
        left: targetRect.left - 4,
        width: targetRect.width + 8,
        height: targetRect.height + 8,
      }
    : null;

  return createPortal(
    <>
      {/* Dark overlay */}
      <div
        className="fixed inset-0 z-[100] bg-black/50 transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Highlight ring around target element */}
      {highlightStyle && (
        <div
          className="fixed z-[100] rounded-lg ring-2 ring-[color:var(--brand-primary)] transition-all duration-200 ease-out"
          style={{
            ...highlightStyle,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${tooltipId}-title`}
        aria-describedby={`${tooltipId}-body`}
        tabIndex={-1}
        className="fixed z-[101] w-80 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 shadow-2xl transition-all duration-200 ease-out focus:outline-none"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
        }}
        onClick={(e) => e.stopPropagation()}
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
            aria-label="Tour schließen"
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

        {/* Progress dots */}
        <div
          className="mb-4 flex items-center gap-1.5"
          role="tablist"
          aria-label="Tour Fortschritt"
        >
          {steps.map((_, i) => (
            <div
              key={i}
              role="tab"
              aria-selected={i === currentStep}
              aria-label={`Schritt ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-200 ${
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
            {currentStep + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <Button variant="ghost" size="sm" onClick={onPrev}>
                <ChevronLeft size={14} /> Zurück
              </Button>
            )}
            {isLastStep ? (
              <Button variant="glow" size="sm" onClick={onComplete}>
                <CheckCircle2 size={14} /> Fertig
              </Button>
            ) : (
              <Button variant="glow" size="sm" onClick={onNext}>
                Weiter <ChevronRight size={14} />
              </Button>
            )}
          </div>
        </div>

        {/* Skip link */}
        <button
          onClick={onClose}
          className="mt-3 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
        >
          Tour überspringen
        </button>
      </div>
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
