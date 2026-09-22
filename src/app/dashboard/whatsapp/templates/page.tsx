"use client";

import { useState, useEffect, useCallback } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Trash2, Edit3, Save, X, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { useLang } from "@/lib/use-lang";
import { useToast } from "@/components/ui/toast";
import type { DashboardKey } from "@/content/dashboard";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORY_LABEL: Record<string, string> = {
  UTILITY: "Service-Nachricht",
  MARKETING: "Marketing",
  AUTHENTICATION: "Bestätigungscode",
};

interface WhatsAppTemplate {
  slug: string;
  name: string;
  language: string;
  category: string;
  body: string;
  status: string;
  createdAt?: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft:
    "bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)] border-[color:var(--ds-neutral-border)]",
  pending:
    "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)] border-[color:var(--ds-warning-border)]",
  approved:
    "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)] border-[color:var(--ds-success-border)]",
  rejected:
    "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]",
};

const TEMPLATE_STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  pending: "bei Meta eingereicht",
  approved: "genehmigt",
  rejected: "abgelehnt",
};

const STATUS_ICONS: Record<string, typeof FileText> = {
  draft: FileText,
  pending: Clock,
  approved: CheckCircle2,
  rejected: AlertCircle,
};

export default function WhatsAppTemplatesPage() {
  const { t } = useLang();
  const confirm = useConfirm();
  const { addToast } = useToast();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WhatsAppTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    language: "de",
    category: "UTILITY",
    body: "",
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/whatsapp/templates");
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      setError(t("wamplates.error_load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function createTemplate() {
    if (!newTemplate.name.trim() || !newTemplate.body.trim()) return;
    try {
      const res = await csrfFetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTemplate),
      });
      if (!res.ok) throw new Error("Failed to create template");
      setCreating(false);
      setNewTemplate({ name: "", language: "de", category: "UTILITY", body: "" });
      await reload();
      addToast({ type: "success", title: t("wamplates.toast_created" as DashboardKey) });
    } catch {
      setError(t("wamplates.error_create"));
    }
  }

  async function updateTemplate() {
    if (!editing) return;
    try {
      const res = await csrfFetch("/api/whatsapp/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error("Failed to update template");
      setEditing(null);
      await reload();
      addToast({ type: "success", title: t("wamplates.toast_saved" as DashboardKey) });
    } catch {
      setError(t("wamplates.error_save"));
    }
  }

  async function deleteTemplate(slug: string) {
    const ok = await confirm({ message: t("wamplates.confirm_delete") });
    if (!ok) return;
    try {
      await csrfFetch("/api/whatsapp/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      await reload();
      addToast({ type: "success", title: t("wamplates.toast_deleted" as DashboardKey) });
    } catch {
      setError(t("wamplates.error_delete"));
    }
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("wamplates.title")}
        description={t("wamplates.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: "WhatsApp", href: "/dashboard/whatsapp" },
          { label: t("wamplates.breadcrumb") },
        ]}
        actions={
          <PrimaryAction onClick={() => setCreating(true)}>
            {t("wamplates.btn_create")}
          </PrimaryAction>
        }
      />

      {error && (
        <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Info box */}
          <div className="rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-4 py-3">
            <p className="text-sm text-[color:var(--ds-info-text)]">
              Vorlagen, die Sie mehr als 24 Stunden nach der letzten Nachricht des Mandanten senden,
              muss Meta vorher genehmigen. Die Einreichung erfolgt im Meta Business Manager; hier
              gespeicherte Vorlagen dienen als Textbasis.
            </p>
          </div>

          {/* Create form */}
          {creating && (
            <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Neue Vorlage</h3>
                <button
                  onClick={() => setCreating(false)}
                  aria-label="Formular schließen"
                  className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-tpl-name" className="text-xs">
                  Name der Vorlage
                </Label>
                <Input
                  id="new-tpl-name"
                  type="text"
                  placeholder="z.B. termin_erinnerung"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-tpl-lang" className="text-xs">
                    Sprache
                  </Label>
                  <Select
                    value={newTemplate.language}
                    onValueChange={(v) => setNewTemplate({ ...newTemplate, language: v })}
                  >
                    <SelectTrigger id="new-tpl-lang">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="en">Englisch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-tpl-cat" className="text-xs">
                    Kategorie
                  </Label>
                  <Select
                    value={newTemplate.category}
                    onValueChange={(v) => setNewTemplate({ ...newTemplate, category: v })}
                  >
                    <SelectTrigger id="new-tpl-cat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTILITY">Service-Nachricht</SelectItem>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="AUTHENTICATION">Bestätigungscode</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-tpl-body" className="text-xs">
                  Inhalt
                </Label>
                <textarea
                  id="new-tpl-body"
                  placeholder={t("whatsapp.tmpl.ph_body")}
                  value={newTemplate.body}
                  onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-[color:var(--ds-info-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
              </div>
              <Button size="sm" className="gap-1.5" onClick={createTemplate}>
                <Save size={14} />
                Speichern
              </Button>
            </div>
          )}

          {/* Template list */}
          {templates.length === 0 && !creating ? (
            <EmptyState
              icon={FileText}
              title="Noch keine Vorlagen"
              description="Legen Sie eine Vorlage an, um wiederkehrende Nachrichten schneller zu versenden."
              actionLabel={t("wamplates.btn_create")}
              onAction={() => setCreating(true)}
            />
          ) : (
            <div className="space-y-3">
              {templates.map((template) => {
                const isEditing = editing?.slug === template.slug;
                const StatusIcon = STATUS_ICONS[template.status] ?? FileText;
                return (
                  <div
                    key={template.slug}
                    className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
                  >
                    {isEditing ? (
                      <>
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                            Vorlage bearbeiten
                          </h3>
                          <button
                            onClick={() => setEditing(null)}
                            aria-label="Bearbeitung schließen"
                            className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                          >
                            <X size={16} />
                          </button>
                        </div>
                        <Input
                          type="text"
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <Select
                            value={editing.language}
                            onValueChange={(v) => setEditing({ ...editing, language: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="de">Deutsch</SelectItem>
                              <SelectItem value="en">Englisch</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={editing.category}
                            onValueChange={(v) => setEditing({ ...editing, category: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="UTILITY">Service-Nachricht</SelectItem>
                              <SelectItem value="MARKETING">Marketing</SelectItem>
                              <SelectItem value="AUTHENTICATION">Bestätigungscode</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={editing.status}
                            onValueChange={(v) => setEditing({ ...editing, status: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <textarea
                          value={editing.body}
                          onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                          rows={4}
                          className="w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-[color:var(--ds-info-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                        />
                        <Button
                          variant="primary"
                          className="gap-2 bg-[color:var(--ds-info-solid)] text-sm text-white hover:bg-[color:var(--ds-info-solid)]"
                          onClick={updateTemplate}
                        >
                          <Save size={14} />
                          Speichern
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <StatusIcon size={14} className="text-[color:var(--ds-text-muted)]" />
                            <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                              {template.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="default"
                              className={cn(
                                "border text-xs",
                                STATUS_STYLES[template.status] ?? STATUS_STYLES.draft
                              )}
                            >
                              {TEMPLATE_STATUS_LABEL[template.status] ?? template.status}
                            </Badge>
                            <button
                              onClick={() => setEditing(template)}
                              aria-label={`Vorlage ${template.name} bearbeiten`}
                              title="Bearbeiten"
                              className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-info-text)]"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => deleteTemplate(template.slug)}
                              aria-label={`Vorlage ${template.name} löschen`}
                              title="Löschen"
                              className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                          <span>
                            {template.language === "de"
                              ? "Deutsch"
                              : template.language === "en"
                                ? "Englisch"
                                : template.language.toUpperCase()}
                          </span>
                          <span>·</span>
                          <span>{CATEGORY_LABEL[template.category] ?? template.category}</span>
                        </div>
                        <p className="rounded-lg bg-[color:var(--ds-surface-hover)] px-3 py-2 text-xs text-[color:var(--ds-text)]">
                          {template.body}
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
