"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, GraduationCap, Clock, FileDown, AlertTriangle, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { ContinuingEducationEntry } from "@/lib/fao-tracking";
import { FAO_REQUIRED_HOURS } from "@/lib/fao-tracking";

export default function FAOTrackingPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [entries, setEntries] = useState<ContinuingEducationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    lawyer_name: "",
    lawyer_email: "",
    specialist_title: "",
    date: "",
    hours: "",
    topic: "",
    provider: "",
  });

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "fao_education_entry", limit: 500 });
      setEntries(pages.map((p) => p.frontmatter as unknown as ContinuingEducationEntry));
    } catch {
      addToast({ type: "error", title: t("fao.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (
      !form.lawyer_name ||
      !form.lawyer_email ||
      !form.specialist_title ||
      !form.date ||
      !form.hours ||
      !form.topic ||
      !form.provider
    ) {
      addToast({ type: "error", title: t("fao.missing_fields") });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/fao-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawyer_email: form.lawyer_email,
          lawyer_name: form.lawyer_name,
          specialist_title: form.specialist_title,
          date: form.date,
          hours: Number(form.hours),
          topic: form.topic,
          provider: form.provider,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({ type: "success", title: t("fao.created") });
      setShowCreate(false);
      setForm({
        lawyer_name: "",
        lawyer_email: "",
        specialist_title: "",
        date: "",
        hours: "",
        topic: "",
        provider: "",
      });
      void load();
    } catch (e) {
      addToast({
        type: "error",
        title: t("fao.err_save"),
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const year = new Date().getFullYear();
  const verifiedHours = entries
    .filter((e) => e.status === "verified")
    .reduce((sum, e) => sum + e.hours, 0);
  const remaining = Math.max(0, FAO_REQUIRED_HOURS - verifiedHours);
  const progress = Math.min(100, Math.round((verifiedHours / FAO_REQUIRED_HOURS) * 100));

  const now = new Date();
  const isQ4 = now.getMonth() >= 9;
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [warningChecked, setWarningChecked] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWarningDismissed(Boolean(localStorage.getItem("subsumio:fao-warning-dismissed")));
      setWarningChecked(true);
    }
  }, []);

  const showWarning = isQ4 && remaining > 0 && !warningDismissed;

  function exportPDF() {
    const win = window.open("", "_blank");
    if (!win) {
      addToast({ type: "error", title: t("fao.err_save") });
      return;
    }
    const rows = entries
      .map(
        (e) =>
          `<tr><td>${e.date.split("T")[0]}</td><td>${e.lawyer_name}</td><td>${e.specialist_title}</td><td>${e.topic}</td><td>${e.provider}</td><td>${e.hours}</td><td>${e.status}</td></tr>`
      )
      .join("");
    win.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>FAO-Tracking ${year}</title><style>body{font-family:Arial,sans-serif;margin:40px}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f5f5f5}.summary{margin:20px 0;padding:12px;background:#f0f4ff;border-radius:8px}</style></head><body><h1>FAO-Tracking ${year}</h1><div class="summary"><p><strong>Verifizierte Stunden:</strong> ${verifiedHours} / ${FAO_REQUIRED_HOURS}</p><p><strong>Verbleibend:</strong> ${remaining}h</p></div><table><thead><tr><th>Datum</th><th>Anwalt</th><th>Fachanwaltsbezeichnung</th><th>Thema</th><th>Veranstalter</th><th>Stunden</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
    );
    win.document.close();
    setTimeout(() => win.print(), 300);
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      {showWarning && warningChecked && !warningDismissed && (
        <div
          className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4"
          role="alert"
        >
          <AlertTriangle
            size={18}
            className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[color:var(--ds-warning-text)]">
              {t("fao.warning_title")}
            </p>
            <p className="mt-1 text-sm text-[color:var(--ds-warning-text)]">
              {t("fao.warning_desc").replace("{remaining}", String(remaining))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem("subsumio:fao-warning-dismissed", "1");
              setWarningDismissed(true);
            }}
            aria-label={t("common.close")}
            className="rounded-md p-1 text-[color:var(--ds-warning-text)] hover:bg-[color:var(--ds-hover)]"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <PageHeader
        title={t("fao.title")}
        description={t("fao.section_fao").replace("{hours}", String(FAO_REQUIRED_HOURS))}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("fao.title") }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportPDF()} disabled={entries.length === 0}>
              <FileDown size={15} aria-hidden="true" /> {t("fao.export_pdf")}
            </Button>
            <Button
              onClick={() => setShowCreate(!showCreate)}
              className="brand-bg gap-2 text-white"
            >
              <Plus size={16} /> {t("fao.add")}
            </Button>
          </div>
        }
      />

      {/* Progress card */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-[color:var(--ds-text-muted)]" />
            <span className="text-sm font-medium">
              {year}: {verifiedHours} / {FAO_REQUIRED_HOURS} {t("fao.year_progress")}
            </span>
          </div>
          <Badge
            variant="default"
            className={
              remaining === 0
                ? "border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]"
                : remaining > 5
                  ? "border-[color:var(--ds-attention-border)] text-[color:var(--ds-attention-text)]"
                  : ""
            }
          >
            {remaining === 0 ? t("fao.fulfilled") : `${remaining}${t("fao.hours_open")}`}
          </Badge>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
          <div
            className={`h-full transition-all ${progress === 100 ? "bg-[color:var(--ds-success-solid)]" : "bg-[color:var(--ds-info-solid)]"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {showCreate && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <h2 className="text-sm font-semibold">{t("fao.create_title")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("fao.lawyer")} *
              </Label>
              <Input
                value={form.lawyer_name}
                onChange={(e) => setForm({ ...form, lawyer_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("fao.email")} *
              </Label>
              <Input
                type="email"
                value={form.lawyer_email}
                onChange={(e) => setForm({ ...form, lawyer_email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("fao.specialist_title")} *
              </Label>
              <Input
                value={form.specialist_title}
                onChange={(e) => setForm({ ...form, specialist_title: e.target.value })}
                placeholder={t("fao.specialist_placeholder")}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">{t("fao.date")} *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("fao.hours")} *
              </Label>
              <Input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("fao.provider")} *
              </Label>
              <Input
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("fao.topic")} *
              </Label>
              <Input
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t("fao.save")}
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-16 text-center">
          <GraduationCap size={32} className="mb-3 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm font-medium">{t("fao.empty_title")}</p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">{t("fao.empty_desc")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{entry.topic}</span>
                  <Badge
                    variant="default"
                    className={`text-xs ${entry.status === "verified" ? "border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]" : entry.status === "rejected" ? "border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]" : ""}`}
                  >
                    {entry.status === "verified"
                      ? t("fao.verified")
                      : entry.status === "rejected"
                        ? t("fao.rejected")
                        : t("fao.pending")}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {entry.lawyer_name} · {entry.specialist_title} · {entry.hours}h ·{" "}
                  {entry.date.split("T")[0]}
                </div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">{entry.provider}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
