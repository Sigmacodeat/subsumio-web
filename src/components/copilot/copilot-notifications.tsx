"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  AlertTriangle,
  Clock,
  FileText,
  Users,
  Shield,
  Wallet,
  CalendarClock,
  Gavel,
  X,
  RefreshCw,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";

interface CopilotNotification {
  id: string;
  type: string;
  severity: "info" | "warning" | "urgent";
  caseSlug: string;
  caseTitle: string;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
  createdAt: string;
  dismissed: boolean;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  critical_deadline: CalendarClock,
  stale_case: Clock,
  missing_time_entries: Clock,
  budget_warning: Wallet,
  unread_documents: FileText,
  conflict_pending: AlertTriangle,
  missing_parties: Users,
  legal_hold_active: Shield,
  no_tasks: Gavel,
};

const SEVERITY_STYLES: Record<string, { border: string; bg: string; icon: string; label: string }> =
  {
    urgent: {
      border: "border-red-500/30",
      bg: "bg-red-500/5",
      icon: "text-red-600",
      label: "Urgent",
    },
    warning: {
      border: "border-amber-500/30",
      bg: "bg-amber-500/5",
      icon: "text-amber-600",
      label: "Warning",
    },
    info: {
      border: "border-blue-500/20",
      bg: "bg-blue-500/5",
      icon: "text-blue-600",
      label: "Info",
    },
  };

export function CopilotNotifications() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [notifications, setNotifications] = useState<CopilotNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/copilot/notifications?lang=${isEn ? "en" : "de"}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(() => void fetchNotifications(), 120_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await csrfFetch("/api/copilot/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", lang: isEn ? "en" : "de" }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch {
      // Non-blocking
    } finally {
      setRefreshing(false);
    }
  };

  const dismiss = async (id: string) => {
    setDismissingId(id);
    try {
      await csrfFetch("/api/copilot/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", notificationId: id }),
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {
      // Non-blocking
    } finally {
      setDismissingId(null);
    }
  };

  const activeNotifications = notifications.filter((n) => !n.dismissed);
  const urgentCount = activeNotifications.filter((n) => n.severity === "urgent").length;
  const warningCount = activeNotifications.filter((n) => n.severity === "warning").length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-[color:var(--ds-text-muted)]">
        <Loader2 size={12} className="animate-spin" />
        {isEn ? "Loading notifications..." : "Benachrichtigungen laden..."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell size={14} className="text-[color:var(--ds-text-muted)]" />
            {urgentCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                {urgentCount}
              </span>
            )}
          </div>
          <span className="text-xs font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Proactive Alerts" : "Proaktive Hinweise"}
          </span>
          {(urgentCount > 0 || warningCount > 0) && (
            <span className="text-[10px] text-[color:var(--ds-text-muted)]">
              {urgentCount > 0 && (
                <span className="font-bold text-red-600">
                  {urgentCount} {isEn ? "urgent" : "dringend"}
                </span>
              )}
              {urgentCount > 0 && warningCount > 0 && " · "}
              {warningCount > 0 && (
                <span className="text-amber-600">
                  {warningCount} {isEn ? "warnings" : "Warnungen"}
                </span>
              )}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)] disabled:opacity-50"
          title={isEn ? "Refresh" : "Aktualisieren"}
        >
          {refreshing ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
        </button>
      </div>

      {/* Notifications */}
      {activeNotifications.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-3">
          <Sparkles size={14} className="text-emerald-500" />
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {isEn
              ? "All clear. No proactive alerts at this time."
              : "Alles in Ordnung. Keine proaktiven Hinweise derzeit."}
          </span>
        </div>
      ) : (
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {activeNotifications.slice(0, 10).map((notif) => {
            const Icon = TYPE_ICONS[notif.type] ?? Bell;
            const styles = SEVERITY_STYLES[notif.severity] ?? SEVERITY_STYLES.info;

            return (
              <div
                key={notif.id}
                className={cn(
                  "group relative rounded-lg border p-2.5 transition-colors",
                  styles.border,
                  styles.bg
                )}
              >
                <div className="flex items-start gap-2">
                  <Icon size={14} className={cn("mt-0.5 shrink-0", styles.icon)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[color:var(--ds-text)]">{notif.title}</p>
                    <p className="mt-0.5 text-[11px] text-[color:var(--ds-text-muted)]">
                      {notif.body}
                    </p>
                    {notif.actionHref && (
                      <Link
                        href={notif.actionHref}
                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-[color:var(--brand-primary)] hover:underline"
                      >
                        {notif.actionLabel ?? (isEn ? "View" : "Ansehen")}
                        {" →"}
                      </Link>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(notif.id)}
                    disabled={dismissingId === notif.id}
                    className="shrink-0 rounded p-0.5 text-[color:var(--ds-text-subtle)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-50"
                    title={isEn ? "Dismiss" : "Verwerfen"}
                  >
                    {dismissingId === notif.id ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <X size={10} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
          {activeNotifications.length > 10 && (
            <p className="px-1 text-[10px] text-[color:var(--ds-text-subtle)]">
              {isEn
                ? `+${activeNotifications.length - 10} more`
                : `+${activeNotifications.length - 10} weitere`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
