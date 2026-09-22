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
  MoreHorizontal,
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
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/dashboard/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
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
  CHANGE_TYPE_LABELS,
  LEGACY_WATCHLIST,
} from "@/lib/regulatory-monitors";

const inputCls =
  "w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus:border-[color:var(--brand-primary)]";
const selectCls = inputCls;
const labelCls = "block text-xs text-[color:var(--ds-text-muted)] mb-1 font-medium";

/** Schweregrad über Status-Tokens statt fester Tailwind-Farben. */
const SEVERITY_BADGE: Record<Severity, "danger" | "warning" | "info"> = {
  high: "danger",
  medium: "warning",
  low: "info",
};

/** Quellenkennung eines Treffers lesbar machen (nie rohe Kennungen zeigen). */
function sourceLabel(src: string): string {
  return (SOURCE_LABELS as Record<string, string>)[src] ?? src;
}

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
  jurisdiction: "at",
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
    } catch {
      setError(t("monitoring.form_error_save"));
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
            <label htmlFor="mon-topic" className={labelCls}>
              {t("monitoring.form_topic_label")}
            </label>
            <Input
              id="mon-topic"
              value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
              placeholder={t("monitoring.form_topic_placeholder")}
            />
          </div>

          <div>
            <label htmlFor="mon-desc" className={labelCls}>
              {t("monitoring.form_desc_label")}
            </label>
            <Input
              id="mon-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t("monitoring.form_desc_placeholder")}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="mon-jurisdiction" className={labelCls}>
                {t("monitoring.form_jurisdiction")}
              </label>
              <select
                id="mon-jurisdiction"
                value={form.jurisdiction}
                onChange={(e) =>
                  setForm((f) => ({ ...f, jurisdiction: e.target.value as Jurisdiction }))
                }
                className={selectCls}
              >
                {Object.entries(JURISDICTION_LABELS)
                  .filter(([v]) => v === "at" || v === "eu" || v === form.jurisdiction)
                  .map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="mon-frequency" className={labelCls}>
                {t("monitoring.form_frequency")}
              </label>
              <select
                id="mon-frequency"
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
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color] motion-reduce:transition-none ${
                    form.sources.includes(src)
                      ? "border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                      : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                  }`}
                  aria-pressed={form.sources.includes(src)}
                >
                  {SOURCE_LABELS[src]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="mon-keyword" className={labelCls}>
              {t("monitoring.form_keywords_label")}
            </label>
            <div className="mb-2 flex gap-2">
              <Input
                id="mon-keyword"
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
                aria-label="Suchbegriff hinzufügen"
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
                      aria-label={`Suchbegriff „${kw}“ entfernen`}
                      className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="mon-status" className={labelCls}>
                {t("monitoring.form_status")}
              </label>
              <select
                id="mon-status"
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
              <label htmlFor="mon-emails" className={labelCls}>
                {t("monitoring.form_notify_emails_label")}
              </label>
              <Input
                id="mon-emails"
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
            <p className="flex items-center gap-1 text-xs text-[color:var(--ds-danger-text)]">
              <AlertTriangle size={12} /> {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("monitoring.form_cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
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
  const lastRun = monitor.last_run_at
    ? formatDateTime(monitor.last_run_at)
    : t("monitoring.card_never");

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
              {monitor.topic}
            </h3>
            <Badge variant={monitor.status === "active" ? "success" : "default"}>
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
            type="button"
            onClick={onEdit}
            title={t("monitoring.card_edit")}
            aria-label={t("monitoring.card_edit")}
            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
          >
            <Pencil size={14} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Weitere Aktionen: ${monitor.topic}`}
                className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
              >
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onToggleStatus} className="gap-2 text-xs">
                {monitor.status === "active" ? <Pause size={13} /> : <Play size={13} />}
                {monitor.status === "active"
                  ? t("monitoring.card_pause")
                  : t("monitoring.card_activate")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="gap-2 text-xs text-[color:var(--ds-danger-text)] focus:text-[color:var(--ds-danger-text)]"
              >
                <Trash2 size={13} />
                {t("monitoring.card_delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

      <div className="flex flex-wrap items-center gap-1.5 border-t border-[color:var(--ds-border)] pt-2">
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
      className={`rounded-xl border bg-[color:var(--ds-surface)] p-4 transition-[background-color,border-color,color] motion-reduce:transition-none ${alert.read ? "border-[color:var(--ds-border)] opacity-75" : "border-[color:var(--ds-border-strong)]"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${alert.read ? "bg-[color:var(--ds-text-subtle)]" : "bg-[color:var(--brand-solid)]"}`}
          aria-label={alert.read ? "Gelesen" : "Ungelesen"}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="line-clamp-2 text-sm font-medium text-[color:var(--ds-text)]">
              {alert.title}
            </h4>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge variant={SEVERITY_BADGE[alert.severity] ?? "default"}>
                {SEVERITY_LABELS[alert.severity]}
              </Badge>
              <Badge variant="default">{CHANGE_TYPE_LABELS[alert.change_type]}</Badge>
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
            <span className="tabular-nums">• {formatDate(alert.date)}</span>
            {alert.source && <span>• {sourceLabel(alert.source)}</span>}
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
                className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] active:scale-[0.99] motion-reduce:transition-none"
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
  const confirmDialog = useConfirm();
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
    } catch {
      setError(t("monitoring.error_load"));
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
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("monitoring.title")}
        description={t("monitoring.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("monitoring.breadcrumb") },
        ]}
        actions={
          <PrimaryAction
            onClick={() => {
              setEditingMonitor(null);
              setDialogOpen(true);
            }}
          >
            {t("monitoring.new_monitor")}
          </PrimaryAction>
        }
      />

      {/* Stats bar — Farbe nur bei Zahl > 0 */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label={`${t("monitoring.tab_monitors")} · ${activeMonitors} ${t("monitoring.active")}`}
            value={monitors.length}
          />
          <StatTile label={t("monitoring.alerts_total")} value={alerts.length} />
          <StatTile label={t("monitoring.unread")} value={unreadCount} highlight />
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3 text-xs text-[color:var(--ds-danger-text)]"
        >
          <AlertTriangle size={14} aria-hidden="true" /> {error}
        </div>
      )}

      {loading ? (
        <div
          className="grid gap-3 md:grid-cols-2"
          role="status"
          aria-label={t("monitoring.loading")}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="monitors" className="gap-1.5 whitespace-nowrap">
              <Radar size={14} aria-hidden="true" /> {t("monitoring.tab_monitors")}
              {monitors.length > 0 && (
                <span className="text-[color:var(--ds-text-muted)] tabular-nums">
                  {monitors.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5 whitespace-nowrap">
              <Bell size={14} aria-hidden="true" /> {t("monitoring.tab_alerts")}
              {unreadCount > 0 && (
                <span
                  className="brand-text font-semibold tabular-nums"
                  aria-label={`${unreadCount} ${t("monitoring.unread")}`}
                >
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 whitespace-nowrap">
              <Settings size={14} aria-hidden="true" /> {t("monitoring.tab_settings")}
            </TabsTrigger>
          </TabsList>

          {/* ── Monitors Tab ── */}
          <TabsContent value="monitors" className="mt-4 space-y-3">
            {monitors.length === 0 && legacyKeywords.length === 0 ? (
              <EmptyState
                icon={Radar}
                title={t("monitoring.empty_title")}
                description={t("monitoring.empty_hint")}
                actionLabel={t("monitoring.create_monitor")}
                onAction={() => {
                  setEditingMonitor(null);
                  setDialogOpen(true);
                }}
              />
            ) : (
              <>
                {monitors.length === 0 && legacyKeywords.length > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3 text-xs text-[color:var(--ds-warning-text)]">
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
                        const ok = await confirmDialog({
                          title: t("monitoring.card_delete"),
                          message: t("monitoring.card_confirm_delete").replace("{topic}", m.topic),
                          confirmLabel: t("monitoring.card_delete"),
                          cancelLabel: t("monitoring.form_cancel"),
                          variant: "danger",
                        });
                        if (!ok) return;
                        try {
                          await deleteMonitor(m);
                        } catch {
                          setError(t("monitoring.form_error_save"));
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
                  aria-label={t("monitoring.filter_all_severities")}
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as Severity | "all")}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                >
                  <option value="all">{t("monitoring.filter_all_severities")}</option>
                  <option value="high">{t("monitoring.severity_high")}</option>
                  <option value="medium">{t("monitoring.severity_medium")}</option>
                  <option value="low">{t("monitoring.severity_low")}</option>
                </select>
                <select
                  aria-label={t("monitoring.filter_all_sources")}
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                >
                  <option value="all">{t("monitoring.filter_all_sources")}</option>
                  {availableSources.map((s) => (
                    <option key={s} value={s}>
                      {sourceLabel(s)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t("monitoring.filter_all_monitors")}
                  value={monitorFilter}
                  onChange={(e) => setMonitorFilter(e.target.value)}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
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
              <div className="flex flex-wrap items-center gap-2">
                <ArrowUpDown size={14} className="text-[color:var(--ds-text-muted)]" />
                <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("monitoring.sort_label")}
                </span>
                <button
                  onClick={() => setSortBy("date_desc")}
                  className={`rounded-lg px-2 py-1 text-xs transition-[background-color,border-color,color] motion-reduce:transition-none ${sortBy === "date_desc" ? "bg-[color:var(--ds-surface-2)] font-medium text-[color:var(--ds-text)]" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
                >
                  {t("monitoring.sort_date_desc")}
                </button>
                <button
                  onClick={() => setSortBy("date_asc")}
                  className={`rounded-lg px-2 py-1 text-xs transition-[background-color,border-color,color] motion-reduce:transition-none ${sortBy === "date_asc" ? "bg-[color:var(--ds-surface-2)] font-medium text-[color:var(--ds-text)]" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
                >
                  {t("monitoring.sort_date_asc")}
                </button>
                <button
                  onClick={() => setSortBy("severity")}
                  className={`rounded-lg px-2 py-1 text-xs transition-[background-color,border-color,color] motion-reduce:transition-none ${sortBy === "severity" ? "bg-[color:var(--ds-surface-2)] font-medium text-[color:var(--ds-text)]" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
                >
                  {t("monitoring.sort_severity")}
                </button>
              </div>
            </div>

            {/* Alert list */}
            {filteredAlerts.length === 0 ? (
              <EmptyState
                icon={Bell}
                title={
                  alerts.length === 0
                    ? t("monitoring.alerts_empty")
                    : t("monitoring.alerts_empty_filtered")
                }
                actionLabel={
                  alerts.length === 0 ? t("monitoring.create_monitor") : "Filter zurücksetzen"
                }
                onAction={() => {
                  if (alerts.length === 0) {
                    setEditingMonitor(null);
                    setDialogOpen(true);
                  } else {
                    setSeverityFilter("all");
                    setSourceFilter("all");
                    setMonitorFilter("all");
                    setShowRead(true);
                  }
                }}
              />
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
                        aria-label={`${t("monitoring.settings_email_title")}: ${m.topic}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {legacyKeywords.length > 0 && (
              <div className="space-y-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-[color:var(--ds-warning-text)]" />
                  <h3 className="text-sm font-semibold text-[color:var(--ds-warning-text)]">
                    {t("monitoring.settings_legacy_title")}
                  </h3>
                </div>
                <p className="text-xs text-[color:var(--ds-warning-text)]">
                  {t("monitoring.settings_legacy_desc").replace(
                    "{count}",
                    String(legacyKeywords.length)
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {legacyKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-md border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-2 py-0.5 text-xs text-[color:var(--ds-warning-text)]"
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

function StatTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
      <p className="text-xs text-[color:var(--ds-text-muted)]">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          highlight && value > 0 ? "brand-text" : "text-[color:var(--ds-text)]"
        )}
      >
        {value}
      </p>
    </div>
  );
}
