"use client";

import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  CalendarClock,
  Search,
  FolderOpen,
  ExternalLink,
  Mail,
  Clock,
  ShieldAlert,
  Timer,
  UserPlus,
  ClipboardList,
  Users,
  X,
  Check,
  RotateCw,
  Briefcase,
  AlertTriangle,
  CalendarDays,
  Bell,
  MapPin,
  CheckSquare,
  Square,
  Gavel,
  Calendar,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  ToolCall,
  ToolResultDisplay,
  DeadlineCardItem,
  CalendarCardItem,
  TaskCardItem,
} from "@/components/chat/chat-types";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

const TOOL_ICONS: Record<string, typeof FileText> = {
  navigate: ArrowRight,
  search_cases: FolderOpen,
  search_deadlines: CalendarClock,
  search_knowledge: Search,
  search_tasks: CheckSquare,
  search_calendar: Calendar,
  create_case: FileText,
  case_summary: FileText,
  email_draft: Mail,
  deadline_extract: Clock,
  document_summary: FileText,
  conflict_check: ShieldAlert,
  time_entry: Timer,
  client_update: Users,
  meeting_tasks: ClipboardList,
  intake_create: UserPlus,
  client_lookup: Users,
  deadline_mark_done: CheckCircle2,
};

const PARAM_LABEL_KEYS: Record<string, string> = {
  route: "chat.tool.param_route",
  query: "chat.tool.param_query",
  status: "chat.tool.param_status",
  case_slug: "chat.tool.param_case_slug",
  title: "chat.tool.param_title",
  client_name: "chat.tool.param_client_name",
  opponent_name: "chat.tool.param_opponent_name",
  subject: "chat.tool.param_subject",
  recipient: "chat.tool.param_recipient",
  tone: "chat.tool.param_tone",
  document_slug: "chat.tool.param_document_slug",
  name: "chat.tool.param_name",
  description: "chat.tool.param_description",
  hours: "chat.tool.param_hours",
  activity_type: "chat.tool.param_activity_type",
  update_type: "chat.tool.param_update_type",
  notes: "chat.tool.param_notes",
  matter_type: "chat.tool.param_matter_type",
  jurisdiction: "chat.tool.param_jurisdiction",
  urgency: "chat.tool.param_urgency",
  streitwert: "chat.tool.param_streitwert",
  items: "chat.tool.param_items",
  message_draft: "chat.tool.param_message_draft",
  channel: "chat.tool.param_channel",
  legal_area: "chat.tool.param_legal_area",
  text: "chat.tool.param_text",
  source_language: "chat.tool.param_source_language",
  target_language: "chat.tool.param_target_language",
  questions: "chat.tool.param_questions",
  document_slugs: "chat.tool.param_document_slugs",
};

function formatParamKey(key: string, t: (k: never) => string): string {
  const labelKey = PARAM_LABEL_KEYS[key];
  if (labelKey) return t(labelKey as never);
  return key.replace(/_/g, " ");
}

