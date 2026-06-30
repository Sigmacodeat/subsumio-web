"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Calendar,
  User,
  Loader2,
  Pencil,
  Trash2,
  Save,
  X,
  AlertCircle,
  Euro,
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
import type { TaxReturnType, TaxReturnStatus } from "@/lib/tax-types";

const TYPE_OPTIONS: Array<{ value: TaxReturnType; label: string }> = [
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

const STATUS_OPTIONS: Array<{ value: TaxReturnStatus; label: string }> = [
  { value: "draft", label: "Entwurf" },
  { value: "in_progress", label: "In Bearbeitung" },
  { value: "review", label: "Zur Prüfung" },
  { value: "submitted", label: "Eingereicht" },
  { value: "assessed", label: "Veranlagt" },
  { value: "corrected", label: "Korrigiert" },
  { value: "closed", label: "Abgeschlossen" },
];

const STATUS_VARIANTS: Record<
  TaxReturnStatus,
  "default" | "info" | "warning" | "success" | "danger"
> = {
  draft: "default",
  in_progress: "info",
  review: "warning",
  submitted: "info",
  assessed: "success",
  corrected: "warning",
  closed: "default",
};

export default function TaxReturnDetailPage() {
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
    type: "ESt" as TaxReturnType,
    year: new Date().getFullYear(),
    status: "draft" as TaxReturnStatus,
    dueDate: "",
    taxAmount: "",
    notes: "",
    submittedDate: "",
    assessedDate: "",
    assignedTo: "",
    refundAmount: "",
  });

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const p = await api.tax.returns.get(slug);
      setData(p);
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      setForm({
        clientName: String(fm.client_name ?? ""),
        type: (fm.tax_type as TaxReturnType) ?? "ESt",
        year: Number(fm.year ?? new Date().getFullYear()),
        status: (fm.status as TaxReturnStatus) ?? "draft",
        dueDate: fm.due_date ? String(fm.due_date).slice(0, 10) : "",
        taxAmount: fm.tax_amount != null ? String(fm.tax_amount) : "",
        notes: String(fm.notes ?? ""),
        submittedDate: fm.submitted_date ? String(fm.submitted_date).slice(0, 10) : "",
        assessedDate: fm.assessed_date ? String(fm.assessed_date).slice(0, 10) : "",
        assignedTo: fm.assigned_to ? String(fm.assigned_to) : "",
        refundAmount: fm.refund_amount != null ? String(fm.refund_amount) : "",
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
      await api.tax.returns.update(slug, {
        clientName: form.clientName.trim(),
        type: form.type,
        year: form.year,
        status: form.status,
        dueDate: form.dueDate || null,
        taxAmount: form.taxAmount ? Number(form.taxAmount) : null,
        notes: form.notes.trim() || null,
        submittedDate: form.submittedDate || null,
        assessedDate: form.assessedDate || null,
        assignedTo: form.assignedTo.trim() || null,
        refundAmount: form.refundAmount ? Number(form.refundAmount) : null,
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
      await api.tax.returns.remove(slug);
      addToast({ type: "success", title: t("tax.detail.deleted") });
      router.push("/dashboard/tax-returns");
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
          href="/dashboard/tax-returns"
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
        href="/dashboard/tax-returns"
        className="inline-flex items-center gap-1 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--brand-primary)]"
      >
        <ArrowLeft size={14} /> {t("tax.detail.back_overview")}
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <FileText size={24} className="text-emerald-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[color:var(--ds-text)]">{data.title}</h1>
            <p className="text-sm text-[color:var(--ds-text-subtle)]">{t("nav.tax_returns")}</p>
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
                    setForm((p) => ({ ...p, type: e.target.value as TaxReturnType }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {TYPE_OPTIONS.map((o) => (
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
                  {t("tax.detail.label_status")}
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, status: e.target.value as TaxReturnStatus }))
                  }
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
                  {t("tax.detail.label_tax_amount")}
                </label>
                <Input
                  type="number"
                  value={form.taxAmount}
                  onChange={(e) => setForm((p) => ({ ...p, taxAmount: e.target.value }))}
                  placeholder="0,00"
                  step="0.01"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_submitted_date")}
                </label>
                <Input
                  type="date"
                  value={form.submittedDate}
                  onChange={(e) => setForm((p) => ({ ...p, submittedDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_assessed_date")}
                </label>
                <Input
                  type="date"
                  value={form.assessedDate}
                  onChange={(e) => setForm((p) => ({ ...p, assessedDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_assigned_to")}
                </label>
                <Input
                  value={form.assignedTo}
                  onChange={(e) => setForm((p) => ({ ...p, assignedTo: e.target.value }))}
                  placeholder={t("tax.detail.label_assigned_to_ph")}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.detail.label_refund_amount")}
                </label>
                <Input
                  type="number"
                  value={form.refundAmount}
                  onChange={(e) => setForm((p) => ({ ...p, refundAmount: e.target.value }))}
                  placeholder="0,00"
                  step="0.01"
                />
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
                  {TYPE_OPTIONS.find((o) => o.value === fm.tax_type)?.label ??
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
                  {t("tax.detail.label_status")}
                </p>
                <Badge
                  variant={STATUS_VARIANTS[(fm.status as TaxReturnStatus) ?? "draft"] ?? "default"}
                >
                  {STATUS_OPTIONS.find((o) => o.value === fm.status)?.label ??
                    String(fm.status ?? "draft")}
                </Badge>
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
              {fm.tax_amount != null && Number(fm.tax_amount) > 0 && (
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("tax.detail.label_tax_amount")}
                  </p>
                  <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                    <Euro size={14} />{" "}
                    {Number(fm.tax_amount).toLocaleString(locale, {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </p>
                </div>
              )}
              {Boolean(fm.submitted_date) && (
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("tax.detail.label_submitted_date")}
                  </p>
                  <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                    <Calendar size={14} /> {String(fm.submitted_date).slice(0, 10)}
                  </p>
                </div>
              )}
              {Boolean(fm.assessed_date) && (
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("tax.detail.label_assessed_date")}
                  </p>
                  <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                    <Calendar size={14} /> {String(fm.assessed_date).slice(0, 10)}
                  </p>
                </div>
              )}
              {Boolean(fm.assigned_to) && (
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("tax.detail.label_assigned_to")}
                  </p>
                  <p className="flex items-center gap-2 text-sm font-medium text-[color:var(--ds-text)]">
                    <User size={14} /> {String(fm.assigned_to)}
                  </p>
                </div>
              )}
              {fm.refund_amount != null && Number(fm.refund_amount) > 0 && (
                <div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">
                    {t("tax.detail.label_refund_amount")}
                  </p>
                  <p className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                    <Euro size={14} />{" "}
                    {Number(fm.refund_amount).toLocaleString(locale, {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </p>
                </div>
              )}
            </div>
            {Boolean(fm.notes) && (
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_notes")}
                </p>
                <p className="text-sm text-[color:var(--ds-text)]">{String(fm.notes)}</p>
              </div>
            )}
            {data.content && (
              <div>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("tax.detail.label_description")}
                </p>
                <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4 text-sm text-[color:var(--ds-text-muted)]">
                  {data.content}
                </div>
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
