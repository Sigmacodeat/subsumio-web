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
  Bot,
  Archive,
  ClipboardCheck,
  EyeOff,
  Database,
  FileClock,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/dashboard/skeleton";

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
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("compliance.title")}
        description={t("compliance.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("compliance.breadcrumb") },
        ]}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
        <HubLink href="/dashboard/compliance/ai-act" icon={Bot} label="KI-Verordnung" />
        <HubLink
          href="/dashboard/compliance/answer-quality"
          icon={ThumbsUp}
          label="Antwortqualität"
        />
      </div>

      {/* Honest framing: this is a maintained checklist, not an automated audit */}
      <div
        className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
        role="note"
      >
        <Info
          size={16}
          className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          {t("compliance.disclaimer")}
        </p>
      </div>

      {/* Tabs */}
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        role="tablist"
        aria-label={t("aria.compliance_area")}
      >
        <button
          role="tab"
          id="tab-dsgvo"
          aria-selected={activeTab === "dsgvo"}
          aria-controls="tabpanel-compliance"
          onClick={() => setActiveTab("dsgvo")}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
            activeTab === "dsgvo"
              ? "border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <Lock size={14} aria-hidden="true" />
          DSGVO
        </button>
        <button
          role="tab"
          id="tab-gwg"
          aria-selected={activeTab === "gwg"}
          aria-controls="tabpanel-compliance"
          onClick={() => setActiveTab("gwg")}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
            activeTab === "gwg"
              ? "border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <ShieldAlert size={14} aria-hidden="true" />
          Geldwäscheprävention
        </button>
        <button
          role="tab"
          id="tab-gobd"
          aria-selected={activeTab === "gobd"}
          aria-controls="tabpanel-compliance"
          onClick={() => setActiveTab("gobd")}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
            activeTab === "gobd"
              ? "border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <Archive size={14} aria-hidden="true" />
          Buchführung
        </button>
      </div>

      {/* Tab panel */}
      <div
        role="tabpanel"
        id="tabpanel-compliance"
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
        className="space-y-3 focus-visible:outline-none"
      >
        {/* Stats — Farbe nur, wenn die Zahl > 0 ist */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile value={okCount} label={t("compliance.status_ok")} tone="success" />
          <StatTile value={warnCount} label={t("compliance.status_warn")} tone="warning" />
          <StatTile value={failCount} label={t("compliance.status_fail")} tone="danger" />
        </div>

        {/* Save state */}
        <div aria-live="polite" className="min-h-5 text-xs">
          {saving && (
            <span className="inline-flex items-center gap-1.5 text-[color:var(--ds-text-muted)]">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />{" "}
              {t("compliance.saving")}
            </span>
          )}
          {saveError && <span className="text-[color:var(--ds-danger-text)]">{saveError}</span>}
        </div>

        {/* Checks list */}
        {loading ? (
          <div className="space-y-2" role="status" aria-label={t("aria.checklist_loading")}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
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
                    "flex w-full items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-left transition-[background-color,border-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] motion-reduce:transition-none",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--brand-primary)]"
                  )}
                >
                  <div className="mt-0.5 shrink-0" aria-hidden="true">
                    {status === "ok" ? (
                      <CheckCircle2 size={16} className="text-[color:var(--ds-success-text)]" />
                    ) : status === "warn" ? (
                      <AlertTriangle size={16} className="text-[color:var(--ds-warning-text)]" />
                    ) : (
                      <XCircle size={16} className="text-[color:var(--ds-danger-text)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">
                        {check.label}
                      </span>
                      <Badge
                        variant="default"
                        className={cn(
                          "border text-xs",
                          status === "ok"
                            ? "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
                            : status === "warn"
                              ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
                              : "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                        )}
                      >
                        {STATUS_LABEL[status](t)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      <span className="text-[color:var(--ds-text-subtle)]">{check.category}</span>
                      {" · "}
                      {check.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
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
  tone: "success" | "warning" | "danger";
}) {
  const color =
    value === 0
      ? "text-[color:var(--ds-text)]"
      : tone === "success"
        ? "text-[color:var(--ds-success-text)]"
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
      className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none motion-reduce:transition-none"
    >
      <Icon size={15} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
