"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen,
  CalendarClock,
  MessageSquare,
  Activity,
  TrendingUp,
  Users,
  Link2,
  Scale,
  Zap,
  FileText,
  GripVertical,
  X,
  Plus,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/dashboard/stats-card";
import { useBrainStats, useRecentQueries, usePages } from "@/lib/queries/brain";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import type { BrainStats, RecentQuery } from "@/lib/types";
import { csrfFetch } from "@/lib/csrf";

// ── Widget Types ────────────────────────────────────────────────────────

export type WidgetType =
  | "stats"
  | "recent-activity"
  | "deadlines"
  | "quick-actions"
  | "dream-cycle"
  | "getting-started";

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "w-stats", type: "stats", visible: true, order: 0 },
  { id: "w-getting-started", type: "getting-started", visible: true, order: 1 },
  { id: "w-recent-activity", type: "recent-activity", visible: true, order: 2 },
  { id: "w-quick-actions", type: "quick-actions", visible: true, order: 3 },
  { id: "w-deadlines", type: "deadlines", visible: true, order: 4 },
  { id: "w-dream-cycle", type: "dream-cycle", visible: true, order: 5 },
];

const WIDGET_LABELS: Record<WidgetType, { de: string; en: string }> = {
  "stats": { de: "Statistiken", en: "Statistics" },
  "recent-activity": { de: "Letzte Aktivitäten", en: "Recent Activity" },
  "deadlines": { de: "Fristen", en: "Deadlines" },
  "quick-actions": { de: "Schnellaktionen", en: "Quick Actions" },
  "dream-cycle": { de: "Dream Cycle", en: "Dream Cycle" },
  "getting-started": { de: "Erste Schritte", en: "Getting Started" },
};

const WIDGET_ICONS: Record<WidgetType, typeof BookOpen> = {
  "stats": TrendingUp,
  "recent-activity": Activity,
  "deadlines": CalendarClock,
  "quick-actions": Zap,
  "dream-cycle": Zap,
  "getting-started": CheckCircle2,
};

// ── Widget Preference Store ─────────────────────────────────────────────

const STORAGE_KEY = "subsumio-dashboard-widgets";

function loadWidgets(): WidgetConfig[] {
  if (typeof window === "undefined") return DEFAULT_WIDGETS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDGETS;
    const parsed = JSON.parse(raw) as WidgetConfig[];
    // Merge with defaults to handle new widgets
    const known = new Set(parsed.map((w) => w.type));
    const merged = [...parsed];
    for (const def of DEFAULT_WIDGETS) {
      if (!known.has(def.type)) {
        merged.push(def);
      }
    }
    return merged.sort((a, b) => a.order - b.order);
  } catch {
    return DEFAULT_WIDGETS;
  }
}

function saveWidgets(widgets: WidgetConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    // Also persist to server (fire-and-forget)
    void csrfFetch("/api/dashboard/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgets }),
    });
  } catch {}
}

// ── Widget Components ───────────────────────────────────────────────────

