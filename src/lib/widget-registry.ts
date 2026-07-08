"use client";

import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  CalendarCheck,
  CalendarClock,
  Clock,
  Gauge,
  GitBranch,
  Inbox,
  Lightbulb,
  MessageSquare,
  PenTool,
  Scale,
  Shield,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";

export type WidgetId =
  | "heute-panel"
  | "secondary-stats"
  | "pinned-matters"
  | "deadlines"
  | "inbox"
  | "review-gaps"
  | "quick-actions"
  | "active-cases"
  | "ai-activity"
  | "kanzlei-insights"
  | "recent-queries"
  | "rundown"
  | "activity-feed"
  | "cross-timeline"
  | "confidence-score"
  | "silent-failures"
  | "deadline-check"
  | "matter-budget"
  | "legal-hold"
  | "insights";

export interface WidgetPref {
  id: WidgetId;
  visible: boolean;
  order: number;
}

export interface WidgetMeta {
  id: WidgetId;
  type: string;
  icon: typeof Briefcase;
  labelKey: string;
  descKey: string;
  defaultVisible: boolean;
  defaultOrder: number;
  fullWidth: boolean;
  conditional?: boolean;
}

export type WidgetPreset = "associate" | "partner" | "admin" | "tax";

const PRESET_ORDER: Record<WidgetPreset, WidgetId[]> = {
  associate: ["heute-panel", "deadlines", "inbox", "active-cases", "quick-actions", "rundown", "review-gaps", "ai-activity"],
  partner: ["heute-panel", "kanzlei-insights", "matter-budget", "active-cases", "deadlines", "review-gaps", "confidence-score", "rundown"],
  admin: ["heute-panel", "secondary-stats", "inbox", "review-gaps", "silent-failures", "legal-hold", "activity-feed", "kanzlei-insights"],
  tax: ["heute-panel", "secondary-stats", "deadlines", "inbox", "active-cases", "quick-actions", "activity-feed", "rundown"],
};

export function getWidgetPreset(preset: WidgetPreset): WidgetPref[] {
  const ordered = PRESET_ORDER[preset];
  const remaining = WIDGET_REGISTRY.map((widget) => widget.id).filter((id) => !ordered.includes(id));
  return [...ordered, ...remaining].map((id, order) => ({ id, order, visible: ordered.includes(id) }));
}

