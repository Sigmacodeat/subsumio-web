"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  title?: string;
  description?: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, toast.duration ?? 5000);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

// Toasts mount in the root layout — OUTSIDE the dashboard's [data-app]
// scope — where only the dark :root token set exists and the translucent
// signal *-bg tokens are undefined. Style the card from surface/text (a
// consistent pair in EVERY scope) and express the type via a colored
// border, so the toast stays readable (WCAG AA) wherever it renders.
const typeStyles: Record<ToastType, string> = {
  success:
    "border-[color:var(--ds-success-border,#4ade80)] bg-[color:var(--ds-surface,#26262e)] text-[color:var(--ds-text,#f1f2f4)]",
  error:
    "border-[color:var(--ds-danger-border,#f87171)] bg-[color:var(--ds-surface,#26262e)] text-[color:var(--ds-text,#f1f2f4)]",
  warning:
    "border-[color:var(--ds-warning-border,#fbbf24)] bg-[color:var(--ds-surface,#26262e)] text-[color:var(--ds-text,#f1f2f4)]",
  info: "border-[color:var(--ds-info-border,#60a5fa)] bg-[color:var(--ds-surface,#26262e)] text-[color:var(--ds-text,#f1f2f4)]",
};

function ToastViewport() {
  const { toasts, removeToast } = useToast();
  // Die Live-Region wird IMMER gerendert (auch leer): Screenreader registrieren
  // aria-live nur für Knoten, die beim Einfügen des Inhalts bereits im DOM
  // stehen. Ein erst mit dem ersten Toast gemountetes Element würde die erste
  // Meldung verschlucken. Der leere Container ist pointer-events-none, damit er
  // keine Klicks abfängt.
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-[100] flex flex-col gap-2"
      role="region"
      aria-label="Benachrichtigungen"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          // Fehler sind assertiv (role="alert"), alles andere höflich (role="status").
          role={toast.type === "error" ? "alert" : "status"}
          className={cn(
            "animate-in slide-in-from-bottom-2 fade-in pointer-events-auto relative flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lg motion-reduce:animate-none",
            typeStyles[toast.type]
          )}
        >
          <div className="flex-1">
            {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
            {toast.description && <p className="mt-0.5 text-xs opacity-90">{toast.description}</p>}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            aria-label="Benachrichtigung schließen"
            className="rounded-md p-0.5 opacity-60 transition-[background-color,color,opacity,transform] duration-[var(--ds-duration-fast)] hover:bg-black/10 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
