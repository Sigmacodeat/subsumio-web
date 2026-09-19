"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  Check,
  Trash2,
  CheckCheck,
  AlertCircle,
  MessageSquare,
  FileText,
  Bot,
  Inbox,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { tracking } from "@/lib/tracking";
import { formatDaysUntil, formatRelativeTime } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RowSkeleton } from "@/components/dashboard/skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { useRealtime } from "@/lib/realtime";
import { api } from "@/lib/api";

type NotificationItem = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

const TYPE_META: Record<string, { icon: typeof Bell; label: string; color: string }> = {
  deadline: { icon: Clock, label: "Frist", color: "text-[color:var(--ds-warning-text)]" },
  mention: { icon: MessageSquare, label: "Erwähnung", color: "text-[color:var(--ds-info-text)]" },
  reply: { icon: MessageSquare, label: "Antwort", color: "text-[color:var(--ds-info-text)]" },
  system: { icon: Bell, label: "Hinweis", color: "text-[color:var(--ds-neutral-text)]" },
  notification_failure: {
    icon: AlertCircle,
    label: "Fehler",
    color: "text-[color:var(--ds-danger-text)]",
  },
  document_request: {
    icon: FileText,
    label: "Dokumentenanforderung",
    color: "text-[color:var(--ds-category-purple-text)]",
  },
  retention: {
    icon: FileText,
    label: "Aufbewahrung",
    color: "text-[color:var(--ds-category-purple-text)]",
  },
  autonomous_task: { icon: Bot, label: "Assistent", color: "text-[color:var(--ds-success-text)]" },
  inbox_triage: { icon: Inbox, label: "Posteingang", color: "text-[color:var(--ds-info-text)]" },
};


function getNotificationMessage(n: NotificationItem): {
  title: string;
  message: string;
  href?: string;
} {
  const data = n.data;
  switch (n.type) {
    case "deadline": {
      const title = (data?.title as string) ?? "Frist";
      const days = data?.daysRemaining as number | undefined;
      const isOverdue = (data?.isOverdue as boolean) ?? false;
      const caseSlug = data?.caseSlug as string | undefined;
      return {
        title: isOverdue ? "Frist abgelaufen" : "Fristenwarnung",
        message: `${title}${
          typeof days === "number" && Number.isFinite(days)
            ? ` — ${formatDaysUntil(isOverdue ? -Math.abs(days) : days)}`
            : ""
        }`,
        href: caseSlug
          ? `/dashboard/cases/${encodeURIComponent(caseSlug)}?tab=deadlines`
          : undefined,
      };
    }
    case "mention":
      return {
        title: "Erwähnung",
        message: String(data?.message ?? ""),
        href: data?.parentSlug
          ? `/dashboard/cases/${encodeURIComponent(data.parentSlug as string)}`
          : undefined,
      };
    case "reply":
      return {
        title: "Antwort",
        message: String(data?.message ?? ""),
        href: data?.parentSlug
          ? `/dashboard/cases/${encodeURIComponent(data.parentSlug as string)}`
          : undefined,
      };
    case "notification_failure":
      return {
        title: "Benachrichtigung fehlgeschlagen",
        message: `Die Erinnerung zur Frist „${String(data?.deadlineTitle ?? "ohne Bezeichnung")}" konnte nicht zugestellt werden. Bitte prüfen Sie die Frist selbst.`,
        href: data?.caseSlug
          ? `/dashboard/cases/${encodeURIComponent(data.caseSlug as string)}`
          : undefined,
      };
    case "document_request":
      return {
        title: "Dokumentenanforderung",
        message: `${data?.title ?? "Akte"} — ${Number(data?.itemCount ?? 0)} ${
          Number(data?.itemCount ?? 0) === 1 ? "Dokument" : "Dokumente"
        }${data?.isReminder ? " (Erinnerung)" : ""}`,
        href: data?.caseSlug
          ? `/dashboard/cases/${encodeURIComponent(data.caseSlug as string)}`
          : undefined,
      };
    case "retention":
      return {
        title: "Aufbewahrungsfrist",
        message: String(data?.message ?? ""),
      };
    case "autonomous_task": {
      const status = data?.status as string;
      const caseSlug = data?.caseSlug as string | undefined;
      const statusLabel =
        status === "completed"
          ? "abgeschlossen"
          : status === "failed"
            ? "fehlgeschlagen"
            : "Freigabe erforderlich";
      return {
        title: "Aufgabe des Assistenten",
        message: `Status: ${statusLabel}`,
        href: caseSlug ? `/dashboard/cases/${encodeURIComponent(caseSlug)}` : undefined,
      };
    }
    case "inbox_triage": {
      const subject = data?.subject as string;
      const urgency = data?.urgency as string;
      const suggestedAction = data?.suggestedAction as string;
      return {
        title: `Posteingang: ${subject ?? "Nachricht"}`,
        message: `${urgency === "urgent" ? "Dringend" : urgency === "normal" ? "Normal" : "Niedrig"} — ${suggestedAction ?? ""}`,
      };
    }
    default:
      return {
        title: "Hinweis",
        message: String(data?.message ?? ""),
      };
  }
}

