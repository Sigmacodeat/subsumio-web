"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  Loader2,
  MessageSquare,
  RotateCcw,
  Settings2,
  Sparkles,
  Search,
} from "lucide-react";
import { StaggerContainer } from "@/components/marketing/motion-system";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { useWidgetPrefs } from "@/lib/hooks/use-widget-prefs";
import { getWidgetMeta, type WidgetId } from "@/lib/widget-registry";
import {
  useKanzleiCockpitData,
  type CockpitData,
  HeutePanel,
  SecondaryStats,
  PinnedMatters,
  DeadlineList,
  InboxList,
  ActiveCasesList,
  AIActivityFeed,
  ActivityFeedWidget,
  QuickActions,
  QueuePanel,
} from "./widget-dashboard";
import dynamic from "next/dynamic";
import { RundownWidget } from "./rundown-widget";
import { InsightsWidget } from "./insights-widget";
import { CrossCaseTimeline } from "./cross-case-timeline";
import { ConfidenceScoreWidget } from "./confidence-score-widget";
import { SilentFailureWidget } from "./silent-failure-widget";
import { DeadlineCheckWidget } from "./deadline-check-widget";
import { MatterBudgetWidget } from "./matter-budget-widget";
import { LegalHoldWidget } from "./legal-hold-widget";
import { useMe } from "@/lib/queries/auth";
import type { WidgetPreset } from "@/lib/widget-registry";

const KanzleiInsights = dynamic(() => import("./kanzlei-insights").then((m) => m.KanzleiInsights), {
  loading: () => (
    <div className="flex h-48 items-center justify-center text-sm text-[color:var(--ds-text-muted)]">
      Laden…
    </div>
  ),
});