export function ToolCallBubble({
  toolCall,
  onConfirm,
  onCancel,
  onRetry,
}: {
  toolCall: ToolCall;
  onConfirm?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
}) {
  const router = useRouter();
  const { t } = useLang();
  const Icon = TOOL_ICONS[toolCall.type] ?? FileText;

  const handleNavigate = (href?: string) => {
    if (href) router.push(href);
  };

  const statusLabel =
    toolCall.status === "pending"
      ? t("chat.tool.status_pending")
      : toolCall.status === "executing"
        ? t("chat.tool.status_executing")
        : toolCall.status === "completed"
          ? t("chat.tool.status_completed")
          : toolCall.status === "error"
            ? t("chat.tool.status_error")
            : "";

  // Confirmation step for destructive tools
  if (toolCall.status === "pending" && toolCall.requiresConfirmation) {
    const paramEntries = Object.entries(toolCall.params).filter(
      ([, v]) => v !== undefined && v !== null && v !== ""
    );
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={`${toolCall.label}: ${statusLabel}`}
        className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
      >
        <div className="flex items-center gap-2 border-b border-amber-200/50 px-3 py-2 dark:border-amber-900/50">
          <Icon size={14} className="text-amber-600 dark:text-amber-400" />
          <span className="flex-1 truncate text-xs font-medium text-amber-900 dark:text-amber-200">
            {t(toolCall.label as never)} — {t("chat.tool.confirm_required")}
          </span>
        </div>
        {paramEntries.length > 0 && (
          <div className="px-3 py-2">
            <dl className="space-y-1">
              {paramEntries.map(([key, value]) => (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <dt className="shrink-0 font-medium text-amber-700 dark:text-amber-300">
                    {formatParamKey(key, t)}:
                  </dt>
                  <dd className="min-w-0 flex-1 truncate text-amber-900 dark:text-amber-100">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-amber-200/50 px-3 py-2 dark:border-amber-900/50">
          <button
            onClick={() => onConfirm?.(toolCall.id)}
            className="flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
          >
            <Check size={12} />
            {t("chat.tool.confirm")}
          </button>
          <button
            onClick={() => onCancel?.(toolCall.id)}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none dark:text-amber-300 dark:hover:bg-amber-900/30"
          >
            <X size={12} />
            {t("chat.tool.cancel")}
          </button>
        </div>
      </div>
    );
  }

  if (toolCall.status === "pending" || toolCall.status === "executing") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={`${toolCall.label}: ${statusLabel}`}
        className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2"
      >
        <Loader2 size={14} className="animate-spin text-[color:var(--ds-text-muted)]" />
        <Icon size={14} className="text-[color:var(--ds-text-muted)]" />
        <span className="text-xs text-[color:var(--ds-text-muted)]">
          {t(toolCall.label as never)}
        </span>
      </div>
    );
  }

  if (toolCall.status === "error" || !toolCall.result?.success) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={`${toolCall.label}: ${statusLabel}`}
        className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/30"
      >
        <AlertCircle size={14} className="shrink-0 text-red-500" />
        <span className="flex-1 text-xs text-red-700 dark:text-red-400">
          {toolCall.result?.display?.title ?? t(toolCall.label as never)} {t("chat.tool.failed")}
        </span>
        {onRetry && (
          <button
            onClick={() => onRetry(toolCall.id)}
            className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
          >
            <RotateCw size={11} />
            {t("chat.tool.retry")}
          </button>
        )}
      </div>
    );
  }

  const display = toolCall.result?.display;
  if (!display) return null;

  return (
    <div role="status" aria-live="polite" aria-label={`${toolCall.label}: ${statusLabel}`}>
      <ToolResultCard display={display} onNavigate={handleNavigate} />
    </div>
  );
}

function ToolResultCard({
  display,
  onNavigate,
}: {
  display: ToolResultDisplay;
  onNavigate: (href?: string) => void;
}) {
  const { t } = useLang();
  const hasItems = display.items && display.items.length > 0;

  // Rich deadline cards
  if (display.kind === "deadline_cards") {
    return <DeadlineCardsDisplay display={display} onNavigate={onNavigate} />;
  }

  // Client overview (combined case + deadlines + summary)
  if (display.kind === "client_overview") {
    return <ClientOverviewDisplay display={display} onNavigate={onNavigate} />;
  }

  // AP3: Calendar cards
  if (display.kind === "calendar_cards") {
    return <CalendarCardsDisplay display={display} onNavigate={onNavigate} />;
  }

  // AP5: Task cards
  if (display.kind === "task_cards") {
    return <TaskCardsDisplay display={display} onNavigate={onNavigate} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[color:var(--ds-border)] px-3 py-2">
        <CheckCircle2 size={14} className="text-emerald-500" />
        <span className="flex-1 truncate text-xs font-medium text-[color:var(--ds-text)]">
          {display.title}
        </span>
        {display.href && (
          <button
            onClick={() => onNavigate(display.href)}
            className="flex items-center gap-1 text-xs text-[color:var(--brand-primary)] transition-opacity hover:opacity-80"
          >
            {t("chat.tool.open")}
            <ExternalLink size={11} />
          </button>
        )}
      </div>

      {/* Message */}
      {display.message && (
        <p className="px-3 py-2 text-xs text-[color:var(--ds-text-muted)]">{display.message}</p>
      )}

      {/* Items list */}
      {hasItems && (
        <div className="max-h-48 overflow-y-auto">
          {(display.items! as Array<{ label: string; value?: string; href?: string }>).map(
            (item, idx) => (
              <button
                key={idx}
                onClick={() => onNavigate(item.href)}
                disabled={!item.href}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                  item.href && "hover:bg-[color:var(--ds-hover)]"
                )}
              >
                <span className="min-w-0 flex-1 truncate text-xs text-[color:var(--ds-text)]">
                  {item.label}
                </span>
                {item.value && (
                  <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)]">
                    {item.value}
                  </span>
                )}
                {item.href && (
                  <ArrowRight size={11} className="shrink-0 text-[color:var(--ds-text-subtle)]" />
                )}
              </button>
            )
          )}
        </div>
      )}

      {/* Navigation action for kind=navigation */}
      {display.kind === "navigation" && display.href && !hasItems && (
        <button
          onClick={() => onNavigate(display.href)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--ds-hover)]"
        >
          {display.message ?? t("chat.tool.open_navigation")}
          <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}

