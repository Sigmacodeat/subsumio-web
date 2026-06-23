"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/use-lang";
import {
  Plug,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Landmark,
  FileText,
  Calendar,
  Mail,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, type ConnectorStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

const CONNECTOR_ICONS: Record<string, React.ElementType> = {
  "google-drive": Folder,
  gmail: Mail,
  notion: FileText,
  github: FileText,
  slack: FileText,
  calendar: Calendar,
  dropbox: Folder,
  asana: FileText,
  jira: FileText,
  "legal-judgements": Landmark,
  "bea-import": FileText,
};

const CONNECTOR_LABELS: Record<string, string> = {
  "google-drive": "Google Drive",
  gmail: "Gmail",
  notion: "Notion",
  github: "GitHub",
  slack: "Slack",
  calendar: "Kalender",
  dropbox: "Dropbox",
  asana: "Asana",
  jira: "Jira",
  "legal-judgements": "Rechtsprechung",
  "bea-import": "beA Import",
};

export default function ConnectorsPage() {
  const { t, lang } = useLang();
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadConnectors() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.connectors.list();
      setConnectors(res.connectors);
    } catch (e) {
      setConnectors([]);
      setError(e instanceof Error ? e.message : "Connector-Status konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConnectors();
  }, []);

  async function handleSync(service: string) {
    setSyncing(service);
    setMessage(null);
    setError(null);
    try {
      await api.connectors.sync(service);
      setMessage(`Sync für ${CONNECTOR_LABELS[service] ?? service} gestartet.`);
      await loadConnectors();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Sync für ${service} fehlgeschlagen.`);
    } finally {
      setSyncing(null);
    }
  }

  async function handleToggle(service: string) {
    setToggling(service);
    setMessage(null);
    setError(null);
    try {
      const res = await api.connectors.toggle(service);
      setMessage(
        `${CONNECTOR_LABELS[service] ?? service} ist jetzt ${res.enabled ? "aktiviert" : "deaktiviert"}.`
      );
      await loadConnectors();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : `Status für ${service} konnte nicht geändert werden.`
      );
    } finally {
      setToggling(null);
    }
  }

  function lastSyncLabel(value: number | null) {
    if (!value) return "Noch nie synchronisiert";
    return `Letzter Sync: ${new Date(value).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}`;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("connectors.title")}
        description={t("connectors.description")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("connectors.breadcrumb") },
        ]}
      />

      {/* Info */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-600">
          Zugangsdaten werden weiterhin über die CLI eingerichtet:{" "}
          <code className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-xs">
            subsumio connector add &lt;service&gt;
          </code>
          . Status, Aktivierung und manuelle Syncs laufen hier direkt über die Engine.
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className="brand-border brand-soft/5 brand-text flex items-center gap-2 rounded-xl border px-4 py-3 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          <XCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label={t("aria.loading")}
        >
          <Loader2 size={24} className="brand-text animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {connectors.map((c) => {
            const Icon = CONNECTOR_ICONS[c.service] || Plug;
            const label = CONNECTOR_LABELS[c.service] || c.service;
            const isLegal = c.service === "legal-judgements" || c.service === "bea-import";

            return (
              <div
                key={c.service}
                className={cn(
                  "flex items-center gap-4 rounded-xl border px-4 py-3 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  isLegal
                    ? "brand-border brand-soft"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                    isLegal
                      ? "brand-soft brand-border"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]"
                  )}
                >
                  <Icon
                    size={18}
                    className={isLegal ? "brand-text" : "text-[color:var(--ds-text-muted)]"}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[color:var(--ds-text)]">{label}</span>
                    {isLegal && (
                      <Badge
                        variant="default"
                        className="brand-soft brand-border brand-text text-xs"
                      >
                        Kanzlei
                      </Badge>
                    )}
                    {!c.configured && (
                      <Badge
                        variant="default"
                        className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                      >
                        Nicht eingerichtet
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        c.enabled ? "text-emerald-600" : "text-[color:var(--ds-text-muted)]"
                      )}
                    >
                      {c.enabled ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                      {c.enabled ? t("connectors.status_enabled") : t("connectors.status_disabled")}
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        c.connected ? "text-emerald-600" : "text-[color:var(--ds-text-muted)]"
                      )}
                    >
                      {c.connected ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                      {c.connected
                        ? t("connectors.status_connected")
                        : t("connectors.status_disconnected")}
                    </span>
                    <span>{lastSyncLabel(c.last_sync_at)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!c.configured || toggling === c.service}
                    onClick={() => handleToggle(c.service)}
                    className="gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  >
                    {toggling === c.service ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : c.enabled ? (
                      <XCircle size={12} />
                    ) : (
                      <CheckCircle2 size={12} />
                    )}
                    {c.enabled ? t("connectors.btn_disable") : t("connectors.btn_enable")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!c.configured || !c.enabled || syncing === c.service}
                    onClick={() => handleSync(c.service)}
                    className="gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  >
                    {syncing === c.service ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Sync
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CLI reference */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">CLI-Kommandos</h2>
        <div className="space-y-2 font-mono text-xs">
          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
            <span className="brand-text">$</span>
            <span className="text-[color:var(--ds-text-muted)]">
              subsumio connector add legal-judgements --query &quot;Haftung&quot; --jurisdiction at
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
            <span className="brand-text">$</span>
            <span className="text-[color:var(--ds-text-muted)]">
              subsumio connector add bea-import --watch-dir ~/Downloads/bea
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
            <span className="brand-text">$</span>
            <span className="text-[color:var(--ds-text-muted)]">
              subsumio connector sync legal-judgements
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
            <span className="brand-text">$</span>
            <span className="text-[color:var(--ds-text-muted)]">subsumio connector list</span>
          </div>
        </div>
      </div>
    </div>
  );
}
