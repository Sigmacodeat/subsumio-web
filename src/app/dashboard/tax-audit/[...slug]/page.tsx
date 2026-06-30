"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  User,
  Calendar,
  Loader2,
  AlertTriangle,
  Pencil,
  Trash2,
  Save,
  X,
  AlertCircle,
  Euro,
  Plus,
  Trash,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import type { TaxAuditPhase } from "@/lib/tax-types";

const AUDIT_TYPES = [
  { value: "Betriebspruefung", label: "Betriebsprüfung" },
  { value: "Aussenpruefung", label: "Außenprüfung" },
  { value: "Lohnpruefung", label: "Lohnprüfung" },
  { value: "UStpruefung", label: "USt-Prüfung" },
] as const;

const PHASE_OPTIONS: Array<{ value: TaxAuditPhase; label: string }> = [
  { value: "vorbereitung", label: "Vorbereitung" },
  { value: "pruefung", label: "Prüfung" },
  { value: "abschluss", label: "Abschluss" },
  { value: "rechtsbehelf", label: "Rechtsbehelf" },
  { value: "abgeschlossen", label: "Abgeschlossen" },
];

const PHASE_VARIANTS: Record<TaxAuditPhase, "default" | "info" | "warning" | "success" | "danger"> =
  {
    vorbereitung: "default",
    pruefung: "info",
    abschluss: "warning",
    rechtsbehelf: "danger",
    abgeschlossen: "success",
  };

interface FindingEntry {
  id: string;
  issue: string;
  amount: string;
  accepted: boolean;
}

