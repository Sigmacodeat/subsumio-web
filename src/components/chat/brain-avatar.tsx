"use client";

import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrainAvatarProps {
  /** When true, the avatar pulses to indicate the AI is thinking/streaming */
  thinking?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional className for the wrapper */
  className?: string;
  /** Accessible title shown on hover */
  title?: string;
}

const SIZE_MAP = {
  sm: {
    wrapper: "h-6 w-6",
    icon: 12,
    ring: "ring-1",
    glow: "shadow-[0_0_8px_2px_var(--brain-glow)]",
  },
  md: {
    wrapper: "h-7 w-7",
    icon: 14,
    ring: "ring-1",
    glow: "shadow-[0_0_12px_3px_var(--brain-glow)]",
  },
  lg: {
    wrapper: "h-9 w-9",
    icon: 18,
    ring: "ring-2",
    glow: "shadow-[0_0_16px_4px_var(--brain-glow)]",
  },
};

/**
 * BrainAvatar — the visual identity of the Subsumio Copilot.
 *
 * Idle:    Brand-gradient blob with Brain icon, subtle border.
 * Thinking: Animated ring-pulse + glow + gentle scale-breathe on the icon.
 */
export function BrainAvatar({ thinking = false, size = "md", className, title }: BrainAvatarProps) {
  const { wrapper, icon, ring, glow } = SIZE_MAP[size];

  return (
    <div className={cn("relative shrink-0", wrapper, className)} title={title} aria-label={title}>
      {/* Outer animated pulse ring — only visible while thinking */}
      {thinking && (
        <>
          <span
            className={cn(
              "absolute inset-0 rounded-xl",
              "animate-[brain-ring_1.6s_ease-in-out_infinite]",
              "bg-[color:var(--brand-primary)] opacity-0"
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              "absolute inset-0 rounded-xl",
              "animate-[brain-ring_1.6s_ease-in-out_0.5s_infinite]",
              "bg-[color:var(--brand-primary)] opacity-0"
            )}
            aria-hidden="true"
          />
        </>
      )}

      {/* Main avatar blob */}
      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl",
          "border border-[color:var(--ds-border)]",
          "bg-gradient-to-br from-slate-800 via-blue-600 to-indigo-700",
          ring,
          thinking ? cn("ring-[color:var(--brand-primary)]/40", glow) : "ring-transparent",
          thinking && "animate-[brain-breathe_2.4s_ease-in-out_infinite]",
          "transition-shadow duration-500"
        )}
      >
        <Brain
          size={icon}
          className={cn(
            "text-white/90 transition-all duration-500",
            thinking && "animate-[brain-icon-pulse_2.4s_ease-in-out_infinite] text-white"
          )}
          strokeWidth={1.75}
        />
      </div>
    </div>
  );
}