export const WIDGET_REGISTRY: WidgetMeta[] = [
  {
    id: "rundown",
    type: "dream-cycle",
    icon: Sparkles,
    labelKey: "widget.rundown",
    descKey: "widget.rundown_desc",
    defaultVisible: true,
    defaultOrder: 0,
    fullWidth: true,
  },
  {
    id: "heute-panel",
    type: "stats",
    icon: CalendarClock,
    labelKey: "widget.heute",
    descKey: "widget.heute_desc",
    defaultVisible: true,
    defaultOrder: 1,
    fullWidth: true,
  },
  {
    id: "secondary-stats",
    type: "stats",
    icon: TrendingUp,
    labelKey: "widget.secondary_stats",
    descKey: "widget.secondary_stats_desc",
    defaultVisible: true,
    defaultOrder: 2,
    fullWidth: true,
  },
  {
    id: "pinned-matters",
    type: "quick-actions",
    icon: Briefcase,
    labelKey: "widget.pinned",
    descKey: "widget.pinned_desc",
    defaultVisible: true,
    defaultOrder: 3,
    fullWidth: true,
  },
  {
    id: "deadlines",
    type: "deadlines",
    icon: CalendarClock,
    labelKey: "widget.deadlines",
    descKey: "widget.deadlines_desc",
    defaultVisible: true,
    defaultOrder: 4,
    fullWidth: false,
  },
  {
    id: "inbox",
    type: "recent-activity",
    icon: Inbox,
    labelKey: "widget.inbox",
    descKey: "widget.inbox_desc",
    defaultVisible: true,
    defaultOrder: 5,
    fullWidth: false,
  },
  {
    id: "review-gaps",
    type: "recent-activity",
    icon: AlertTriangle,
    labelKey: "widget.review_gaps",
    descKey: "widget.review_gaps_desc",
    defaultVisible: true,
    defaultOrder: 6,
    fullWidth: true,
    conditional: true,
  },
  {
    id: "quick-actions",
    type: "quick-actions",
    icon: PenTool,
    labelKey: "widget.quick_actions",
    descKey: "widget.quick_actions_desc",
    defaultVisible: true,
    defaultOrder: 7,
    fullWidth: true,
  },
  {
    id: "active-cases",
    type: "recent-activity",
    icon: Briefcase,
    labelKey: "widget.active_cases",
    descKey: "widget.active_cases_desc",
    defaultVisible: true,
    defaultOrder: 8,
    fullWidth: false,
  },
  {
    id: "ai-activity",
    type: "recent-activity",
    icon: Scale,
    labelKey: "widget.ai_activity",
    descKey: "widget.ai_activity_desc",
    defaultVisible: true,
    defaultOrder: 9,
    fullWidth: false,
  },
  {
    id: "kanzlei-insights",
    type: "stats",
    icon: TrendingUp,
    labelKey: "widget.insights",
    descKey: "widget.insights_desc",
    defaultVisible: true,
    defaultOrder: 10,
    fullWidth: true,
  },
  {
    id: "recent-queries",
    type: "recent-activity",
    icon: MessageSquare,
    labelKey: "widget.recent_queries",
    descKey: "widget.recent_queries_desc",
    defaultVisible: true,
    defaultOrder: 11,
    fullWidth: true,
    conditional: true,
  },
  {
    id: "activity-feed",
    type: "activity-feed",
    icon: Clock,
    labelKey: "widget.activity_feed",
    descKey: "widget.activity_feed_desc",
    defaultVisible: true,
    defaultOrder: 12,
    fullWidth: true,
  },
  {
    id: "cross-timeline",
    type: "timeline",
    icon: GitBranch,
    labelKey: "widget.cross_timeline",
    descKey: "widget.cross_timeline_desc",
    defaultVisible: true,
    defaultOrder: 13,
    fullWidth: true,
  },
  {
    id: "confidence-score",
    type: "confidence",
    icon: Gauge,
    labelKey: "widget.confidence_score",
    descKey: "widget.confidence_score_desc",
    defaultVisible: true,
    defaultOrder: 14,
    fullWidth: false,
  },
  {
    id: "silent-failures",
    type: "failures",
    icon: AlertCircle,
    labelKey: "widget.silent_failures",
    descKey: "widget.silent_failures_desc",
    defaultVisible: true,
    defaultOrder: 15,
    fullWidth: false,
  },
  {
    id: "deadline-check",
    type: "deadline-check",
    icon: CalendarCheck,
    labelKey: "widget.deadline_check",
    descKey: "widget.deadline_check_desc",
    defaultVisible: true,
    defaultOrder: 16,
    fullWidth: false,
  },
  {
    id: "matter-budget",
    type: "budget",
    icon: Wallet,
    labelKey: "widget.matter_budget",
    descKey: "widget.matter_budget_desc",
    defaultVisible: true,
    defaultOrder: 17,
    fullWidth: false,
  },
  {
    id: "legal-hold",
    type: "legal-hold",
    icon: Shield,
    labelKey: "widget.legal_hold",
    descKey: "widget.legal_hold_desc",
    defaultVisible: true,
    defaultOrder: 18,
    fullWidth: false,
  },
  {
    id: "insights",
    type: "insights",
    icon: Lightbulb,
    labelKey: "widget.insights",
    descKey: "widget.insights_desc",
    defaultVisible: false,
    defaultOrder: 19,
    fullWidth: true,
  },
];

export const DEFAULT_WIDGET_PREFS: WidgetPref[] = WIDGET_REGISTRY.map((w) => ({
  id: w.id,
  visible: w.defaultVisible,
  order: w.defaultOrder,
}));

export function getWidgetMeta(id: WidgetId): WidgetMeta | undefined {
  return WIDGET_REGISTRY.find((w) => w.id === id);
}

export function mergeWithDefaults(saved: Partial<WidgetPref>[]): WidgetPref[] {
  const seen = new Set<WidgetId>();
  const merged: WidgetPref[] = [];

  for (const s of saved) {
    const id = s.id as WidgetId;
    if (!id || seen.has(id)) continue;
    const meta = getWidgetMeta(id);
    if (!meta) continue;
    seen.add(id);
    merged.push({
      id,
      visible: s.visible ?? meta.defaultVisible,
      order: s.order ?? meta.defaultOrder,
    });
  }

  for (const meta of WIDGET_REGISTRY) {
    if (seen.has(meta.id)) continue;
    merged.push({
      id: meta.id,
      visible: meta.defaultVisible,
      order: meta.defaultOrder,
    });
  }

  return merged.sort((a, b) => a.order - b.order);
}
