"use client";

import { useEffect, useState } from "react";
import { Search, Brain, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";

interface ChatStreamingIndicatorProps {
  className?: string;
}

const PHASES = [
  { icon: Search, labelKey: "chat.streaming.search", duration: 1500 },
  { icon: Brain, labelKey: "chat.streaming.synthesize", duration: 2000 },
  { icon: Sparkles, labelKey: "chat.streaming.verify", duration: 1500 },
] as const;

export function ChatStreamingIndicator({ className }: ChatStreamingIndicatorProps) {
  const [phase, setPhase] = useState(0);
  const { t } = useLang();

  useEffect(() => {
    if (phase >= PHASES.length) return;
    const timer = setTimeout(() => setPhase((p) => p + 1), PHASES[phase].duration);
    return () => clearTimeout(timer);
  }, [phase]);

  const currentPhase = Math.min(phase, PHASES.length - 1);
  const Icon = phase >= PHASES.length ? CheckCircle2 : PHASES[currentPhase].icon;
  const label = phase >= PHASES.length ? t("chat.done") : t(PHASES[currentPhase].labelKey as never);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-[11px] text-[color:var(--ds-text-muted)]",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        size={11}
        className={cn(
          "shrink-0",
          phase >= PHASES.length ? "text-emerald-500" : "brand-text animate-pulse"
        )}
      />
      <span className="font-medium">{label}</span>
      {phase < PHASES.length && (
        <div className="flex items-center gap-0.5">
          {PHASES.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 w-1 rounded-full transition-all duration-300",
                i <= currentPhase
                  ? "brand-text scale-100"
                  : "scale-75 bg-[color:var(--ds-border)] opacity-50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
