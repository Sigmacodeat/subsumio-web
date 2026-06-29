"use client";

import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  Clock,
  Inbox,
  MessageSquare,
  PenTool,
  Scale,
  Sparkles,
  TrendingUp,
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
  | "activity-feed";

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
