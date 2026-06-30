"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Wifi,
  WifiOff,
  AlertTriangle,
  RotateCcw,
  Send,
  FileCheck,
  Clock,
  XCircle,
  CheckCircle2,
  HelpCircle,
  Copy,
  Check,
  FileJson,
  FileStack,
} from "lucide-react";
import { api } from "@/lib/api";
import { buildElsterXml } from "@/lib/elster";
import type { BrainPage } from "@/lib/types";
import type { VariantProps } from "class-variance-authority";
import type { ElsterFormType } from "@/lib/elster";
import { ElsterSubmissionWizard, TaxStatCard } from "@/components/tax";

type BadgeVariant = VariantProps<typeof import("@/components/ui/badge").badgeVariants>["variant"];

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: "default",
  queued: "warning",
  submitted: "info",
  accepted: "success",
  rejected: "danger",
  error: "danger",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  accepted: <CheckCircle2 size={14} />,
  submitted: <Send size={14} />,
  queued: <Clock size={14} />,
  rejected: <XCircle size={14} />,
  error: <XCircle size={14} />,
  draft: <FileCheck size={14} />,
};

export default function ElsterPage() {
  const { t, lang } = useLang();
  const locale = lang === "en" ? "en-GB" : "de-DE";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    mode: string;
    connected: boolean;
    lastError?: string;
  } | null>(null);
  const [submissions, setSubmissions] = useState<BrainPage[]>([]);

  const [selectedSubmission, setSelectedSubmission] = useState<BrainPage | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.tax.elster.status();
      setStatus(res.status);
      setSubmissions(res.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("elster.error_load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const sortedSubmissions = useMemo(() => {
    return [...submissions].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }, [submissions]);

  const acceptedCount = sortedSubmissions.filter((p) => {
    const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
    return fm.elster_status === "accepted";
  }).length;
  const pendingCount = sortedSubmissions.filter((p) => {
    const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
    return fm.elster_status === "queued" || fm.elster_status === "submitted";
  }).length;
  const errorCount = sortedSubmissions.filter((p) => {
    const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
    return fm.elster_status === "rejected" || fm.elster_status === "error";
  }).length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("elster.title")}
        description={t("elster.desc")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("elster.title") }]}
      />

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle size={16} />
              <p className="text-sm font-medium">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RotateCcw size={14} /> {t("elster.retry")}
            </Button>
          </div>
        </div>
      )}

      <ConnectionStatus status={status} />

      {/* Stats */}
      {!loading && sortedSubmissions.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TaxStatCard
            label={t("elster.stat_total")}
            value={sortedSubmissions.length}
            icon={FileStack}
          />
          <TaxStatCard
            label={t("elster.stat_pending")}
            value={pendingCount}
            icon={Clock}
            colorVar="--ds-warning-text"
          />
          <TaxStatCard
            label={t("elster.stat_accepted")}
            value={acceptedCount}
            icon={CheckCircle2}
            colorVar="--ds-success-text"
          />
          <TaxStatCard
            label={t("elster.stat_errors")}
            value={errorCount}
            icon={XCircle}
            colorVar="--ds-danger-text"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Send size={16} className="text-[color:var(--brand-primary)]" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("elster.new_submission")}
            </h3>
          </div>
          {wizardOpen ? (
            <ElsterSubmissionWizard
              onSubmitted={() => {
                setWizardOpen(false);
                void load();
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Send size={32} className="text-[color:var(--ds-text-subtle)] opacity-50" />
              <p className="mt-3 text-sm text-[color:var(--ds-text-subtle)]">
                {t("elster.wizard_hint")}
              </p>
              <Button
                onClick={() => setWizardOpen(true)}
                className="brand-bg mt-4 gap-2 text-white"
              >
                <Send size={16} />
                {t("elster.start_submission")}
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <HelpCircle size={16} className="text-[color:var(--brand-primary)]" />
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("elster.info_title")}
            </h3>
          </div>
          <p className="text-sm leading-relaxed text-[color:var(--ds-text-subtle)]">
            {t("elster.info_text")}
          </p>
        </Card>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
          {t("elster.history")} ({sortedSubmissions.length})
        </h3>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : sortedSubmissions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-10 text-center">
            <FileCheck
              size={32}
              className="mx-auto text-[color:var(--ds-text-subtle)] opacity-50"
            />
            <p className="mt-2 text-sm text-[color:var(--ds-text-subtle)]">{t("elster.empty")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedSubmissions.map((page) => (
              <SubmissionRow
                key={page.slug}
                page={page}
                locale={locale}
                onClick={() => setSelectedSubmission(page)}
              />
            ))}
          </div>
        )}
      </div>

      <SubmissionDetailDialog
        page={selectedSubmission}
        onClose={() => setSelectedSubmission(null)}
        locale={locale}
      />
    </div>
  );
}

