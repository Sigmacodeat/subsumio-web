"use client";

/**
 * QualityFlagBadge — Visualisiert den Review-Status einer Corpus-Datei.
 *
 * Five flags: verified (grün), needs_review (amber), defective (rot),
 * unreviewed (grau), archived (neutral). Wird in Browser-Liste und
 * Viewer-Header verwendet.
 */

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, CircleDashed, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

export type QualityFlag = "verified" | "needs_review" | "defective" | "unreviewed" | "archived";

const FLAG_CONFIG: Record<
  QualityFlag,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  verified: {
    label: "Verifiziert",
    icon: CheckCircle2,
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  needs_review: {
    label: "Prüfung offen",
    icon: AlertTriangle,
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  defective: {
    label: "Defekt",
    icon: XCircle,
    className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  unreviewed: {
    label: "Ungeprüft",
    icon: CircleDashed,
    className:
      "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]",
  },
  archived: {
    label: "Archiviert",
    icon: Archive,
    className:
      "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]",
  },
};

interface Props {
  flag: QualityFlag | null;
  size?: "sm" | "default";
  className?: string;
}

export function QualityFlagBadge({ flag, size = "sm", className }: Props) {
  if (!flag) {
    const cfg = FLAG_CONFIG.unreviewed;
    const Icon = cfg.icon;
    return (
      <Badge
        variant="default"
        className={cn(cfg.className, size === "sm" && "gap-1 text-xs", className)}
        aria-label={`Status: ${cfg.label}`}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {cfg.label}
      </Badge>
    );
  }

  const cfg = FLAG_CONFIG[flag] ?? FLAG_CONFIG.unreviewed;
  const Icon = cfg.icon;
  return (
    <Badge
      variant="default"
      className={cn(cfg.className, size === "sm" && "gap-1 text-xs", className)}
      aria-label={`Status: ${cfg.label}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {cfg.label}
    </Badge>
  );
}

export const FLAG_OPTIONS: { value: QualityFlag; label: string }[] = [
  { value: "verified", label: "Verifiziert" },
  { value: "needs_review", label: "Prüfung offen" },
  { value: "defective", label: "Defekt" },
  { value: "archived", label: "Archiviert" },
];
