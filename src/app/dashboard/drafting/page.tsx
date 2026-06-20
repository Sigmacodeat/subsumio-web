"use client";

import { useEffect, useState } from "react";
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

const TEMPLATES = [
  {
    key: "klage",
    label: "Klage",
    icon: Scale,
    prompt: (data: Record<string, string>) =>
      `Entwirf eine Klageschrift für den Rechtsstreit: ${data.title}. Kläger: ${data.klaeger}, Beklagter: ${data.beklagter}. Streitgegenstand: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  {
    key: "klageerwiderung",
    label: "Klageerwiderung",
    icon: Scale,
    prompt: (data: Record<string, string>) =>
      `Entwirf eine Klageerwiderung für den Rechtsstreit: ${data.title}. Beklagter: ${data.beklagter}, Kläger: ${data.klaeger}. Verteidigung: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  {
    key: "berufung",
    label: "Berufung",
    icon: Scale,
    prompt: (data: Record<string, string>) =>
      `Entwirf eine Berufungsschrift für den Rechtsstreit: ${data.title}. Berufungsführer: ${data.klaeger}, Berufungsgegner: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  {
    key: "beschwerde",
    label: "Beschwerde",
    icon: Scale,
    prompt: (data: Record<string, string>) =>
      `Entwirf eine Beschwerdeschrift für: ${data.title}. Beschwerdeführer: ${data.klaeger}, Beschwerdegegner: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  {
    key: "mahnung",
    label: "Mahnung",
    icon: PenTool,
    prompt: (data: Record<string, string>) =>
      `Entwirf eine Mahnung/Schreiben für: ${data.title}. Empfänger: ${data.beklagter}, Absender: ${data.klaeger}. Sachverhalt: ${data.facts}. Forderung: ${data.legalBasis}.`,
  },
  {
    key: "antragschrift",
    label: "Antragschrift",
    icon: FileText,
    prompt: (data: Record<string, string>) =>
      `Entwirf eine Antragschrift für: ${data.title}. Antragsteller: ${data.klaeger}, Antragsgegner: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  {
    key: "einstweilige",
    label: "Einstw. Verfügung",
    icon: FileText,
    prompt: (data: Record<string, string>) =>
      `Entwirf einen Antrag auf einstweilige Verfügung für: ${data.title}. Antragsteller: ${data.klaeger}, Antragsgegner: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  {
    key: "vergleich",
    label: "Vergleichsvertrag",
    icon: FileText,
    prompt: (data: Record<string, string>) =>
      `Entwirf einen Vergleichsvertrag für den Rechtsstreit: ${data.title}. Partei A: ${data.klaeger}, Partei B: ${data.beklagter}. Streitgegenstand: ${data.facts}.`,
  },
  {
    key: "vollstreckung",
    label: "Vollstreckung",
    icon: FileText,
    prompt: (data: Record<string, string>) =>
      `Entwirf einen Antrag auf Erlass eines Vollstreckungsbescheids für: ${data.title}. Gläubiger: ${data.klaeger}, Schuldner: ${data.beklagter}. Forderung: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  {
    key: "beweisantrag",
    label: "Beweisantrag",
    icon: FileText,
    prompt: (data: Record<string, string>) =>
      `Entwirf einen Beweisantrag für den Rechtsstreit: ${data.title}. Antragsteller: ${data.klaeger}. Zu beweisende Tatsachen: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  {
    key: "gutachten",
    label: "Rechtsgutachten",
    icon: BookOpen,
    prompt: (data: Record<string, string>) =>
      `Entwirf ein Rechtsgutachten im Gutachtenstil zu: ${data.title}. Sachverhalt: ${data.facts}. Rechtsfrage: ${data.legalBasis}.`,
  },
  {
    key: "stellungnahme",
    label: "Stellungnahme",
    icon: BookOpen,
    prompt: (data: Record<string, string>) =>
      `Entwirf eine Stellungnahme für: ${data.title}. Von: ${data.klaeger}, Gegenüber: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
  {
    key: "widerruf",
    label: "Widerruf",
    icon: PenTool,
    prompt: (data: Record<string, string>) =>
      `Entwirf einen Widerruf/Rücktritt für: ${data.title}. Von: ${data.klaeger}, Gegenüber: ${data.beklagter}. Sachverhalt: ${data.facts}. Rechtsgrundlage: ${data.legalBasis}.`,
  },
];

export default function DraftingPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("klage");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [docxReady, setDocxReady] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftSaved, setDraftSaved] = useState<string | null>(null);
  const [cases, setCases] = useState<BrainPage[]>([]);

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
          template.prompt(data as unknown as Record<string, string>)
        );
        setResult(res.answer);
        setDraftSaved(null);
      } catch {
        setResult("Fehler bei der Generierung. Bitte versuche es erneut.");
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
    api.brain
      .listPages({ type: "legal_case", limit: 200 })
      .then((pages) => setCases(pages))
      .catch(() => setCases([]));
  }, []);

  const canGenerate = (formData.title || "").trim() && (formData.facts || "").trim();

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadDocx(text: string) {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${template.label}</title></head>
<body style="font-family:Calibri,sans-serif;font-size:11pt;line-height:1.5;">
<h1 style="font-size:16pt;">${template.label}: ${formData.title}</h1>
<p><strong>Kläger/Absender:</strong> ${formData.klaeger || "—"}</p>
<p><strong>Beklagter/Empfänger:</strong> ${formData.beklagter || "—"}</p>
<p><strong>Rechtsgrundlage:</strong> ${formData.legalBasis || "—"}</p>
<hr/>
<pre style="font-family:Calibri,sans-serif;white-space:pre-wrap;">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
<hr/>
<p style="font-size:9pt;color:#777;font-style:italic;">${AI_NOTICE}</p>
</body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.label}_${formData.title.slice(0, 40).replace(/[^a-zA-Z0-9äöüß]/g, "_")}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    setDocxReady(true);
    setTimeout(() => setDocxReady(false), 2000);
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
        title: `${template.label}: ${current.title || "Entwurf"}`,
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
      setDraftSaved(e instanceof Error ? `Fehler: ${e.message}` : "Fehler beim Speichern");
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
    try {
      const slug = await saveDraftToBrain(text);
      if (!slug) return;
      const actionSlug = `legal/approvals/${Date.now()}-${template.key}`;
      await api.brain.createPage({
        slug: actionSlug,
        title: `Freigabe: ${template.label} — ${current.title || "Entwurf"}`,
        type: "agent_action",
        content: text.slice(0, 4000),
        frontmatter: agentActionFrontmatter({
          action_type: "document_finalize",
          proposed_by: "Schriftsatz-Generator (KI)",
          target_slug: slug,
          summary: `${template.label}: ${current.title || "Entwurf"}${current.selectedCaseSlug ? ` · Akte ${current.selectedCaseSlug}` : ""}`,
        }),
      });
      setDraftSaved(`approval:${actionSlug}`);
    } catch (e) {
      setDraftSaved(e instanceof Error ? `Fehler: ${e.message}` : "Fehler beim Einreichen");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Schriftsatz-Generator"
        description="Schriftsätze und Gutachten mit KI-Unterstützung erstellen"
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
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all",
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
              Kläger / Absender
            </label>
            <Input
              {...register("klaeger")}
              placeholder="Name"
              aria-label="Name"
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">
              Beklagter / Empfänger
            </label>
            <Input
              {...register("beklagter")}
              placeholder="Name"
              aria-label="Name"
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
            aria-label="Beschreibe den Sachverhalt"
            className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
          {f.formState.errors.facts && (
            <p className="mt-1 text-xs text-red-600">{f.formState.errors.facts.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]">
            Mit Akte verknüpfen
          </label>
          <select
            {...register("selectedCaseSlug")}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            <option value="">Keine Akte</option>
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
          {template.label} generieren
        </Button>
      </form>

      {/* Result */}
      {result && (
        <div className="brand-border brand-soft space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="brand-text text-xs font-medium">Entwurf</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                {AI_BADGE_LABEL}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveDraftToBrain(result)}
                disabled={savingDraft || submitting}
                className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-emerald-600 disabled:opacity-60"
                title="Entwurf im Brain speichern"
              >
                {savingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Speichern
              </button>
              <button
                onClick={() => submitForApproval(result)}
                disabled={savingDraft || submitting}
                className="hover:brand-text flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors disabled:opacity-60"
                title="Entwurf einem zweiten Bearbeiter zur Freigabe vorlegen (Vier-Augen-Prinzip)"
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <UserCheck size={14} />
                )}
                Zur Freigabe
              </button>
              <button
                onClick={() => downloadDocx(result)}
                className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-blue-600"
                title="Als Word-Dokument herunterladen"
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
                draftSaved.startsWith("Fehler:")
                  ? "text-red-600"
                  : draftSaved.startsWith("approval:")
                    ? "brand-text"
                    : "text-emerald-600"
              )}
            >
              {draftSaved.startsWith("Fehler:")
                ? draftSaved
                : draftSaved.startsWith("approval:")
                  ? "Zur Freigabe eingereicht — sichtbar im Menü unter Freigaben."
                  : `Gespeichert: ${draftSaved}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
