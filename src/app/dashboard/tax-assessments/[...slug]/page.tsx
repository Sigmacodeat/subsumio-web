"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Calendar,
  User,
  Euro,
  Loader2,
  Pencil,
  Trash2,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
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
import type { AssessmentType, TaxReturnType } from "@/lib/tax-types";

const ASSESSMENT_TYPES: Array<{ value: AssessmentType; label: string }> = [
  { value: "Einschaetzung", label: "Einschätzung" },
  { value: "Festsetzung", label: "Festsetzung" },
  { value: "Nachforderung", label: "Nachforderung" },
  { value: "Erstattung", label: "Erstattung" },
  { value: "Vorauszahlung", label: "Vorauszahlung" },
  { value: "Stundung", label: "Stundung" },
  { value: "Haftruecklass", label: "Haft-/Rücklass" },
];

const TAX_TYPES: Array<{ value: TaxReturnType; label: string }> = [
  { value: "ESt", label: "Einkommensteuer" },
  { value: "USt", label: "Umsatzsteuer" },
  { value: "GewSt", label: "Gewerbesteuer" },
  { value: "KSt", label: "Körperschaftsteuer" },
  { value: "SolZ", label: "Solidaritätszuschlag" },
  { value: "VSt", label: "Vermögensteuer" },
  { value: "GrESt", label: "Grunderwerbsteuer" },
  { value: "ErbSt", label: "Erbschaftsteuer" },
  { value: "LSt", label: "Lohnsteuer" },
  { value: "UStVA", label: "USt-Voranmeldung" },
  { value: "LStA", label: "Lohnsteuer-Anmeldung" },
  { value: "ZM", label: "Zusammenfassende Meldung" },
  { value: "other", label: "Sonstige" },
];

