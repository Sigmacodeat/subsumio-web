"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  Check,
  Trash2,
  CheckCheck,
  Search,
  AlertCircle,
  MessageSquare,
  FileText,
  Bot,
  Inbox,
  Clock,
} from "lucide-react";
import { tracking } from "@/lib/tracking";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/ui/toast";
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
  deadline: { icon: Clock, label: "Frist", color: "text-amber-500" },
  mention: { icon: MessageSquare, label: "Erwähnung", color: "text-blue-500" },
  reply: { icon: MessageSquare, label: "Antwort", color: "text-blue-500" },
  system: { icon: Bell, label: "System", color: "text-slate-500" },
  notification_failure: { icon: AlertCircle, label: "Fehler", color: "text-red-500" },
  document_request: { icon: FileText, label: "Dokumentenanforderung", color: "text-purple-500" },
  retention: { icon: FileText, label: "Aufbewahrung", color: "text-purple-500" },
  autonomous_task: { icon: Bot, label: "Autonom", color: "text-green-500" },
  inbox_triage: { icon: Inbox, label: "Inbox", color: "text-cyan-500" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `vor ${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString("de-DE");
}

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
        message: `${title}${days !== undefined ? (isOverdue ? ` — ${Math.abs(days)}T überfällig` : ` — in ${days}T`) : ""}`,
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
        message: `${data?.deadlineTitle ?? "Frist"} — ${data?.reason ?? "unbekannt"}`,
        href: data?.caseSlug
          ? `/dashboard/cases/${encodeURIComponent(data.caseSlug as string)}`
          : undefined,
      };
    case "document_request":
      return {
        title: "Dokumentenanforderung",
        message: `${data?.title ?? "Akte"} — ${data?.itemCount ?? 0} Dokumente${data?.isReminder ? " (Erinnerung)" : ""}`,
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
      const taskType = data?.taskType as string;
      const caseSlug = data?.caseSlug as string | undefined;
      const statusLabel =
        status === "completed"
          ? "abgeschlossen"
          : status === "failed"
            ? "fehlgeschlagen"
            : "Freigabe erforderlich";
      return {
        title: `Autonom: ${taskType}`,
        message: `Status: ${statusLabel}`,
        href: caseSlug ? `/dashboard/cases/${encodeURIComponent(caseSlug)}` : undefined,
      };
    }
    case "inbox_triage": {
      const subject = data?.subject as string;
      const urgency = data?.urgency as string;
      const suggestedAction = data?.suggestedAction as string;
      return {
        title: `Inbox: ${subject ?? "Nachricht"}`,
        message: `${urgency === "urgent" ? "Dringend" : urgency === "normal" ? "Normal" : "Niedrig"} — ${suggestedAction ?? ""}`,
      };
    }
    default:
      return {
        title: "System",
        message: String(data?.message ?? ""),
      };
  }
}

export default function NotificationCenterPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const { data, isLoading } = useQuery({
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
    onError: (err: Error) => {
      addToast({ title: "Fehler", description: err.message, type: "error" });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => api.notifications.markAllRead(),
    onSuccess: () => {
      tracking.notifications.markAllRead();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      addToast({ title: "Alle als gelesen markiert", type: "success" });
    },
    onError: (err: Error) => {
      addToast({ title: "Fehler", description: err.message, type: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.notifications.delete(id),
    onSuccess: (_data, id) => {
      tracking.notifications.deleted(id);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      addToast({ title: "Benachrichtigung gelöscht", type: "success" });
    },
    onError: (err: Error) => {
      addToast({ title: "Fehler", description: err.message, type: "error" });
    },
  });

  const deleteAllReadMutation = useMutation({
    mutationFn: async () => api.notifications.deleteAllRead(),
    onSuccess: (result: { ok: boolean; deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      addToast({
        title: `${result.deleted} gelesene Benachrichtigungen gelöscht`,
        type: "success",
      });
    },
    onError: (err: Error) => {
      addToast({ title: "Fehler", description: err.message, type: "error" });
    },
  });

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    (data || []).forEach((n: NotificationItem) => types.add(n.type));
    return Array.from(types).sort();
  }, [data]);

  function handleNavigate(href: string | undefined) {
    if (href) {
      window.location.href = href;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benachrichtigungen"
        description="Alle Ihre Benachrichtigungen an einem Ort"
        actions={[
          <Button
            key="mark-all-read"
            variant="outline"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Alle gelesen
          </Button>,
          <Button
            key="delete-read"
            variant="outline"
            size="sm"
            onClick={() => deleteAllReadMutation.mutate()}
            disabled={deleteAllReadMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Gelesene löschen
          </Button>,
        ]}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ungelesen</CardTitle>
            <Bell className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unreadCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
            <Bell className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gefiltert</CardTitle>
            <Search className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Suche..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
            >
              <option value="">Alle Typen</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t]?.label ?? t}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Alle</TabsTrigger>
          <TabsTrigger value="unread">
            Ungelesen
            {unreadCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[color:var(--ds-danger-text)] px-1 text-xs font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="read">Gelesen</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="text-muted-foreground p-8 text-center">Laden...</div>
              ) : filtered.length > 0 ? (
                <div className="divide-y divide-[color:var(--ds-border)]">
                  {filtered.map((n: NotificationItem) => {
                    const meta = getNotificationMessage(n);
                    const typeMeta = TYPE_META[n.type] ?? TYPE_META.system;
                    const Icon = typeMeta.icon;
                    return (
                      <div
                        key={n.id}
                        className={`flex items-start gap-3 p-4 transition-colors hover:bg-[color:var(--ds-hover)] ${!n.readAt ? "bg-[color:var(--ds-surface-2)]" : ""}`}
                      >
                        <div className={`mt-0.5 shrink-0 ${typeMeta.color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[color:var(--ds-text)]">
                              {meta.title}
                            </span>
                            <Badge variant="default" className="text-xs">
                              {typeMeta.label}
                            </Badge>
                            {!n.readAt && (
                              <span className="h-2 w-2 rounded-full bg-[color:var(--ds-danger-text)]" />
                            )}
                          </div>
                          <p
                            className={`mt-1 text-sm text-[color:var(--ds-text-muted)] ${meta.href ? "cursor-pointer hover:text-[color:var(--ds-text)]" : ""}`}
                            onClick={() => handleNavigate(meta.href)}
                          >
                            {meta.message}
                          </p>
                          <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
                            {formatDate(n.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {!n.readAt && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markReadMutation.mutate(n.id)}
                              disabled={markReadMutation.isPending}
                              aria-label="Als gelesen markieren"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(n.id)}
                            disabled={deleteMutation.isPending}
                            aria-label="Löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Bell className="mb-3 h-10 w-10 text-[color:var(--ds-border-strong)]" />
                  <p className="font-medium text-[color:var(--ds-text)]">
                    Keine Benachrichtigungen
                  </p>
                  <p className="text-sm text-[color:var(--ds-text-muted)]">
                    {activeTab === "unread"
                      ? "Sie haben keine ungelesenen Benachrichtigungen."
                      : activeTab === "read"
                        ? "Sie haben keine gelesenen Benachrichtigungen."
                        : "Es gibt keine Benachrichtigungen."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
