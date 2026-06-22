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

const typeStyles: Record<ToastType, string> = {
  success:
    "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-text)]",
  error:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-text)]",
  warning:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-text)]",
  info: "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-text)]",
};

function ToastViewport() {
  const { toasts, removeToast } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed right-4 bottom-4 z-[100] flex flex-col gap-2"
      role="region"
      aria-label="Benachrichtigungen"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "animate-in slide-in-from-bottom-2 fade-in relative flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lg",
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
            className="opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
