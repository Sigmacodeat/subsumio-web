"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, FileText, FileQuestion, Plus, Trash2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import {
  variableFromLabel,
  type InterviewDefinition,
  type InterviewQuestionType,
} from "@/lib/document-interviews";

const STATUS_COLORS: Record<string, string> = {
  unreviewed: "bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]",
  reviewed: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  approved: "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
};

const STATUS_LABELS: Record<string, string> = {
  unreviewed: "Ungeprüft",
  reviewed: "Geprüft",
  approved: "Freigegeben",
};

const QUESTION_TYPES: Array<{ value: InterviewQuestionType; label: string }> = [
  { value: "text", label: "Text (einzeilig)" },
  { value: "textarea", label: "Text (mehrzeilig)" },
  { value: "date", label: "Datum" },
  { value: "number", label: "Zahl" },
  { value: "boolean", label: "Ja/Nein" },
  { value: "party", label: "Partei" },
];

interface DraftQuestion {
  label: string;
  type: InterviewQuestionType;
  required: boolean;
}

const EMPTY_FORM = {
  title: "",
  description: "",
  template_slug: "",
  output_format: "docx" as "docx" | "pdf" | "markdown",
};

export default function DocumentInterviewsPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [interviews, setInterviews] = useState<InterviewDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { label: "", type: "text", required: true },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data?: { items?: InterviewDefinition[] } }>(
        "/api/document-interviews"
      );
      setInterviews(res?.data?.items ?? []);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      addToast({ type: "error", title: t("interview.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateQuestion = (index: number, patch: Partial<DraftQuestion>) =>
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));

  const create = async () => {
    const filled = questions.filter((q) => q.label.trim());
    if (!form.title.trim() || !form.template_slug.trim() || filled.length === 0) {
      addToast({
        type: "error",
        title: t("interview.err_required"),
        description: "Titel, Vorlagenkennung und mindestens eine Frage sind erforderlich.",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/document-interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          title: form.title.trim(),
          template_slug: form.template_slug.trim(),
          questions: filled.map((q, i) => ({
            id: `q${i + 1}`,
            type: q.type,
            label: q.label.trim(),
            required: q.required,
            variable: variableFromLabel(q.label, i),
          })),
        }),
      });
      if (!res.ok) {
        // apiError: { error: "<deutscher Text>", code }
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "");
      }
      addToast({ type: "success", title: t("interview.ok_create") });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setQuestions([{ label: "", type: "text", required: true }]);
      void load();
    } catch (err) {
      addToast({
        type: "error",
        title: t("interview.err_create"),
        description: err instanceof Error && err.message ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("interview.title")}
        description={t("interview.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: "Interviews" },
        ]}
        actions={
          <PrimaryAction onClick={() => setShowCreate(!showCreate)}>
            {t("interview.new")}
          </PrimaryAction>
        }
      />

      {showCreate && (
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="font-semibold">{t("interview.create_title")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="interview-title">{t("interview.title_label")} *</Label>
              <Input
                id="interview-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="interview-template">{t("interview.template_slug")} *</Label>
              <Input
                id="interview-template"
                value={form.template_slug}
                onChange={(e) => setForm({ ...form, template_slug: e.target.value })}
                placeholder="templates/scheidungsvereinbarung"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="interview-description">{t("interview.description_label")}</Label>
              <Input
                id="interview-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="interview-format">{t("interview.output_format")}</Label>
              <select
                id="interview-format"
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

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("interview.questions")} *</legend>
            {questions.map((q, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`Frage ${i + 1}`}
                  className="min-w-[200px] flex-1"
                  value={q.label}
                  placeholder="z. B. Name der Mandantin"
                  onChange={(e) => updateQuestion(i, { label: e.target.value })}
                />
                <select
                  aria-label={`Antworttyp Frage ${i + 1}`}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-2 text-sm"
                  value={q.type}
                  onChange={(e) =>
                    updateQuestion(i, { type: e.target.value as InterviewQuestionType })
                  }
                >
                  {QUESTION_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                  />
                  Pflichtfrage
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Frage ${i + 1} entfernen`}
                  disabled={questions.length === 1}
                  onClick={() => setQuestions((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setQuestions((prev) => [...prev, { label: "", type: "text", required: false }])
              }
            >
              <Plus size={14} /> Frage hinzufügen
            </Button>
          </fieldset>

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
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : loadFailed ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[color:var(--ds-danger-border)] p-10 text-center"
        >
          <AlertTriangle className="h-8 w-8 text-[color:var(--ds-danger-text)]" />
          <p>Interviews konnten nicht geladen werden.</p>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Erneut versuchen
          </Button>
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
                <Badge className={STATUS_COLORS[iv.review_status] ?? ""}>
                  {STATUS_LABELS[iv.review_status] ?? iv.review_status}
                </Badge>
              </div>
              <p className="text-sm text-[color:var(--ds-text-muted)]">{iv.description}</p>
              <div className="flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                <span>
                  <FileText className="mr-1 inline h-3 w-3" />
                  {(iv.questions ?? []).length} {t("interview.questions")}
                </span>
                <span>· {(iv.output_format ?? "docx").toUpperCase()}</span>
                <span>· {iv.template_slug}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
