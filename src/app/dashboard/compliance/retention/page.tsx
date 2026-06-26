"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Trash2, CheckCircle2, Shield, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

interface RetentionCase {
  slug: string;
  title: string;
  caseNumber: string;
  status: string;
  closedAt?: string;
  yearsSinceClosure: number;
  action: "keep" | "review" | "delete";
}

// DSGVO + BRAO: Handakten 6 Jahre nach Abschluss (§ 147 AO, § 50 BRAO)
// Persönliche Daten: Löschung nach Zweckwegfall (Art. 5 DSGVO)
// Empfohlene Fristen: 6 Jahre (steuerrechtlich) / 10 Jahre (BRAO) / 3 Jahre (DSGVO nach Zweckwegfall)
const RETENTION_YEARS = 6;

export default function RetentionPage() {
  const { t } = useLang();
  const confirm = useConfirm();
  const [cases, setCases] = useState<RetentionCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const pages = await api.brain.listPages({ type: "legal_case", limit: 500 });
        const now = new Date();
        const mapped: RetentionCase[] = pages.map((p) => {
          const fm = p.frontmatter as Record<string, unknown>;
          const closedAt = fm.closed_at ? String(fm.closed_at) : undefined;
          const years = closedAt
            ? (now.getTime() - new Date(closedAt).getTime()) / (1000 * 60 * 60 * 24 * 365)
            : 0;
          let action: RetentionCase["action"] = "keep";
          if (years >= RETENTION_YEARS + 4)
            action = "delete"; // > 10 Jahre
          else if (years >= RETENTION_YEARS) action = "review"; // 6-10 Jahre
          return {
            slug: p.slug,
            title: p.title,
            caseNumber: String(fm.case_number ?? p.slug),
            status: String(fm.status ?? "open"),
            closedAt,
            yearsSinceClosure: Math.round(years * 10) / 10,
            action,
          };
        });
        setCases(mapped.sort((a, b) => b.yearsSinceClosure - a.yearsSinceClosure));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : t("retention.error_load"));
      }
      setLoading(false);
    }
    load();
  }, []);

  const toReview = cases.filter((c) => c.action === "review");
  const toDelete = cases.filter((c) => c.action === "delete");

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("retention.title")}
        description={t("retention.description")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Compliance", href: "/dashboard/compliance" },
          { label: t("retention.breadcrumb") },
        ]}
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
          <div className="text-xl font-bold text-emerald-600">
            {cases.filter((c) => c.action === "keep").length}
          </div>
          <div className="text-xs text-[color:var(--ds-text-muted)]">
            {t("retention.stat_keep")}
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
          <div className="text-xl font-bold text-amber-600">{toReview.length}</div>
          <div className="text-xs text-[color:var(--ds-text-muted)]">
            {t("retention.stat_review").replace("{{years}}", String(RETENTION_YEARS))}
          </div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
          <div className="text-xl font-bold text-red-600">{toDelete.length}</div>
          <div className="text-xs text-[color:var(--ds-text-muted)]">
            {t("retention.stat_delete").replace("{{years}}", String(RETENTION_YEARS + 4))}
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-[color:var(--ds-text-muted)]">
          {t("retention.loading")}
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <div
              key={c.slug}
              className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${
                c.action === "delete"
                  ? "border-red-500/20 bg-red-500/5"
                  : c.action === "review"
                    ? "border-amber-500/20 bg-amber-500/5"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                {c.action === "delete" ? (
                  <Trash2 size={18} className="text-red-600" />
                ) : c.action === "review" ? (
                  <AlertTriangle size={18} className="text-amber-600" />
                ) : (
                  <CheckCircle2 size={18} className="text-emerald-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[color:var(--ds-text)]">
                    {c.caseNumber}
                  </span>
                  <span className="rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {c.status}
                  </span>
                </div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {c.title} ·{" "}
                  {t("retention.years_since").replace("{{years}}", String(c.yearsSinceClosure))}
                </div>
              </div>
              {c.action !== "keep" && (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium ${c.action === "delete" ? "text-red-600" : "text-amber-600"}`}
                  >
                    {c.action === "delete"
                      ? t("retention.action_delete")
                      : t("retention.action_review")}
                  </span>
                  {c.action === "delete" && (
                    <button
                      onClick={async () => {
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
                        try {
                          await api.brain.deletePage(c.slug);
                          setCases((prev) => prev.filter((pc) => pc.slug !== c.slug));
                        } catch (e) {
                          setLoadError(
                            e instanceof Error ? e.message : t("retention.error_delete")
                          );
                        } finally {
                          setDeleting(null);
                        }
                      }}
                      disabled={deleting === c.slug}
                      className="rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-xs text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {deleting === c.slug ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        t("retention.btn_delete")
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex items-start gap-3">
          <Shield size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-xs text-[color:var(--ds-text-muted)]">{t("retention.disclaimer")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
