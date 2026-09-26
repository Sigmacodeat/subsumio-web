"use client";

/**
 * Sheet — Mobile Bottom-Sheet / Desktop Side-Panel.
 *
 - shadcn/ui-Stil, nutzt dieselben Design-Tokens.
 - Mobile: Bottom-Sheet (von unten einsliden, swipe-to-dismiss).
 - Desktop (md+): Side-Panel (von rechts).
 - Framer Motion für Entrance/Exit-Animation.
 - Accessibility: focus trap, Escape-to-close, aria-modal.
 - Wie OpenAI's mobile Analytics Bottom-Sheet.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Side on desktop. Default: right */
  side?: "right" | "left" | "bottom";
  /** Width on desktop (px or tailwind class). Default: 480px */
  desktopWidth?: string;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("aria-hidden") && !el.closest("[aria-hidden='true']")
  );
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  side = "right",
  desktopWidth = "max-w-md",
}: SheetProps) {
  const { t } = useLang();
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Escape to close + Fokusfalle (WCAG 2.1.2 / 2.4.3):
  // - beim Öffnen: Fokus auf das erste fokussierbare Element im Panel,
  //   sonst auf das Panel selbst (tabIndex=-1)
  // - Tab / Shift+Tab zyklisch innerhalb des Panels
  // - beim Schließen: Fokus zurück auf das zuvor fokussierte Element
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFirst = () => {
      const panel = sheetRef.current;
      if (!panel) return;
      const first = getFocusable(panel)[0];
      (first ?? panel).focus({ preventScroll: true });
    };
    // Framer Motion mountet das Panel synchron; der Fokus wird trotzdem in
    // einem Frame nachgezogen, damit initiale Autofocus-Kinder gewinnen.
    const raf = requestAnimationFrame(() => {
      const panel = sheetRef.current;
      if (panel && !panel.contains(document.activeElement)) focusFirst();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = sheetRef.current;
      if (!panel) return;
      const focusable = getFocusable(panel);
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first || active === panel) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  // Mobile: bottom-sheet animation; Desktop: side-panel animation
  const isBottom = side === "bottom";
  const initial = isBottom ? { y: "100%" } : side === "left" ? { x: "-100%" } : { x: "100%" };
  const animate = { x: 0, y: 0 };
  const exit = initial;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            aria-hidden
          />
          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : t("sheet.aria_close")}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={initial}
            animate={animate}
            exit={exit}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={cn(
              "fixed z-50 bg-[color:var(--ds-surface)] shadow-2xl",
              // Mobile: bottom-sheet
              isBottom &&
                "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t border-[color:var(--ds-border)]",
              // Desktop: side-panel
              !isBottom &&
                side === "right" &&
                cn(
                  "inset-y-0 right-0 w-full border-l border-[color:var(--ds-border)] md:w-auto",
                  desktopWidth
                ),
              !isBottom &&
                side === "left" &&
                cn(
                  "inset-y-0 left-0 w-full border-r border-[color:var(--ds-border)] md:w-auto",
                  desktopWidth
                )
            )}
          >
            {/* Mobile drag handle */}
            {isBottom && (
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-[color:var(--ds-border)]" aria-hidden />
              </div>
            )}
            {/* Header */}
            {(title || description) && (
              <div className="flex items-start justify-between gap-3 border-b border-[color:var(--ds-border)] p-4">
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2 id={titleId} className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p id={descId} className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("sheet.aria_close")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            )}
            {/* Content */}
            <div
              className={cn(
                "overflow-y-auto p-4",
                isBottom ? "max-h-[70vh]" : "h-[calc(100%-65px)]"
              )}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