function ConnectionStatus({
  status,
}: {
  status: { mode: string; connected: boolean; lastError?: string } | null;
}) {
  const { t } = useLang();
  if (!status) return null;
  const connected = status.connected;
  return (
    <Card className={`border-l-4 p-4 ${connected ? "border-l-emerald-500" : "border-l-rose-500"}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {connected ? (
            <Wifi size={18} className="text-emerald-600" />
          ) : (
            <WifiOff size={18} className="text-rose-600" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[color:var(--ds-text)]">
            {connected ? t("elster.connected") : t("elster.disconnected")}
          </p>
          <p className="text-xs text-[color:var(--ds-text-subtle)]">
            {t("elster.mode")}: {status.mode}
          </p>
          {status.lastError && <p className="mt-1 text-xs text-rose-600">{status.lastError}</p>}
        </div>
      </div>
    </Card>
  );
}

function SubmissionRow({
  page,
  locale,
  onClick,
}: {
  page: BrainPage;
  locale: string;
  onClick?: () => void;
}) {
  const { t } = useLang();
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  const status = String(fm.elster_status ?? "draft");
  const formType = String(fm.form_type ?? "—");
  const period = String(fm.period ?? "—");
  const clientName = String(fm.client_name ?? "—");
  const submittedAt = fm.submitted_at
    ? new Date(String(fm.submitted_at)).toLocaleDateString(locale)
    : "—";
  const reference = String(fm.elster_reference ?? "—");
  const variant = STATUS_VARIANTS[status] ?? "default";
  const icon = STATUS_ICONS[status] ?? STATUS_ICONS.draft;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
      className="flex cursor-pointer items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 transition-colors hover:bg-[color:var(--ds-surface-2)]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
          {formType} {period} — {clientName}
        </p>
        <p className="text-xs text-[color:var(--ds-text-subtle)]">
          {t("elster.reference")}: {reference} · {t("elster.submitted_at")}: {submittedAt}
        </p>
      </div>
      <Badge variant={variant}>{status}</Badge>
    </div>
  );
}

function SubmissionDetailDialog({
  page,
  onClose,
  locale,
}: {
  page: BrainPage | null;
  onClose: () => void;
  locale: string;
}) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const open = !!page;
  const fm = (page?.frontmatter ?? {}) as Record<string, unknown>;

  const status = String(fm.elster_status ?? "draft");
  const formType = String(fm.form_type ?? "—");
  const period = String(fm.period ?? "—");
  const year = Number(fm.year ?? 0);
  const clientName = String(fm.client_name ?? "—");
  const clientId = String(fm.client_id ?? "—");
  const taxAmount = Number(fm.tax_amount ?? 0) || undefined;
  const refundAmount = Number(fm.refund_amount ?? 0) || undefined;
  const submittedAt = fm.submitted_at
    ? new Date(String(fm.submitted_at)).toLocaleString(locale)
    : "—";
  const reference = String(fm.elster_reference ?? "—");
  const xml = page
    ? (() => {
        try {
          return buildElsterXml({
            clientId,
            clientName,
            formType: formType as ElsterFormType,
            period,
            year,
            taxAmount,
            refundAmount,
          });
        } catch {
          return null;
        }
      })()
    : null;

  async function copyXml() {
    if (!xml) return;
    try {
      await navigator.clipboard.writeText(xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {formType} {period} — {clientName}
          </DialogTitle>
          <DialogDescription>
            {t("elster.reference")}: {reference}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Detail label={t("elster.status")} value={status} />
          <Detail label={t("elster.year")} value={String(year)} />
          <Detail
            label={t("elster.tax_amount")}
            value={taxAmount?.toLocaleString(locale, { minimumFractionDigits: 2 }) ?? "—"}
          />
          <Detail
            label={t("elster.refund_amount")}
            value={refundAmount?.toLocaleString(locale, { minimumFractionDigits: 2 }) ?? "—"}
          />
          <Detail label={t("elster.submitted_at")} value={submittedAt} />
        </div>
        {xml && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                <FileJson size={16} />
                {t("elster.xml_preview")}
              </div>
              <Button size="sm" variant="outline" onClick={copyXml}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? t("elster.copied") : t("elster.copy_xml")}
              </Button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-xs text-[color:var(--ds-text-subtle)]">
              {xml}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[color:var(--ds-surface-2)] px-3 py-2">
      <p className="text-xs text-[color:var(--ds-text-subtle)]">{label}</p>
      <p className="font-medium text-[color:var(--ds-text)]">{value}</p>
    </div>
  );
}
