"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, Mic, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { DictationEntry } from "@/lib/dictation";
import { formatDictationDuration } from "@/lib/dictation";
import type { BrainPage } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";

const LANGUAGE_LABELS: Record<string, string> = {
  de: "Deutsch",
  en: "Englisch",
  fr: "Französisch",
  it: "Italienisch",
};

export default function DictationPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [entries, setEntries] = useState<DictationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cases, setCases] = useState<BrainPage[]>([]);
  const [form, setForm] = useState({
    case_slug: "",
    lawyer_name: "",
    lawyer_email: "",
    duration_seconds: "",
  });

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "dictation_entry", limit: 200 });
      setEntries(pages.map((p) => p.frontmatter as unknown as DictationEntry));
    } catch {
      addToast({ type: "error", title: t("dictation.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api.cases
      .list({ limit: 200 })
      .then((list) => {
        if (!cancelled) setCases(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const caseTitle = (slug: string) => cases.find((c) => c.slug === slug)?.title ?? "Akte";

  async function handleCreate() {
    if (!form.lawyer_name || !form.lawyer_email || !form.duration_seconds) {
      addToast({ type: "error", title: t("dictation.err_required") });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dictation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: form.case_slug || undefined,
          lawyer_email: form.lawyer_email,
          lawyer_name: form.lawyer_name,
          duration_seconds: Number(form.duration_seconds),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({ type: "success", title: t("dictation.ok_create") });
      setShowCreate(false);
      setForm({ case_slug: "", lawyer_name: "", lawyer_email: "", duration_seconds: "" });
      void load();
    } catch {
      addToast({ type: "error", title: t("dictation.err_create") });
    } finally {
      setSaving(false);
    }
  }

  const pendingCount = entries.filter((e) => e.status === "transcribed").length;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("dictation.title")}
        description={t("dictation.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("dictation.title") },
        ]}
        actions={
          <Button onClick={() => setShowCreate(!showCreate)} className="gap-2 whitespace-nowrap">
            <Plus size={16} /> {t("dictation.new")}
          </Button>
        }
      />

      {pendingCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-4 py-3">
          <FileText size={16} className="mt-0.5 shrink-0 text-[color:var(--ds-info-text)]" />
          <p className="text-sm text-[color:var(--ds-info-text)]">
            <strong>{pendingCount}</strong> {t("dictation.pending")}
          </p>
        </div>
      )}

      {showCreate && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <h2 className="text-sm font-semibold">{t("dictation.create_title")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="dict-lawyer" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("dictation.lawyer")} *
              </Label>
              <Input
                id="dict-lawyer"
                value={form.lawyer_name}
                onChange={(e) => setForm({ ...form, lawyer_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dict-email" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("dictation.email")} *
              </Label>
              <Input
                id="dict-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={form.lawyer_email}
                onChange={(e) => setForm({ ...form, lawyer_email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dict-case" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("dictation.case")}
              </Label>
              <select
                id="dict-case"
                value={form.case_slug}
                onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              >
                <option value="">Ohne Aktenbezug</option>
                {cases.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dict-duration" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("dictation.duration_sec")} *
              </Label>
              <Input
                id="dict-duration"
                type="number" inputMode="numeric"
                min="1"
                value={form.duration_seconds}
                onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })}
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
            {t("dictation.save")}
          </Button>
        </form>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Mic}
          title={t("dictation.empty")}
          description={t("dictation.empty_hint")}
          actionLabel={showCreate ? undefined : t("dictation.new")}
          onAction={showCreate ? undefined : () => setShowCreate(true)}
        />
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{entry.lawyer_name}</span>
                  <Badge
                    variant="default"
                    className={`text-xs ${entry.status === "filed" ? "border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]" : entry.status === "failed" ? "border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]" : ""}`}
                  >
                    {entry.status === "recording"
                      ? t("dictation.status_recording")
                      : entry.status === "transcribed"
                        ? t("dictation.status_transcribed")
                        : entry.status === "corrected"
                          ? t("dictation.status_corrected")
                          : entry.status === "filed"
                            ? t("dictation.status_filed")
                            : t("dictation.status_failed")}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {formatDictationDuration(entry.duration_seconds)}
                  {entry.language
                    ? ` · ${LANGUAGE_LABELS[entry.language] ?? entry.language.toUpperCase()}`
                    : ""}
                  {entry.case_slug ? ` · ${caseTitle(entry.case_slug)}` : ""}
                </div>
                {entry.transcript && (
                  <div className="mt-1 line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                    {entry.transcript}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
