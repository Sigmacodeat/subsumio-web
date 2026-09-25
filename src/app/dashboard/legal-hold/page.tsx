"use client";

import { useState, useCallback } from "react";
import { Shield, ShieldOff, Lock, Unlock, Loader2, Search, AlertTriangle, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { STATUS_LABELS_DE, type CaseStatus } from "@/lib/case-status";

const statusLabel = (status: string) =>
  STATUS_LABELS_DE[status as CaseStatus] ?? (status === "active" ? "Aktiv" : status);

interface CasePage {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
}

interface CaseWithHold {
  slug: string;
  title: string;
  status: string;
  legalHold: boolean;
  reason: string;
  setAt: string;
  setBy: string;
}

/** Every matter of the firm — the hold overview must not stop at the newest few hundred. */
const LEGAL_HOLD_CASES_MAX = 10_000;

async function fetchCases(): Promise<CaseWithHold[]> {
  const pages = await api.brain.listAllPages({ type: "legal_case", max: LEGAL_HOLD_CASES_MAX });
  return (pages as CasePage[]).map((p) => {
    const fm = p.frontmatter ?? {};
    return {
      slug: p.slug,
      title: p.title,
      status: String(fm.status ?? "active"),
      legalHold: fm.legal_hold === true,
      reason: String(fm.legal_hold_reason ?? ""),
      setAt: String(fm.legal_hold_set_at ?? ""),
      setBy: String(fm.legal_hold_set_by ?? ""),
    };
  });
}

export default function LegalHoldPage() {
  const { addToast } = useToast();
  const { lang, t } = useLang();
  const isEn = lang === "en";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "on_hold">("on_hold");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [toggling, setToggling] = useState(false);

  const {
    data: cases,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["legal-hold-cases"],
    queryFn: fetchCases,
    staleTime: 30_000,
  });

  const filtered = (cases ?? []).filter((c) => {
    if (filter === "on_hold" && !c.legalHold) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.title.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
    }
    return true;
  });

  const onHoldCount = (cases ?? []).filter((c) => c.legalHold).length;

  const toggleHold = useCallback(
    async (caseSlug: string, caseTitle: string, hold: boolean, reason: string) => {
      setToggling(true);
      try {
        const res = await csrfFetch("/api/cases/legal-hold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            case_slug: caseSlug,
            legal_hold: hold,
            reason: reason || undefined,
          }),
        });
        if (!res.ok) {
          // apiError: { error: "<deutscher Text>", code }
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "");
        }
        addToast({
          type: "success",
          title: hold
            ? isEn
              ? "Legal hold activated"
              : "Aufbewahrungssperre gesetzt"
            : isEn
              ? "Legal hold released"
              : "Aufbewahrungssperre aufgehoben",
          description: caseTitle,
          duration: 3000,
        });
        setSelectedSlug(null);
        setHoldReason("");
        void queryClient.invalidateQueries({ queryKey: ["legal-hold-cases"] });
        void queryClient.invalidateQueries({ queryKey: ["legal-holds"] });
      } catch (err) {
        const serverText = err instanceof Error ? err.message : "";
        addToast({
          type: "error",
          title: isEn ? "Operation failed" : "Vorgang fehlgeschlagen",
          description: isEn
            ? "Please try again."
            : serverText || "Die Sperre wurde nicht geändert. Bitte versuchen Sie es erneut.",
          duration: 5000,
        });
      } finally {
        setToggling(false);
      }
    },
    [addToast, isEn, queryClient]
  );

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={isEn ? "Legal hold" : "Aufbewahrungssperre"}
        description={
          isEn
            ? "Manage litigation holds across all matters. Matters under hold cannot be deleted, archived, or modified."
            : "Aufbewahrungssperren für alle Akten verwalten. Gesperrte Akten können nicht gelöscht, archiviert oder geändert werden."
        }
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: isEn ? "Legal hold" : "Aufbewahrungssperre" },
        ]}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[color:var(--ds-text-muted)]" />
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              {isEn ? "Total matters" : "Akten gesamt"}
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-text)] tabular-nums">
            {cases?.length ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-2">
            <Lock
              size={16}
              className={
                onHoldCount > 0
                  ? "text-[color:var(--ds-danger-text)]"
                  : "text-[color:var(--ds-text-muted)]"
              }
            />
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              {isEn ? "On hold" : "Gesperrt"}
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-text)] tabular-nums">
            {onHoldCount}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-2">
            <Unlock size={16} className="text-[color:var(--ds-text-muted)]" />
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              {isEn ? "Not on hold" : "Ohne Sperre"}
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-text)] tabular-nums">
            {(cases?.length ?? 0) - onHoldCount}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isEn ? "Search matters…" : "Akten durchsuchen …"}
            aria-label={isEn ? "Search matters" : "Akten durchsuchen"}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter("on_hold")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none",
              filter === "on_hold"
                ? "border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            )}
            aria-pressed={filter === "on_hold"}
          >
            {isEn ? "On hold" : "Gesperrt"}
          </button>
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none",
              filter === "all"
                ? "border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            )}
            aria-pressed={filter === "all"}
          >
            {isEn ? "All" : "Alle"}
          </button>
        </div>
      </div>

      {/* Case list */}
      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title={isEn ? "Matters could not be loaded" : "Akten konnten nicht geladen werden"}
          description={
            isEn
              ? "The hold status is unknown until the list loads."
              : "Solange die Liste nicht geladen ist, ist unklar, welche Akten gesperrt sind."
          }
          actionLabel={isEn ? "Try again" : "Erneut versuchen"}
          onAction={() => void refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldOff}
          title={
            filter === "on_hold"
              ? isEn
                ? "No matters under legal hold"
                : "Keine Akte ist gesperrt"
              : isEn
                ? "No matters found"
                : "Keine Akten gefunden"
          }
          actionLabel={
            filter === "on_hold" ? (isEn ? "Show all matters" : "Alle Akten anzeigen") : undefined
          }
          onAction={filter === "on_hold" ? () => setFilter("all") : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div
              key={c.slug}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[color:var(--ds-surface)] p-4",
                c.legalHold
                  ? "border-[color:var(--ds-danger-border)]"
                  : "border-[color:var(--ds-border)]"
              )}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  {c.legalHold ? (
                    <Lock size={14} className="shrink-0 text-[color:var(--ds-danger-text)]" />
                  ) : (
                    <Unlock size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                  )}
                  <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                    {c.title}
                  </span>
                  <Badge variant="default" className="shrink-0 text-xs">
                    {statusLabel(c.status)}
                  </Badge>
                  {c.legalHold && (
                    <Badge className="shrink-0 border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]">
                      {isEn ? "On hold" : "Gesperrt"}
                    </Badge>
                  )}
                </div>
                {c.legalHold && (c.reason || c.setAt) && (
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-[color:var(--ds-text-muted)]">
                    {c.reason && <span className="truncate">{c.reason}</span>}
                    {c.setAt && (
                      <span className="tabular-nums">
                        {c.reason ? "· " : ""}
                        {isEn ? "since" : "seit"} {formatDate(c.setAt)}
                        {c.setBy && ` · ${c.setBy}`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedSlug === c.slug ? (
                  <>
                    <Input
                      value={holdReason}
                      onChange={(e) => setHoldReason(e.target.value)}
                      placeholder={
                        c.legalHold
                          ? isEn
                            ? "Reason for release (required)…"
                            : "Grund der Aufhebung (Pflicht) …"
                          : isEn
                            ? "Reason for hold…"
                            : "Grund der Sperre …"
                      }
                      aria-label={
                        c.legalHold
                          ? isEn
                            ? "Reason for release"
                            : "Grund der Aufhebung"
                          : isEn
                            ? "Reason for hold"
                            : "Grund der Sperre"
                      }
                      className="w-48 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      className="text-xs whitespace-nowrap"
                      // Lifting a hold needs a documented reason (checked server-side too).
                      disabled={toggling || (c.legalHold && holdReason.trim().length < 10)}
                      onClick={() => toggleHold(c.slug, c.title, !c.legalHold, holdReason)}
                    >
                      {toggling ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : c.legalHold ? (
                        <Unlock size={12} />
                      ) : (
                        <Lock size={12} />
                      )}
                      {c.legalHold
                        ? isEn
                          ? "Release"
                          : "Aufheben"
                        : isEn
                          ? "Activate"
                          : "Sperre setzen"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs"
                      aria-label={isEn ? "Cancel" : "Abbrechen"}
                      onClick={() => {
                        setSelectedSlug(null);
                        setHoldReason("");
                      }}
                    >
                      <X size={12} />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className={cn(
                      "text-xs whitespace-nowrap",
                      c.legalHold
                        ? "border border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)]"
                        : "border border-[color:var(--ds-border)]"
                    )}
                    onClick={() => {
                      setSelectedSlug(c.slug);
                      setHoldReason(c.reason);
                    }}
                  >
                    {c.legalHold ? <Unlock size={12} /> : <Lock size={12} />}
                    {c.legalHold
                      ? isEn
                        ? "Release"
                        : "Aufheben"
                      : isEn
                        ? "Place Hold"
                        : "Sperre setzen"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Warning notice */}
      <div className="flex items-start gap-2 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]" />
        <div className="text-xs text-[color:var(--ds-warning-text)]">
          <p>
            {isEn
              ? "The automatic retention clean-up skips matters under hold. Every change to a hold is recorded in the audit log."
              : "Die automatische Löschung nach Ablauf der Aufbewahrungsfrist überspringt gesperrte Akten. Jede Änderung einer Sperre wird im Prüfprotokoll festgehalten."}
          </p>
        </div>
      </div>
    </div>
  );
}
