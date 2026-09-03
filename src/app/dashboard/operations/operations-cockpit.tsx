"use client";

import { useMemo, useState, useCallback, Suspense, useRef, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowDownUp,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  FileSearch,
  Filter,
  Focus,
  Inbox,
  Loader2,
  RotateCw,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { useRealtime, ensureRealtime } from "@/lib/realtime";
import {
  attentionScore,
  isDueTodayOrOverdue,
  isOverdue,
  type WorkItem as WorkItemType,
} from "@/lib/work-items";

interface WorkItem extends Omit<WorkItemType, "kind" | "priority"> {
  kind: string;
  priority: string;
  error?: string;
}

interface OperationsData {
  items: WorkItem[];
  counts?: Record<string, number>;
  generatedAt: string;
}

type KindFilter =
  | "all"
  | "communication"
  | "document_review"
  | "case_analysis"
  | "approval"
  | "deadline"
  | "appointment";
type PriorityFilter = "all" | "critical" | "high" | "medium" | "low";
type DueFilter = "all" | "today";
type FocusMode = "off" | "top3";
type SortMode = "priority" | "due" | "created" | "attention";

const VALID_KINDS: KindFilter[] = [
  "all",
  "communication",
  "document_review",
  "case_analysis",
  "approval",
  "deadline",
  "appointment",
];
const VALID_PRIORITIES: PriorityFilter[] = ["all", "critical", "high", "medium", "low"];
const VALID_SORTS: SortMode[] = ["priority", "due", "created", "attention"];

async function loadOperations(): Promise<OperationsData> {
  const response = await fetch("/api/dashboard/operations?limit=500", {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Operationsdaten konnten nicht geladen werden.");
  const payload = (await response.json()) as { data?: OperationsData };
  return payload.data ?? { items: [], counts: {}, generatedAt: new Date().toISOString() };
}

const KIND_META: Record<
  string,
  { label: string; labelEn: string; icon: typeof Inbox; href: string }
> = {
  communication: {
    label: "Kommunikation",
    labelEn: "Communication",
    icon: Inbox,
    href: "/dashboard/communications",
  },
  document_review: {
    label: "Dokumentprüfung",
    labelEn: "Document review",
    icon: FileSearch,
    href: "/dashboard/review-queue",
  },
  case_analysis: {
    label: "Fallanalyse",
    labelEn: "Case analysis",
    icon: Scale,
    href: "/dashboard/cases",
  },
  approval: {
    label: "Freigabe",
    labelEn: "Approval",
    icon: ShieldCheck,
    href: "/dashboard/approvals",
  },
  deadline: { label: "Frist", labelEn: "Deadline", icon: Clock, href: "/dashboard/deadlines" },
  appointment: {
    label: "Termin",
    labelEn: "Appointment",
    icon: Clock,
    href: "/dashboard/calendar",
  },
};

const PRIORITY_STYLE: Record<string, string> = {
  critical:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  high: "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  medium:
    "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  low: "border-[color:var(--ds-border-hover)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]",
};

function statusLabel(
  stage: string | undefined,
  currentLayer: number | undefined,
  lang: string
): string {
  if (!stage) return "—";
  const labels: Record<string, string> = {
    received: "Empfangen",
    stored: "Gespeichert",
    ocr: "OCR/Extraktion",
    embedding: "Embedding",
    embedded: "Copilot-bereit",
    running: currentLayer
      ? lang === "en"
        ? `Analyzing (step ${currentLayer}/7)`
        : `Wird analysiert (Schritt ${currentLayer}/7)`
      : lang === "en"
        ? "Running"
        : "Läuft",
    awaiting_review: "Anwaltliche Prüfung",
    needs_human_review: "Menschliche Prüfung",
    completed: "Abgeschlossen",
    completed_with_warnings: "Mit Warnungen",
    revised: "Überarbeitet",
    failed: "Fehler",
    processing: "In Verarbeitung",
    pending: "Ausstehend",
    open: "Offen",
    scheduled: "Geplant",
  };
  return labels[stage] ?? stage;
}

function itemHref(item: WorkItem): string {
  const meta = KIND_META[item.kind];
  if (!meta) return "/dashboard";
  if (item.kind === "case_analysis" && item.caseSlug) return `/dashboard/cases/${item.caseSlug}`;
  return meta.href;
}

function formatDate(iso: string | undefined, lang: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function OperationsCockpitPageWrapper({
  initialData,
}: {
  initialData?: OperationsData;
}) {
  return (
    <Suspense fallback={<OperationsLoadingSkeleton />}>
      <OperationsCockpitPage initialData={initialData} />
    </Suspense>
  );
}

function OperationsLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

function OperationsCockpitPage({ initialData }: { initialData?: OperationsData }) {
  const { lang } = useLang();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL-driven filter state
  const kindFilter = useMemo<KindFilter>(() => {
    const v = searchParams.get("kind");
    return v && VALID_KINDS.includes(v as KindFilter) ? (v as KindFilter) : "all";
  }, [searchParams]);

  const priorityFilter = useMemo<PriorityFilter>(() => {
    const v = searchParams.get("priority");
    return v && VALID_PRIORITIES.includes(v as PriorityFilter) ? (v as PriorityFilter) : "all";
  }, [searchParams]);

  const showFailedOnly = searchParams.get("failed") === "1";
  const dueFilter = useMemo<DueFilter>(() => {
    return searchParams.get("due") === "today" ? "today" : "all";
  }, [searchParams]);
  const focusMode = useMemo<FocusMode>(() => {
    return searchParams.get("focus") === "top3" ? "top3" : "off";
  }, [searchParams]);

  const sortMode = useMemo<SortMode>(() => {
    const v = searchParams.get("sort");
    return v && VALID_SORTS.includes(v as SortMode) ? (v as SortMode) : "priority";
  }, [searchParams]);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ slug: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // URL update helper — merges new params into existing ones
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      router.replace(`/dashboard/operations?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setKindFilter = useCallback(
    (k: KindFilter) => updateParams({ kind: k === "all" ? null : k }),
    [updateParams]
  );
  const setPriorityFilter = useCallback(
    (p: PriorityFilter) => updateParams({ priority: p === "all" ? null : p }),
    [updateParams]
  );
  const setShowFailedOnly = useCallback(
    (v: boolean) => updateParams({ failed: v ? "1" : null }),
    [updateParams]
  );
  const setDueFilter = useCallback(
    (d: DueFilter) => updateParams({ due: d === "today" ? "today" : null }),
    [updateParams]
  );
  const setFocusMode = useCallback(
    (f: FocusMode) => updateParams({ focus: f === "top3" ? "top3" : null }),
    [updateParams]
  );
  const setSortMode = useCallback(
    (s: SortMode) => updateParams({ sort: s === "priority" ? null : s }),
    [updateParams]
  );

  const query = useQuery({
    queryKey: ["kanzlei-operations-full"],
    queryFn: loadOperations,
    staleTime: 30_000,
    refetchInterval: 60_000,
    initialData,
  });

  // SSE realtime: invalidate on relevant events
  ensureRealtime();
  useRealtime("case.updated", () => {
    void queryClient.invalidateQueries({ queryKey: ["kanzlei-operations-full"] });
  });
  useRealtime("document.uploaded", () => {
    void queryClient.invalidateQueries({ queryKey: ["kanzlei-operations-full"] });
  });
  useRealtime("inbox.triage", () => {
    void queryClient.invalidateQueries({ queryKey: ["kanzlei-operations-full"] });
  });
  useRealtime("workflow.completed", () => {
    void queryClient.invalidateQueries({ queryKey: ["kanzlei-operations-full"] });
  });
  useRealtime("workflow.failed", () => {
    void queryClient.invalidateQueries({ queryKey: ["kanzlei-operations-full"] });
  });

  const allItems = useMemo(() => query.data?.items ?? [], [query.data]);
  const counts = query.data?.counts ?? {};

  const QUERY_KEY = ["kanzlei-operations-full"];

  const approvalMutation = useMutation({
    mutationKey: ["operations-approval"],
    mutationFn: async (params: {
      actionSlug: string;
      decision: "approved" | "rejected";
      reason?: string;
    }) => {
      const res = await csrfFetch("/api/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: params.actionSlug,
          decision: params.decision,
          execute: params.decision === "approved",
          ...(params.reason ? { reject_reason: params.reason } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onMutate: async (params) => {
      setBusyAction(params.actionSlug);
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<OperationsData>(QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<OperationsData>(QUERY_KEY, {
          ...previous,
          items: previous.items.filter((i) => i.id !== params.actionSlug),
        });
      }
      return { previous };
    },
    onError: (err, params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      addToast({
        type: "error",
        title: lang === "en" ? "Action failed" : "Aktion fehlgeschlagen",
        description: err instanceof Error ? err.message : "Unknown error",
        duration: 5000,
      });
    },
    onSettled: (_data, _err, _params) => {
      setBusyAction(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["kanzlei-operations"] });
    },
    onSuccess: (_data, params) => {
      addToast({
        type: params.decision === "approved" ? "success" : "info",
        title:
          params.decision === "approved"
            ? lang === "en"
              ? "Approved"
              : "Freigegeben"
            : lang === "en"
              ? "Rejected"
              : "Abgelehnt",
        description: params.actionSlug,
        duration: 3000,
      });
    },
  });

  const decideApproval = useCallback(
    (actionSlug: string, decision: "approved" | "rejected") => {
      if (decision === "rejected") {
        // Open reject dialog — reason is required
        const item = allItems.find((i) => i.id === actionSlug);
        setRejectDialog({ slug: actionSlug, title: item?.title ?? actionSlug });
        setRejectReason("");
      } else {
        approvalMutation.mutate({ actionSlug, decision: "approved" });
      }
    },
    [approvalMutation, allItems]
  );

  const confirmReject = useCallback(() => {
    if (!rejectDialog) return;
    if (!rejectReason.trim()) {
      addToast({
        type: "error",
        title: lang === "en" ? "Reason required" : "Begründung erforderlich",
        description:
          lang === "en"
            ? "Please provide a rejection reason."
            : "Bitte geben Sie einen Ablehnungsgrund an.",
        duration: 3000,
      });
      return;
    }
    approvalMutation.mutate({
      actionSlug: rejectDialog.slug,
      decision: "rejected",
      reason: rejectReason.trim(),
    });
    setRejectDialog(null);
    setRejectReason("");
  }, [rejectDialog, rejectReason, approvalMutation, addToast, lang]);

  // Retry mutation for failed documents/pipelines
  const retryMutation = useMutation({
    mutationKey: ["operations-retry"],
    mutationFn: async (params: { slug: string }) => {
      const res = await csrfFetch("/api/documents/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: params.slug }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onMutate: async (params) => {
      setBusyAction(params.slug);
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<OperationsData>(QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<OperationsData>(QUERY_KEY, {
          ...previous,
          items: previous.items.map((i) =>
            i.id === params.slug
              ? { ...i, pipelineStage: "received" as const, status: "processing", error: undefined }
              : i
          ),
        });
      }
      return { previous };
    },
    onError: (err, _params, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      addToast({
        type: "error",
        title: lang === "en" ? "Retry failed" : "Retry fehlgeschlagen",
        description: err instanceof Error ? err.message : "Unknown error",
        duration: 5000,
      });
    },
    onSettled: (_data, _err, _params) => {
      setBusyAction(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["kanzlei-operations"] });
    },
    onSuccess: (_data, params) => {
      addToast({
        type: "success",
        title: lang === "en" ? "Retry started" : "Retry gestartet",
        description: params.slug,
        duration: 3000,
      });
    },
  });

  const filtered = useMemo(() => {
    let result = allItems;
    if (kindFilter !== "all") result = result.filter((i) => i.kind === kindFilter);
    if (priorityFilter !== "all") result = result.filter((i) => i.priority === priorityFilter);
    if (showFailedOnly)
      result = result.filter((i) => i.pipelineStage === "failed" || i.status === "failed");
    if (dueFilter === "today") result = result.filter((i) => isDueTodayOrOverdue(i));
    // Sort
    const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sortMode === "due") {
      result = [...result].sort((a, b) => {
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return a.dueAt.localeCompare(b.dueAt);
      });
    } else if (sortMode === "created") {
      result = [...result].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sortMode === "attention") {
      result = [...result].sort((a, b) => attentionScore(b) - attentionScore(a));
    } else {
      // priority (default): by priority rank, then by due date
      result = [...result].sort((a, b) => {
        const pr = (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3);
        if (pr !== 0) return pr;
        if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
        return 0;
      });
    }
    // Focus Mode: limit to top-3 by attention score (sorted desc)
    if (focusMode === "top3") {
      result = [...result].sort((a, b) => attentionScore(b) - attentionScore(a)).slice(0, 3);
    }
    return result;
  }, [allItems, kindFilter, priorityFilter, showFailedOnly, dueFilter, sortMode, focusMode]);

  // Count items before focus-mode slicing (for "show all" CTA)
  const preFocusCount = useMemo(() => {
    let result = allItems;
    if (kindFilter !== "all") result = result.filter((i) => i.kind === kindFilter);
    if (priorityFilter !== "all") result = result.filter((i) => i.priority === priorityFilter);
    if (showFailedOnly)
      result = result.filter((i) => i.pipelineStage === "failed" || i.status === "failed");
    if (dueFilter === "today") result = result.filter((i) => isDueTodayOrOverdue(i));
    return result.length;
  }, [allItems, kindFilter, priorityFilter, showFailedOnly, dueFilter]);

  const shouldVirtualize = filtered.length > 50;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? filtered.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
    enabled: shouldVirtualize,
  });

  // Bulk selection helpers
  const toggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastSelectedId) {
          // Range select: select all items between lastSelectedId and id
          const ids = filtered.map((i) => i.id);
          const startIdx = ids.indexOf(lastSelectedId);
          const endIdx = ids.indexOf(id);
          if (startIdx !== -1 && endIdx !== -1) {
            const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            for (let i = from; i <= to; i++) {
              // Only select approval items (bulk actions only apply to approvals)
              if (filtered[i]?.kind === "approval") next.add(ids[i]!);
            }
          }
        } else {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        return next;
      });
      setLastSelectedId(id);
    },
    [lastSelectedId, filtered]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const selectedApprovals = useMemo(
    () => filtered.filter((i) => i.kind === "approval" && selectedIds.has(i.id)),
    [filtered, selectedIds]
  );

  // Bulk approve/reject
  const bulkApprove = useCallback(() => {
    for (const item of selectedApprovals) {
      approvalMutation.mutate({ actionSlug: item.id, decision: "approved" });
    }
    clearSelection();
  }, [selectedApprovals, approvalMutation, clearSelection]);

  const bulkReject = useCallback(() => {
    // For bulk reject, use a generic reason
    for (const item of selectedApprovals) {
      approvalMutation.mutate({
        actionSlug: item.id,
        decision: "rejected",
        reason: lang === "en" ? "Bulk rejection" : "Sammelablehnung",
      });
    }
    clearSelection();
  }, [selectedApprovals, approvalMutation, clearSelection, lang]);

  // Keyboard navigation
  useEffect(() => {
    if (rejectDialog) return; // Don't interfere with dialog
    const handler = (e: KeyboardEvent) => {
      // Only handle when focus is in the list area, not in inputs/selects
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA"
      )
        return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && activeIndex >= 0 && activeIndex < filtered.length) {
        e.preventDefault();
        const item = filtered[activeIndex];
        if (item) window.location.href = itemHref(item);
      } else if (e.key === "a" && activeIndex >= 0 && activeIndex < filtered.length) {
        const item = filtered[activeIndex];
        if (item?.kind === "approval") {
          e.preventDefault();
          decideApproval(item.id, "approved");
        }
      } else if (e.key === "r" && activeIndex >= 0 && activeIndex < filtered.length) {
        const item = filtered[activeIndex];
        if (item?.kind === "approval") {
          e.preventDefault();
          decideApproval(item.id, "rejected");
        }
      } else if (e.key === "Escape") {
        if (selectedIds.size > 0) {
          e.preventDefault();
          clearSelection();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, activeIndex, rejectDialog, selectedIds, decideApproval, clearSelection]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0) return;
    if (shouldVirtualize) {
      rowVirtualizer.scrollToIndex(activeIndex, { align: "auto" });
    } else if (listRef.current) {
      const items = listRef.current.querySelectorAll<HTMLLIElement>("[data-item-index]");
      const el = items[activeIndex];
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeIndex, shouldVirtualize, rowVirtualizer]);

  const kindTabs: { key: KindFilter; label: string; count: number }[] = [
    { key: "all", label: lang === "en" ? "All" : "Alle", count: allItems.length },
    {
      key: "communication",
      label: KIND_META.communication.label,
      count: counts.communication ?? 0,
    },
    {
      key: "document_review",
      label: KIND_META.document_review.label,
      count: counts.document_review ?? 0,
    },
    {
      key: "case_analysis",
      label: KIND_META.case_analysis.label,
      count: counts.case_analysis ?? 0,
    },
    { key: "approval", label: KIND_META.approval.label, count: counts.approval ?? 0 },
    { key: "deadline", label: KIND_META.deadline.label, count: counts.deadline ?? 0 },
    { key: "appointment", label: KIND_META.appointment.label, count: counts.appointment ?? 0 },
  ];

  const priorityOptions: { key: PriorityFilter; label: string }[] = [
    { key: "all", label: lang === "en" ? "All priorities" : "Alle Prioritäten" },
    { key: "critical", label: lang === "en" ? "Critical" : "Kritisch" },
    { key: "high", label: lang === "en" ? "High" : "Hoch" },
    { key: "medium", label: lang === "en" ? "Medium" : "Mittel" },
    { key: "low", label: lang === "en" ? "Low" : "Niedrig" },
  ];

  const activeFilterCount =
    (kindFilter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (showFailedOnly ? 1 : 0) +
    (dueFilter !== "all" ? 1 : 0) +
    (focusMode !== "off" ? 1 : 0) +
    (sortMode !== "priority" ? 1 : 0);

  function clearFilters() {
    router.replace("/dashboard/operations", { scroll: false });
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={lang === "en" ? "Operations Cockpit" : "Kanzlei-Operations-Cockpit"}
          breadcrumbs={[
            { label: lang === "en" ? "Dashboard" : "Übersicht", href: "/dashboard" },
            { label: lang === "en" ? "Operations" : "Operationen" },
          ]}
        />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title={lang === "en" ? "Operations Cockpit" : "Kanzlei-Operations-Cockpit"}
          breadcrumbs={[
            { label: lang === "en" ? "Dashboard" : "Übersicht", href: "/dashboard" },
            { label: lang === "en" ? "Operations" : "Operationen" },
          ]}
        />
        <div
          className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4 text-sm text-[color:var(--ds-danger-text)]"
          role="alert"
        >
          <AlertTriangle size={18} className="shrink-0" />
          <span>
            {lang === "en"
              ? "Operations data could not be loaded."
              : "Operationsdaten konnten nicht geladen werden."}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void query.refetch()}
            className="ml-auto h-auto p-0 underline"
          >
            {lang === "en" ? "Retry" : "Erneut versuchen"}
          </Button>
        </div>
      </div>
    );
  }

  const failedCount = allItems.filter(
    (i) => i.pipelineStage === "failed" || i.status === "failed"
  ).length;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={lang === "en" ? "Operations Cockpit" : "Kanzlei-Operations-Cockpit"}
        description={
          lang === "en"
            ? "All open work items across your matters — communications, documents, case analysis, approvals, deadlines, appointments."
            : "Alle offenen Vorgänge über Ihre Akten — Kommunikation, Dokumente, Fallanalyse, Freigaben, Fristen, Termine."
        }
        breadcrumbs={[
          { label: lang === "en" ? "Dashboard" : "Übersicht", href: "/dashboard" },
          { label: lang === "en" ? "Operations" : "Operationen" },
        ]}
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat
          icon={Activity}
          label={lang === "en" ? "Total open" : "Offene Vorgänge"}
          value={allItems.length}
          tone="default"
        />
        <SummaryStat
          icon={AlertTriangle}
          label={lang === "en" ? "Critical" : "Kritisch"}
          value={counts.critical ?? 0}
          tone="danger"
        />
        <SummaryStat
          icon={Clock}
          label={lang === "en" ? "High priority" : "Hohe Priorität"}
          value={counts.high ?? 0}
          tone="warning"
        />
        <SummaryStat
          icon={AlertTriangle}
          label={lang === "en" ? "Failed" : "Fehlgeschlagen"}
          value={failedCount}
          tone={failedCount > 0 ? "danger" : "success"}
        />
      </div>

      {/* Kind filter tabs */}
      <div
        className="flex flex-wrap gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1.5"
        role="tablist"
        aria-label={lang === "en" ? "Filter by type" : "Nach Typ filtern"}
      >
        {kindTabs.map((tab) => {
          const isActive = kindFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setKindFilter(tab.key)}
              className={
                isActive
                  ? "inline-flex items-center gap-1.5 rounded-md bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-sm font-medium text-[color:var(--ds-text)] transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
                  : "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
              }
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  isActive
                    ? "bg-[color:var(--brand-primary)] text-white"
                    : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-subtle)]"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Secondary filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
          <Filter size={13} />
          {lang === "en" ? "Filters:" : "Filter:"}
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
          className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text)] transition-colors hover:border-[color:var(--ds-border-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
          aria-label={lang === "en" ? "Priority filter" : "Prioritäts-Filter"}
        >
          {priorityOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setDueFilter(dueFilter === "today" ? "all" : "today")}
          aria-pressed={dueFilter === "today"}
          className={
            dueFilter === "today"
              ? "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--brand-primary)] bg-[color:var(--brand-glow)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--brand-primary)] transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
              : "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:border-[color:var(--ds-border-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
          }
        >
          <CalendarClock size={12} />
          {lang === "en" ? "Today" : "Heute"}
          {dueFilter === "today" && filtered.length > 0 && (
            <span className="ml-0.5 rounded-full bg-[color:var(--brand-primary)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--brand-primary)] tabular-nums">
              {filtered.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setFocusMode(focusMode === "top3" ? "off" : "top3")}
          aria-pressed={focusMode === "top3"}
          className={
            focusMode === "top3"
              ? "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--ds-warning-text)] transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
              : "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:border-[color:var(--ds-border-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
          }
          title={
            lang === "en"
              ? "Show only the 3 most urgent items"
              : "Nur die 3 dringendsten Vorgänge anzeigen"
          }
        >
          <Focus size={12} />
          {lang === "en" ? "Focus" : "Fokus"}
        </button>
        <button
          type="button"
          onClick={() => setShowFailedOnly(!showFailedOnly)}
          aria-pressed={showFailedOnly}
          className={
            showFailedOnly
              ? "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--ds-danger-text)] transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
              : "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:border-[color:var(--ds-border-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
          }
        >
          <AlertTriangle size={12} />
          {lang === "en" ? "Failed only" : "Nur fehlgeschlagene"}
        </button>
        {/* Sort selector */}
        <div className="flex items-center gap-1.5">
          <ArrowDownUp size={12} className="text-[color:var(--ds-text-muted)]" />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text)] transition-colors hover:border-[color:var(--ds-border-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
            aria-label={lang === "en" ? "Sort by" : "Sortieren nach"}
          >
            <option value="priority">{lang === "en" ? "Priority" : "Priorität"}</option>
            <option value="attention">
              {lang === "en" ? "Needs attention" : "Needs Attention"}
            </option>
            <option value="due">{lang === "en" ? "Due date" : "Frist"}</option>
            <option value="created">{lang === "en" ? "Created" : "Erstellt"}</option>
          </select>
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
          >
            <X size={12} />
            {lang === "en" ? "Clear filters" : "Filter zurücksetzen"}
            <span className="text-[10px]">({activeFilterCount})</span>
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedApprovals.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5 px-4 py-2.5">
          <span className="text-sm font-medium text-[color:var(--ds-text)]">
            {selectedApprovals.length} {lang === "en" ? "selected" : "ausgewählt"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={bulkApprove}
              disabled={approvalMutation.isPending}
              className="gap-1.5 border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)] hover:bg-[color:var(--ds-success-bg)]/80"
            >
              <Check size={14} />
              {lang === "en" ? "Bulk approve" : "Sammelfreigabe"}
            </Button>
            <Button
              size="sm"
              onClick={bulkReject}
              disabled={approvalMutation.isPending}
              className="gap-1.5 border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)]/80"
            >
              <X size={14} />
              {lang === "en" ? "Bulk reject" : "Sammelablehnung"}
            </Button>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
          >
            {lang === "en" ? "Clear selection" : "Auswahl aufheben"}
          </button>
        </div>
      )}

      {/* Work items list */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[color:var(--ds-border)]">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>
              {focusMode === "top3" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Focus size={14} className="text-[color:var(--ds-warning-text)]" />
                  {lang === "en" ? "Focus — Top 3" : "Fokus — Top 3"}
                </span>
              ) : (
                <span>
                  {lang === "en" ? "Work items" : "Vorgänge"}
                  <span className="ml-2 text-[color:var(--ds-text-muted)]">
                    ({filtered.length})
                  </span>
                </span>
              )}
            </span>
            {query.data?.generatedAt && (
              <span className="text-[10px] font-normal text-[color:var(--ds-text-subtle)]">
                {lang === "en" ? "Updated" : "Aktualisiert"}{" "}
                {formatDate(query.data.generatedAt, lang)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <CheckCircle2 size={32} className="text-[color:var(--ds-success-text)]" />
              <div>
                <p className="text-sm font-medium text-[color:var(--ds-text)]">
                  {dueFilter === "today" && allItems.length > 0
                    ? lang === "en"
                      ? "Nothing due today."
                      : "Nichts fällig heute."
                    : allItems.length === 0
                      ? lang === "en"
                        ? "No open work items."
                        : "Keine offenen Vorgänge."
                      : lang === "en"
                        ? "No items match your filters."
                        : "Keine Vorgänge entsprechen den Filtern."}
                </p>
                <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  {dueFilter === "today" && allItems.length > 0
                    ? lang === "en"
                      ? "A quiet day — enjoy it."
                      : "Ein ruhiger Tag — geniessen Sie ihn."
                    : allItems.length === 0
                      ? lang === "en"
                        ? "All caught up — nothing to do right now."
                        : "Alles erledigt — aktuell nichts zu tun."
                      : lang === "en"
                        ? "Try adjusting or clearing your filters."
                        : "Filter anpassen oder zurücksetzen."}
                </p>
              </div>
              {dueFilter === "today" && allItems.length > 0 ? (
                <Button variant="outline" size="sm" onClick={() => setDueFilter("all")}>
                  {lang === "en" ? "Show all items" : "Alle Vorgänge ansehen"}
                </Button>
              ) : activeFilterCount > 0 ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  {lang === "en" ? "Clear filters" : "Filter zurücksetzen"}
                </Button>
              ) : null}
            </div>
          ) : shouldVirtualize ? (
            <div ref={scrollRef} className="max-h-[600px] overflow-y-auto">
              <ul
                className="relative"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                aria-label={lang === "en" ? "Work items" : "Vorgänge"}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = filtered[virtualRow.index]!;
                  const meta = KIND_META[item.kind];
                  const Icon = meta?.icon ?? Activity;
                  const isFailed = item.pipelineStage === "failed" || item.status === "failed";
                  const isApproval = item.kind === "approval";
                  const isBusy = busyAction === item.id;
                  const isSelected = selectedIds.has(item.id);
                  const overdue = isOverdue(item);
                  const isActive = activeIndex === virtualRow.index;
                  return (
                    <li
                      key={item.id}
                      data-item-index={virtualRow.index}
                      data-selected={isSelected || undefined}
                      className={`absolute left-0 w-full border-b border-[color:var(--ds-border)] ${isActive ? "bg-[color:var(--brand-primary)]/5" : ""} ${isSelected ? "bg-[color:var(--brand-primary)]/5" : ""}`}
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-[color:var(--ds-surface-hover)]">
                        {isApproval && (
                          <Checkbox
                            checked={isSelected}
                            onClick={(e) =>
                              toggleSelect(item.id, (e as unknown as MouseEvent).shiftKey)
                            }
                            onCheckedChange={() => {}}
                            aria-label={lang === "en" ? "Select item" : "Item auswählen"}
                            className="shrink-0"
                          />
                        )}
                        <Link
                          href={itemHref(item)}
                          className="group flex min-w-0 flex-1 items-center gap-3 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
                        >
                          <Icon
                            size={16}
                            className={`shrink-0 ${isFailed ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--brand-primary)]"}`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                              {item.title}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
                              {item.caseSlug && (
                                <>
                                  <span className="truncate">{item.caseSlug}</span>
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              <span>{meta?.label ?? item.kind}</span>
                              {item.dueAt && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span
                                    className={
                                      overdue
                                        ? "inline-flex items-center gap-0.5 font-semibold text-[color:var(--ds-danger-text)]"
                                        : "text-[color:var(--ds-warning-text)]"
                                    }
                                  >
                                    {overdue && (
                                      <AlertTriangle
                                        size={10}
                                        className="motion-reduce:animate-none"
                                        aria-hidden="true"
                                      />
                                    )}
                                    {formatDate(item.dueAt, lang)}
                                  </span>
                                </>
                              )}
                              {isFailed && item.error && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate text-[color:var(--ds-danger-text)]">
                                    {item.error}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <Badge
                            variant="default"
                            className={`shrink-0 text-[10px] ${PRIORITY_STYLE[item.priority] ?? PRIORITY_STYLE.low}`}
                          >
                            {item.priority}
                          </Badge>
                        </Link>
                        {isApproval && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => decideApproval(item.id, "approved")}
                              aria-label={lang === "en" ? "Approve" : "Freigeben"}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)] transition-all hover:scale-105 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none active:scale-95 disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Check size={14} />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => decideApproval(item.id, "rejected")}
                              aria-label={lang === "en" ? "Reject" : "Ablehnen"}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] transition-all hover:scale-105 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none active:scale-95 disabled:opacity-50"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                        {isFailed && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              retryMutation.mutate({ slug: item.id });
                            }}
                            aria-label={lang === "en" ? "Retry" : "Erneut versuchen"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)] transition-all hover:scale-105 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none active:scale-95 disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RotateCw size={14} />
                            )}
                          </button>
                        )}
                        <ArrowRight
                          size={14}
                          className="shrink-0 text-[color:var(--ds-text-muted)] transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <ul
              ref={listRef}
              className="divide-y divide-[color:var(--ds-border)]"
              aria-label={lang === "en" ? "Work items" : "Vorgänge"}
            >
              {filtered.map((item, index) => {
                const meta = KIND_META[item.kind];
                const Icon = meta?.icon ?? Activity;
                const isFailed = item.pipelineStage === "failed" || item.status === "failed";
                const isApproval = item.kind === "approval";
                const isBusy = busyAction === item.id;
                const isSelected = selectedIds.has(item.id);
                const overdue = isOverdue(item);
                const isActive = activeIndex === index;
                return (
                  <li
                    key={item.id}
                    data-item-index={index}
                    data-selected={isSelected || undefined}
                    className={isActive ? "bg-[color:var(--brand-primary)]/5" : undefined}
                  >
                    <div
                      className={`group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-[color:var(--ds-surface-hover)] ${isSelected ? "bg-[color:var(--brand-primary)]/5" : ""}`}
                    >
                      {isApproval && (
                        <Checkbox
                          checked={isSelected}
                          onClick={(e) =>
                            toggleSelect(item.id, (e as unknown as MouseEvent).shiftKey)
                          }
                          onCheckedChange={() => {}}
                          aria-label={lang === "en" ? "Select item" : "Item auswählen"}
                          className="shrink-0"
                        />
                      )}
                      <Link
                        href={itemHref(item)}
                        className="group flex min-w-0 flex-1 items-center gap-3 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
                      >
                        <Icon
                          size={16}
                          className={`shrink-0 ${isFailed ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--brand-primary)]"}`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                              {item.title}
                            </span>
                            {item.caseSlug && (
                              <span className="hidden shrink-0 font-mono text-[10px] text-[color:var(--ds-text-subtle)] sm:inline">
                                {item.caseSlug}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[color:var(--ds-text-muted)]">
                            <span className="truncate">{meta?.label ?? item.kind}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {statusLabel(
                                item.pipelineStage ?? item.status,
                                item.currentLayer,
                                lang
                              )}
                            </span>
                            {item.dueAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    overdue
                                      ? "inline-flex items-center gap-0.5 font-semibold text-[color:var(--ds-danger-text)]"
                                      : "inline-flex items-center gap-0.5 text-[color:var(--ds-warning-text)]"
                                  }
                                >
                                  {overdue ? (
                                    <AlertTriangle
                                      size={10}
                                      className="motion-reduce:animate-none"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Clock size={10} aria-hidden="true" />
                                  )}
                                  {formatDate(item.dueAt, lang)}
                                </span>
                              </>
                            )}
                            {isFailed && item.error && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate text-[color:var(--ds-danger-text)]">
                                  {item.error}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="default"
                          className={`shrink-0 text-[10px] ${PRIORITY_STYLE[item.priority] ?? PRIORITY_STYLE.low}`}
                        >
                          {item.priority}
                        </Badge>
                      </Link>
                      {isApproval && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => decideApproval(item.id, "approved")}
                            aria-label={lang === "en" ? "Approve" : "Freigeben"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)] transition-all hover:scale-105 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none active:scale-95 disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Check size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => decideApproval(item.id, "rejected")}
                            aria-label={lang === "en" ? "Reject" : "Ablehnen"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] transition-all hover:scale-105 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none active:scale-95 disabled:opacity-50"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                      {isFailed && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            retryMutation.mutate({ slug: item.id });
                          }}
                          aria-label={lang === "en" ? "Retry" : "Erneut versuchen"}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)] transition-all hover:scale-105 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none active:scale-95 disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RotateCw size={14} />
                          )}
                        </button>
                      )}
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-[color:var(--ds-text-muted)] transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {focusMode === "top3" && preFocusCount > filtered.length && (
            <div className="border-t border-[color:var(--ds-border)] px-4 py-3 text-center">
              <button
                type="button"
                onClick={() => setFocusMode("off")}
                className="rounded-md px-2 py-1 text-xs font-medium text-[color:var(--brand-primary)] transition-colors hover:text-[color:var(--brand-primary-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
              >
                {lang === "en"
                  ? `Show all ${preFocusCount} items`
                  : `Alle ${preFocusCount} Vorgänge ansehen`}
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject reason dialog */}
      <Dialog
        open={rejectDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectDialog(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <X size={16} className="text-[color:var(--ds-danger-text)]" />
              {lang === "en" ? "Reject approval" : "Freigabe ablehnen"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {lang === "en"
                ? "Please provide a reason for rejecting this approval. The reason will be audit-logged."
                : "Bitte geben Sie einen Grund für die Ablehnung an. Der Grund wird audit-protokolliert."}
            </p>
            {rejectDialog && (
              <p className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-xs text-[color:var(--ds-text)]">
                {rejectDialog.title}
              </p>
            )}
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={
                lang === "en"
                  ? "Rejection reason (required)..."
                  : "Ablehnungsgrund (erforderlich)..."
              }
              className="min-h-[80px] resize-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  confirmReject();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRejectDialog(null);
                setRejectReason("");
              }}
            >
              {lang === "en" ? "Cancel" : "Abbrechen"}
            </Button>
            <Button
              size="sm"
              onClick={confirmReject}
              disabled={!rejectReason.trim() || approvalMutation.isPending}
              className="gap-1.5 border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)]/80"
            >
              {approvalMutation.isPending && busyAction === rejectDialog?.slug ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <X size={14} />
              )}
              {lang === "en" ? "Reject" : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  tone: "default" | "danger" | "warning" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "text-[color:var(--ds-danger-text)]"
      : tone === "warning"
        ? "text-[color:var(--ds-warning-text)]"
        : tone === "success"
          ? "text-[color:var(--ds-success-text)]"
          : "text-[color:var(--ds-text)]";
  const iconToneClass =
    tone === "danger"
      ? "text-[color:var(--ds-danger-text)]"
      : tone === "warning"
        ? "text-[color:var(--ds-warning-text)]"
        : tone === "success"
          ? "text-[color:var(--ds-success-text)]"
          : "text-[color:var(--brand-primary)]";
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center justify-between">
        <Icon size={16} className={iconToneClass} aria-hidden="true" />
        <span className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</span>
      </div>
      <p className="mt-2 text-xs font-medium text-[color:var(--ds-text-muted)]">{label}</p>
    </div>
  );
}
