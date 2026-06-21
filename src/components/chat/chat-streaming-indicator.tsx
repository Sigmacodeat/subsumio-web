"use client";

import { useEffect, useState } from "react";
import { Search, Brain, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatStreamingIndicatorProps {
  className?: string;
}

const PHASES = [
  { icon: Search, label: "Brain wird durchsucht…", duration: 1500 },
  { icon: Brain, label: "Antwort wird synthetisiert…", duration: 2000 },
  { icon: Sparkles, label: "Quellen werden verifiziert…", duration: 1500 },
] as const;

export function ChatStreamingIndicator({ className }: ChatStreamingIndicatorProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (phase >= PHASES.length) return;
    const timer = setTimeout(() => setPhase((p) => p + 1), PHASES[phase].duration);
    return () => clearTimeout(timer);
  }, [phase]);

  const currentPhase = Math.min(phase, PHASES.length - 1);
  const Icon = phase >= PHASES.length ? CheckCircle2 : PHASES[currentPhase].icon;
  const label = phase >= PHASES.length ? "Fertig!" : PHASES[currentPhase].label;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-xs text-[color:var(--ds-text-muted)]",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        size={12}
        className={cn(
          "shrink-0",
          phase >= PHASES.length ? "text-emerald-500" : "brand-text animate-pulse"
        )}
      />
      <span>{label}</span>
      {phase < PHASES.length && (
        <div className="flex items-center gap-0.5">
          {PHASES.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 w-1 rounded-full transition-colors",
                i <= currentPhase ? "brand-text" : "bg-[color:var(--ds-border)]"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
