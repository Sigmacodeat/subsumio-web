"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/use-lang";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Loader2,
  Info,
  Archive,
  ClipboardCheck,
  EyeOff,
  Database,
  FileClock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

type CheckStatus = "ok" | "warn" | "fail";

interface ComplianceCheck {
  id: string;
  category: string;
  label: string;
  description: string;
}

type TFunc = (key: import("@/content/dashboard").DashboardKey) => string;

function getDsgvoChecks(t: TFunc): ComplianceCheck[] {
  return [
    {
      id: "dsgvo-1",
      category: t("compliance.cat.legal_basis"),
      label: t("compliance.dsgvo.1.label"),
      description: t("compliance.dsgvo.1.desc"),
    },
    {
      id: "dsgvo-2",
      category: t("compliance.cat.legal_basis"),
      label: t("compliance.dsgvo.2.label"),
      description: t("compliance.dsgvo.2.desc"),
    },
    {
      id: "dsgvo-3",
      category: t("compliance.cat.data_subjects"),
      label: t("compliance.dsgvo.3.label"),
      description: t("compliance.dsgvo.3.desc"),
    },
    {
      id: "dsgvo-4",
      category: t("compliance.cat.data_subjects"),
      label: t("compliance.dsgvo.4.label"),
      description: t("compliance.dsgvo.4.desc"),
    },
    {
      id: "dsgvo-5",
      category: t("compliance.cat.documentation"),
      label: t("compliance.dsgvo.5.label"),
      description: t("compliance.dsgvo.5.desc"),
    },
    {
      id: "dsgvo-6",
      category: t("compliance.cat.documentation"),
      label: t("compliance.dsgvo.6.label"),
      description: t("compliance.dsgvo.6.desc"),
    },
    {
      id: "dsgvo-7",
      category: t("compliance.cat.technical"),
      label: t("compliance.dsgvo.7.label"),
      description: t("compliance.dsgvo.7.desc"),
    },
    {
      id: "dsgvo-8",
      category: t("compliance.cat.technical"),
      label: t("compliance.dsgvo.8.label"),
      description: t("compliance.dsgvo.8.desc"),
    },
    {
      id: "dsgvo-9",
      category: t("compliance.cat.organisational"),
      label: t("compliance.dsgvo.9.label"),
      description: t("compliance.dsgvo.9.desc"),
    },
    {
      id: "dsgvo-10",
      category: t("compliance.cat.organisational"),
      label: t("compliance.dsgvo.10.label"),
      description: t("compliance.dsgvo.10.desc"),
    },
  ];
}

function getGwgChecks(t: TFunc): ComplianceCheck[] {
  return [
    {
      id: "gwg-1",
      category: t("compliance.cat.identification"),
      label: t("compliance.gwg.1.label"),
      description: t("compliance.gwg.1.desc"),
    },
    {
      id: "gwg-2",
      category: t("compliance.cat.identification"),
      label: t("compliance.gwg.2.label"),
      description: t("compliance.gwg.2.desc"),
    },
    {
      id: "gwg-3",
      category: t("compliance.cat.screening"),
      label: t("compliance.gwg.3.label"),
      description: t("compliance.gwg.3.desc"),
    },
    {
      id: "gwg-4",
      category: t("compliance.cat.screening"),
      label: t("compliance.gwg.4.label"),
      description: t("compliance.gwg.4.desc"),
    },
    {
      id: "gwg-5",
      category: t("compliance.cat.documentation"),
      label: t("compliance.gwg.5.label"),
      description: t("compliance.gwg.5.desc"),
    },
    {
      id: "gwg-6",
      category: t("compliance.cat.documentation"),
      label: t("compliance.gwg.6.label"),
      description: t("compliance.gwg.6.desc"),
    },
  ];
}

function getGobdChecks(t: TFunc): ComplianceCheck[] {
  return [
    {
      id: "gobd-1",
      category: t("compliance.cat.immutability"),
      label: t("compliance.gobd.1.label"),
      description: t("compliance.gobd.1.desc"),
    },
    {
      id: "gobd-2",
      category: t("compliance.cat.traceability"),
      label: t("compliance.gobd.2.label"),
      description: t("compliance.gobd.2.desc"),
    },
    {
      id: "gobd-3",
      category: t("compliance.cat.traceability"),
      label: t("compliance.gobd.3.label"),
      description: t("compliance.gobd.3.desc"),
    },
    {
      id: "gobd-4",
      category: t("compliance.cat.documentation"),
      label: t("compliance.gobd.4.label"),
      description: t("compliance.gobd.4.desc"),
    },
    {
      id: "gobd-5",
      category: t("compliance.cat.control"),
      label: t("compliance.gobd.5.label"),
      description: t("compliance.gobd.5.desc"),
    },
    {
      id: "gobd-6",
      category: t("compliance.cat.control"),
      label: t("compliance.gobd.6.label"),
      description: t("compliance.gobd.6.desc"),
    },
    {
      id: "gobd-7",
      category: t("compliance.cat.documentation"),
      label: t("compliance.gobd.7.label"),
      description: t("compliance.gobd.7.desc"),
    },
  ];
}

const STATE_SLUG = "legal/compliance/selbstauskunft";
const STATUS_CYCLE: CheckStatus[] = ["ok", "warn", "fail"];

const STATUS_LABEL: Record<CheckStatus, (t: TFunc) => string> = {
  ok: (t) => t("compliance.status_ok"),
  warn: (t) => t("compliance.status_warn"),
  fail: (t) => t("compliance.status_fail"),
};

