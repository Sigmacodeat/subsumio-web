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
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ToolCall, ToolResultDisplay } from "@/components/chat/chat-types";
import { cn } from "@/lib/utils";

const TOOL_ICONS: Record<string, typeof FileText> = {
  navigate: ArrowRight,
  search_cases: FolderOpen,
  search_deadlines: CalendarClock,
  search_knowledge: Search,
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
};

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
  const Icon = TOOL_ICONS[toolCall.type] ?? FileText;

  const handleNavigate = (href?: string) => {
    if (href) router.push(href);
  };

  const statusLabel =
    toolCall.status === "pending"
      ? "Ausstehend"
      : toolCall.status === "executing"
        ? "Wird ausgeführt"
        : toolCall.status === "completed"
          ? "Abgeschlossen"
          : toolCall.status === "error"
            ? "Fehler"
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
            {toolCall.label} — Bestätigung erforderlich
          </span>
        </div>
        {paramEntries.length > 0 && (
          <div className="px-3 py-2">
            <dl className="space-y-1">
              {paramEntries.map(([key, value]) => (
                <div key={key} className="flex items-start gap-2 text-xs">
                  <dt className="shrink-0 font-medium text-amber-700 dark:text-amber-300">
                    {key}:
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
            Bestätigen
          </button>
          <button
            onClick={() => onCancel?.(toolCall.id)}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none dark:text-amber-300 dark:hover:bg-amber-900/30"
          >
            <X size={12} />
            Abbrechen
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
        <span className="text-xs text-[color:var(--ds-text-muted)]">{toolCall.label}</span>
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
          {toolCall.result?.display.title ?? toolCall.label} fehlgeschlagen
        </span>
        {onRetry && (
          <button
            onClick={() => onRetry(toolCall.id)}
            className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
          >
            <RotateCw size={11} />
            Retry
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
  const hasItems = display.items && display.items.length > 0;

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
            Öffnen
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
          {display.items!.map((item, idx) => (
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
          ))}
        </div>
      )}

      {/* Navigation action for kind=navigation */}
      {display.kind === "navigation" && display.href && !hasItems && (
        <button
          onClick={() => onNavigate(display.href)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--ds-hover)]"
        >
          {display.message ?? "Navigation öffnen"}
          <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}
