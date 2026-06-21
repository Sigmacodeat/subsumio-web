"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatPanel } from "@/components/chat/chat-panel";

interface ChatDrawerProps {
  className?: string;
}

export function ChatDrawer({ className }: ChatDrawerProps) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Open via keyboard shortcut: Cmd+J
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  // Focus management: focus close button when drawer opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
  }, [open]);

  // Focus trap within drawer
  useEffect(() => {
    if (!open) return;
    function handleTabKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleTabKey);
    return () => document.removeEventListener("keydown", handleTabKey);
  }, [open]);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "brand-bg brand-text-on-primary fixed right-6 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-[transform,box-shadow,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-105 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-bg)] focus-visible:outline-none active:scale-95",
          open && "pointer-events-none opacity-0",
          className
        )}
        aria-label="Brain Copilot öffnen (Cmd+J)"
        title="Brain Copilot öffnen (Cmd+J)"
      >
        {!open && (
          <span
            className="brand-bg absolute inset-0 animate-ping rounded-full opacity-20"
            aria-hidden
          />
        )}
        <Sparkles size={22} className="relative" />
      </button>

      {/* Drawer overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-md transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-label="Brain Copilot"
        aria-modal={open ? "true" : undefined}
        aria-hidden={!open}
        inert={!open || undefined}
      >
        <div className="flex h-full flex-col bg-[color:var(--ds-surface)] shadow-2xl">
          {/* Close button */}
          <button
            ref={closeButtonRef}
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
            aria-label="Brain Copilot schließen (Esc)"
          >
            <X size={18} />
          </button>

          <ChatPanel
            className="h-full rounded-none border-0"
            features={{
              brainStatus: true,
              tokenWidget: true,
              sessionHistory: true,
            }}
          />
        </div>
      </div>
    </>
  );
}
