"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Radar,
  Plus,
  X,
  Loader2,
  Check,
  AlertTriangle,
  Pencil,
  Trash2,
  Bell,
  BellOff,
  Pause,
  Play,
  ExternalLink,
  Filter,
  ArrowUpDown,
  Mail,
  Settings,
  Inbox,
  Clock,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { EvalGateWidget } from "@/components/legal/EvalGateWidget";
import { useLang } from "@/lib/use-lang";
import type { TFunc } from "@/content/dashboard";
import {
  type RegulatoryMonitor,
  type RegulatoryAlert,
  type Jurisdiction,
  type MonitorFrequency,
  type MonitorSource,
  type MonitorStatus,
  type Severity,
  frontmatterToMonitor,
  frontmatterToAlert,
  monitorToFrontmatter,
  alertToFrontmatter,
  monitorSlug,
  generateMonitorId,
  JURISDICTION_LABELS,
  FREQUENCY_LABELS,
  SOURCE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  CHANGE_TYPE_LABELS,
  LEGACY_WATCHLIST,
} from "@/lib/regulatory-monitors";

const inputCls =
  "w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]";
const selectCls = inputCls;
const labelCls = "block text-xs text-[color:var(--ds-text-muted)] mb-1 font-medium";

// ─── Monitor Form Component ───────────────────────────────────────

interface MonitorFormState {
  monitor_id?: string;
  topic: string;
  description: string;
  jurisdiction: Jurisdiction;
  frequency: MonitorFrequency;
  sources: MonitorSource[];
  keywords: string[];
  status: MonitorStatus;
  email_notifications: boolean;
  notify_emails: string;
  newKeyword: string;
}

const emptyForm: MonitorFormState = {
  topic: "",
  description: "",
  jurisdiction: "all",
  frequency: "daily",
  sources: ["case-law"],
  keywords: [],
  status: "active",
  email_notifications: true,
  notify_emails: "",
  newKeyword: "",
};