// ── Status Badge Helpers ──────────────────────────────────────────────

const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; border: string; icon: typeof Clock }
> = {
  pending: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-900",
    icon: Clock,
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-900",
    icon: AlertTriangle,
  },
  critical: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-900",
    icon: AlertTriangle,
  },
  overdue: {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-900",
    icon: AlertCircle,
  },
  done: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-900",
    icon: CheckCircle2,
  },
  vorfrist: {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-900",
    icon: Bell,
  },
};

const EVENT_TYPE_STYLES: Record<
  string,
  { bg: string; text: string; border: string; icon: typeof Clock }
> = {
  hearing: {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-900",
    icon: Gavel,
  },
  appointment: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-900",
    icon: CalendarDays,
  },
  meeting: {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-900",
    icon: Users,
  },
  deadline: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-900",
    icon: Clock,
  },
  other: {
    bg: "bg-slate-50 dark:bg-slate-950/30",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-800",
    icon: Calendar,
  },
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-900",
  },
  high: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-900",
  },
  medium: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-900",
  },
  low: {
    bg: "bg-slate-50 dark:bg-slate-950/30",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-800",
  },
};

function StatusBadge({
  status,
  daysUntil,
  t,
}: {
  status: string;
  daysUntil?: number;
  t: (k: never) => string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  const Icon = style.icon;
  const label = t(`chat.deadline.status_${status}` as never);
  const daysLabel =
    daysUntil !== undefined
      ? daysUntil < 0
        ? t("chat.deadline.days_overdue" as never).replace("{n}", String(Math.abs(daysUntil)))
        : daysUntil === 0
          ? t("chat.deadline.today" as never)
          : t("chat.deadline.days_left" as never).replace("{n}", String(daysUntil))
      : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        style.bg,
        style.text,
        style.border
      )}
    >
      <Icon size={9} />
      {label}
      {daysLabel && <span className="opacity-70">· {daysLabel}</span>}
    </span>
  );
}

// ── Calendar Card (AP3) ────────────────────────────────────────────────

