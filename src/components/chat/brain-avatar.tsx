"use client";

import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrainAvatarProps {
  /** When true, the avatar pulses to indicate the AI is thinking/streaming */
  thinking?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Render a soft circular orb behind the icon (ideal for empty states/hero placements) */
  orb?: boolean;
  /** Additional className for the wrapper */
  className?: string;
  /** Accessible title shown on hover */
  title?: string;
}

const SIZE_MAP = {
  sm: {
    wrapper: "h-8 w-8",
    icon: 16,
    glow: "shadow-[0_0_8px_2px_var(--brain-glow)]",
  },
  md: {
    wrapper: "h-9 w-9",
    icon: 18,
    glow: "shadow-[0_0_10px_2.5px_var(--brain-glow)]",
  },
  lg: {
    wrapper: "h-12 w-12",
    icon: 24,
    glow: "shadow-[0_0_12px_3px_var(--brain-glow)]",
  },
};

/**
 * BrainAvatar — the visual identity of the Subsumio Copilot.
 *
 * Idle:    Brain icon in Brand-Primary, optional soft orb.
 * Thinking: Three staggered circular ripples + soft halo + icon breathing.
 */
export function BrainAvatar({
  thinking = false,
  size = "md",
  orb = false,
  className,
  title,
}: BrainAvatarProps) {
  const { wrapper, icon, glow } = SIZE_MAP[size];

  return (
    <div className={cn("relative shrink-0", wrapper, className)} title={title} aria-label={title}>
      {/* Soft halo / orb background — idle + thinking */}
      {orb && (
        <span
          className={cn(
            "pointer-events-none absolute -inset-2 rounded-full",
            "bg-[color:var(--brain-halo)] blur-md",
            thinking && "animate-[brain-halo_3s_ease-in-out_infinite]"
          )}
          aria-hidden="true"
        />
      )}

      {/* Three staggered ripple rings — only visible while thinking */}
      {thinking && (
        <>
          {[0, 0.6, 1.2].map((delay, i) => (
            <span
              key={i}
              className={cn(
                "pointer-events-none absolute inset-0 rounded-full",
                "border border-[color:var(--brand-primary)]/50",
                "animate-[brain-ripple_2s_ease-out_infinite]"
              )}
              style={{ animationDelay: `${delay}s` }}
              aria-hidden="true"
            />
          ))}
        </>
      )}

      {/* Brain icon — Brand-Primary, transparent background */}
      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center rounded-full",
          thinking ? glow : ""
        )}
      >
        <Brain
          size={icon}
          className={cn(
            "text-[color:var(--brand-primary)] transition-all duration-500",
            thinking && "animate-[brain-breathe_2.4s_ease-in-out_infinite]"
          )}
          strokeWidth={1.75}
        />
      </div>
    </div>
  );
}