function MonitorFormDialog({
  open,
  onClose,
  onSave,
  editing,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (m: RegulatoryMonitor) => Promise<void>;
  editing: RegulatoryMonitor | null;
  t: TFunc;
}) {
  const [form, setForm] = useState<MonitorFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setForm({
        monitor_id: editing.monitor_id,
        topic: editing.topic,
        description: editing.description ?? "",
        jurisdiction: editing.jurisdiction,
        frequency: editing.frequency,
        sources: editing.sources,
        keywords: editing.keywords,
        status: editing.status,
        email_notifications: editing.email_notifications,
        notify_emails: editing.notify_emails?.join(", ") ?? "",
        newKeyword: "",
      });
    } else {
      setForm(emptyForm);
    }
    setError(null);
  }, [editing, open]);

  function toggleSource(src: MonitorSource) {
    setForm((f) => ({
      ...f,
      sources: f.sources.includes(src) ? f.sources.filter((s) => s !== src) : [...f.sources, src],
    }));
  }

  function addKeyword() {
    const kw = form.newKeyword.trim();
    if (!kw || form.keywords.includes(kw)) return;
    setForm((f) => ({ ...f, keywords: [...f.keywords, kw], newKeyword: "" }));
  }

  function removeKeyword(kw: string) {
    setForm((f) => ({ ...f, keywords: f.keywords.filter((k) => k !== kw) }));
  }

  async function handleSave() {
    if (!form.topic.trim()) {
      setError(t("monitoring.form_error_topic"));
      return;
    }
    if (form.keywords.length === 0) {
      setError(t("monitoring.form_error_keywords"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const monitor: RegulatoryMonitor = {
        monitor_id: form.monitor_id ?? generateMonitorId(form.topic),
        topic: form.topic.trim(),
        description: form.description.trim() || undefined,
        jurisdiction: form.jurisdiction,
        frequency: form.frequency,
        sources: form.sources.length > 0 ? form.sources : ["case-law"],
        keywords: form.keywords,
        status: form.status,
        email_notifications: form.email_notifications,
        notify_emails:
          form.notify_emails
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean) || undefined,
        created_at: editing?.created_at ?? now,
        updated_at: now,
        last_run_at: editing?.last_run_at,
        last_run_status: editing?.last_run_status,
        last_run_hits: editing?.last_run_hits,
      };
      await onSave(monitor);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("monitoring.form_error_save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? t("monitoring.form_edit_title") : t("monitoring.form_new_title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className={labelCls}>{t("monitoring.form_topic_label")}</label>
            <Input
              value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
              placeholder={t("monitoring.form_topic_placeholder")}
            />
          </div>

          <div>
            <label className={labelCls}>{t("monitoring.form_desc_label")}</label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t("monitoring.form_desc_placeholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("monitoring.form_jurisdiction")}</label>
              <select
                value={form.jurisdiction}
                onChange={(e) =>
                  setForm((f) => ({ ...f, jurisdiction: e.target.value as Jurisdiction }))
                }
                className={selectCls}
              >
                {Object.entries(JURISDICTION_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("monitoring.form_frequency")}</label>
              <select
                value={form.frequency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, frequency: e.target.value as MonitorFrequency }))
                }
                className={selectCls}
              >
                {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("monitoring.form_sources")}</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SOURCE_LABELS) as MonitorSource[]).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => toggleSource(src)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    form.sources.includes(src)
                      ? "brand-soft brand-text brand-border"
                      : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                  }`}
                >
                  {SOURCE_LABELS[src]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>{t("monitoring.form_keywords_label")}</label>
            <div className="mb-2 flex gap-2">
              <Input
                value={form.newKeyword}
                onChange={(e) => setForm((f) => ({ ...f, newKeyword: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                placeholder={t("monitoring.form_keywords_placeholder")}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addKeyword}
                disabled={!form.newKeyword.trim()}
              >
                <Plus size={14} />
              </Button>
            </div>
            {form.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() => removeKeyword(kw)}
                      className="text-[color:var(--ds-text-muted)] hover:text-red-600"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t("monitoring.form_status")}</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as MonitorStatus }))
                }
                className={selectCls}
              >
                <option value="active">{t("monitoring.form_status_active")}</option>
                <option value="paused">{t("monitoring.form_status_paused")}</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 pb-2">
                <Switch
                  checked={form.email_notifications}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, email_notifications: v }))}
                />
                <span className="text-sm text-[color:var(--ds-text)]">
                  {t("monitoring.form_email_notifications")}
                </span>
              </label>
            </div>
          </div>

          {form.email_notifications && (
            <div>
              <label className={labelCls}>{t("monitoring.form_notify_emails_label")}</label>
              <Input
                value={form.notify_emails}
                onChange={(e) => setForm((f) => ({ ...f, notify_emails: e.target.value }))}
                placeholder={t("monitoring.form_notify_emails_placeholder")}
              />
              <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
                {t("monitoring.form_notify_emails_hint")}
              </p>
            </div>
          )}

          {error && (
            <p className="flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle size={12} /> {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("monitoring.form_cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="brand-bg gap-1.5 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {editing ? t("monitoring.form_save") : t("monitoring.form_create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Monitor Card ──────────────────────────────────────────────────

function MonitorCard({
  monitor,
  onEdit,
  onDelete,
  onToggleStatus,
  onToggleEmail: _onToggleEmail,
  t,
}: {
  monitor: RegulatoryMonitor;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onToggleEmail: () => void;
  t: TFunc;
}) {
  const { lang } = useLang();
  const lastRun = monitor.last_run_at
    ? new Date(monitor.last_run_at).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : t("monitoring.card_never");

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
              {monitor.topic}
            </h3>
            <Badge variant={monitor.status === "active" ? "accent" : "default"}>
              {monitor.status === "active"
                ? t("monitoring.form_status_active")
                : t("monitoring.form_status_paused")}
            </Badge>
          </div>
          {monitor.description && (
            <p className="line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
              {monitor.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onToggleStatus}
            title={
              monitor.status === "active"
                ? t("monitoring.card_pause")
                : t("monitoring.card_activate")
            }
            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          >
            {monitor.status === "active" ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={onEdit}
            title={t("monitoring.card_edit")}
            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            title={t("monitoring.card_delete")}
            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {monitor.keywords.slice(0, 5).map((kw) => (
          <span
            key={kw}
            className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-0.5 text-xs text-[color:var(--ds-text-muted)]"
          >
            {kw}
          </span>
        ))}
        {monitor.keywords.length > 5 && (
          <span className="px-2 py-0.5 text-xs text-[color:var(--ds-text-subtle)]">
            {t("monitoring.card_more_keywords").replace(
              "{count}",
              String(monitor.keywords.length - 5)
            )}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
        <span className="flex items-center gap-1">
          <Globe size={11} /> {JURISDICTION_LABELS[monitor.jurisdiction]}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} /> {FREQUENCY_LABELS[monitor.frequency]}
        </span>
        <span className="flex items-center gap-1">
          {monitor.email_notifications ? <Bell size={11} /> : <BellOff size={11} />}
          {monitor.email_notifications
            ? t("monitoring.card_email_on")
            : t("monitoring.card_email_off")}
        </span>
        {monitor.last_run_hits !== undefined && (
          <span className="flex items-center gap-1">
            <Inbox size={11} /> {monitor.last_run_hits} {t("monitoring.card_hits")}
          </span>
        )}
        <span className="text-[color:var(--ds-text-subtle)]">
          {t("monitoring.card_last_run")} {lastRun}
        </span>
      </div>

      <div className="flex items-center gap-1.5 border-t border-[color:var(--ds-border)] pt-1">
        <span className="mr-1 text-xs text-[color:var(--ds-text-subtle)]">
          {t("monitoring.card_sources_label")}
        </span>
        {monitor.sources.map((src) => (
          <span
            key={src}
            className="rounded bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-xs font-medium text-[color:var(--ds-text-muted)]"
          >
            {SOURCE_LABELS[src]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Alert Item ────────────────────────────────────────────────────

function AlertItem({
  alert,
  onMarkRead,
  t,
}: {
  alert: RegulatoryAlert;
  onMarkRead: () => void;
  t: TFunc;
}) {
  return (
    <div
      className={`rounded-xl border bg-[color:var(--ds-surface)] p-4 transition-colors ${alert.read ? "border-[color:var(--ds-border)] opacity-75" : "border-[color:var(--ds-border-strong)]"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${alert.read ? "bg-[color:var(--ds-text-subtle)]" : "animate-pulse bg-[color:var(--brand-primary)]"}`}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h4 className="line-clamp-2 text-sm font-medium text-[color:var(--ds-text)]">
              {alert.title}
            </h4>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${SEVERITY_COLORS[alert.severity]}`}
              >
                {SEVERITY_LABELS[alert.severity]}
              </span>
              <span className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-0.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
                {CHANGE_TYPE_LABELS[alert.change_type]}
              </span>
            </div>
          </div>

          {alert.summary && (
            <p className="line-clamp-3 text-xs text-[color:var(--ds-text-muted)]">
              {alert.summary}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
            <span className="font-medium text-[color:var(--ds-text)]">{alert.monitor_topic}</span>
            {alert.court && <span>• {alert.court}</span>}
            {alert.case_number && <span>• {alert.case_number}</span>}
            <span>• {alert.date}</span>
            <span>• {alert.source}</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {alert.url && (
              <a
                href={alert.url}
                target="_blank"
                rel="noopener noreferrer"
                className="brand-text inline-flex items-center gap-1 text-xs hover:underline"
              >
                <ExternalLink size={11} /> {t("monitoring.alert_open")}
              </a>
            )}
            {!alert.read && (
              <button
                onClick={onMarkRead}
                className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
              >
                <Check size={11} /> {t("monitoring.alert_mark_read")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────

export default function MonitoringPage() {
  const { t } = useLang();
  const [monitors, setMonitors] = useState<RegulatoryMonitor[]>([]);
  const [alerts, setAlerts] = useState<RegulatoryAlert[]>([]);
  const [alertSlugs, setAlertSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<RegulatoryMonitor | null>(null);
  const [activeTab, setActiveTab] = useState("monitors");

  // Alert filters
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [monitorFilter, setMonitorFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "severity">("date_desc");
  const [showRead, setShowRead] = useState(true);

  // Legacy watchlist
  const [legacyKeywords, setLegacyKeywords] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const batch = await api.brain.batchListPages(["regulatory_monitor", "regulatory_alert"], 200);
      const monitorPages = batch["regulatory_monitor"] ?? [];
      const alertPages = batch["regulatory_alert"] ?? [];

      const parsedMonitors = monitorPages
        .map((p) => frontmatterToMonitor(p))
        .filter((m): m is RegulatoryMonitor => m !== null);

      const parsedAlerts = alertPages
        .map((p) => frontmatterToAlert(p))
        .filter((a): a is RegulatoryAlert => a !== null);
      const slugs = alertPages.map((p) => p.slug);

      setMonitors(parsedMonitors);
      setAlerts(parsedAlerts);
      setAlertSlugs(slugs);

      // Load legacy watchlist for backward compat display
      try {
        const legacy = await api.brain.getPage(LEGACY_WATCHLIST);
        const fmTerms = legacy?.frontmatter?.terms;
        if (Array.isArray(fmTerms)) {
          setLegacyKeywords(
            fmTerms
              .map((t: unknown) =>
                t && typeof t === "object" ? (t as Record<string, unknown>) : {}
              )
              .map((t: Record<string, unknown>) => String(t.query ?? ""))
              .filter(Boolean)
          );
        }
      } catch {
        setLegacyKeywords([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("monitoring.error_load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── CRUD handlers ──

  async function saveMonitor(m: RegulatoryMonitor) {
    const slug = monitorSlug(m.monitor_id);
    const isEditing = monitors.some((existing) => existing.monitor_id === m.monitor_id);
    if (isEditing) {
      await api.brain.updatePage({
        slug,
        title: `Monitor: ${m.topic}`,
        type: "regulatory_monitor",
        content: m.description ?? "",
        frontmatter: monitorToFrontmatter(m),
      });
    } else {
      await api.brain.createPage({
        slug,
        title: `Monitor: ${m.topic}`,
        type: "regulatory_monitor",
        content: m.description ?? "",
        frontmatter: monitorToFrontmatter(m),
      });
    }
    await loadData();
  }

  async function deleteMonitor(m: RegulatoryMonitor) {
    const slug = monitorSlug(m.monitor_id);
    await api.brain.deletePage(slug);
    await loadData();
  }

  async function toggleMonitorStatus(m: RegulatoryMonitor) {
    const slug = monitorSlug(m.monitor_id);
    const updated: RegulatoryMonitor = {
      ...m,
      status: m.status === "active" ? "paused" : "active",
      updated_at: new Date().toISOString(),
    };
    await api.brain.updatePage({
      slug,
      type: "regulatory_monitor",
      frontmatter: monitorToFrontmatter(updated),
    });
    await loadData();
  }

  async function toggleMonitorEmail(m: RegulatoryMonitor) {
    const slug = monitorSlug(m.monitor_id);
    const updated: RegulatoryMonitor = {
      ...m,
      email_notifications: !m.email_notifications,
      updated_at: new Date().toISOString(),
    };
    await api.brain.updatePage({
      slug,
      type: "regulatory_monitor",
      frontmatter: monitorToFrontmatter(updated),
    });
    await loadData();
  }

  async function markAlertRead(alert: RegulatoryAlert, slug: string) {
    await api.brain.updatePage({
      slug,
      type: "regulatory_alert",
      frontmatter: { ...alertToFrontmatter(alert), read: true },
    });
    await loadData();
  }

  // ── Filtered + sorted alerts ──

  const filteredAlerts = useMemo(() => {
    let result = alerts;
    if (!showRead) result = result.filter((a) => !a.read);
    if (severityFilter !== "all") result = result.filter((a) => a.severity === severityFilter);
    if (sourceFilter !== "all") result = result.filter((a) => a.source === sourceFilter);
    if (monitorFilter !== "all") result = result.filter((a) => a.monitor_id === monitorFilter);

    const severityRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
    result = [...result].sort((a, b) => {
      if (sortBy === "date_desc") return b.date.localeCompare(a.date);
      if (sortBy === "date_asc") return a.date.localeCompare(b.date);
      if (sortBy === "severity")
        return severityRank[a.severity] - severityRank[b.severity] || b.date.localeCompare(a.date);
      return 0;
    });
    return result;
  }, [alerts, showRead, severityFilter, sourceFilter, monitorFilter, sortBy]);

  const availableSources = useMemo(() => [...new Set(alerts.map((a) => a.source))], [alerts]);
  const unreadCount = alerts.filter((a) => !a.read).length;
  const activeMonitors = monitors.filter((m) => m.status === "active").length;

  // ── Render ──

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("monitoring.title")}
        description={t("monitoring.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("monitoring.breadcrumb") },
        ]}
        actions={
          <Button
            onClick={() => {
              setEditingMonitor(null);
              setDialogOpen(true);
            }}
            className="brand-bg gap-1.5 text-white"
          >
            <Plus size={15} /> {t("monitoring.new_monitor")}
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <p className="text-2xl font-bold text-[color:var(--ds-text)]">{monitors.length}</p>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {activeMonitors} {t("monitoring.active")}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <p className="text-2xl font-bold text-[color:var(--ds-text)]">{alerts.length}</p>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {t("monitoring.alerts_total")}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <p className="brand-text text-2xl font-bold">{unreadCount}</p>
          <p className="text-xs text-[color:var(--ds-text-muted)]">{t("monitoring.unread")}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-600">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-[color:var(--ds-text-muted)]">
          <Loader2 size={18} className="mr-2 animate-spin" /> {t("monitoring.loading")}
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="monitors" className="gap-1.5">
              <Radar size={14} /> {t("monitoring.tab_monitors")} ({monitors.length})
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5">
              <Bell size={14} /> {t("monitoring.tab_alerts")} (
              {unreadCount > 0 && <span className="brand-text font-bold">{unreadCount}</span>}{" "}
              {alerts.length})
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings size={14} /> {t("monitoring.tab_settings")}
            </TabsTrigger>
          </TabsList>

          {/* ── Monitors Tab ── */}
          <TabsContent value="monitors" className="mt-4 space-y-3">
            {monitors.length === 0 && legacyKeywords.length === 0 ? (
              <div className="py-16 text-center text-[color:var(--ds-text-muted)]">
                <Radar size={36} className="mx-auto mb-3 opacity-30" />
                <p className="mb-2 text-sm">{t("monitoring.empty_title")}</p>
                <p className="mb-4 text-xs text-[color:var(--ds-text-subtle)]">
                  {t("monitoring.empty_hint")}
                </p>
                <Button
                  onClick={() => {
                    setEditingMonitor(null);
                    setDialogOpen(true);
                  }}
                  className="brand-bg gap-1.5 text-white"
                >
                  <Plus size={15} /> {t("monitoring.create_monitor")}
                </Button>
              </div>
            ) : (
              <>
                {monitors.length === 0 && legacyKeywords.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700">
                    <AlertTriangle size={14} />
                    {t("monitoring.legacy_warning").replace(
                      "{count}",
                      String(legacyKeywords.length)
                    )}
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {monitors.map((m) => (
                    <MonitorCard
                      key={m.monitor_id}
                      monitor={m}
                      onEdit={() => {
                        setEditingMonitor(m);
                        setDialogOpen(true);
                      }}
                      onDelete={async () => {
                        if (
                          confirm(t("monitoring.card_confirm_delete").replace("{topic}", m.topic))
                        ) {
                          await deleteMonitor(m);
                        }
                      }}
                      onToggleStatus={() => toggleMonitorStatus(m)}
                      onToggleEmail={() => toggleMonitorEmail(m)}
                      t={t}
                    />
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Alerts Tab ── */}
          <TabsContent value="alerts" className="mt-4 space-y-3">
            {/* Filter bar */}
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Filter size={14} className="text-[color:var(--ds-text-muted)]" />
                <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("monitoring.filter_label")}
                </span>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as Severity | "all")}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="all">{t("monitoring.filter_all_severities")}</option>
                  <option value="high">{t("monitoring.severity_high")}</option>
                  <option value="medium">{t("monitoring.severity_medium")}</option>
                  <option value="low">{t("monitoring.severity_low")}</option>
                </select>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="all">{t("monitoring.filter_all_sources")}</option>
                  {availableSources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={monitorFilter}
                  onChange={(e) => setMonitorFilter(e.target.value)}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="all">{t("monitoring.filter_all_monitors")}</option>
                  {monitors.map((m) => (
                    <option key={m.monitor_id} value={m.monitor_id}>
                      {m.topic}
                    </option>
                  ))}
                </select>
                <div className="flex-1" />
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
                  <Switch checked={showRead} onCheckedChange={setShowRead} />
                  {t("monitoring.filter_show_read")}
                </label>
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpDown size={14} className="text-[color:var(--ds-text-muted)]" />
                <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("monitoring.sort_label")}
                </span>
                <button
                  onClick={() => setSortBy("date_desc")}
                  className={`rounded-lg px-2 py-1 text-xs transition-colors ${sortBy === "date_desc" ? "brand-soft brand-text" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
                >
                  {t("monitoring.sort_date_desc")}
                </button>
                <button
                  onClick={() => setSortBy("date_asc")}
                  className={`rounded-lg px-2 py-1 text-xs transition-colors ${sortBy === "date_asc" ? "brand-soft brand-text" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
                >
                  {t("monitoring.sort_date_asc")}
                </button>
                <button
                  onClick={() => setSortBy("severity")}
                  className={`rounded-lg px-2 py-1 text-xs transition-colors ${sortBy === "severity" ? "brand-soft brand-text" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
                >
                  {t("monitoring.sort_severity")}
                </button>
              </div>
            </div>

            {/* Alert list */}
            {filteredAlerts.length === 0 ? (
              <div className="py-16 text-center text-[color:var(--ds-text-muted)]">
                <Bell size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {alerts.length === 0
                    ? t("monitoring.alerts_empty")
                    : t("monitoring.alerts_empty_filtered")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAlerts.map((alert, i) => {
                  const slug = alertSlugs[alerts.indexOf(alert)] ?? "";
                  return (
                    <AlertItem
                      key={`${alert.monitor_id}-${alert.date}-${i}`}
                      alert={alert}
                      onMarkRead={() => {
                        if (slug) markAlertRead(alert, slug);
                      }}
                      t={t}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Settings Tab ── */}
          <TabsContent value="settings" className="mt-4 space-y-4">
            <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-[color:var(--ds-text-muted)]" />
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("monitoring.settings_email_title")}
                </h3>
              </div>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {t("monitoring.settings_email_desc")}
              </p>

              {monitors.length === 0 ? (
                <p className="py-4 text-xs text-[color:var(--ds-text-subtle)]">
                  {t("monitoring.settings_no_monitors")}
                </p>
              ) : (
                <div className="space-y-2">
                  {monitors.map((m) => (
                    <div
                      key={m.monitor_id}
                      className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[color:var(--ds-text)]">{m.topic}</p>
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          {m.email_notifications
                            ? `${t("monitoring.settings_email_active")} — ${m.notify_emails?.length ? m.notify_emails.join(", ") : t("monitoring.settings_email_all_users")}`
                            : t("monitoring.settings_email_disabled")}
                        </p>
                      </div>
                      <Switch
                        checked={m.email_notifications}
                        onCheckedChange={() => toggleMonitorEmail(m)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-[color:var(--ds-text-muted)]" />
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("monitoring.settings_cron_title")}
                </h3>
              </div>
              <div className="space-y-1.5 text-xs text-[color:var(--ds-text-muted)]">
                <p>
                  {t("monitoring.settings_cron_schedule").replace(
                    "{code}",
                    "/api/cron/regulatory-monitors"
                  )}
                </p>
                <p>
                  {t("monitoring.settings_cron_requirements")
                    .replace("{code1}", "CRON_SECRET")
                    .replace("{code2}", "RESEND_API_KEY")}
                </p>
                <p>
                  {t("monitoring.settings_cron_sources").replace("{code}", "/api/cron/case-law")}
                </p>
              </div>
            </div>

            {/* Eval Gate */}
            <EvalGateWidget />

            {legacyKeywords.length > 0 && (
              <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <h3 className="text-sm font-semibold text-amber-700">
                    {t("monitoring.settings_legacy_title")}
                  </h3>
                </div>
                <p className="text-xs text-amber-700">
                  {t("monitoring.settings_legacy_desc").replace(
                    "{count}",
                    String(legacyKeywords.length)
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {legacyKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <MonitorFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={saveMonitor}
        editing={editingMonitor}
        t={t}
      />
    </div>
  );
}
