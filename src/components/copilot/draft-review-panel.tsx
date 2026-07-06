"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileSearch,
  X,
  Loader2,
  AlertTriangle,
  Check,
  XCircle,
  Clock,
  Shield,
  Scale,
  FileText,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";

interface DraftReviewIssue {
  id: string;
  category: "legal_accuracy" | "completeness" | "risk" | "style" | "compliance" | "consistency";
  severity: "critical" | "warning" | "info" | "suggestion";
  title: string;
  description: string;
  location?: string;
  suggestion?: string;
  legalBasis?: string;
  status: "open" | "accepted" | "rejected" | "deferred";
}

interface DraftReviewResult {
  id: string;
  draftSlug?: string;
  draftTitle: string;
  draftType: string;
  reviewStatus: "pending" | "in_review" | "approved" | "rejected" | "changes_requested";
  issues: DraftReviewIssue[];
  summary: string;
  overallRisk: "low" | "medium" | "high" | "critical";
  reviewedAt: string;
}

interface DraftReviewPanelProps {
  content: string;
  title: string;
  type?: string;
  draftSlug?: string;
  onClose: () => void;
}

const SEVERITY_STYLES = {
  critical: {
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    labelDe: "Kritisch",
    labelEn: "Critical",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    labelDe: "Warnung",
    labelEn: "Warning",
  },
  info: {
    icon: Lightbulb,
    color: "text-blue-600",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    labelDe: "Info",
    labelEn: "Info",
  },
  suggestion: {
    icon: Lightbulb,
    color: "text-purple-600",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    labelDe: "Vorschlag",
    labelEn: "Suggestion",
  },
};

const CATEGORY_ICONS = {
  legal_accuracy: Scale,
  completeness: FileText,
  risk: Shield,
  style: FileText,
  compliance: Shield,
  consistency: FileText,
};

const CATEGORY_LABELS_DE = {
  legal_accuracy: "Rechtliche Richtigkeit",
  completeness: "Vollständigkeit",
  risk: "Risiko",
  style: "Stil",
  compliance: "Compliance",
  consistency: "Konsistenz",
};

const RISK_STYLES = {
  low: { color: "text-emerald-600", bg: "bg-emerald-500/10", labelDe: "Niedrig", labelEn: "Low" },
  medium: { color: "text-amber-600", bg: "bg-amber-500/10", labelDe: "Mittel", labelEn: "Medium" },
  high: { color: "text-red-600", bg: "bg-red-500/10", labelDe: "Hoch", labelEn: "High" },
  critical: {
    color: "text-red-700",
    bg: "bg-red-500/20",
    labelDe: "Kritisch",
    labelEn: "Critical",
  },
};

const STATUS_LABELS_DE = {
  pending: "Ausstehend",
  in_review: "In Prüfung",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
  changes_requested: "Überarbeitung angefordert",
};

