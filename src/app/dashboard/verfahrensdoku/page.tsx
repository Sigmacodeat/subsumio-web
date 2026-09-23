"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Save, Printer, Download, Info, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { buildVerfahrensdoku, type VerfahrensdokuInput } from "@/lib/gobd-verfahrensdoku";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import { verfahrensdokuSchema, type VerfahrensdokuFormData } from "@/lib/schemas/verfahrensdoku";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { useLang } from "@/lib/use-lang";

const DOC_SLUG = "legal/gobd/verfahrensdokumentation";

/** Escape vor Injektion in HTML-Strings (Druck/Word-Export) — verhindert XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Minimaler Markdown→HTML-Konverter für den Export (Überschriften, Listen,
 *  Tabellen, Blockquote, fett/kursiv, Trennlinie). Inhalt wird vorab escaped. */
function markdownToHtml(md: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>");

  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  let tableRows: string[][] = [];

  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  const flushTable = () => {
    if (tableRows.length === 0) return;
    const [header, , ...body] = tableRows; // zweite Zeile = Trenner
    out.push("<table><thead><tr>");
    for (const c of header) out.push(`<th>${inline(c.trim())}</th>`);
    out.push("</tr></thead><tbody>");
    for (const row of body) {
      out.push("<tr>");
      for (const c of row) out.push(`<td>${inline(c.trim())}</td>`);
      out.push("</tr>");
    }
    out.push("</tbody></table>");
    tableRows = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("|")) {
      const cells = line.slice(1, line.endsWith("|") ? -1 : undefined).split("|");
      tableRows.push(cells);
      continue;
    }
    flushTable();

    if (line.startsWith("### ")) {
      flushList();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      flushList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      flushList();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith("> ")) {
      flushList();
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    } else if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === "---") {
      flushList();
      out.push("<hr/>");
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flushList();
  flushTable();
  return out.join("\n");
}

function exportHtmlDocument(title: string, markdown: string): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; margin: 40px; color: hsl(222, 8%, 15%); font-size: 12pt; line-height: 1.5; }
  h1 { font-size: 20pt; color: hsl(213, 46%, 32%); border-bottom: 2px solid hsl(213, 46%, 42%); padding-bottom: 8px; }
  h2 { font-size: 15pt; color: hsl(213, 46%, 32%); margin-top: 24px; }
  h3 { font-size: 12.5pt; color: hsl(222, 10%, 20%); margin-top: 16px; }
  blockquote { background: hsl(213, 72%, 97%); border-left: 4px solid hsl(213, 46%, 42%); margin: 16px 0; padding: 10px 16px; color: hsl(222, 8%, 30%); font-size: 10.5pt; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid hsl(222, 8%, 80%); padding: 6px 10px; text-align: left; font-size: 11pt; }
  th { background: hsl(222, 8%, 94%); }
  hr { border: none; border-top: 1px solid hsl(222, 8%, 85%); margin: 24px 0; }
  em { color: hsl(222, 8%, 40%); }
