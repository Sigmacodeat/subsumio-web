"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/use-lang";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import {
  FileText,
  Loader2,
  Send,
  Copy,
  Check,
  BookOpen,
  Scale,
  PenTool,
  Save,
  UserCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { caseFrontmatter, type DocumentEntry } from "@/lib/legal-types";
import { AI_NOTICE, AI_BADGE_LABEL, AI_FRONTMATTER } from "@/lib/ai-act";
import { agentActionFrontmatter } from "@/lib/approval";
import type { BrainPage } from "@/lib/types";
import { useDashboardForm } from "@/lib/hooks/use-dashboard-form";
import { draftingSchema, type DraftingFormData } from "@/lib/schemas/drafting";
import { PageHeader } from "@/components/dashboard/page-header";
import { csrfFetch } from "@/lib/csrf";

const TEMPLATE_KEYS = [
  "klage",
  "klageerwiderung",
  "berufung",
  "beschwerde",
  "mahnung",
  "antragschrift",
  "einstweilige",
  "vergleich",
  "vollstreckung",
  "beweisantrag",
  "gutachten",
  "stellungnahme",
  "widerruf",
] as const;

const TEMPLATE_META: Record<
  string,
  { icon: typeof Scale; prompt: (data: Record<string, string>) => string }
> = {
  klage: {
    icon: Scale,
    prompt: (data) =>
      `Entwirf eine Klageschrift für den Rechtsstreit: ${data.title}. Kläger: ${data.klaeger}, Beklagter: ${data.beklagter}. Streitgegenstand: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  klageerwiderung: {
    icon: Scale,
    prompt: (data) =>
      `Entwirf eine Klageerwiderung für den Rechtsstreit: ${data.title}. Beklagter: ${data.beklagter}, Kläger: ${data.klaeger}. Verteidigung: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  berufung: {
    icon: Scale,
    prompt: (data) =>
      `Entwirf eine Berufungsschrift für den Rechtsstreit: ${data.title}. Berufungsführer: ${data.klaeger}, Berufungsgegner: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  beschwerde: {
    icon: Scale,
    prompt: (data) =>
      `Entwirf eine Beschwerdeschrift für: ${data.title}. Beschwerdeführer: ${data.klaeger}, Beschwerdegegner: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  mahnung: {
    icon: PenTool,
    prompt: (data) =>
      `Entwirf eine Mahnung/Schreiben für: ${data.title}. Empfänger: ${data.beklagter}, Absender: ${data.klaeger}. Sachverhalt: ${data.facts}. Forderung: ${data.legalBasis}.`,
  },
  antragschrift: {
    icon: FileText,
    prompt: (data) =>
      `Entwirf eine Antragschrift für: ${data.title}. Antragsteller: ${data.klaeger}, Antragsgegner: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  einstweilige: {
    icon: FileText,
    prompt: (data) =>
      `Entwirf einen Antrag auf einstweilige Verfügung für: ${data.title}. Antragsteller: ${data.klaeger}, Antragsgegner: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  vergleich: {
    icon: FileText,
    prompt: (data) =>
      `Entwirf einen Vergleichsvertrag für den Rechtsstreit: ${data.title}. Partei A: ${data.klaeger}, Partei B: ${data.beklagter}. Streitgegenstand: ${data.facts}.`,
  },
  vollstreckung: {
    icon: FileText,
    prompt: (data) =>
      `Entwirf einen Antrag auf Erlass eines Vollstreckungsbescheids für: ${data.title}. Gläubiger: ${data.klaeger}, Schuldner: ${data.beklagter}. Forderung: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  beweisantrag: {
    icon: FileText,
    prompt: (data) =>
      `Entwirf einen Beweisantrag für den Rechtsstreit: ${data.title}. Antragsteller: ${data.klaeger}. Zu beweisende Tatsachen: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  gutachten: {
    icon: BookOpen,
    prompt: (data) =>
      `Entwirf ein Rechtsgutachten im Gutachtenstil zu: ${data.title}. Sachverhalt: ${data.facts}. Rechtsfrage: ${data.legalBasis}.`,
  },
  stellungnahme: {
    icon: BookOpen,
    prompt: (data) =>
      `Entwirf eine Stellungnahme für: ${data.title}. Von: ${data.klaeger}, Gegenüber: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  widerruf: {
    icon: PenTool,
    prompt: (data) =>
      `Entwirf einen Widerruf/Rücktritt für: ${data.title}. Von: ${data.klaeger}, Gegenüber: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
};

function getTemplates(t: (key: import("@/content/dashboard").DashboardKey) => string) {
  return TEMPLATE_KEYS.map((key) => ({
    key,
    label: t(`drafting.tpl.${key}` as import("@/content/dashboard").DashboardKey),
    icon: TEMPLATE_META[key].icon,
    prompt: TEMPLATE_META[key].prompt,
  }));
}

export default function DraftingPage() {
  const { t, lang } = useLang();
  const TEMPLATES = getTemplates(t);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("klage");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [docxReady, setDocxReady] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftSaved, setDraftSaved] = useState<string | null>(null);
  const [cases, setCases] = useState<BrainPage[]>([]);
  const [casesError, setCasesError] = useState(false);

  const template = TEMPLATES.find((t) => t.key === selectedTemplate)!;

  const form = useDashboardForm({
    schema: draftingSchema,
    defaultValues: {
      title: "",
      legalBasis: "",
      klaeger: "",
      beklagter: "",
      facts: "",
      selectedCaseSlug: "",
    },
    onSubmit: async (data: DraftingFormData) => {
      setGenerating(true);
      setResult(null);
      try {
        const res = await api.query.think(
          template.prompt(data as unknown as Record<string, string>),
          {
            mode: data.selectedCaseSlug ? "tokenmax" : "balanced",
            queryMode: data.selectedCaseSlug ? "deep_matter" : "balanced",
            caseSlug: data.selectedCaseSlug || undefined,
          }
        );
        setResult(res.answer);
        setDraftSaved(null);
      } catch {
        setResult(t("drafting.error_generate"));
      } finally {
        setGenerating(false);
      }
    },
  });

  const f = form.form;
  const { register, watch } = f;
  const formData = watch();
  const _selectedCaseSlug = formData.selectedCaseSlug || "";

  useUnsavedChanges(f.formState.isDirty);

  useEffect(() => {
    let cancelled = false;
    api.brain
      .listPages({ type: "legal_case", limit: 200 })
      .then((pages) => {
        if (!cancelled) setCases(pages);
      })
      .catch(() => {
        if (!cancelled) setCasesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canGenerate = (formData.title || "").trim() && (formData.facts || "").trim();

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadDocx(text: string) {
    setDocxReady(false);
    try {
      const draftSlug = draftSaved ?? null;
      const res = await csrfFetch("/api/word-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: draftSlug,
          title: `${template.label}: ${formData.title || "Entwurf"}`,
          markdown: text,
          formData,
        }),
      });
      if (!res.ok) {
        throw new Error(`Export failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.label}_${(formData.title || t("drafting.saved_default")).slice(0, 40).replace(/[^a-zA-Z0-9äöüß]/g, "_")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      setDocxReady(true);
      setTimeout(() => setDocxReady(false), 2000);
    } catch (err) {
      console.error("docx export failed:", err);
      // Fallback: old HTML method
      const escTitle = (formData.title || t("drafting.saved_default"))
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escTitle}</title><style>@page{margin:2.5cm}body{font-family:Calibri,Arial,sans-serif;font-size:11pt}</style></head><body><pre style="white-space:pre-wrap">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`;
      const blob = new Blob([html], { type: "application/vnd.ms-word" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.label}_${(formData.title || t("drafting.saved_default")).slice(0, 40).replace(/[^a-zA-Z0-9äöüß]/g, "_")}.doc`;
      a.click();
      URL.revokeObjectURL(url);
      setDocxReady(true);
      setTimeout(() => setDocxReady(false), 2000);
    }
  }

  async function saveDraftToBrain(text: string) {
    const current = f.getValues();
    setSavingDraft(true);
    setDraftSaved(null);
    try {
      const now = new Date();
      const safeTitle = (current.title || template.label)
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
      const slug = `legal/drafts/${now.toISOString().split("T")[0]}-${template.key}-${safeTitle || now.getTime()}`;
      await api.brain.createPage({
        slug,
        title: `${template.label}: ${current.title || t("drafting.saved_default")}`,
        type: "legal_document",
        content: text,
        frontmatter: {
          type: "legal_document",
          document_kind: template.key,
          status: "draft",
          case_slug: current.selectedCaseSlug || undefined,
          claimant: current.klaeger || undefined,
          respondent: current.beklagter || undefined,
          legal_basis: current.legalBasis || undefined,
          generated_at: now.toISOString(),
          source: "drafting",
          ...AI_FRONTMATTER,
        },
      });

      if (current.selectedCaseSlug) {
        const page = await api.brain.getPage(current.selectedCaseSlug);
        const fm = caseFrontmatter(page);
        const documents = fm.documents ?? [];
        const entry: DocumentEntry = {
          id: `doc-${Date.now()}`,
          name: `${template.label}: ${current.title || "Entwurf"}`,
          uploadedAt: now.toISOString(),
          slug,
          source: "drafting",
          kind: template.key,
        };
        await api.brain.updatePage({
          slug: current.selectedCaseSlug,
          title: page.title,
          content: page.content,
          frontmatter: {
            ...fm,
            documents: [...documents, entry],
          },
        });
      }

      setDraftSaved(slug);
      return slug;
    } catch (e) {
      setDraftSaved(
        e instanceof Error
          ? `${lang === "de" ? "Fehler" : "Error"}: ${e.message}`
          : t("drafting.error_save")
      );
      return null;
    } finally {
      setSavingDraft(false);
    }
  }

  // Vier-Augen-Prinzip: KI-Entwurf speichern UND zur Freigabe durch einen
  // zweiten Menschen einreichen (agent_action, status=pending). Der Entwurf
  // wird erst „freigegeben", wenn jemand in der Freigabe-Queue zustimmt.
  async function submitForApproval(text: string) {
    const current = f.getValues();
    setSubmitting(true);
    let draftSlug: string | null = null;
    try {
      draftSlug = await saveDraftToBrain(text);
      if (!draftSlug) return;
      const actionSlug = `legal/approvals/${Date.now()}-${template.key}`;
      await api.brain.createPage({
        slug: actionSlug,
        title: `Freigabe: ${template.label} — ${current.title || "Entwurf"}`,
        type: "agent_action",
        content: text.slice(0, 4000),
        frontmatter: agentActionFrontmatter({
          action_type: "document_finalize",
          proposed_by: "Schriftsatz-Generator (KI)",
          target_slug: draftSlug,
          summary: `${template.label}: ${current.title || "Entwurf"}${current.selectedCaseSlug ? ` · Akte ${current.selectedCaseSlug}` : ""}`,
        }),
      });
      setDraftSaved(`approval:${actionSlug}`);
    } catch (e) {
      if (draftSlug) {
        try {
          await api.brain.deletePage(draftSlug);
        } catch {
          // Best-effort cleanup — draft may remain as orphan
        }
      }
      setDraftSaved(
        e instanceof Error
          ? `${lang === "de" ? "Fehler" : "Error"}: ${e.message}`
          : t("drafting.error_submit")
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("drafting.title")}
        description={t("drafting.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("drafting.breadcrumb") },
        ]}
      />

      {/* Template selector */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => {
                setSelectedTemplate(t.key);
                setResult(null);
              }}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                selectedTemplate === t.key
                  ? "brand-soft brand-border brand-text"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Form */}
      <form
        onSubmit={form.handleSubmit}
        className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
      >
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {template.label} — Angaben
        </h2>
        {form.error && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertTriangle size={14} /> {form.error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">
              Titel / Betreff
            </label>
            <Input
              {...register("title")}
              placeholder="z.B. Vertragsbruch Muster GmbH"
              aria-label="z.B. Vertragsbruch Muster GmbH"
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
            {f.formState.errors.title && (
              <p className="mt-1 text-xs text-red-600">{f.formState.errors.title.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">
              Rechtsgrundlage
            </label>
            <Input
              {...register("legalBasis")}
              placeholder="z.B. § 823 BGB"
              aria-label="z.B. § 823 BGB"
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">
              {t("drafting.label_klaeger")}
            </label>
            <Input
              {...register("klaeger")}
              placeholder="Name"
              aria-label={t("drafting.name")}
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">
              {t("drafting.label_beklagter")}
            </label>
            <Input
              {...register("beklagter")}
              placeholder="Name"
              aria-label={t("drafting.name")}
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">
            Sachverhalt
          </label>
          <textarea
            {...register("facts")}
            rows={4}
            placeholder="Beschreibe den Sachverhalt…"
            aria-label={t("drafting.describe_case")}
            className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
          {f.formState.errors.facts && (
            <p className="mt-1 text-xs text-red-600">{f.formState.errors.facts.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">
            {t("drafting.label_link_case")}
          </label>
          <select
            {...register("selectedCaseSlug")}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            <option value="">
              {casesError ? t("drafting.cases_load_error") : t("drafting.no_case")}
            </option>
            {cases.map((c) => {
              const fm = caseFrontmatter(c);
              return (
                <option key={c.slug} value={c.slug}>
                  {fm.case_number ? `${fm.case_number} - ` : ""}
                  {c.title}
                </option>
              );
            })}
          </select>
        </div>
        <Button
          type="submit"
          variant="primary"
          className="brand-bg brand-bg gap-2 text-white"
          disabled={!canGenerate || generating}
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {generating
            ? t("drafting.btn_generating")
            : `${template.label} ${lang === "de" ? "generieren" : "generate"}`}
        </Button>
      </form>

      {/* Result */}
      {result && (
        <div className="brand-border brand-soft space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="brand-text text-xs font-medium">{t("drafting.saved_default")}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                {AI_BADGE_LABEL}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveDraftToBrain(result)}
                disabled={savingDraft || submitting}
                className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-emerald-600 disabled:opacity-60"
                title={t("drafting.btn_save")}
              >
                {savingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {t("drafting.btn_save")}
              </button>
              <button
                onClick={() => submitForApproval(result)}
                disabled={savingDraft || submitting}
                className="hover:brand-text flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors disabled:opacity-60"
                title={t("drafting.btn_submit_approval")}
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <UserCheck size={14} />
                )}
                {t("drafting.btn_submit_approval")}
              </button>
              <button
                onClick={() => downloadDocx(result)}
                className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-blue-600"
                title={t("drafting.btn_docx")}
              >
                {docxReady ? (
                  <Check size={14} className="text-emerald-600" />
                ) : (
                  <FileText size={14} />
                )}
                Word
              </button>
              <button
                onClick={() => copyToClipboard(result)}
                className="text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text-muted)]"
                title={t("drafting.btn_copy")}
                aria-label={t("drafting.btn_copy")}
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
            {result}
          </div>
          <p className="border-t border-[color:var(--ds-border)] pt-2 text-xs leading-relaxed text-amber-700/70">
            {AI_NOTICE}
          </p>
          {draftSaved && (
            <p
              className={cn(
                "text-xs",
                draftSaved.startsWith(lang === "de" ? "Fehler" : "Error")
                  ? "text-red-600"
                  : draftSaved.startsWith("approval:")
                    ? "brand-text"
                    : "text-emerald-600"
              )}
            >
              {draftSaved.startsWith(lang === "de" ? "Fehler" : "Error")
                ? draftSaved
                : draftSaved.startsWith("approval:")
                  ? t("drafting.approval_msg")
                  : `${t("drafting.saved_msg")}: ${draftSaved}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