export default function TaxAuditDetailPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const params = useParams<{ slug: string[] }>();
  const slug = params.slug?.join("/") ?? "";
  const { addToast } = useToast();
  const [data, setData] = useState<BrainPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    clientName: "",
    type: "Betriebspruefung" as string,
    year: new Date().getFullYear(),
    phase: "vorbereitung" as TaxAuditPhase,
    auditor: "",
    startDate: "",
    endDate: "",
    totalAdditionalTax: "",
    notes: "",
  });
  const [findings, setFindings] = useState<FindingEntry[]>([]);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const p = await api.tax.audits.get(slug);
      setData(p);
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      const rawFindings = Array.isArray(fm.findings)
        ? (fm.findings as Array<Record<string, unknown>>)
        : [];
      setForm({
        clientName: String(fm.client_name ?? ""),
        type: String(fm.audit_type ?? "Betriebspruefung"),
        year: Number(fm.year ?? new Date().getFullYear()),
        phase: (fm.phase as TaxAuditPhase) ?? "vorbereitung",
        auditor: String(fm.auditor ?? ""),
        startDate: fm.start_date ? String(fm.start_date).slice(0, 10) : "",
        endDate: fm.end_date ? String(fm.end_date).slice(0, 10) : "",
        totalAdditionalTax: fm.total_additional_tax != null ? String(fm.total_additional_tax) : "",
        notes: String(fm.notes ?? ""),
      });
      setFindings(
        rawFindings.map((f, i) => ({
          id: String(f.id ?? `finding-${i}`),
          issue: String(f.issue ?? f.title ?? ""),
          amount: f.amount != null ? String(f.amount) : "",
          accepted: Boolean(f.accepted),
        }))
      );
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!slug || !data) return;
    setSaving(true);
    try {
      await api.tax.audits.update(slug, {
        clientName: form.clientName.trim(),
        type: form.type,
        year: form.year,
        phase: form.phase,
        auditor: form.auditor || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        totalAdditionalTax: form.totalAdditionalTax ? Number(form.totalAdditionalTax) : null,
        notes: form.notes.trim() || null,
        findings: findings.map((f) => ({
          id: f.id,
          issue: f.issue,
          amount: f.amount ? Number(f.amount) : null,
          accepted: f.accepted,
        })),
      });
      addToast({ type: "success", title: t("tax.detail.saved") });
      setEditing(false);
      await load();
    } catch (err) {
      addToast({
        type: "error",
        title: t("tax.detail.save_failed"),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!slug) return;
    setDeleting(true);
    try {
      await api.tax.audits.remove(slug);
      addToast({ type: "success", title: t("tax.detail.deleted") });
      router.push("/dashboard/tax-audit");
    } catch (err) {
      addToast({
        type: "error",
        title: t("tax.detail.delete_failed"),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  }

  function addFinding() {
    setFindings((p) => [
      ...p,
      { id: `finding-${Date.now()}`, issue: "", amount: "", accepted: false },
    ]);
  }

  function updateFinding(id: string, patch: Partial<FindingEntry>) {
    setFindings((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeFinding(id: string) {
    setFindings((p) => p.filter((f) => f.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[color:var(--ds-text-subtle)]" size={24} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <Link
          href="/dashboard/tax-audit"
          className="inline-flex items-center gap-1 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--brand-primary)]"
        >
          <ArrowLeft size={14} /> {t("tax.detail.back")}
        </Link>
        <p className="text-sm text-[color:var(--ds-text-subtle)]">{t("tax.detail.not_found")}</p>
      </div>
    );
  }

  const fm = (data.frontmatter ?? {}) as Record<string, unknown>;
  const rawFindings = Array.isArray(fm.findings)
    ? (fm.findings as Array<Record<string, unknown>>)
    : [];
  const locale = lang === "en" ? "en-GB" : "de-DE";

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <Link
        href="/dashboard/tax-audit"
        className="inline-flex items-center gap-1 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--brand-primary)]"
      >
        <ArrowLeft size={14} /> {t("tax.detail.back_overview")}
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-500/10">
            <Search size={24} className="text-rose-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[color:var(--ds-text)]">{data.title}</h1>
            <p className="text-sm text-[color:var(--ds-text-subtle)]">{t("nav.tax_audit")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(!editing)}
            className="gap-2"
          >
            {editing ? <X size={14} /> : <Pencil size={14} />}
            {editing ? t("tax.detail.cancel") : t("tax.detail.edit")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="gap-2 text-red-600 hover:bg-red-500/10 hover:text-red-700"
          >
            <Trash2 size={14} /> {t("tax.detail.delete")}
          </Button>
        </div>
      </div>

      <Card className="space-y-4 p-6">
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_client")} *
                </label>
                <Input
                  value={form.clientName}
                  onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_type")}
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {AUDIT_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_year")}
                </label>
                <Input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm((p) => ({ ...p, year: Number(e.target.value) }))}
                  min={2000}
                  max={new Date().getFullYear() + 1}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_phase")}
                </label>
                <select
                  value={form.phase}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, phase: e.target.value as TaxAuditPhase }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {PHASE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_auditor")}
                </label>
                <Input
                  value={form.auditor}
                  onChange={(e) => setForm((p) => ({ ...p, auditor: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_additional_tax")}
                </label>
                <Input
                  type="number"
                  value={form.totalAdditionalTax}
                  onChange={(e) => setForm((p) => ({ ...p, totalAdditionalTax: e.target.value }))}
                  placeholder="0,00"
                  step="0.01"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_start")}
                </label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_end")}
                </label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_findings")} ({findings.length})
                </label>
                <Button variant="outline" size="sm" onClick={addFinding} className="gap-1">
                  <Plus size={12} /> {t("tax.detail.add_finding")}
                </Button>
              </div>
              <div className="space-y-2">
                {findings.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                  >
                    <Input
                      value={f.issue}
                      onChange={(e) => updateFinding(f.id, { issue: e.target.value })}
                      placeholder={t("tax.detail.finding_placeholder")}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={f.amount}
                      onChange={(e) => updateFinding(f.id, { amount: e.target.value })}
                      placeholder="€"
                      className="w-28"
                      step="0.01"
                    />
                    <label className="flex items-center gap-1 pt-2 text-xs text-[color:var(--ds-text-muted)]">
                      <input
                        type="checkbox"
                        checked={f.accepted}
                        onChange={(e) => updateFinding(f.id, { accepted: e.target.checked })}
                        className="h-4 w-4 rounded border-[color:var(--ds-border)]"
                      />
                      OK
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFinding(f.id)}
                      className="text-red-600 hover:bg-red-500/10"
                    >
                      <Trash size={14} />
                    </Button>
                  </div>
                ))}
                {findings.length === 0 && (
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("tax.detail.no_findings")}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.detail.label_notes")}
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                {t("tax.detail.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving || !form.clientName.trim()}
                className="brand-bg gap-2 text-white"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? t("tax.detail.saving") : t("tax.detail.save")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_client")}
                </p>
                <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                  <User size={14} /> {String(fm.client_name ?? "—")}
                </p>
              </div>
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_type")}
                </p>
                <p className="text-sm font-medium text-[color:var(--ds-text)]">
                  {AUDIT_TYPES.find((o) => o.value === fm.audit_type)?.label ??
                    String(fm.audit_type ?? "—")}
                </p>
              </div>
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_auditor")}
                </p>
                <p className="text-sm font-medium text-[color:var(--ds-text)]">
                  {String(fm.auditor ?? "—")}
                </p>
              </div>
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_phase")}
                </p>
                <Badge
                  variant={
                    PHASE_VARIANTS[(fm.phase as TaxAuditPhase) ?? "vorbereitung"] ?? "default"
                  }
                >
                  {PHASE_OPTIONS.find((o) => o.value === fm.phase)?.label ??
                    String(fm.phase ?? "vorbereitung")}
                </Badge>
              </div>
              {Boolean(fm.start_date) && (
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("tax.detail.label_start")}
                  </p>
                  <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                    <Calendar size={14} /> {String(fm.start_date).slice(0, 10)}
                  </p>
                </div>
              )}
              {Boolean(fm.end_date) && (
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("tax.detail.label_end")}
                  </p>
                  <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                    <Calendar size={14} /> {String(fm.end_date).slice(0, 10)}
                  </p>
                </div>
              )}
            </div>

            {fm.total_additional_tax != null && Number(fm.total_additional_tax) > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-600">
                <AlertTriangle size={16} />
                {t("tax.detail.label_additional_tax")}:{" "}
                {Number(fm.total_additional_tax).toLocaleString(locale, {
                  style: "currency",
                  currency: "EUR",
                })}
              </div>
            )}

            {rawFindings.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_findings")} ({rawFindings.length})
                </p>
                <div className="space-y-2">
                  {rawFindings.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 text-sm text-[color:var(--ds-text-muted)]"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-[color:var(--ds-text)]">
                          {String(
                            f.issue ?? f.title ?? `${t("tax.detail.label_findings")} ${i + 1}`
                          )}
                        </p>
                        {Boolean(f.accepted) && <Badge variant="success">akzeptiert</Badge>}
                      </div>
                      {f.amount != null && (
                        <p className="mt-1 text-xs font-medium text-rose-500">
                          +
                          {Number(f.amount).toLocaleString(locale, {
                            style: "currency",
                            currency: "EUR",
                          })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Boolean(fm.notes) && (
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_notes")}
                </p>
                <p className="text-sm text-[color:var(--ds-text)]">{String(fm.notes)}</p>
              </div>
            )}
          </>
        )}
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle size={18} /> {t("tax.detail.delete_title")}
            </DialogTitle>
            <DialogDescription>{t("tax.detail.delete_desc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t("tax.detail.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t("tax.detail.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
