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

export default function DictationPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [entries, setEntries] = useState<DictationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
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
    } catch (e) {
      addToast({
        type: "error",
        title: t("dictation.err_create"),
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const pendingCount = entries.filter((e) => e.status === "transcribed").length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("dictation.title")}
        description={t("dictation.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("dictation.title") }]}
        actions={
          <Button onClick={() => setShowCreate(!showCreate)} className="brand-bg gap-2 text-white">
            <Plus size={16} /> {t("dictation.new")}
          </Button>
        }
      />

      {pendingCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <FileText size={16} className="mt-0.5 shrink-0 text-blue-600" />
          <p className="text-sm text-blue-600">
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
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("dictation.lawyer")} *
              </Label>
              <Input
                value={form.lawyer_name}
                onChange={(e) => setForm({ ...form, lawyer_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("dictation.email")} *
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
                {t("dictation.case")}
              </Label>
              <Input
                value={form.case_slug}
                onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("dictation.duration_sec")} *
              </Label>
              <Input
                type="number"
                min="1"
                value={form.duration_seconds}
                onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })}
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
            {t("dictation.save")}
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-16 text-center">
          <Mic size={32} className="mb-3 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm font-medium">{t("dictation.empty")}</p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {t("dictation.empty_hint")}
          </p>
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
                  <span className="text-sm font-medium">{entry.lawyer_name}</span>
                  <Badge
                    variant="default"
                    className={`text-xs ${entry.status === "filed" ? "border-green-500/30 text-green-600" : entry.status === "failed" ? "border-red-500/30 text-red-600" : ""}`}
                  >
                    {entry.status === "recording"
                      ? "Aufnahme"
                      : entry.status === "transcribed"
                        ? "Transkribiert"
                        : entry.status === "corrected"
                          ? "Korrigiert"
                          : entry.status === "filed"
                            ? "Abgelegt"
                            : "Fehler"}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {formatDictationDuration(entry.duration_seconds)} · {entry.language}{" "}
                  {entry.case_slug ? `· ${entry.case_slug}` : ""}
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
