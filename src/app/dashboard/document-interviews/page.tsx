"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, FileText, FileQuestion } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { InterviewDefinition } from "@/lib/document-interviews";

const STATUS_COLORS: Record<string, string> = {
  unreviewed: "bg-slate-100 text-slate-600",
  reviewed: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
};

export default function DocumentInterviewsPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [interviews, setInterviews] = useState<InterviewDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    template_slug: "",
    output_format: "docx" as "docx" | "pdf" | "markdown",
  });

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "interview_definition", limit: 200 });
      setInterviews(pages.map((p) => p.frontmatter as unknown as InterviewDefinition));
    } catch {
      addToast({ type: "error", title: t("interview.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!form.title || !form.template_slug) {
      addToast({ type: "error", title: t("interview.err_required") });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/document-interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("API error");
      addToast({ type: "success", title: t("interview.ok_create") });
      setShowCreate(false);
      setForm({ title: "", description: "", template_slug: "", output_format: "docx" });
      void load();
    } catch {
      addToast({ type: "error", title: t("interview.err_create") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("interview.title")}
        description={t("interview.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Interviews" }]}
        actions={
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("interview.new")}
          </Button>
        }
      />

      {showCreate && (
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="font-semibold">{t("interview.create_title")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>{t("interview.title_label")} *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("interview.template_slug")} *</Label>
              <Input
                value={form.template_slug}
                onChange={(e) => setForm({ ...form, template_slug: e.target.value })}
                placeholder="templates/scheidungsvereinbarung"
              />
            </div>
            <div className="md:col-span-2">
              <Label>{t("interview.description_label")}</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("interview.output_format")}</Label>
              <select
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-2 text-sm"
                value={form.output_format}
                onChange={(e) =>
                  setForm({ ...form, output_format: e.target.value as "docx" | "pdf" | "markdown" })
                }
              >
                <option value="docx">DOCX</option>
                <option value="pdf">PDF</option>
                <option value="markdown">Markdown</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={create} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("interview.save")}
            </Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              {t("interview.cancel")}
            </Button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : interviews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center text-[color:var(--ds-text-muted)]">
          <FileQuestion className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p>{t("interview.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {interviews.map((iv) => (
            <div
              key={iv.id}
              className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{iv.title}</h3>
                <Badge className={STATUS_COLORS[iv.review_status] ?? ""}>{iv.review_status}</Badge>
              </div>
              <p className="text-sm text-[color:var(--ds-text-muted)]">{iv.description}</p>
              <div className="flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                <span>
                  <FileText className="mr-1 inline h-3 w-3" />
                  {iv.questions.length} {t("interview.questions")}
                </span>
                <span>· {iv.output_format.toUpperCase()}</span>
                <span>· {iv.template_slug}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