function CalendarCard({
  item,
  onNavigate,
}: {
  item: CalendarCardItem;
  onNavigate: (href?: string) => void;
}) {
  const { lang } = useLang();
  const eventType = item.eventType ?? "other";
  const style = EVENT_TYPE_STYLES[eventType] ?? EVENT_TYPE_STYLES.other;
  const Icon = style.icon;

  const dateStr = item.date
    ? new Date(item.date).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      })
    : "";
  const timeStr = item.startTime
    ? (() => {
        try {
          return new Date(item.startTime).toLocaleTimeString(lang === "en" ? "en-GB" : "de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          });
        } catch {
          return item.startTime;
        }
      })()
    : "";

  return (
    <div
      className={cn(
        "border-b border-[color:var(--ds-border)] px-3 py-2.5 last:border-b-0",
        style.bg
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex w-14 shrink-0 flex-col items-center gap-0.5 pt-0.5">
          <span className="text-[10px] font-medium text-[color:var(--ds-text-muted)]">
            {dateStr}
          </span>
          {timeStr && <span className={cn("text-[11px] font-bold", style.text)}>{timeStr}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <button
            onClick={() => onNavigate(item.href)}
            disabled={!item.href}
            className={cn(
              "block w-full truncate text-left text-xs font-medium text-[color:var(--ds-text)]",
              item.href && "hover:text-[color:var(--brand-primary)]"
            )}
          >
            {item.label}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                style.bg,
                style.text,
                style.border
              )}
            >
              <Icon size={9} />
              {eventType}
            </span>
            {item.caseTitle && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ds-text-subtle)]">
                <Briefcase size={9} />
                <span className="max-w-[100px] truncate">{item.caseTitle}</span>
              </span>
            )}
            {item.location && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ds-text-subtle)]">
                <MapPin size={9} />
                {item.location}
              </span>
            )}
          </div>
        </div>
        {item.href && (
          <button
            onClick={() => onNavigate(item.href)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-[10px] font-medium text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--ds-hover)]"
          >
            <ExternalLink size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Task Card (AP5) ────────────────────────────────────────────────────

function TaskCard({
  item,
  onNavigate,
}: {
  item: TaskCardItem;
  onNavigate: (href?: string) => void;
}) {
  const { lang } = useLang();
  const priority = item.priority ?? "medium";
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.medium;

  const dueStr = item.dueDate
    ? new Date(item.dueDate).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
        day: "2-digit",
        month: "short",
      })
    : "";
  const daysLabel =
    item.daysUntil !== undefined
      ? item.daysUntil < 0
        ? `${Math.abs(item.daysUntil)}d überfällig`
        : item.daysUntil === 0
          ? "Heute"
          : `${item.daysUntil}d`
      : null;

  return (
    <div
      className={cn(
        "border-b border-[color:var(--ds-border)] px-3 py-2.5 last:border-b-0",
        item.done && "opacity-50"
      )}
    >
      <div className="flex items-start gap-2">
        {item.done ? (
          <CheckSquare size={14} className="mt-0.5 shrink-0 text-emerald-500" />
        ) : (
          <Square size={14} className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]" />
        )}
        <div className="min-w-0 flex-1">
          <button
            onClick={() => onNavigate(item.href)}
            disabled={!item.href}
            className={cn(
              "block w-full truncate text-left text-xs font-medium text-[color:var(--ds-text)]",
              item.href && "hover:text-[color:var(--brand-primary)]",
              item.done && "line-through"
            )}
          >
            {item.label}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {priority !== "medium" && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                  style.bg,
                  style.text,
                  style.border
                )}
              >
                {priority}
              </span>
            )}
            {dueStr && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px]",
                  item.daysUntil !== undefined && item.daysUntil < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-[color:var(--ds-text-muted)]"
                )}
              >
                <CalendarDays size={9} />
                {dueStr}
                {daysLabel && <span className="opacity-70">({daysLabel})</span>}
              </span>
            )}
            {item.caseTitle && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ds-text-subtle)]">
                <Briefcase size={9} />
                <span className="max-w-[100px] truncate">{item.caseTitle}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Rich Deadline Card ─────────────────────────────────────────────────