</style></head><body>
${markdownToHtml(markdown)}
</body></html>`;
}

export default function VerfahrensdokuPage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dokuForm = useForm<VerfahrensdokuFormData>({
    resolver: zodResolver(verfahrensdokuSchema) as never,
    defaultValues: {
      kanzleiName: "",
      anwaltName: "",
      ustId: "",
      verantwortlich: "",
      systeme: "Subsumio",
      belegEingang: "",
      erfassung: "",
      ablageOrt: "Subsumio-Kanzleiwissen (steuerlich relevante Belege mit Prüfsumme)",
      backup: "",
      zugriffsschutz: "",
      iks: "",
      stand: today,
    },
  });

  const formValues = dokuForm.watch();
  const formData: VerfahrensdokuInput = {
    kanzleiName: formValues.kanzleiName ?? "",
    anwaltName: formValues.anwaltName ?? "",
    ustId: formValues.ustId ?? "",
    verantwortlich: formValues.verantwortlich ?? "",
    systeme: formValues.systeme ?? "",
    belegEingang: formValues.belegEingang ?? "",
    erfassung: formValues.erfassung ?? "",
    ablageOrt: formValues.ablageOrt ?? "",
    backup: formValues.backup ?? "",
    zugriffsschutz: formValues.zugriffsschutz ?? "",
    iks: formValues.iks ?? "",
    stand: formValues.stand ?? today,
  };

  useEffect(() => {
    let cancelled = false;
    loadKanzleiSettings()
      .then((s) => {
        if (cancelled) return;
        dokuForm.reset({
          ...dokuForm.getValues(),
          kanzleiName: s.kanzleiName ?? "",
          anwaltName: s.anwaltName ?? "",
          ustId: s.ustId ?? "",
          verantwortlich: dokuForm.getValues("verantwortlich") || (s.anwaltName ?? ""),
        });
      })
      .catch((err) =>
        console.warn(
          "[verfahrensdoku] Failed to load kanzlei settings:",
          err instanceof Error ? err.message : err
        )
      );
    api.brain
      .getPage(DOC_SLUG)
      .then((p) => {
        if (cancelled) return;
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        const stored = fm.verfahrensdoku_input;
        if (stored && typeof stored === "object") {
          dokuForm.reset({
            ...dokuForm.getValues(),
            ...(stored as Partial<VerfahrensdokuFormData>),
          });
        }
      })
      .catch((err) =>
        console.warn(
          "[verfahrensdoku] Failed to load verfahrensdoku page:",
          err instanceof Error ? err.message : err
        )
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markdown = buildVerfahrensdoku(formData);

  async function save() {
    const isValid = await dokuForm.trigger();
    if (!isValid) return;
    const data = dokuForm.getValues();
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await api.brain.updatePage({
        slug: DOC_SLUG,
        title: "Verfahrensdokumentation",
        type: "document",
        content: markdown,
        frontmatter: {
          type: "document",
          gobd_verfahrensdoku: true,
          verfahrensdoku_input: data,
          updated_via: "dashboard",
        },
      });
      setSaved(true);
      addToast({ type: "success", description: t("verfahrensdoku.btn_saved") });
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError(t("verfahrensdoku.error_save"));
      addToast({ type: "error", description: t("verfahrensdoku.error_save") });
    } finally {
      setSaving(false);
    }
  }

  function printPdf() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(exportHtmlDocument("Verfahrensdokumentation", markdown));
    w.document.close();
    w.onload = () => setTimeout(() => w.print(), 300);
  }

  function downloadWord() {
    const blob = new Blob([exportHtmlDocument("Verfahrensdokumentation", markdown)], {
      type: "application/msword",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gobd-verfahrensdokumentation-${formData.stand}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const field = (
    label: string,
    name: keyof VerfahrensdokuFormData,
    placeholder: string,
    textarea = false,
    inputType: "text" | "date" = "text"
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`vd-${name}`} className="text-xs text-[color:var(--ds-text-muted)]">
        {label}
      </Label>
      {textarea ? (
        <textarea
          id={`vd-${name}`}
          {...dokuForm.register(name)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
        />
      ) : (
        <Input
          id={`vd-${name}`}
          type={inputType}
          {...dokuForm.register(name)}
          placeholder={placeholder}
        />
      )}
      {dokuForm.formState.errors[name] && (
        <p className="mt-1 text-xs text-[color:var(--ds-danger-text)]">
          {dokuForm.formState.errors[name]?.message}
        </p>
      )}
    </div>
  );

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("verfahrensdoku.title")}
        description={t("verfahrensdoku.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("verfahrensdoku.breadcrumb") },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={printPdf} className="gap-1.5 text-xs">
              <Printer size={14} /> {t("verfahrensdoku.btn_print")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadWord}
              className="gap-1.5 text-xs"
            >
              <Download size={14} /> {t("verfahrensdoku.btn_word")}
            </Button>
            <PrimaryAction
              icon={
                saving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : saved ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <Save size={15} />
                )
              }
              onClick={save}
              disabled={saving}
            >
              {saved ? t("verfahrensdoku.btn_saved") : t("verfahrensdoku.btn_save")}
            </PrimaryAction>
          </div>
        }
      />

      {/* Honest framing */}
      <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3">
        <Info size={16} className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]" />
        <p className="text-xs leading-relaxed text-[color:var(--ds-warning-text)]">
          {t("verfahrensdoku.disclaimer")}
        </p>
      </div>

      {saveError && (
        <div className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-xs text-[color:var(--ds-danger-text)]">
          {saveError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("verfahrensdoku.section_master")}
            </h2>
            {field(
              t("verfahrensdoku.field_firm"),
              "kanzleiName",
              t("verfahrensdoku.field_firm_ph")
            )}
            {field(
              t("verfahrensdoku.field_representative"),
              "anwaltName",
              t("verfahrensdoku.field_representative_ph")
            )}
            {field("UID-Nummer", "ustId", "ATU12345678")}
            {field(
              t("verfahrensdoku.field_responsible"),
              "verantwortlich",
              t("verfahrensdoku.field_responsible_ph")
            )}
            {field(t("verfahrensdoku.field_stand"), "stand", today, false, "date")}
          </div>

          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("verfahrensdoku.section_process")}
            </h2>
            {field(
              t("verfahrensdoku.field_systems"),
              "systeme",
              t("verfahrensdoku.field_systems_ph")
            )}
            {field(
              t("verfahrensdoku.field_receipt"),
              "belegEingang",
              t("verfahrensdoku.field_receipt_ph"),
              true
            )}
            {field(
              t("verfahrensdoku.field_booking"),
              "erfassung",
              t("verfahrensdoku.field_booking_ph"),
              true
            )}
            {field(
              t("verfahrensdoku.field_storage"),
              "ablageOrt",
              t("verfahrensdoku.field_storage_ph"),
              true
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("verfahrensdoku.field_backup")} & {t("verfahrensdoku.field_access")}
            </h2>
            {field(
              t("verfahrensdoku.field_backup"),
              "backup",
              t("verfahrensdoku.field_backup_ph"),
              true
            )}
            {field(
              t("verfahrensdoku.field_access"),
              "zugriffsschutz",
              t("verfahrensdoku.field_access_ph"),
              true
            )}
            {field(t("verfahrensdoku.field_iks"), "iks", t("verfahrensdoku.field_iks_ph"), true)}
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
            <FileText size={14} className="text-[color:var(--ds-text-muted)]" />
            <span className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("verfahrensdoku.preview_title")}
            </span>
          </div>
          {/* Rendered with the same escaping converter as the print/Word export. */}
          <div
            className="prose prose-sm dark:prose-invert max-h-[70vh] max-w-none overflow-y-auto text-xs leading-relaxed text-[color:var(--ds-text-muted)]"
            tabIndex={0}
            aria-label={t("verfahrensdoku.preview_title")}
            dangerouslySetInnerHTML={{
              // The page owns the only h1 — demote the document's own headings.
              __html: markdownToHtml(markdown)
                .replace(/<(\/?)h2>/g, "<$1h4>")
                .replace(/<(\/?)h1>/g, "<$1h3>"),
            }}
          />
        </div>
      </div>
    </div>
  );
}
