"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export function LoadingSpinner({
  size = 16,
  className,
  label = "Wird geladen…",
}: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-2", className)}
    >
      <Loader2 size={size} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface LoadingOverlayProps {
  label?: string;
  className?: string;
}

export function LoadingOverlay({ label = "Wird geladen…", className }: LoadingOverlayProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("flex items-center justify-center p-8", className)}
    >
      <Loader2
        className="animate-spin text-[color:var(--ds-text-muted)] motion-reduce:animate-none"
        size={24}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
