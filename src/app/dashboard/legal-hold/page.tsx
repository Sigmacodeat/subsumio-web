"use client";

import { useState, useCallback } from "react";
import { Shield, ShieldOff, Lock, Unlock, Loader2, Search, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

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

async function fetchCases(): Promise<CaseWithHold[]> {
  const pages = await api.brain.listPages({ type: "legal_case", limit: 500 });
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

  const { data: cases, isLoading } = useQuery({
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
    async (caseSlug: string, hold: boolean, reason: string) => {
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        addToast({
          type: "success",
          title: hold
            ? isEn
              ? "Legal Hold activated"
              : "Legal Hold aktiviert"
            : isEn
              ? "Legal Hold released"
              : "Legal Hold aufgehoben",
          description: caseSlug,
          duration: 3000,
        });
        setSelectedSlug(null);
        setHoldReason("");
        void queryClient.invalidateQueries({ queryKey: ["legal-hold-cases"] });
        void queryClient.invalidateQueries({ queryKey: ["legal-holds"] });
      } catch (err) {
        addToast({
          type: "error",
          title: isEn ? "Operation failed" : "Vorgang fehlgeschlagen",
          description: err instanceof Error ? err.message : "Unknown error",
          duration: 5000,
        });
      } finally {
        setToggling(false);
      }
    },
    [addToast, isEn, queryClient]
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-8">
      <PageHeader
        title={isEn ? "Legal Hold" : "Legal Hold"}
        description={
          isEn
            ? "Manage litigation holds and preservation orders across all matters. Documents under hold cannot be deleted, archived, or modified."
            : "Verwaltung von Beweisbeschlüssen und Aufbewahrungsanordnungen für alle Akten. Dokumente unter Hold können nicht gelöscht, archiviert oder geändert werden."
        }
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Legal Hold" }]}
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
        <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-[color:var(--ds-danger-text)]" />
            <span className="text-xs text-[color:var(--ds-danger-text)]">
              {isEn ? "On hold" : "Unter Hold"}
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-danger-text)] tabular-nums">
            {onHoldCount}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-4">
          <div className="flex items-center gap-2">
            <Unlock size={16} className="text-[color:var(--ds-success-text)]" />
            <span className="text-xs text-[color:var(--ds-success-text)]">
              {isEn ? "Available" : "Verfügbar"}
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-success-text)] tabular-nums">
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
            placeholder={isEn ? "Search matters..." : "Akten durchsuchen..."}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter("on_hold")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === "on_hold"
                ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            )}
          >
            {isEn ? "On Hold" : "Unter Hold"}
          </button>
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === "all"
                ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]"
                : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            )}
          >
            {isEn ? "All" : "Alle"}
          </button>
        </div>
      </div>

      {/* Case list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center">
          <ShieldOff className="mx-auto mb-3 h-12 w-12 text-[color:var(--ds-text-muted)] opacity-40" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            {filter === "on_hold"
              ? isEn
                ? "No matters under legal hold."
                : "Keine Akten unter Legal Hold."
              : isEn
                ? "No matters found."
                : "Keine Akten gefunden."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div
              key={c.slug}
              className={cn(
                "flex items-center justify-between rounded-xl border p-4",
                c.legalHold
                  ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
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
                    {c.status}
                  </Badge>
                  {c.legalHold && (
                    <Badge className="shrink-0 border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-xs text-[color:var(--ds-danger-text)]">
                      {isEn ? "HOLD" : "HOLD"}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                  <span className="truncate">{c.slug}</span>
                  {c.legalHold && c.reason && <span className="truncate">· {c.reason}</span>}
                  {c.legalHold && c.setAt && (
                    <span>
                      · {new Date(c.setAt).toLocaleDateString(isEn ? "en-GB" : "de-DE")}
                      {c.setBy && ` · ${c.setBy}`}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {selectedSlug === c.slug ? (
                  <>
                    <Input
                      value={holdReason}
                      onChange={(e) => setHoldReason(e.target.value)}
                      placeholder={isEn ? "Reason for hold..." : "Grund für Hold..."}
                      className="w-48 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      className="brand-bg text-xs text-white"
                      disabled={toggling}
                      onClick={() => toggleHold(c.slug, !c.legalHold, holdReason)}
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
                          : "Aktivieren"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => {
                        setSelectedSlug(null);
                        setHoldReason("");
                      }}
                    >
                      ✕
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className={cn(
                      "text-xs",
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
                        : "Hold setzen"}
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
          <p className="font-medium">{isEn ? "Important" : "Wichtig"}</p>
          <p className="mt-0.5">
            {isEn
              ? "Matters under legal hold cannot be deleted, archived, or modified. The retention cron job will skip held matters. All hold actions are audit-logged."
              : "Akten unter Legal Hold können nicht gelöscht, archiviert oder geändert werden. Der Retention-Cron-Job überspringt gehaltene Akten. Alle Hold-Aktionen werden audit-protokolliert."}
          </p>
        </div>
      </div>
    </div>
  );
}
