"use client";

import * as React from "react";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Copy,
  Check,
  PenTool,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";

export interface DraftReviewData {
  taskId: string;
  title: string;
  templateKey: string;
  status: "pending" | "completed" | "failed" | "requires_approval";
  draftText?: string;
  caseSlug?: string;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

interface DraftReviewCardProps {
  draft: DraftReviewData;
  onSign?: (draft: DraftReviewData) => void;
  onCopy?: (text: string) => void;
  className?: string;
}

export function DraftReviewCard({
  draft,
  onSign,
  onCopy,
  className,
}: DraftReviewCardProps) {
  const { t } = useLang();
  const [copied, setCopied] = React.useState(false);

  const statusConfig = {
    pending: {
      icon: Clock,
      label: t("draftreview.status_pending"),
      badgeClass: "border-[color:var(--ds-warning-border)] text-[color:var(--ds-warning-text)]",
    },
    completed: {
      icon: CheckCircle2,
      label: t("draftreview.status_completed"),
      badgeClass: "border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]",
    },
    failed: {
      icon: XCircle,
      label: t("draftreview.status_failed"),
      badgeClass: "border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]",
    },
    requires_approval: {
      icon: AlertTriangle,
      label: t("draftreview.status_approval"),
      badgeClass: "border-[color:var(--ds-info-border)] text-[color:var(--ds-info-text)]",
    },
  } as const;

  const cfg = statusConfig[draft.status];
  const StatusIcon = cfg.icon;

  const handleCopy = () => {
    if (!draft.draftText) return;
    navigator.clipboard.writeText(draft.draftText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.(draft.draftText);
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
            <FileText size={18} className="text-[color:var(--ds-text-muted)]" />
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-sm font-medium text-[color:var(--ds-text)]">
              {draft.title}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="default" className={cn("text-xs", cfg.badgeClass)}>
                <StatusIcon size={12} className="mr-1" />
                {cfg.label}
              </Badge>
              {draft.caseSlug && (
                <span className="text-xs text-[color:var(--ds-text-muted)]">
                  {t("draftreview.case")}: {draft.caseSlug}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="shrink-0 text-xs text-[color:var(--ds-text-muted)]">
          {new Date(draft.createdAt).toLocaleDateString("de-DE")}
        </span>
      </div>

      {draft.draftText && draft.status === "completed" && (
        <div className="mt-3 space-y-2">
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
            <pre className="whitespace-pre-wrap text-xs text-[color:var(--ds-text)]">
              {draft.draftText.slice(0, 800)}
              {draft.draftText.length > 800 && "…"}
            </pre>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5 active:scale-[0.98]"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t("draftreview.copied") : t("draftreview.copy")}
            </Button>
            {onSign && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onSign(draft)}
                className="gap-1.5 active:scale-[0.98]"
              >
                <PenTool size={14} />
                {t("draftreview.sign")}
              </Button>
            )}
          </div>
        </div>
      )}

      {draft.status === "failed" && draft.errorMessage && (
        <div className="mt-3 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3 text-xs text-[color:var(--ds-danger-text)]">
          {draft.errorMessage}
        </div>
      )}

      {draft.status === "pending" && (
        <div className="mt-3 flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
          <Clock size={12} className="animate-pulse" />
          {t("draftreview.pending_hint")}
        </div>
      )}
    </div>
  );
}
