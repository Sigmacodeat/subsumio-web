"use client";

/**
 * CorpusAlertBanner — zeigt neue RIS-Delta-Notifications auf der Corpus-Page.
 *
 * Erscheint wenn:
 *  - Der RIS Delta-Watcher neue/geänderte Dokumente gefunden hat (corpus_delta Notification)
 *  - Oder Alerts in der Pipeline aufgetreten sind (alert_flags in pipeline_state)
 *
 * Features:
 *  - Farbcodierte Schweregrade: info (neue Gesetze), warning (Alerts), danger (Fehler)
 *  - „Als gelesen markieren"-Button
 *  - Auto-Refresh alle 60s (ungelesene Notifications)
 *  - Link zum Command-Center für Details
 *  - Dismissible (markiert alle als gelesen)
 *
 * Accessibility: role=status, aria-live=polite, Tastatur bedienbar.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Sparkles, AlertTriangle, CheckCheck, ArrowRight } from "lucide-react";
import Link from "next/link";

interface CorpusAlert {
  id: string;
  type: "corpus_delta";
  data: {
    title: string;
    newCount: number;
    changedCount: number;
    failedCount: number;
    applikationen: string[];
    total: number;
    url: string;
    syncDate: string;
  };
  readAt: string | null;
  createdAt: string;
}

interface AlertsResponse {
  notifications: CorpusAlert[];
  count: number;
  unreadCount: number;
}

export function CorpusAlertBanner() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const { data, isLoading } = useQuery<AlertsResponse>({
    queryKey: ["corpus-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/corpus-alerts?unread=true&limit=10", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Alerts nicht ladbar");
      const json = await res.json();
      return json.data ?? json;
    },
    refetchInterval: 60_000, // Auto-Refresh alle 60s
  });

  const markReadMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/corpus-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Markieren fehlgeschlagen");
      return res.json();
    },
    onSuccess: () => {
      addToast({
        title: "Alerts als gelesen markiert",
        description: "Die Corpus-Alerts wurden aus dem Banner entfernt.",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["corpus-alerts"] });
    },
    onError: (err: Error) => {
      addToast({ title: "Fehler", description: err.message, type: "error" });
    },
  });

  // Nichts zu zeigen
  if (isLoading || !data || data.unreadCount === 0) return null;

  const alerts = data.notifications;
  if (alerts.length === 0) return null;

  // Priorität: Fehler (failedCount > 0) → danger, neue Gesetze → info, nur Alerts → warning
  const hasFailures = alerts.some((a) => a.data.failedCount > 0);
  const hasNewDocs = alerts.some((a) => a.data.total > 0);
  const severity: "info" | "warning" | "danger" = hasFailures
    ? "danger"
    : hasNewDocs
      ? "info"
      : "warning";

  const totalNew = alerts.reduce((s, a) => s + a.data.newCount, 0);
  const totalChanged = alerts.reduce((s, a) => s + a.data.changedCount, 0);
  const totalFailed = alerts.reduce((s, a) => s + a.data.failedCount, 0);
  const totalDelta = totalNew + totalChanged;

  const severityConfig = {
    info: {
      icon: Sparkles,
      borderClass: "border-[color:var(--ds-info-border)]",
      bgClass: "bg-[color:var(--ds-info-bg)]",
      textClass: "text-[color:var(--ds-info-text)]",
      iconClass: "text-[color:var(--ds-info-text)]",
    },
    warning: {
      icon: AlertTriangle,
      borderClass: "border-[color:var(--ds-warning-border)]",
      bgClass: "bg-[color:var(--ds-warning-bg)]",
      textClass: "text-[color:var(--ds-warning-text)]",
      iconClass: "text-[color:var(--ds-warning-text)]",
    },
    danger: {
      icon: AlertTriangle,
      borderClass: "border-[color:var(--ds-danger-border)]",
      bgClass: "bg-[color:var(--ds-danger-bg)]",
      textClass: "text-[color:var(--ds-danger-text)]",
      iconClass: "text-[color:var(--ds-danger-text)]",
    },
  };

  const cfg = severityConfig[severity];
  const Icon = cfg.icon;

  // Build delta description string
  const deltaParts: string[] = [];
  if (totalNew > 0) deltaParts.push(`${totalNew.toLocaleString("de-AT")} neu`);
  if (totalChanged > 0) deltaParts.push(`${totalChanged.toLocaleString("de-AT")} geändert`);
  const deltaDesc = deltaParts.join(", ");
  const failedDesc =
    totalFailed > 0 ? ` · ${totalFailed.toLocaleString("de-AT")} fehlgeschlagen` : "";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${totalDelta} neue oder geänderte RIS-Dokumente`}
      className={`rounded-lg border ${cfg.borderClass} ${cfg.bgClass} p-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.iconClass}`} aria-hidden="true" />
          <div className="text-sm">
            <strong className={cfg.textClass}>
              {severity === "danger"
                ? "RIS Delta-Sync mit Fehlern"
                : severity === "info"
                  ? "Neue Gesetze verfügbar"
                  : "RIS Delta-Sync abgeschlossen"}
            </strong>
            <p className="mt-1 text-[color:var(--ds-text)]">
              {totalDelta > 0 ? (
                <span>
                  <span className="font-medium">{totalDelta.toLocaleString("de-AT")}</span>{" "}
                  {totalDelta === 1 ? "neues/geändertes Dokument" : "neue/geänderte Dokumente"} im
                  RIS
                  {deltaDesc && <> ({deltaDesc})</>}
                  {failedDesc && <span className={`ml-2 ${cfg.textClass}`}>{failedDesc}</span>}
                </span>
              ) : (
                "Keine neuen Dokumente im RIS gefunden."
              )}
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              Letzter Sync:{" "}
              {new Date(alerts[0].createdAt).toLocaleString("de-AT", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link href="/dashboard/admin/corpus">
            <Button size="sm" variant="outline">
              Zum Command-Center
              <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => markReadMut.mutate()}
            disabled={markReadMut.isPending}
            aria-label="Alle Alerts als gelesen markieren"
          >
            <CheckCheck className="h-3 w-3" aria-hidden="true" />
            <span className="hidden sm:inline">Als gelesen</span>
          </Button>
        </div>
      </div>

      {markReadMut.isError && (
        <p className="mt-2 text-sm text-[color:var(--ds-danger-text)]">
          {(markReadMut.error as Error).message}
        </p>
      )}
    </div>
  );
}