function SortableWidget({
  id,
  editMode,
  visible,
  label,
  icon: Icon,
  onToggleVisible,
  children,
}: {
  id: WidgetId;
  editMode: boolean;
  visible: boolean;
  label: string;
  icon: typeof Settings2;
  onToggleVisible: () => void;
  children: React.ReactNode;
}) {
  const { t } = useLang();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  if (!visible && !editMode) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${editMode ? "rounded-lg border border-dashed border-[color:var(--ds-border)] p-1" : ""} ${editMode && !visible ? "opacity-40" : ""}`}
    >
      {editMode && (
        <div className="absolute -top-2.5 left-3 z-10 flex items-center gap-1 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-1.5 py-0.5 shadow-sm">
          <button
            type="button"
            className="flex h-6 w-6 cursor-grab items-center justify-center rounded text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={13} />
          </button>
          <span className="flex items-center gap-1 text-xs font-medium text-[color:var(--ds-text-muted)]">
            <Icon size={11} />
            {label}
          </span>
          <button
            type="button"
            onClick={onToggleVisible}
            className="flex h-6 w-6 items-center justify-center rounded text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            aria-label={visible ? t("widget.hide") : t("widget.show")}
            title={visible ? t("widget.hide") : t("widget.show")}
          >
            {visible ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      )}
      {visible && children}
    </div>
  );
}

function EditModeToolbar({
  onDone,
  onReset,
  search,
  onSearch,
}: {
  onDone: () => void;
  onReset: () => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const { t } = useLang();

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--brand-primary)]/30 bg-[color:var(--ds-surface)] px-4 py-2.5 shadow-md">
      <div className="flex items-center gap-2">
        <Settings2 size={15} className="brand-text" />
        <span className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("widget.customize")}
        </span>
        <span className="hidden text-xs text-[color:var(--ds-text-subtle)] sm:inline">
          {t("widget.drag_hint")}
        </span>
      </div>
      <label className="relative min-w-48 flex-1 sm:max-w-xs">
        <Search
          size={13}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
        />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t("widget.search_placeholder")}
          aria-label={t("widget.search_placeholder")}
          className="w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-1.5 pr-3 pl-8 text-xs text-[color:var(--ds-text)]"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t("widget.reset_confirm"))) onReset();
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
        >
          <RotateCcw size={12} />
          {t("widget.reset")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="brand-solid inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Sparkles size={12} />
          {t("widget.done")}
        </button>
      </div>
    </div>
  );
}

function EmptyDashboard({ onReset }: { onReset: () => void }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-6 py-12 text-center">
      <AlertTriangle size={24} className="text-[color:var(--ds-text-subtle)]" />
      <div>
        <p className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("widget.empty_title")}
        </p>
        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">{t("widget.empty_desc")}</p>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
      >
        <RotateCcw size={12} />
        {t("widget.reset")}
      </button>
    </div>
  );
}

function ReviewGapsPanel({ data }: { data: CockpitData }) {
  const { t } = useLang();
  if (data.unassignedDocs.length === 0 && data.reviewGaps.length === 0) return null;

  return (
    <QueuePanel
      icon={AlertTriangle}
      title={t("cockpit.gaps_title")}
      href="/dashboard/vault"
      action={t("cockpit.open")}
    >
      <div className="space-y-2 p-4">
        {data.unassignedDocs.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <FileText size={15} className="shrink-0 text-[color:var(--ds-warning-text)]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                  {t("cockpit.gaps_unassigned")}
                </p>
                <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
                  {t("cockpit.gaps_unassigned_desc")}
                </p>
              </div>
            </div>
            <Badge variant="warning" className="shrink-0">
              {data.unassignedDocs.length}
            </Badge>
          </div>
        )}
        {data.reviewGaps.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <AlertTriangle size={15} className="shrink-0 text-[color:var(--ds-danger-text)]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                  {t("cockpit.gaps_review")}
                </p>
                <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
                  {t("cockpit.gaps_review_desc")}
                </p>
              </div>
            </div>
            <Badge variant="danger" className="shrink-0">
              {data.reviewGaps.length}
            </Badge>
          </div>
        )}
      </div>
    </QueuePanel>
  );
}

function RecentQueriesPanel({ data }: { data: CockpitData }) {
  const { t, lang } = useLang();
  if (data.recent.length === 0) return null;

  return (
    <QueuePanel
      icon={MessageSquare}
      title={t("cockpit.recent_queries")}
      href="/dashboard/chat"
      action={t("cockpit.recent_queries_all")}
    >
      <div>
        {data.recent.slice(0, 5).map((rq) => (
          <Link
            key={rq.id ?? rq.query}
            href={`/dashboard/chat?q=${encodeURIComponent(rq.query)}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--ds-border)] px-4 py-3 last:border-b-0 hover:bg-[color:var(--ds-hover)]"
          >
            <MessageSquare size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
            <div className="min-w-0">
              <p className="truncate text-sm text-[color:var(--ds-text)]">{rq.query}</p>
              {rq.answer_preview && (
                <p className="truncate text-xs text-[color:var(--ds-text-subtle)]">
                  {rq.answer_preview}
                </p>
              )}
            </div>
            {rq.created_at && (
              <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)]">
                {new Date(rq.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            )}
          </Link>
        ))}
      </div>
    </QueuePanel>
  );
}