function DeadlineCard({
  item,
  onNavigate,
  onMarkDone,
  marking,
}: {
  item: DeadlineCardItem;
  onNavigate: (href?: string) => void;
  onMarkDone?: (slug: string) => void;
  marking?: boolean;
}) {
  const { t, lang } = useLang();
  const status = item.deadlineStatus ?? "pending";
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  const dueDate = item.dueDate ? new Date(item.dueDate) : null;
  const dateStr = dueDate
    ? dueDate.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <div
      className={cn(
        "border-b border-[color:var(--ds-border)] px-3 py-2.5 last:border-b-0",
        style.bg
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Title + Notfrist badge */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onNavigate(item.href)}
              disabled={!item.href}
              className={cn(
                "min-w-0 flex-1 truncate text-left text-xs font-medium text-[color:var(--ds-text)]",
                item.href && "hover:text-[color:var(--brand-primary)]"
              )}
            >
              {item.label}
            </button>
            {item.isNotfrist && (
              <span className="shrink-0 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {t("chat.deadline.notfrist" as never)}
              </span>
            )}
            {item.isVorfrist && (
              <span className="shrink-0 rounded bg-purple-100 px-1 py-0.5 text-[9px] font-bold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                {t("chat.deadline.vorfrist" as never)}
              </span>
            )}
          </div>
          {/* Case title */}
          {item.caseTitle && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[color:var(--ds-text-subtle)]">
              <Briefcase size={9} />
              <span className="truncate">{item.caseTitle}</span>
            </div>
          )}
          {/* Date + Status + Days */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ds-text-muted)]">
              <CalendarDays size={10} />
              {dateStr}
            </span>
            <StatusBadge status={status} daysUntil={item.daysUntil} t={t} />
            {item.needsSecondCheck && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <ShieldAlert size={8} />
                {t("chat.deadline.second_check" as never)}
              </span>
            )}
          </div>
        </div>
        {/* Inline actions */}
        <div className="flex shrink-0 flex-col gap-1">
          {onMarkDone && item.deadlineSlug && status !== "done" && (
            <button
              onClick={() => onMarkDone(item.deadlineSlug!)}
              disabled={marking}
              className="inline-flex items-center gap-1 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-[10px] font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-50"
              title={t("chat.deadline.mark_done" as never)}
            >
              {marking ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
              {t("chat.deadline.mark_done" as never)}
            </button>
          )}
          {item.href && (
            <button
              onClick={() => onNavigate(item.href)}
              className="inline-flex items-center gap-1 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-[10px] font-medium text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--ds-hover)]"
            >
              <ExternalLink size={10} />
              {t("chat.deadline.open_case" as never)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Calendar Cards Display (AP3) ──────────────────────────────────────

function CalendarCardsDisplay({
  display,
  onNavigate,
}: {
  display: ToolResultDisplay;
  onNavigate: (href?: string) => void;
}) {
  const { t } = useLang();
  const items = (display.items ?? []) as CalendarCardItem[];

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
      <div className="flex items-center gap-2 border-b border-[color:var(--ds-border)] px-3 py-2">
        <Calendar size={14} className="text-[color:var(--brand-primary)]" />
        <span className="flex-1 truncate text-xs font-semibold text-[color:var(--ds-text)]">
          {display.title}
        </span>
        {display.filterHref && (
          <button
            onClick={() => onNavigate(display.filterHref)}
            className="flex items-center gap-1 text-xs font-medium text-[color:var(--brand-primary)] transition-opacity hover:opacity-80"
          >
            {t("chat.tool.open_calendar" as never)}
            <ArrowRight size={11} />
          </button>
        )}
      </div>
      {display.message && (
        <p className="px-3 py-2 text-xs text-[color:var(--ds-text-muted)]">{display.message}</p>
      )}
      {items.length > 0 ? (
        <div className="max-h-80 overflow-y-auto">
          {items.map((item, idx) => (
            <CalendarCard key={idx} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ) : (
        <div className="px-3 py-4 text-center text-xs text-[color:var(--ds-text-muted)]">
          {t("chat.tool.no_events" as never)}
        </div>
      )}
    </div>
  );
}

// ── Task Cards Display (AP5) ───────────────────────────────────────────

function TaskCardsDisplay({
  display,
  onNavigate,
}: {
  display: ToolResultDisplay;
  onNavigate: (href?: string) => void;
}) {
  const { t } = useLang();
  const items = (display.items ?? []) as TaskCardItem[];

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
      <div className="flex items-center gap-2 border-b border-[color:var(--ds-border)] px-3 py-2">
        <CheckSquare size={14} className="text-[color:var(--brand-primary)]" />
        <span className="flex-1 truncate text-xs font-semibold text-[color:var(--ds-text)]">
          {display.title}
        </span>
        {display.filterHref && (
          <button
            onClick={() => onNavigate(display.filterHref)}
            className="flex items-center gap-1 text-xs font-medium text-[color:var(--brand-primary)] transition-opacity hover:opacity-80"
          >
            {t("chat.tool.all_tasks" as never)}
            <ArrowRight size={11} />
          </button>
        )}
      </div>
      {display.message && (
        <p className="px-3 py-2 text-xs text-[color:var(--ds-text-muted)]">{display.message}</p>
      )}
      {items.length > 0 ? (
        <div className="max-h-80 overflow-y-auto">
          {items.map((item, idx) => (
            <TaskCard key={item.taskSlug ?? idx} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ) : (
        <div className="px-3 py-4 text-center text-xs text-[color:var(--ds-text-muted)]">
          {t("chat.tool.no_tasks" as never)}
        </div>
      )}
    </div>
  );
}

// ── Deadline Cards Display ─────────────────────────────────────────────

function DeadlineCardsDisplay({
  display,
  onNavigate,
}: {
  display: ToolResultDisplay;
  onNavigate: (href?: string) => void;
}) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [markingSlug, setMarkingSlug] = useState<string | null>(null);
  const [doneSlugs, setDoneSlugs] = useState<Set<string>>(new Set());
  const items = (display.items ?? []) as DeadlineCardItem[];
  const visibleItems = items.filter((i) => !doneSlugs.has(i.deadlineSlug ?? ""));

  const handleMarkDone = async (slug: string) => {
    setMarkingSlug(slug);
    try {
      const result = await api.copilot.executeTool("deadline_mark_done", { deadline_slug: slug });
      if (result.success) {
        setDoneSlugs((prev) => new Set(prev).add(slug));
        addToast({ type: "success", title: t("chat.deadline.mark_done" as never) });
      } else {
        addToast({ type: "error", title: result.error ?? "Fehler beim Markieren" });
      }
    } catch {
      addToast({ type: "error", title: t("chat.deadline.mark_done" as never) + " fehlgeschlagen" });
    } finally {
      setMarkingSlug(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[color:var(--ds-border)] px-3 py-2">
        <CalendarClock size={14} className="text-[color:var(--brand-primary)]" />
        <span className="flex-1 truncate text-xs font-semibold text-[color:var(--ds-text)]">
          {display.title}
        </span>
        {display.filterHref && (
          <button
            onClick={() => onNavigate(display.filterHref)}
            className="flex items-center gap-1 text-xs font-medium text-[color:var(--brand-primary)] transition-opacity hover:opacity-80"
          >
            {t("chat.deadline.all_deadlines" as never)}
            <ArrowRight size={11} />
          </button>
        )}
      </div>
      {/* Message */}
      {display.message && (
        <p className="px-3 py-2 text-xs text-[color:var(--ds-text-muted)]">{display.message}</p>
      )}
      {/* Cards */}
      {visibleItems.length > 0 ? (
        <div className="max-h-80 overflow-y-auto">
          {visibleItems.map((item, idx) => (
            <DeadlineCard
              key={item.deadlineSlug ?? `dl-${idx}`}
              item={item}
              onNavigate={onNavigate}
              onMarkDone={handleMarkDone}
              marking={markingSlug === item.deadlineSlug}
            />
          ))}
        </div>
      ) : (
        <div className="px-3 py-4 text-center text-xs text-[color:var(--ds-text-muted)]">
          {t("chat.deadline.none_found" as never)}
        </div>
      )}
    </div>
  );
}

// ── Client Overview Display ────────────────────────────────────────────

function ClientOverviewDisplay({
  display,
  onNavigate,
}: {
  display: ToolResultDisplay;
  onNavigate: (href?: string) => void;
}) {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [markingSlug, setMarkingSlug] = useState<string | null>(null);
  const [doneSlugs, setDoneSlugs] = useState<Set<string>>(new Set());
  const s = display.summary;
  const items = (display.items ?? []) as DeadlineCardItem[];
  const visibleItems = items.filter((i) => !doneSlugs.has(i.deadlineSlug ?? ""));

  const handleMarkDone = async (slug: string) => {
    setMarkingSlug(slug);
    try {
      const result = await api.copilot.executeTool("deadline_mark_done", { deadline_slug: slug });
      if (result.success) {
        setDoneSlugs((prev) => new Set(prev).add(slug));
        addToast({ type: "success", title: t("chat.deadline.mark_done" as never) });
      } else {
        addToast({ type: "error", title: result.error ?? "Fehler beim Markieren" });
      }
    } catch {
      addToast({ type: "error", title: t("chat.deadline.mark_done" as never) + " fehlgeschlagen" });
    } finally {
      setMarkingSlug(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[color:var(--ds-border)] px-3 py-2">
        <Users size={14} className="text-[color:var(--brand-primary)]" />
        <span className="flex-1 truncate text-xs font-semibold text-[color:var(--ds-text)]">
          {display.title}
        </span>
      </div>

      {/* Case Summary Section */}
      {s && (
        <div className="border-b border-[color:var(--ds-border)] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Briefcase size={12} className="text-[color:var(--ds-text-subtle)]" />
            <span className="flex-1 truncate text-xs font-medium text-[color:var(--ds-text)]">
              {s.caseTitle ?? "—"}
            </span>
            {s.caseStatus && (
              <span className="rounded bg-[color:var(--ds-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--ds-text-muted)]">
                {s.caseStatus}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-[color:var(--ds-text-subtle)]">
            {s.openDeadlines !== undefined && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  s.openDeadlines > 0 && "text-orange-600 dark:text-orange-400"
                )}
              >
                <CalendarClock size={10} />
                {s.openDeadlines}/{s.totalDeadlines ?? 0} {t("chat.deadline.fristen" as never)}
              </span>
            )}
            {s.openTasks !== undefined && (
              <span className="inline-flex items-center gap-1">
                <ClipboardList size={10} />
                {s.openTasks} {t("chat.deadline.tasks" as never)}
              </span>
            )}
            {s.documentCount !== undefined && (
              <span className="inline-flex items-center gap-1">
                <FileText size={10} />
                {s.documentCount} {t("chat.deadline.docs" as never)}
              </span>
            )}
            {s.nextDeadlineDate && (
              <span className="inline-flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400">
                <Clock size={10} />
                {new Date(s.nextDeadlineDate).toLocaleDateString(
                  lang === "en" ? "en-GB" : "de-DE",
                  { day: "2-digit", month: "short" }
                )}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Message */}
      {display.message && (
        <p className="px-3 py-2 text-xs text-[color:var(--ds-text-muted)]">{display.message}</p>
      )}

      {/* Deadline Cards */}
      {visibleItems.length > 0 && (
        <div className="max-h-64 overflow-y-auto">
          {visibleItems.map((item, idx) => (
            <DeadlineCard
              key={item.deadlineSlug ?? `dl-${idx}`}
              item={item}
              onNavigate={onNavigate}
              onMarkDone={handleMarkDone}
              marking={markingSlug === item.deadlineSlug}
            />
          ))}
        </div>
      )}

      {/* Footer: Deep-link buttons */}
      <div className="flex items-center gap-2 border-t border-[color:var(--ds-border)] px-3 py-2">
        {s?.caseSlug && (
          <button
            onClick={() =>
              onNavigate(`/dashboard/cases/${(s.caseSlug ?? "").replace(/^cases\//, "")}`)
            }
            className="flex items-center gap-1 text-xs font-medium text-[color:var(--brand-primary)] transition-opacity hover:opacity-80"
          >
            <Briefcase size={11} />
            {t("chat.deadline.to_case" as never)}
            <ArrowRight size={10} />
          </button>
        )}
        {display.filterHref && (
          <button
            onClick={() => onNavigate(display.filterHref)}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-[color:var(--brand-primary)] transition-opacity hover:opacity-80"
          >
            {t("chat.deadline.all_deadlines" as never)}
            <ArrowRight size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