export default function CompliancePage() {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState<"dsgvo" | "gwg" | "gobd">("dsgvo");
  const [statuses, setStatuses] = useState<Record<string, CheckStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await api.brain.getPage(STATE_SLUG);
        const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
        const stored = fm.check_statuses;
        if (!cancelled && stored && typeof stored === "object") {
          setStatuses(stored as Record<string, CheckStatus>);
        }
      } catch {
        // Seite existiert noch nicht — alle Checks starten als "warn" (offen)
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: Record<string, CheckStatus>) => {
      setSaving(true);
      setSaveError(null);
      try {
        await api.brain.updatePage({
          slug: STATE_SLUG,
          title: "Compliance-Selbstauskunft",
          type: "document",
          frontmatter: {
            check_statuses: next,
            updated_via: "dashboard",
          },
        });
      } catch {
        setSaveError(t("compliance.error_save"));
      } finally {
        setSaving(false);
      }
    },
    [t]
  );

  function cycleStatus(id: string) {
    setStatuses((prev) => {
      const current = prev[id] ?? "warn";
      const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
      const next = { ...prev, [id]: nextStatus };
      void persist(next);
      return next;
    });
  }

  const checks =
    activeTab === "dsgvo"
      ? getDsgvoChecks(t)
      : activeTab === "gwg"
        ? getGwgChecks(t)
        : getGobdChecks(t);
  const statusOf = (c: ComplianceCheck): CheckStatus => statuses[c.id] ?? "warn";
  const okCount = checks.filter((c) => statusOf(c) === "ok").length;
  const warnCount = checks.filter((c) => statusOf(c) === "warn").length;
  const failCount = checks.filter((c) => statusOf(c) === "fail").length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("compliance.title")}
        description={t("compliance.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("compliance.breadcrumb") },
        ]}
      />

      <div className="grid gap-2 sm:grid-cols-4">
        <HubLink
          href="/dashboard/verfahrensdoku"
          icon={ClipboardCheck}
          label={t("nav.verfahrensdoku")}
        />
        <HubLink
          href="/dashboard/compliance/retention"
          icon={FileClock}
          label={t("nav.retention")}
        />
        <HubLink href="/dashboard/anonymize" icon={EyeOff} label={t("nav.anonymize")} />
        <HubLink href="/dashboard/data-export" icon={Database} label={t("nav.data_export")} />
      </div>

      {/* Honest framing: this is a maintained checklist, not an automated audit */}
      <div
        className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
        role="note"
      >
        <Info size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-amber-600">{t("compliance.disclaimer")}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2" role="tablist" aria-label={t("aria.compliance_area")}>
        <button
          role="tab"
          aria-selected={activeTab === "dsgvo"}
          onClick={() => setActiveTab("dsgvo")}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            activeTab === "dsgvo"
              ? "border-emerald-500/30 bg-emerald-600/10 text-emerald-600"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <Lock size={14} aria-hidden="true" />
          DSGVO
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "gwg"}
          onClick={() => setActiveTab("gwg")}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            activeTab === "gwg"
              ? "border-blue-500/30 bg-blue-600/10 text-blue-600"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <ShieldAlert size={14} aria-hidden="true" />
          GwG
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "gobd"}
          onClick={() => setActiveTab("gobd")}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            activeTab === "gobd"
              ? "brand-soft brand-border brand-text"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <Archive size={14} aria-hidden="true" />
          GoBD
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
          <div className="text-xl font-bold text-emerald-600">{okCount}</div>
          <div className="text-xs text-[color:var(--ds-text-muted)]">
            {t("compliance.status_ok")}
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
          <div className="text-xl font-bold text-amber-600">{warnCount}</div>
          <div className="text-xs text-[color:var(--ds-text-muted)]">
            {t("compliance.status_warn")}
          </div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
          <div className="text-xl font-bold text-red-600">{failCount}</div>
          <div className="text-xs text-[color:var(--ds-text-muted)]">
            {t("compliance.status_fail")}
          </div>
        </div>
      </div>

      {/* Save state */}
      <div aria-live="polite" className="min-h-5 text-xs">
        {saving && (
          <span className="inline-flex items-center gap-1.5 text-[color:var(--ds-text-muted)]">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />{" "}
            {t("compliance.saving")}
          </span>
        )}
        {saveError && <span className="text-red-600">{saveError}</span>}
      </div>

      {/* Checks list */}
      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label={t("aria.checklist_loading")}
        >
          <Loader2 size={24} className="brand-text animate-spin" aria-hidden="true" />
        </div>
      ) : (
        <div className="space-y-2">
          {checks.map((check) => {
            const status = statusOf(check);
            return (
              <button
                key={check.id}
                onClick={() => cycleStatus(check.id)}
                aria-label={`${check.label} — ${t("aria.status")}: ${STATUS_LABEL[status](t)}. ${t("compliance.aria_change")}`}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--brand-primary)]",
                  status === "ok"
                    ? "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40"
                    : status === "warn"
                      ? "border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40"
                      : "border-red-500/20 bg-red-500/5 hover:border-red-500/40"
                )}
              >
                <div className="mt-0.5 shrink-0" aria-hidden="true">
                  {status === "ok" ? (
                    <CheckCircle2 size={16} className="text-emerald-600" />
                  ) : status === "warn" ? (
                    <AlertTriangle size={16} className="text-amber-600" />
                  ) : (
                    <XCircle size={16} className="text-red-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)]">
                      {check.label}
                    </span>
                    <Badge
                      variant="default"
                      className={cn(
                        "border text-xs",
                        status === "ok"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                          : status === "warn"
                            ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
                            : "border-red-500/20 bg-red-500/10 text-red-600"
                      )}
                    >
                      {STATUS_LABEL[status](t)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    {check.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HubLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof ShieldAlert;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
