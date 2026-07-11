"use client";

import { ShieldCheck, ShieldAlert, ShieldX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfidenceLevel = "high" | "medium" | "low" | "none" | "running" | "failed";

export interface ConfidenceInfo {
  score: number | null;
  recommendation?: string | null;
  coherenceScore?: number | null;
  status?: string | null;
}

export function confidenceLevel(info: ConfidenceInfo): ConfidenceLevel {
  if (info.status === "running" || info.status === "resuming") return "running";
  if (info.status === "failed") return "failed";
  if (info.score === null || info.score === undefined) return "none";
  if (info.score >= 70) return "high";
  if (info.score >= 50) return "medium";
  return "low";
}

const levelConfig: Record<
  ConfidenceLevel,
  {
    icon: typeof ShieldCheck;
    label: string;
    labelEn: string;
    classes: string;
  }
> = {
  high: {
    icon: ShieldCheck,
    label: "Hoch",
    labelEn: "High",
    classes:
      "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  },
  medium: {
    icon: ShieldAlert,
    label: "Mittel",
    labelEn: "Medium",
    classes:
      "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  },
  low: {
    icon: ShieldX,
    label: "Niedrig",
    labelEn: "Low",
    classes:
      "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  },
  none: {
    icon: ShieldCheck,
    label: "Keine Pipeline",
    labelEn: "No pipeline",
    classes:
      "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]",
  },
  running: {
    icon: Loader2,
    label: "Läuft…",
    labelEn: "Running…",
    classes:
      "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  },
  failed: {
    icon: ShieldX,
    label: "Fehlgeschlagen",
    labelEn: "Failed",
    classes:
      "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  },
};

interface ConfidenceBadgeProps {
  info: ConfidenceInfo;
  lang?: string;
  showScore?: boolean;
  size?: "sm" | "md";
}

export function ConfidenceBadge({
  info,
  lang = "de",
  showScore = true,
  size = "sm",
}: ConfidenceBadgeProps) {
  const level = confidenceLevel(info);
  const config = levelConfig[level];
  const Icon = config.icon;
  const isEn = lang === "en";
  const label = isEn ? config.labelEn : config.label;
  const sizeClasses = size === "sm" ? "text-xs px-2 py-0.5 gap-1" : "text-sm px-2.5 py-1 gap-1.5";
  const iconSize = size === "sm" ? 12 : 14;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        config.classes,
        sizeClasses,
        level === "running" && "[&_svg]:animate-spin"
      )}
      title={
        info.score !== null && info.score !== undefined
          ? `${label} — Score: ${info.score}/100${info.recommendation ? ` (${info.recommendation})` : ""}`
          : label
      }
    >
      <Icon size={iconSize} className="shrink-0" />
      {label}
      {showScore && info.score !== null && info.score !== undefined && level !== "running" && (
        <span className="tabular-nums opacity-80">{info.score}</span>
      )}
    </span>
  );
}