export function WidgetBoard() {
  const { t } = useLang();
  const data = useKanzleiCockpitData();
  const meQuery = useMe();
  const preset: WidgetPreset =
    meQuery.data?.user?.industry === "tax"
      ? "tax"
      : ["partner", "admin", "associate"].includes(meQuery.data?.user?.role ?? "")
        ? (meQuery.data?.user?.role as WidgetPreset)
        : "associate";
  const { prefs, loaded, toggleVisible, reorder, reset } = useWidgetPrefs(preset);
  const [editMode, setEditMode] = useState(false);
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"today" | "week" | "all">("all");
  useEffect(() => {
    const saved = localStorage.getItem("subsumio:widget-period");
    if (saved === "today" || saved === "week" || saved === "all") setPeriod(saved);
  }, []);
  const filteredData = useMemo(() => {
    if (period === "all") return data;
    const now = new Date();
    const windowMs = period === "today" ? 86400000 : 7 * 86400000;
    const relevant = (item: {
      due?: Date;
      created_at?: string;
      frontmatter?: Record<string, unknown>;
    }) => {
      const raw =
        item.frontmatter?.due_date ?? item.frontmatter?.date ?? item.created_at ?? item.due;
      const time = raw ? new Date(String(raw)).getTime() : NaN;
      return Number.isFinite(time) && Math.abs(time - now.getTime()) <= windowMs;
    };
    return {
      ...data,
      deadlines: data.deadlines.filter(relevant),
      criticalDeadlines: data.criticalDeadlines.filter(relevant),
      inboxItems: data.inboxItems.filter(relevant),
      pendingReviews: data.pendingReviews.filter(relevant),
    };
  }, [data, period]);

  const showDegraded = data.degraded && !editMode;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const orderedPrefs = useMemo(() => [...prefs].sort((a, b) => a.order - b.order), [prefs]);

  const visiblePrefs = useMemo(
    () =>
      orderedPrefs.filter(
        (p) =>
          (p.visible || editMode) &&
          (!editMode ||
            !search.trim() ||
            [getWidgetMeta(p.id)?.labelKey, getWidgetMeta(p.id)?.descKey].some(
              (key) =>
                key &&
                t(key as DashboardKey)
                  .toLowerCase()
                  .includes(search.trim().toLowerCase())
            ))
      ),
    [orderedPrefs, editMode, search, t]
  );

  const orderedIds = useMemo(() => visiblePrefs.map((p) => p.id), [visiblePrefs]);

  const hasVisible = orderedPrefs.some((p) => p.visible);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as WidgetId);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(active.id as WidgetId);
    const newIndex = orderedIds.indexOf(over.id as WidgetId);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(orderedIds, oldIndex, newIndex);
    reorder(newOrder);
  }

  function renderWidget(id: WidgetId): React.ReactNode {
    switch (id) {
      case "rundown":
        return <RundownWidget />;
      case "heute-panel":
        return (
          <HeutePanel
            loading={data.loading}
            criticalDeadlines={filteredData.criticalDeadlines}
            deadlines={filteredData.deadlines}
            inboxCount={filteredData.inboxItems.length}
            reviewCount={filteredData.pendingReviews.length}
            documentRequestCount={data.openDocumentRequests.length}
            signatureCount={data.pendingSignatures.length}
            gapsCount={data.unassignedDocs.length + data.reviewGaps.length}
            overdueReconciliations={data.overdueReconciliations}
          />
        );
      case "secondary-stats":
        return (
          <SecondaryStats
            loading={data.loading}
            items={[
              {
                label: t("cockpit.stat_cases"),
                value: data.activeCases.length,
                href: "/dashboard/cases",
              },
              {
                label: t("cockpit.stat_inbox"),
                value: data.inboxItems.length,
                href: "/dashboard/intake",
              },
              {
                label: t("cockpit.stat_reviews"),
                value: data.pendingReviews.length,
                href: "/dashboard/review-queue",
              },
              {
                label: t("cockpit.stat_billing"),
                value: data.openInvoices.length,
                href: "/dashboard/invoicing",
              },
            ]}
          />
        );
      case "pinned-matters":
        return <PinnedMatters cases={data.cases} />;
      case "deadlines":
        return <DeadlineList items={filteredData.deadlines} />;
      case "inbox":
        return <InboxList items={filteredData.inboxItems} />;
      case "review-gaps":
        return <ReviewGapsPanel data={data} />;
      case "quick-actions":
        return <QuickActions />;
      case "active-cases":
        return <ActiveCasesList cases={data.activeCases} />;
      case "ai-activity":
        return (
          <AIActivityFeed
            reviews={filteredData.pendingReviews}
            agentActions={filteredData.pendingReviews.filter((p) => p.type === "agent_action")}
          />
        );
      case "kanzlei-insights":
        return <KanzleiInsights />;
      case "recent-queries":
        return <RecentQueriesPanel data={data} />;
      case "activity-feed":
        return <ActivityFeedWidget data={data} />;
      case "cross-timeline":
        return <CrossCaseTimeline data={data} />;
      case "confidence-score":
        return <ConfidenceScoreWidget />;
      case "silent-failures":
        return <SilentFailureWidget />;
      case "deadline-check":
        return <DeadlineCheckWidget />;
      case "matter-budget":
        return <MatterBudgetWidget />;
      case "legal-hold":
        return <LegalHoldWidget />;
      case "insights":
        return <InsightsWidget />;
      default:
        return null;
    }
  }

  const activeMeta = activeId ? getWidgetMeta(activeId) : null;

  return (
    <div data-tour="stats-overview" className="space-y-4">
      {showDegraded && (
        <div className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={17}
              className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[color:var(--ds-warning-text)]">
                {t("cockpit.degraded_title")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                {t("cockpit.degraded_desc")}
              </p>
            </div>
          </div>
        </div>
      )}
      {editMode ? (
        <EditModeToolbar
          onDone={() => setEditMode(false)}
          onReset={() => reset()}
          search={search}
          onSearch={setSearch}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="inline-flex rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-0.5"
            role="group"
            aria-label={t("widget.period_label")}
          >
            {(["today", "week", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                onClick={() => {
                  setPeriod(value);
                  localStorage.setItem("subsumio:widget-period", value);
                }}
                className={`rounded px-2.5 py-1 text-xs ${period === value ? "brand-solid text-white" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
              >
                {t(`widget.period_${value}` as DashboardKey)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          >
            <Settings2 size={13} />
            {t("widget.customize")}
          </button>
        </div>
      )}

      {!loaded ? (
        <div
          className="flex min-h-[200px] items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-5 w-5 animate-spin text-[color:var(--ds-text-subtle)]" />
        </div>
      ) : !hasVisible && !editMode ? (
        <EmptyDashboard onReset={reset} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
            <StaggerContainer className="space-y-4">
              {(() => {
                const rows: Array<{ type: "full" | "grid"; ids: WidgetId[] }> = [];
                let currentGrid: WidgetId[] = [];

                for (const id of orderedIds) {
                  const meta = getWidgetMeta(id);
                  if (!meta) continue;
                  if (meta.fullWidth || editMode) {
                    if (currentGrid.length > 0) {
                      rows.push({ type: "grid", ids: currentGrid });
                      currentGrid = [];
                    }
                    rows.push({ type: "full", ids: [id] });
                  } else {
                    currentGrid.push(id);
                  }
                }
                if (currentGrid.length > 0) {
                  rows.push({ type: "grid", ids: currentGrid });
                }

                return rows.map((row) => {
                  if (row.type === "full" || row.ids.length === 1 || editMode) {
                    return row.ids.map((id) => {
                      const meta = getWidgetMeta(id);
                      if (!meta) return null;
                      const pref = prefs.find((p) => p.id === id);
                      const visible = pref?.visible ?? meta.defaultVisible;
                      return (
                        <SortableWidget
                          key={id}
                          id={id}
                          editMode={editMode}
                          visible={visible}
                          label={t(meta.labelKey as DashboardKey)}
                          icon={meta.icon}
                          onToggleVisible={() => toggleVisible(id)}
                        >
                          {renderWidget(id)}
                        </SortableWidget>
                      );
                    });
                  }
                  return (
                    <div key={row.ids.join("-")} className="grid gap-4 lg:grid-cols-2">
                      {row.ids.map((id) => {
                        const meta = getWidgetMeta(id);
                        if (!meta) return null;
                        const pref = prefs.find((p) => p.id === id);
                        const visible = pref?.visible ?? meta.defaultVisible;
                        return (
                          <SortableWidget
                            key={id}
                            id={id}
                            editMode={editMode}
                            visible={visible}
                            label={t(meta.labelKey as DashboardKey)}
                            icon={meta.icon}
                            onToggleVisible={() => toggleVisible(id)}
                          >
                            {renderWidget(id)}
                          </SortableWidget>
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </StaggerContainer>
          </SortableContext>
          <DragOverlay>
            {activeMeta ? (
              <div className="rounded-lg border border-[color:var(--brand-primary)]/40 bg-[color:var(--ds-surface)] p-3 shadow-lg">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                  <GripVertical size={14} className="text-[color:var(--ds-text-subtle)]" />
                  {(() => {
                    const ActiveIcon = activeMeta.icon;
                    return <ActiveIcon size={14} aria-hidden="true" />;
                  })()}
                  {t(activeMeta.labelKey as DashboardKey)}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