export default function NotificationCenterPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const result = await api.notifications.list({ limit: 200 });
      return result.notifications || [];
    },
  });

  useRealtime("notification.created", () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  });
  useRealtime("comment.added", () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  });

  const filtered = useMemo(() => {
    return (data || []).filter((n: NotificationItem) => {
      if (activeTab === "unread" && n.readAt) return false;
      if (activeTab === "read" && !n.readAt) return false;
      if (typeFilter && n.type !== typeFilter) return false;
      if (searchQuery) {
        const meta = getNotificationMessage(n);
        const haystack = `${meta.title} ${meta.message}`.toLowerCase();
        if (!haystack.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, activeTab, typeFilter, searchQuery]);

  const unreadCount = (data || []).filter((n: NotificationItem) => !n.readAt).length;

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => api.notifications.markRead(id),
    onSuccess: (_data, id) => {
      tracking.notifications.markRead(id);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => {
      addToast({
        title: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        type: "error",
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => api.notifications.markAllRead(),
    onSuccess: () => {
      tracking.notifications.markAllRead();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      addToast({ title: t("notifications.all_marked"), type: "success" });
    },
    onError: () => {
      addToast({
        title: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        type: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.notifications.delete(id),
    onSuccess: (_data, id) => {
      tracking.notifications.deleted(id);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      addToast({ title: t("notifications.deleted"), type: "success" });
    },
    onError: () => {
      addToast({
        title: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        type: "error",
      });
    },
  });

  const deleteAllReadMutation = useMutation({
    mutationFn: async () => api.notifications.deleteAllRead(),
    onSuccess: (result: { ok: boolean; deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      addToast({
        title: `${result.deleted} ${t("notifications.deleted_read")}`,
        type: "success",
      });
    },
    onError: () => {
      addToast({
        title: "Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        type: "error",
      });
    },
  });

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    (data || []).forEach((n: NotificationItem) => types.add(n.type));
    return Array.from(types).sort();
  }, [data]);

  const readCount = (data || []).length - unreadCount;

  async function deleteAllRead() {
    const ok = await confirm({
      title: "Gelesene Benachrichtigungen löschen",
      message: `${readCount} gelesene ${readCount === 1 ? "Benachrichtigung wird" : "Benachrichtigungen werden"} endgültig entfernt.`,
      confirmLabel: "Löschen",
      variant: "danger",
    });
    if (ok) deleteAllReadMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("notifications.title") },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => markAllReadMutation.mutate()}
              disabled={unreadCount === 0 || markAllReadMutation.isPending}
            >
              <CheckCheck className="mr-2 h-4 w-4" aria-hidden />
              Alle als gelesen markieren
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={deleteAllRead}
              disabled={readCount === 0 || deleteAllReadMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              {t("notifications.delete_read")}
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList>
            <TabsTrigger value="all">{t("notifications.tab_all")}</TabsTrigger>
            <TabsTrigger value="unread">
              {t("notifications.tab_unread")}
              {unreadCount > 0 && (
                <span className="ml-1.5 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="read">{t("notifications.tab_read")}</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Benachrichtigungen durchsuchen"
              aria-label="Benachrichtigungen durchsuchen"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64"
            />
            {availableTypes.length > 1 && (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Nach Art filtern"
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
              >
                <option value="">Alle Arten</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_META[type]?.label ?? "Hinweis"}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4 space-y-4">
          {isLoading ? (
            <div
              role="status"
              aria-label="Benachrichtigungen werden geladen"
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
            >
              <RowSkeleton count={4} />
            </div>
          ) : isError ? (
            <div
              role="alert"
              className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
            >
              Die Benachrichtigungen konnten nicht geladen werden. Bitte laden Sie die Seite neu.
            </div>
          ) : filtered.length > 0 ? (
            <div className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
              {filtered.map((n: NotificationItem) => {
                const meta = getNotificationMessage(n);
                const typeMeta = TYPE_META[n.type] ?? TYPE_META.system;
                const Icon = typeMeta.icon;
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-4 ${!n.readAt ? "bg-[color:var(--ds-surface-2)]" : ""}`}
                  >
                    <div className={`mt-0.5 shrink-0 ${typeMeta.color}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {!n.readAt && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--brand-solid)]"
                            aria-label="Ungelesen"
                          />
                        )}
                        <span className="text-sm font-medium text-[color:var(--ds-text)]">
                          {meta.title}
                        </span>
                        <span className="text-xs text-[color:var(--ds-text-subtle)]">
                          {typeMeta.label}
                        </span>
                      </div>
                      {meta.message &&
                        (meta.href ? (
                          <Link
                            href={meta.href}
                            className="mt-1 block text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:underline"
                          >
                            {meta.message}
                          </Link>
                        ) : (
                          <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
                            {meta.message}
                          </p>
                        ))}
                      <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!n.readAt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markReadMutation.mutate(n.id)}
                          disabled={markReadMutation.isPending}
                          aria-label={t("notifications.aria_mark_read")}
                          title={t("notifications.aria_mark_read")}
                        >
                          <Check className="h-4 w-4" aria-hidden />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(n.id)}
                        disabled={deleteMutation.isPending}
                        aria-label={t("notifications.aria_delete")}
                        title={t("notifications.aria_delete")}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Bell}
              title={t("notifications.empty_title")}
              description={
                searchQuery || typeFilter
                  ? "Keine Benachrichtigung passt zu Suche oder Filter."
                  : activeTab === "unread"
                    ? t("notifications.empty_unread")
                    : activeTab === "read"
                      ? t("notifications.empty_read")
                      : "Hier erscheinen Fristwarnungen, Erwähnungen, Antworten und Hinweise des Assistenten."
              }
              actionLabel={searchQuery || typeFilter ? "Filter zurücksetzen" : undefined}
              onAction={
                searchQuery || typeFilter
                  ? () => {
                      setSearchQuery("");
                      setTypeFilter("");
                    }
                  : undefined
              }
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
