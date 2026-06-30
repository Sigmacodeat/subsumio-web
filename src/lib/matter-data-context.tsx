"use client";

/**
 * MatterDataProvider — React Context that fetches and shares case data
 * across all matter sub-pages. Eliminates redundant fetches and provides
 * a single source of truth for the active matter.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { recordMatterVisit } from "@/lib/use-recent-matters";
import { caseFrontmatter } from "@/lib/legal-types";
import type { DeadlineEntry, TaskEntry, TimeEntry, ExpenseEntry } from "@/lib/legal-types";
import type { BrainPage } from "@/lib/types";

// ── Tab Definitions ───────────────────────────────────────────────────

export const MATTER_TABS = [
  "overview",
  "documents",
  "deadlines",
  "strategy",
  "activity",
  "evidence",
  "billing",
  "communications",
  "contacts",
  "ai",
] as const;

export type MatterTab = (typeof MATTER_TABS)[number];

export const PRIMARY_TABS: MatterTab[] = [
  "overview",
  "documents",
  "deadlines",
  "strategy",
  "evidence",
];
export const SECONDARY_TABS: MatterTab[] = [
  "activity",
  "billing",
  "communications",
  "contacts",
  "ai",
];

// ── Types ─────────────────────────────────────────────────────────────

export interface MatterVitals {
  deadlineCount: number;
  openDeadlineCount: number;
  nextDeadlineDate?: string;
  taskCount: number;
  openTaskCount: number;
  documentCount: number;
  timeEntryCount: number;
  totalHours: number;
  expenseTotal: number;
  evidenceCount: number;
}

export interface MatterData {
  slug: string;
  title: string;
  caseNumber: string;
  status: string;
  legalArea: string;
  subArea?: string;
  priority: string;
  opponentName?: string;
  opponentSlugs?: string[];
  ownLawyerName?: string;
  ownLawyerSlug?: string;
  courtName?: string;
  courtSlug?: string;
  clientName?: string;
  clientSlug?: string;
  facts: string;
  claims: string[];
  defenses: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  portalEnabled: boolean;
  archivedAt?: string;
  archivedBy?: string;
  version: number;
  rawPage: BrainPage;
  vitals: MatterVitals;
  phase?: string;
}

interface MatterDataContextValue {
  matter: MatterData | null;
  loading: boolean;
  error: string | null;
  activeTab: MatterTab;
  caseSlug: string;
  refresh: () => Promise<void>;
  updateMatter: (updates: Partial<MatterData>) => void;
}

const MatterDataContext = createContext<MatterDataContextValue | null>(null);

// ── Slug Parsing ──────────────────────────────────────────────────────

/**
 * Parses the [...slug] catch-all params to determine:
 * - caseSlug: the full case slug (without tab suffix)
 * - activeTab: which sub-page tab is active
 *
 * Known tab names are stripped from the end of the slug array.
 * If the last segment is NOT a known tab, the entire slug is the case slug
 * and the active tab defaults to "overview".
 */
export function parseMatterSlug(slugSegments: string[]): {
  caseSlug: string;
  activeTab: MatterTab;
} {
  if (!slugSegments || slugSegments.length === 0) {
    return { caseSlug: "", activeTab: "overview" };
  }

  const lastSegment = slugSegments[slugSegments.length - 1];
  const isKnownTab = MATTER_TABS.includes(lastSegment as MatterTab);

  if (isKnownTab && slugSegments.length > 1) {
    const caseSegments = slugSegments.slice(0, -1);
    return {
      caseSlug: caseSegments.join("/"),
      activeTab: lastSegment as MatterTab,
    };
  }

  return {
    caseSlug: slugSegments.join("/"),
    activeTab: "overview",
  };
}

// ── Data Fetching ─────────────────────────────────────────────────────

