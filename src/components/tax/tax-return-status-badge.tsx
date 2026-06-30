"use client";

import { Badge } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import { FileText, Loader2, Eye, Send, CheckCircle2, AlertCircle, Archive } from "lucide-react";
import type { TaxReturnStatus } from "@/lib/tax-types";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

const STATUS_CONFIG: Record<
  TaxReturnStatus,
  { variant: BadgeVariant; icon: typeof FileText; labelDe: string; labelEn: string }
> = {
  draft: { variant: "default", icon: FileText, labelDe: "Entwurf", labelEn: "Draft" },
  in_progress: {
    variant: "info",
    icon: Loader2,
    labelDe: "In Bearbeitung",
    labelEn: "In Progress",
  },
  review: { variant: "warning", icon: Eye, labelDe: "Zur Prüfung", labelEn: "In Review" },
  submitted: { variant: "info", icon: Send, labelDe: "Eingereicht", labelEn: "Submitted" },
  assessed: { variant: "success", icon: CheckCircle2, labelDe: "Veranlagt", labelEn: "Assessed" },
  corrected: { variant: "warning", icon: AlertCircle, labelDe: "Korrigiert", labelEn: "Corrected" },
  closed: { variant: "default", icon: Archive, labelDe: "Abgeschlossen", labelEn: "Closed" },
};

interface TaxReturnStatusBadgeProps {
  status: TaxReturnStatus;
  lang?: "de" | "en";
  size?: "sm" | "md";
}

export function TaxReturnStatusBadge({
  status,
  lang = "de",
  size = "sm",
}: TaxReturnStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const Icon = config.icon;
  const label = lang === "en" ? config.labelEn : config.labelDe;
  const iconSize = size === "sm" ? 12 : 14;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon size={iconSize} className={status === "in_progress" ? "animate-spin" : ""} />
      {label}
    </Badge>
  );
}
