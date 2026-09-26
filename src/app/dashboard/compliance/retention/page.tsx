"use client";

import { useState, useEffect } from "react";
import { retentionStatus } from "@/lib/retention-period";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, CheckCircle2, Info, Loader2, Archive } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/dashboard/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

interface RetentionCase {
  slug: string;
  title: string;
  caseNumber: string;
  status: string;
  closedAt: string;
  yearsSinceClosure: number;
  action: "keep" | "review" | "delete";
}

// Österreich: Bücher, Aufzeichnungen und Belege sind sieben Jahre aufzubewahren
// (§§ 131, 132 BAO). Persönliche Daten: Löschung nach Zweckwegfall (Art. 5 DSGVO).
// Ab 7 Jahren wird eine Prüfung empfohlen; nach weiteren 3 Jahren Karenz (für
// anhängige Verfahren, Haftungsfragen) gilt die Akte als löschfällig. Gelöscht
// wird nie automatisch — immer nur nach ausdrücklicher Bestätigung.
const RETENTION_YEARS = 7; // § 132 BAO
const DELETE_GRACE_YEARS = 3;

const CASE_STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  active: "Laufend",
  pending: "Ruhend",
  closed: "Abgeschlossen",
  archived: "Archiviert",
};

export default function RetentionPage() {
  const { t } = useLang();
  const router = useRouter();
  const confirm = useConfirm();
  const [cases, setCases] = useState<RetentionCase[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // listAllPages blättert über die 100er-Grenze der Engine und filtert gelöschte Akten.
        const pages = await api.brain.listAllPages({ type: "legal_case" });
        if (cancelled) return;
        const now = Date.now();
        const closed: RetentionCase[] = [];
        let running = 0;
        for (const p of pages) {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          const closedAt = fm.closed_at ? String(fm.closed_at) : "";
          // § 132 BAO: the period runs from the end of the closing year.
          const status = closedAt
            ? retentionStatus(closedAt, new Date(now), RETENTION_YEARS, DELETE_GRACE_YEARS)
            : null;
          // Laufende Akten (ohne gültiges Abschlussdatum) unterliegen noch keiner Frist.
          if (!status) {
            running++;
            continue;
          }
          const years = status.yearsSinceStart;
          const action: RetentionCase["action"] = status.action;
          closed.push({
            slug: p.slug,
            title: p.title,
            caseNumber: String(fm.case_number ?? p.title),
            status: String(fm.status ?? "closed"),
            closedAt,
            yearsSinceClosure: Math.floor(years * 10) / 10,
            action,
          });
        }
        if (!cancelled) {
          setCases(closed.sort((a, b) => b.yearsSinceClosure - a.yearsSinceClosure));
          setOpenCount(running);
        }
      } catch {
        if (!cancelled) setLoadError(t("retention.error_load"));
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keepCount = cases.filter((c) => c.action === "keep").length + openCount;
  const toReview = cases.filter((c) => c.action === "review");
  const toDelete = cases.filter((c) => c.action === "delete");

  async function handleDelete(c: RetentionCase) {
    const ok = await confirm({
      title: t("retention.confirm_title"),
      message: t("retention.confirm_msg")
        .replace("{{title}}", c.title)
        .replace("{{number}}", c.caseNumber),
      confirmLabel: t("retention.confirm_delete"),
      cancelLabel: t("retention.confirm_cancel"),
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(c.slug);
    setLoadError(null);
    try {
      // Nach Fristablauf: in den Papierkorb (endgültige Löschung nach der
      // Papierkorbfrist). Ein normales DELETE würde die Akte nur archivieren.
      await api.brain.deletePage(c.slug, { mode: "trash" });
      setCases((prev) => prev.filter((pc) => pc.slug !== c.slug));
    } catch {
      setLoadError(t("retention.error_delete"));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("retention.title")}
        description={t("retention.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("compliance.breadcrumb"), href: "/dashboard/compliance" },
          { label: t("retention.breadcrumb") },
        ]}
      />

      {/* Summary — Farbe nur bei Zahl > 0 */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile value={keepCount} label={t("retention.stat_keep")} tone="neutral" />
          <StatTile
            value={toReview.length}
            label={t("retention.stat_review").replace("{{years}}", String(RETENTION_YEARS))}
            tone="warning"
          />
          <StatTile
            value={toDelete.length}
            label={t("retention.stat_delete").replace(
              "{{years}}",
              String(RETENTION_YEARS + DELETE_GRACE_YEARS)
            )}
            tone="danger"
          />
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="space-y-2" role="status" aria-label={t("retention.loading")}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : cases.length === 0 && !loadError ? (
        <EmptyState
          icon={Archive}
          title="Keine abgeschlossenen Akten"
          description="Aufbewahrungsfristen beginnen mit dem Abschluss einer Akte. Sobald Sie eine Akte abschließen, erscheint sie hier mit ihrer Frist."
          actionLabel="Zu den Akten"
          onAction={() => router.push("/dashboard/cases")}
        />
      ) : (
        <ul className="space-y-2">
          {cases.map((c) => (
            <li
              key={c.slug}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
                {c.action === "delete" ? (
                  <Trash2 size={16} className="text-[color:var(--ds-danger-text)]" />
                ) : c.action === "review" ? (
                  <AlertTriangle size={16} className="text-[color:var(--ds-warning-text)]" />
                ) : (
                  <CheckCircle2 size={16} className="text-[color:var(--ds-success-text)]" />
                )}
              </div>
              <div className="min-w-[12rem] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[color:var(--ds-text)] tabular-nums">
                    {c.caseNumber}
                  </span>
                  <span className="rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {CASE_STATUS_LABEL[c.status] ?? "Abgeschlossen"}
                  </span>
                </div>
                <div className="truncate text-xs text-[color:var(--ds-text-muted)]">
                  {c.title} · Abgeschlossen am{" "}
                  <span className="tabular-nums">{formatDate(c.closedAt)}</span> ·{" "}
                  {t("retention.years_since").replace(
                    "{{years}}",
                    c.yearsSinceClosure.toLocaleString("de-AT")
                  )}
                </div>
              </div>
              {c.action !== "keep" && (
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-medium whitespace-nowrap",
                      c.action === "delete"
                        ? "text-[color:var(--ds-danger-text)]"
                        : "text-[color:var(--ds-warning-text)]"
                    )}
                  >
                    {c.action === "delete"
                      ? t("retention.action_delete")
                      : t("retention.action_review")}
                  </span>
                  {c.action === "delete" && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(c)}
                      disabled={deleting === c.slug}
                      aria-label={`${t("retention.btn_delete")}: ${c.caseNumber}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-danger-border)] px-2.5 py-1 text-xs whitespace-nowrap text-[color:var(--ds-danger-text)] transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-danger-bg)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none disabled:opacity-50 motion-reduce:transition-none"
                    >
                      {deleting === c.slug && (
                        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                      )}
                      {t("retention.btn_delete")}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <Info
          size={16}
          className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          {t("retention.disclaimer")}
        </p>
      </div>
    </div>
  );
}

function StatTile({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "neutral" | "warning" | "danger";
}) {
  const color =
    value === 0 || tone === "neutral"
      ? "text-[color:var(--ds-text)]"
      : tone === "warning"
        ? "text-[color:var(--ds-warning-text)]"
        : "text-[color:var(--ds-danger-text)]";
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", color)}>{value}</div>
    </div>
  );
}