export function DraftReviewPanel({
  content,
  title,
  type = "document_draft",
  draftSlug,
  onClose,
}: DraftReviewPanelProps) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<DraftReviewResult | null>(null);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  const startReview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/copilot/draft-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", content, title, type, draftSlug }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReview(data.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [content, title, type, draftSlug]);

  useEffect(() => {
    void startReview();
  }, [startReview]);

  const toggleIssue = (id: string) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateIssue = async (issueId: string, status: DraftReviewIssue["status"]) => {
    if (!review) return;
    try {
      await csrfFetch("/api/copilot/draft-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id, issueId, status }),
      });
      setReview((prev) => {
        if (!prev) return prev;
        const issues = prev.issues.map((i) => (i.id === issueId ? { ...i, status } : i));
        const allResolved = issues.every((i) => i.status !== "open");
        const hasRejected = issues.some((i) => i.status === "rejected");
        return {
          ...prev,
          issues,
          reviewStatus: allResolved
            ? hasRejected
              ? "changes_requested"
              : "approved"
            : prev.reviewStatus,
        };
      });
    } catch {
      // Non-blocking
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSearch size={14} className="text-[color:var(--brand-primary)]" />
            <span className="text-xs font-semibold text-[color:var(--ds-text)]">
              {isEn ? "Draft Review" : "Entwurfs-Review"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex items-center gap-2 py-4">
          <Loader2 size={14} className="animate-spin text-[color:var(--brand-primary)]" />
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {isEn ? "Reviewing draft..." : "Entwurf wird geprüft..."}
          </span>
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-600" />
          <span className="text-xs text-red-600">
            {isEn ? "Review failed" : "Review fehlgeschlagen"}: {error}
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded p-0.5 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  const risk = RISK_STYLES[review.overallRisk];
  const openCount = review.issues.filter((i) => i.status === "open").length;
  const resolvedCount = review.issues.length - openCount;

  return (
    <div className="space-y-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSearch size={14} className="text-[color:var(--brand-primary)]" />
          <span className="text-xs font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Draft Review" : "Entwurfs-Review"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
        >
          <X size={12} />
        </button>
      </div>

      {/* Summary */}
      <div className={cn("rounded-md border px-2.5 py-2", risk.bg, "border-transparent")}>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-medium", risk.color)}>
            {isEn ? `Risk: ${risk.labelEn}` : `Risiko: ${risk.labelDe}`}
          </span>
          <span className="text-[10px] text-[color:var(--ds-text-muted)]">
            · {openCount} {isEn ? "open" : "offen"} / {resolvedCount} {isEn ? "resolved" : "gelöst"}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--ds-text-muted)]">
          {review.summary}
        </p>
      </div>

      {/* Issues */}
      {review.issues.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span className="text-xs text-emerald-600">
            {isEn
              ? "No issues found — draft looks good!"
              : "Keine Probleme gefunden — Entwurf sieht gut aus!"}
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {review.issues.map((issue) => {
            const sev = SEVERITY_STYLES[issue.severity];
            const SevIcon = sev.icon;
            const CatIcon = CATEGORY_ICONS[issue.category];
            const isExpanded = expandedIssues.has(issue.id);
            const isResolved = issue.status !== "open";

            return (
              <div
                key={issue.id}
                className={cn(
                  "rounded-md border p-2 transition-colors",
                  isResolved
                    ? "border-[color:var(--ds-border)] opacity-60"
                    : "border-[color:var(--ds-border)]"
                )}
              >
                <button
                  onClick={() => toggleIssue(issue.id)}
                  className="flex w-full items-start gap-1.5 text-left"
                >
                  <div className={cn("mt-0.5 shrink-0 rounded p-0.5", sev.bg)}>
                    <SevIcon size={10} className={sev.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[11px] font-medium text-[color:var(--ds-text)]">
                        {issue.title}
                      </span>
                      {isExpanded ? (
                        <ChevronUp
                          size={10}
                          className="shrink-0 text-[color:var(--ds-text-subtle)]"
                        />
                      ) : (
                        <ChevronDown
                          size={10}
                          className="shrink-0 text-[color:var(--ds-text-subtle)]"
                        />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded border px-1 py-0.5 text-[8px] font-medium",
                          sev.border,
                          sev.bg,
                          sev.color
                        )}
                      >
                        {isEn ? sev.labelEn : sev.labelDe}
                      </span>
                      <span className="flex items-center gap-0.5 text-[8px] text-[color:var(--ds-text-subtle)]">
                        <CatIcon size={8} />
                        {CATEGORY_LABELS_DE[issue.category]}
                      </span>
                      {issue.status !== "open" && (
                        <span className="text-[8px] text-[color:var(--ds-text-subtle)]">
                          ·{" "}
                          {issue.status === "accepted"
                            ? "✓"
                            : issue.status === "rejected"
                              ? "✗"
                              : "⏳"}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-2 space-y-1.5 pl-5">
                    <p className="text-[10px] leading-relaxed text-[color:var(--ds-text-muted)]">
                      {issue.description}
                    </p>
                    {issue.location && (
                      <p className="text-[10px] text-[color:var(--ds-text-subtle)]">
                        <span className="font-medium">{isEn ? "Location" : "Bereich"}:</span>{" "}
                        {issue.location}
                      </p>
                    )}
                    {issue.suggestion && (
                      <div className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-1.5">
                        <p className="text-[10px] leading-relaxed text-[color:var(--ds-text)]">
                          <span className="font-medium">{isEn ? "Suggestion" : "Vorschlag"}:</span>{" "}
                          {issue.suggestion}
                        </p>
                      </div>
                    )}
                    {issue.legalBasis && (
                      <p className="flex items-center gap-1 text-[10px] text-[color:var(--ds-text-subtle)]">
                        <Scale size={8} />
                        <span className="font-mono">{issue.legalBasis}</span>
                      </p>
                    )}
                    {/* Action buttons */}
                    {issue.status === "open" ? (
                      <div className="flex items-center gap-1 pt-1">
                        <button
                          onClick={() => updateIssue(issue.id, "accepted")}
                          className="flex items-center gap-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-600 hover:bg-emerald-500/20"
                        >
                          <Check size={8} />
                          {isEn ? "Accept" : "Akzeptieren"}
                        </button>
                        <button
                          onClick={() => updateIssue(issue.id, "rejected")}
                          className="flex items-center gap-0.5 rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-600 hover:bg-red-500/20"
                        >
                          <XCircle size={8} />
                          {isEn ? "Reject" : "Ablehnen"}
                        </button>
                        <button
                          onClick={() => updateIssue(issue.id, "deferred")}
                          className="flex items-center gap-0.5 rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-[9px] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                        >
                          <Clock size={8} />
                          {isEn ? "Defer" : "Zurückstellen"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => updateIssue(issue.id, "open")}
                        className="text-[9px] text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
                      >
                        {isEn ? "Reopen" : "Wieder öffnen"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Review Status */}
      <div className="flex items-center justify-between border-t border-[color:var(--ds-border)] pt-2">
        <span className="text-[10px] text-[color:var(--ds-text-subtle)]">
          {isEn ? "Status" : "Status"}:{" "}
          {isEn ? review.reviewStatus.replace(/_/g, " ") : STATUS_LABELS_DE[review.reviewStatus]}
        </span>
        <button
          onClick={startReview}
          className="text-[10px] text-[color:var(--brand-primary)] hover:underline"
        >
          {isEn ? "Re-review" : "Neu prüfen"}
        </button>
      </div>
    </div>
  );
}