function StatsWidget() {
  const statsQuery = useBrainStats();
  const statutesQuery = usePages({ limit: 1, type: "statute" });
  const { t } = useLang();
  const stats = (statsQuery.data ?? null) as BrainStats | null;
  const loading = statsQuery.isLoading;

  const statutesCount = (() => {
    if (statutesQuery.isLoading) return null;
    const pages = statutesQuery.data;
    if (Array.isArray(pages) && pages.length > 0) return stats?.total_pages ?? pages.length;
    return 0;
  })();

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const cards = [
    { label: t("dashboard.stat_pages"), value: stats ? fmt(stats.total_pages) : "—", icon: BookOpen },
    { label: t("dashboard.stat_entities"), value: stats ? fmt(stats.total_entities) : "—", icon: Users },
    { label: t("dashboard.stat_edges"), value: stats ? fmt(stats.total_edges) : "—", icon: Link2 },
    { label: t("dashboard.stat_queries"), value: stats ? fmt(stats.total_queries) : "—", icon: MessageSquare },
    { label: t("dashboard.stat_statutes"), value: statutesCount !== null ? String(statutesCount) : "—", icon: Scale },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5">
      {cards.map((stat, i) => (
        <StatsCard
          key={stat.label}
          title={stat.label}
          value={loading ? "—" : stat.value}
          icon={stat.icon}
          loading={loading}
          className="widget-fade-in"
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
}

function RecentActivityWidget() {
  const recentQuery = useRecentQueries(5);
  const { t } = useLang();
  const recent = ((recentQuery.data ?? []) as RecentQuery[]);
  const loading = recentQuery.isLoading;

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("dashboard.time_now");
    if (mins < 60) return `${t("dashboard.time_min")} ${mins} ${t("dashboard.time_min_suffix")}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${t("dashboard.time_min")} ${hours} ${t("dashboard.time_hour_suffix")}`;
    const days = Math.floor(hours / 24);
    return `${t("dashboard.time_day")} ${days} ${days !== 1 ? t("dashboard.time_days_suffix") : t("dashboard.time_day_suffix")}`;
  }

  return (
    <Card>
      <div className="p-5 pb-4 border-b border-[color:var(--ds-border)]">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-[color:var(--ds-text-muted)]" />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)] tracking-tight">{t("dashboard.recent_activity")}</h2>
        </div>
      </div>
      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-[color:var(--ds-surface-2)] animate-pulse" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[color:var(--ds-surface-2)] flex items-center justify-center mx-auto mb-4">
            <FileText size={24} className="text-[color:var(--ds-border-strong)]" />
          </div>
          <p className="text-sm font-medium text-[color:var(--ds-text)]">{t("dashboard.no_activity")}</p>
          <p className="text-xs text-[color:var(--ds-text-muted)] mt-1.5">{t("dashboard.no_activity_desc")}</p>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--ds-border)]">
          {recent.map((q) => (
            <div key={q.id} className="px-5 py-4 hover:bg-[color:var(--ds-hover)] transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[color:var(--ds-surface-2)] flex items-center justify-center shrink-0 mt-0.5">
                  <MessageSquare size={14} className="text-[color:var(--ds-text-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[color:var(--ds-text)] truncate leading-snug">{q.query}</p>
                  <p className="text-xs text-[color:var(--ds-text-subtle)] mt-1">{timeAgo(q.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function DeadlinesWidget() {
  const deadlinesQuery = usePages({ limit: 10, type: "legal_deadline" });
  const { t } = useLang();
  const deadlines = (() => {
    const pages = deadlinesQuery.data;
    if (!Array.isArray(pages)) return [];
    const now = new Date();
    return (pages as unknown as Record<string, unknown>[])
      .map((p) => {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        const dueStr = (fm.due_date || fm.date || p.created_at) as string | undefined;
        if (!dueStr) return null;
        const due = new Date(dueStr);
        const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: String(p.slug ?? p.id ?? ""),
          title: String(p.title ?? t("dashboard.unnamed_deadline")),
          dueDate: dueStr,
          daysLeft,
          overdue: daysLeft < 0 && fm.status !== "done",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);
  })();

  return (
    <Card>
      <div className="p-5 pb-4 border-b border-[color:var(--ds-border)]">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-[color:var(--ds-text-muted)]" />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)] tracking-tight">{t("dashboard.upcoming_deadlines")}</h2>
        </div>
      </div>
      {deadlines.length === 0 ? (
        <div className="p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[color:var(--ds-surface-2)] flex items-center justify-center mx-auto mb-3">
            <CalendarClock size={20} className="text-[color:var(--ds-border-strong)]" />
          </div>
          <p className="text-xs text-[color:var(--ds-text-muted)]">{t("dashboard.no_deadlines")}</p>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--ds-border)]">
          {deadlines.map((d) => (
            <div key={d.id} className="px-5 py-3.5 hover:bg-[color:var(--ds-hover)] transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-[color:var(--ds-text)] truncate flex-1 leading-snug">{d.title}</p>
                <span className={`text-xs font-semibold shrink-0 tabular-nums ${d.overdue ? "text-red-600" : d.daysLeft <= 3 ? "text-amber-600" : "text-[color:var(--ds-text-muted)]"}`}>
                  {d.overdue ? `${Math.abs(d.daysLeft)}T ${t("dashboard.overdue_short")}` : d.daysLeft === 0 ? t("dashboard.today") : `${d.daysLeft}T`}
                </span>
              </div>
              <p className="text-xs text-[color:var(--ds-text-subtle)] mt-1">
                {new Date(d.dueDate).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function QuickActionsWidget() {
  const { t } = useLang();
  const actions = [
    { href: "/dashboard/upload", icon: FileText, label: t("dashboard.qa_upload"), desc: t("dashboard.qa_upload_desc") },
    { href: "/dashboard/query", icon: MessageSquare, label: t("dashboard.qa_query"), desc: t("dashboard.qa_query_desc") },
    { href: "/dashboard/brain", icon: BookOpen, label: t("dashboard.qa_explore"), desc: t("dashboard.qa_explore_desc") },
  ];
  return (
    <Card>
      <div className="p-5 pb-4 border-b border-[color:var(--ds-border)]">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)] tracking-tight">{t("dashboard.quick_actions")}</h2>
      </div>
      <div className="p-3 space-y-1">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <a key={a.href} href={a.href} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[color:var(--ds-hover)] transition-colors group">
              <div className="w-9 h-9 rounded-xl brand-soft border brand-border flex items-center justify-center shrink-0">
                <Icon size={16} className="brand-text" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[color:var(--ds-text)] group-hover:brand-text transition-colors">{a.label}</p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">{a.desc}</p>
              </div>
            </a>
          );
        })}
      </div>
    </Card>
  );
}

function DreamCycleWidget() {
  const { t } = useLang();
  return (
    <Card className="border-amber-500/20">
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <Zap size={14} className="text-amber-600" />
          </div>
          <span className="text-sm font-semibold text-[color:var(--ds-text)] tracking-tight">{t("dashboard.dream_cycle")}</span>
          <Badge variant="warning" className="ml-auto text-xs">{t("dashboard.dream_inactive")}</Badge>
        </div>
        <p className="text-xs text-[color:var(--ds-text-muted)] leading-relaxed mb-4">{t("dashboard.dream_desc")}</p>
        <a href="/dashboard/settings">
          <Button variant="outline" size="sm" className="w-full brand-text border-[color:var(--ds-border-strong)] hover:brand-soft">
            {t("dashboard.dream_setup")}
          </Button>
        </a>
      </div>
    </Card>
  );
}

function GettingStartedWidget() {
  const statsQuery = useBrainStats();
  const { t } = useLang();
  const stats = (statsQuery.data ?? null) as BrainStats | null;
  const steps = [
    { step: 1, done: (stats?.total_pages ?? 0) > 0, label: t("dashboard.gs_upload"), desc: t("dashboard.gs_upload_desc"), href: "/dashboard/upload" },
    { step: 2, done: (stats?.total_queries ?? 0) > 0, label: t("dashboard.gs_query"), desc: t("dashboard.gs_query_desc"), href: "/dashboard/query" },
    { step: 3, done: (stats?.total_edges ?? 0) > 0, label: t("dashboard.gs_graph"), desc: t("dashboard.gs_graph_desc"), href: "/dashboard/graph" },
  ];
  return (
    <Card>
      <div className="p-5 pb-4 border-b border-[color:var(--ds-border)]">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="brand-text" />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)] tracking-tight">{t("dashboard.getting_started")}</h2>
        </div>
      </div>
      <div className="divide-y divide-[color:var(--ds-border)]">
        {steps.map((item) => (
          <div key={item.step} className="flex items-center gap-4 p-4 hover:bg-[color:var(--ds-hover)] transition-colors group">
            <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 text-xs font-mono font-bold ${
              item.done
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                : "bg-[color:var(--ds-surface-2)] border-[color:var(--ds-border-strong)] text-[color:var(--ds-text-muted)]"
            }`}>
              {item.done ? "✓" : item.step}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${item.done ? "line-through text-[color:var(--ds-text-muted)]" : "text-[color:var(--ds-text)]"}`}>{item.label}</p>
              <p className="text-xs text-[color:var(--ds-text-muted)] mt-0.5">{item.desc}</p>
            </div>
            <a href={item.href} className="text-xs brand-text hover:underline shrink-0">{item.done ? "" : "→"}</a>
          </div>
        ))}
      </div>
    </Card>
  );
}

const WIDGET_COMPONENTS: Record<WidgetType, () => React.ReactElement> = {
  "stats": StatsWidget,
  "recent-activity": RecentActivityWidget,
  "deadlines": DeadlinesWidget,
  "quick-actions": QuickActionsWidget,
  "dream-cycle": DreamCycleWidget,
  "getting-started": GettingStartedWidget,
};

// ── Main Widget Dashboard ───────────────────────────────────────────────

export function WidgetDashboard() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [editMode, setEditMode] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const { t } = useLang();

  useEffect(() => {
    setWidgets(loadWidgets());
    setLoaded(true);
  }, []);

  const updateWidgets = useCallback((next: WidgetConfig[]) => {
    setWidgets(next);
    saveWidgets(next);
  }, []);

  const toggleVisible = (id: string) => {
    updateWidgets(widgets.map((w) => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;
    const next = [...widgets];
    const draggedItem = next[dragItem.current];
    next.splice(dragItem.current, 1);
    next.splice(dragOverItem.current, 0, draggedItem);
    const reordered = next.map((w, i) => ({ ...w, order: i }));
    updateWidgets(reordered);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const resetToDefault = () => {
    updateWidgets(DEFAULT_WIDGETS);
  };

  if (!loaded) return null;

  const visibleWidgets = widgets.filter((w) => w.visible);
  const hiddenWidgets = widgets.filter((w) => !w.visible);

  return (
    <div className="space-y-6">
      {/* Edit mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={editMode ? "glow" : "ghost"}
            size="sm"
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? <><Eye size={14} /> Ansicht beenden</> : <><Plus size={14} /> Widgets anpassen</>}
          </Button>
          {editMode && (
            <Button variant="ghost" size="sm" onClick={resetToDefault}>
              Zurücksetzen
            </Button>
          )}
        </div>
      </div>

      {/* Hidden widgets panel (edit mode) */}
      {editMode && hiddenWidgets.length > 0 && (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface-2)] p-4">
          <p className="text-xs font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-3">Ausgeblendete Widgets</p>
          <div className="flex flex-wrap gap-2">
            {hiddenWidgets.map((w) => {
              const Icon = WIDGET_ICONS[w.type];
              return (
                <button
                  key={w.id}
                  onClick={() => toggleVisible(w.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:brand-soft hover:brand-border transition-all text-xs font-medium text-[color:var(--ds-text-muted)] hover:brand-text"
                >
                  <Icon size={14} />
                  {WIDGET_LABELS[w.type].de}
                  <Plus size={12} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Widget grid */}
      <div className="space-y-6">
        {/* Stats widget is always full-width */}
        {visibleWidgets.find((w) => w.type === "stats") && (
          <div className="relative">
            {editMode && (
              <div className="absolute -top-3 right-0 z-10 flex items-center gap-1">
                <button
                  onClick={() => toggleVisible("w-stats")}
                  className="w-6 h-6 rounded-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] flex items-center justify-center text-[color:var(--ds-text-muted)] hover:text-red-500 transition-colors"
                  title="Widget ausblenden"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <StatsWidget />
          </div>
        )}

        {/* Two-column grid for other widgets */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleWidgets
            .filter((w) => w.type !== "stats")
            .map((w, _index) => {
              const WidgetComp = WIDGET_COMPONENTS[w.type];
              const realIndex = widgets.indexOf(w);
              return (
                <div
                  key={w.id}
                  className={`relative ${editMode ? "cursor-move" : ""}`}
                  draggable={editMode}
                  onDragStart={() => handleDragStart(realIndex)}
                  onDragEnter={() => handleDragEnter(realIndex)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  {editMode && (
                    <div className="absolute -top-2 left-2 z-10 flex items-center gap-1">
                      <div className="w-6 h-6 rounded-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] flex items-center justify-center text-[color:var(--ds-text-muted)] cursor-grab active:cursor-grabbing">
                        <GripVertical size={12} />
                      </div>
                      <button
                        onClick={() => toggleVisible(w.id)}
                        className="w-6 h-6 rounded-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] flex items-center justify-center text-[color:var(--ds-text-muted)] hover:text-red-500 transition-colors"
                        title="Widget ausblenden"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <WidgetComp />
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