export default function TaxAssessmentDetailPage() {
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
    type: "Festsetzung" as AssessmentType,
    taxType: "ESt" as TaxReturnType,
    year: new Date().getFullYear(),
    noticeNumber: "",
    noticeDate: "",
    dueDate: "",
    amount: "",
    paidDate: "",
    contested: false,
    contestDeadline: "",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const p = await api.tax.assessments.get(slug);
      setData(p);
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      setForm({
        clientName: String(fm.client_name ?? ""),
        type: (fm.assessment_type as AssessmentType) ?? "Festsetzung",
        taxType: (fm.tax_type as TaxReturnType) ?? "ESt",
        year: Number(fm.year ?? new Date().getFullYear()),
        noticeNumber: String(fm.notice_number ?? ""),
        noticeDate: fm.notice_date ? String(fm.notice_date).slice(0, 10) : "",
        dueDate: fm.due_date ? String(fm.due_date).slice(0, 10) : "",
        amount: fm.amount != null ? String(fm.amount) : "",
        paidDate: fm.paid_date ? String(fm.paid_date).slice(0, 10) : "",
        contested: Boolean(fm.contested),
        contestDeadline: fm.contest_deadline ? String(fm.contest_deadline).slice(0, 10) : "",
        notes: String(fm.notes ?? ""),
      });
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
      await api.tax.assessments.update(slug, {
        clientName: form.clientName.trim(),
        type: form.type,
        taxType: form.taxType,
        year: form.year,
        noticeNumber: form.noticeNumber || null,
        noticeDate: form.noticeDate || null,
        dueDate: form.dueDate || null,
        amount: Number(form.amount) || 0,
        paidDate: form.paidDate || null,
        contested: form.contested,
        contestDeadline: form.contestDeadline || null,
        notes: form.notes.trim() || null,
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
      await api.tax.assessments.remove(slug);
      addToast({ type: "success", title: t("tax.detail.deleted") });
      router.push("/dashboard/tax-assessments");
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
          href="/dashboard/tax-assessments"
          className="inline-flex items-center gap-1 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--brand-primary)]"
        >
          <ArrowLeft size={14} /> {t("tax.detail.back")}
        </Link>
        <p className="text-sm text-[color:var(--ds-text-subtle)]">{t("tax.detail.not_found")}</p>
      </div>
    );
  }

  const fm = (data.frontmatter ?? {}) as Record<string, unknown>;
  const locale = lang === "en" ? "en-GB" : "de-DE";

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <Link
        href="/dashboard/tax-assessments"
        className="inline-flex items-center gap-1 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--brand-primary)]"
      >
        <ArrowLeft size={14} /> {t("tax.detail.back_overview")}
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <FileText size={24} className="text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[color:var(--ds-text)]">{data.title}</h1>
            <p className="text-sm text-[color:var(--ds-text-subtle)]">{t("nav.tax_assessments")}</p>
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
                  onChange={(e) =>
                    setForm((p) => ({ ...p, type: e.target.value as AssessmentType }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {ASSESSMENT_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_tax_type")}
                </label>
                <select
                  value={form.taxType}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, taxType: e.target.value as TaxReturnType }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {TAX_TYPES.map((o) => (
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
                  {t("tax.detail.label_notice_no")}
                </label>
                <Input
                  value={form.noticeNumber}
                  onChange={(e) => setForm((p) => ({ ...p, noticeNumber: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_notice_date")}
                </label>
                <Input
                  type="date"
                  value={form.noticeDate}
                  onChange={(e) => setForm((p) => ({ ...p, noticeDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_due")}
                </label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_amount")}
                </label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0,00"
                  step="0.01"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_paid_date")}
                </label>
                <Input
                  type="date"
                  value={form.paidDate}
                  onChange={(e) => setForm((p) => ({ ...p, paidDate: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <label className="flex items-center gap-2 text-sm text-[color:var(--ds-text)]">
                  <input
                    type="checkbox"
                    checked={form.contested}
                    onChange={(e) => setForm((p) => ({ ...p, contested: e.target.checked }))}
                    className="h-4 w-4 rounded border-[color:var(--ds-border)]"
                  />
                  {t("tax.detail.contested")}
                </label>
              </div>
              {form.contested && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                    {t("tax.detail.label_contest_deadline")}
                  </label>
                  <Input
                    type="date"
                    value={form.contestDeadline}
                    onChange={(e) => setForm((p) => ({ ...p, contestDeadline: e.target.value }))}
                  />
                </div>
              )}
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
                disabled={saving || !form.clientName.trim() || !form.noticeDate}
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
                  {ASSESSMENT_TYPES.find((o) => o.value === fm.assessment_type)?.label ??
                    String(fm.assessment_type ?? "—")}
                </p>
              </div>
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_tax_type")}
                </p>
                <p className="text-sm font-medium text-[color:var(--ds-text)]">
                  {TAX_TYPES.find((o) => o.value === fm.tax_type)?.label ??
                    String(fm.tax_type ?? "—")}
                </p>
              </div>
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_year")}
                </p>
                <p className="text-sm font-medium text-[color:var(--ds-text)]">
                  {String(fm.year ?? "—")}
                </p>
              </div>
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_notice_no")}
                </p>
                <p className="text-sm font-medium text-[color:var(--ds-text)]">
                  {String(fm.notice_number ?? "—")}
                </p>
              </div>
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_notice_date")}
                </p>
                <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                  <Calendar size={14} /> {String(fm.notice_date ?? "—").slice(0, 10)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_amount")}
                </p>
                <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                  <Euro size={14} />{" "}
                  {Number(fm.amount ?? 0).toLocaleString(locale, {
                    style: "currency",
                    currency: "EUR",
                  })}
                </p>
              </div>
              {Boolean(fm.due_date) && (
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("tax.detail.label_due")}
                  </p>
                  <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                    <Calendar size={14} /> {String(fm.due_date).slice(0, 10)}
                  </p>
                </div>
              )}
              {Boolean(fm.paid_date) && (
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("tax.detail.label_paid_date")}
                  </p>
                  <p className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                    <CheckCircle2 size={14} /> {String(fm.paid_date).slice(0, 10)}
                  </p>
                </div>
              )}
            </div>
            {Boolean(fm.contested) && (
              <div className="flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-600">
                <span>{t("tax.detail.contested")}</span>
                {Boolean(fm.contest_deadline) && (
                  <span className="text-xs">
                    {t("tax.detail.label_contest_deadline")}:{" "}
                    {String(fm.contest_deadline).slice(0, 10)}
                  </span>
                )}
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
