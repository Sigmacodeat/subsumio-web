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
    glow: "shadow-[0_0_6px_1.5px_var(--brain-glow)]",
  },
  md: {
    wrapper: "h-7 w-7",
    icon: 14,
    glow: "shadow-[0_0_8px_2px_var(--brain-glow)]",
  },
  lg: {
    wrapper: "h-9 w-9",
    icon: 18,
    glow: "shadow-[0_0_10px_2.5px_var(--brain-glow)]",
  },
};

/**
 * BrainAvatar — the visual identity of the Subsumio Copilot.
 *
 * Idle:    Brain icon in Brand-Primary, transparent background.
 * Thinking: Single pulse ring + subtle glow.
 */
export function BrainAvatar({ thinking = false, size = "md", className, title }: BrainAvatarProps) {
  const { wrapper, icon, glow } = SIZE_MAP[size];

  return (
    <div className={cn("relative shrink-0", wrapper, className)} title={title} aria-label={title}>
      {/* Single pulse ring — only visible while thinking */}
      {thinking && (
        <span
          className={cn(
            "absolute inset-0 rounded-xl",
            "animate-[brain-ring_2s_ease-out_infinite]",
            "bg-[color:var(--brand-primary)] opacity-0"
          )}
          aria-hidden="true"
        />
      )}

      {/* Brain icon — Brand-Primary, transparent background */}
      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center rounded-xl",
          thinking ? glow : ""
        )}
      >
        <Brain
          size={icon}
          className={cn(
            "text-[color:var(--brand-primary)] transition-all duration-500",
            thinking && "opacity-80"
          )}
          strokeWidth={1.75}
        />
      </div>
    </div>
  );
}
