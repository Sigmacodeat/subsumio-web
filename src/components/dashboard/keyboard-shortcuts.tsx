"use client";

import { useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { X, Keyboard, Command } from "lucide-react";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  items: { keys: string[]; label: string }[];
}

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  const { t } = useLang();
  const { reduceMotion, panelTransition, modalInitial, modalAnimate, modalExit } =
    useDashboardMotion();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        onClose();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  const groups: ShortcutGroup[] = [
    {
      title: t("cmd.shortcuts.global"),
      items: [
        { keys: ["⌘", "K"], label: t("cmd.shortcuts.cmd_k") },
        { keys: ["⇧", "?"], label: t("cmd.shortcuts.title") },
        { keys: ["Esc"], label: t("cmd.shortcuts.close") },
      ],
    },
    {
      title: t("cmd.section.actions"),
      items: [
        { keys: ["⌘", "Shift", "L"], label: t("cmd.shortcuts.theme") },
        { keys: ["⌘", "B"], label: t("cmd.shortcuts.sidebar") },
        { keys: ["⌘", "Shift", "A"], label: t("cmd.shortcuts.assistant") },
      ],
    },
  ];

  return (
    <AnimatePresence initial={false}>
      {open && [
        <motion.div
          key="shortcuts-overlay"
          className="fixed inset-0 z-[110] bg-black/50"
          initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
          animate={{
            opacity: 1,
            backdropFilter: reduceMotion ? "blur(0px)" : "blur(8px)",
          }}
          exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={panelTransition}
          onClick={onClose}
          aria-hidden="true"
        />,
        <motion.div
          key="shortcuts-panel"
          role="dialog"
          aria-modal="true"
          aria-label={t("cmd.shortcuts.title")}
          className="fixed top-1/2 left-1/2 z-[111] w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4"
          initial={modalInitial}
          animate={modalAnimate}
          exit={modalExit}
          transition={panelTransition}
        >
          <div className="card-shadow-elevated overflow-hidden rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
                  <Keyboard size={14} className="text-[color:var(--ds-text-muted)]" />
                </div>
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("cmd.shortcuts.title")}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={t("cmd.shortcuts.close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              <div className="space-y-5">
                {groups.map((group) => (
                  <div key={group.title}>
                    <h3 className="mb-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                      {group.title}
                    </h3>
                    <div className="space-y-1.5">
                      {group.items.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center justify-between rounded-lg px-2 py-1.5"
                        >
                          <span className="text-sm text-[color:var(--ds-text)]">{item.label}</span>
                          <span className="flex items-center gap-1">
                            {item.keys.map((key, i) => (
                              <kbd
                                key={key + i}
                                className={cn(
                                  "rounded border border-[color:var(--ds-border)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--ds-text-muted)]",
                                  key.length > 2 && "px-2"
                                )}
                              >
                                {key}
                              </kbd>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[color:var(--ds-border)] px-4 py-3 text-xs text-[color:var(--ds-text-muted)]">
              <span>{t("cmd.shortcuts.close")}: Esc / Shift + ?</span>
              <span className="flex items-center gap-1">
                <Command size={12} /> K
              </span>
            </div>
          </div>
        </motion.div>,
      ]}
    </AnimatePresence>
  );
}