function parseMatterData(page: BrainPage): MatterData {
  const fm = caseFrontmatter(page);
  const deadlines = fm.deadlines || [];
  const tasks = fm.tasks || [];
  const documents = fm.documents || [];
  const timeEntries = fm.time_entries || [];
  const expenses = fm.expenses || [];
  const evidence = fm.evidence || [];

  const openDeadlines = deadlines.filter(
    (d: DeadlineEntry) => d.status !== "done" && d.status !== "completed"
  );
  const openTasks = tasks.filter((t: TaskEntry) => !t.done);
  const nextDeadline = openDeadlines
    .map((d: DeadlineEntry) => d.due_date || d.date || "")
    .filter(Boolean)
    .sort()[0];

  const totalHours = timeEntries.reduce(
    (sum: number, t: TimeEntry) => sum + (typeof t.minutes === "number" ? t.minutes / 60 : 0),
    0
  );
  const expenseTotal = expenses.reduce(
    (sum: number, e: ExpenseEntry) => sum + (typeof e.amount === "number" ? e.amount : 0),
    0
  );

  return {
    slug: page.slug,
    title: page.title,
    caseNumber: fm.case_number || page.slug,
    status: fm.status || "open",
    legalArea: fm.legal_area || "",
    subArea: fm.sub_area || undefined,
    priority: fm.priority || "medium",
    opponentName: fm.opponent_name || undefined,
    opponentSlugs: fm.opponent_slugs || undefined,
    ownLawyerName: fm.own_lawyer_name || undefined,
    ownLawyerSlug: fm.own_lawyer_slug || undefined,
    courtName: fm.court_name || undefined,
    courtSlug: fm.court_slug || undefined,
    clientName: fm.client_name || undefined,
    clientSlug: fm.client_slug || undefined,
    facts: page.content || "",
    claims: fm.claims || [],
    defenses: fm.defenses || [],
    tags: fm.tags || [],
    createdAt: page.created_at,
    updatedAt: page.updated_at,
    portalEnabled: fm.portal_enabled || false,
    archivedAt: typeof fm.archived_at === "string" ? fm.archived_at : undefined,
    archivedBy: typeof fm.archived_by === "string" ? fm.archived_by : undefined,
    version: (fm.version as number) || 0,
    rawPage: page,
    phase:
      typeof (fm as Record<string, unknown>).phase === "string"
        ? ((fm as Record<string, unknown>).phase as string)
        : undefined,
    vitals: {
      deadlineCount: deadlines.length,
      openDeadlineCount: openDeadlines.length,
      nextDeadlineDate: nextDeadline || undefined,
      taskCount: tasks.length,
      openTaskCount: openTasks.length,
      documentCount: documents.length,
      timeEntryCount: timeEntries.length,
      totalHours: Math.round(totalHours * 100) / 100,
      expenseTotal: Math.round(expenseTotal * 100) / 100,
      evidenceCount: evidence.length,
    },
  };
}

// ── Provider ──────────────────────────────────────────────────────────

export function MatterDataProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const slugSegments = (params?.slug as string[]) || [];
  const { caseSlug, activeTab } = parseMatterSlug(slugSegments);

  const [matter, setMatter] = useState<MatterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const fetchMatter = useCallback(async () => {
    if (!caseSlug) return;
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const encodedSlug = caseSlug.split("/").map(encodeURIComponent).join("/");
      const page = await api.brain.getPage(encodedSlug);
      if (fetchId !== fetchIdRef.current) return; // stale fetch
      if (!page) {
        setError("Akte nicht gefunden");
        setMatter(null);
        return;
      }
      setMatter(parseMatterData(page));
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : "Fehler beim Laden der Akte");
      setMatter(null);
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, [caseSlug]);

  useEffect(() => {
    fetchMatter();
  }, [fetchMatter]);

  // Record visit for recent matters tracking (with title for switcher display)
  useEffect(() => {
    if (caseSlug) recordMatterVisit(caseSlug, matter?.title);
  }, [caseSlug, matter?.title]);

  const updateMatter = useCallback((updates: Partial<MatterData>) => {
    setMatter((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const value: MatterDataContextValue = {
    matter,
    loading,
    error,
    activeTab,
    caseSlug,
    refresh: fetchMatter,
    updateMatter,
  };

  return <MatterDataContext.Provider value={value}>{children}</MatterDataContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useMatterData(): MatterDataContextValue {
  const ctx = useContext(MatterDataContext);
  if (!ctx) {
    throw new Error("useMatterData must be used within a MatterDataProvider");
  }
  return ctx;
}

// Safe version — returns null when used outside a MatterDataProvider (e.g. sidebar)
export function useMatterDataSafe(): MatterDataContextValue | null {
  return useContext(MatterDataContext);
}

// ── Tab URL Builder ───────────────────────────────────────────────────

/**
 * Builds the URL for a specific matter tab.
 * Uses the case slug + tab name for clean URL-based navigation.
 */
export function matterTabUrl(caseSlug: string, tab: MatterTab): string {
  const encoded = caseSlug.split("/").map(encodeURIComponent).join("/");
  if (tab === "overview") {
    return `/dashboard/cases/${encoded}`;
  }
  return `/dashboard/cases/${encoded}/${tab}`;
}
