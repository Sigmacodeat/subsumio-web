"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
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
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";

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
  draft: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
};

const STATUS_ICONS: Record<string, typeof FileText> = {
  draft: FileText,
  pending: Clock,
  approved: CheckCircle2,
  rejected: AlertCircle,
};

export default function WhatsAppTemplatesPage() {
  const { t } = useLang();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wamplates.error_load"));
    } finally {
      setLoading(false);
    }
  }, []);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wamplates.error_create"));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wamplates.error_save"));
    }
  }

  async function deleteTemplate(slug: string) {
    if (!confirm(t("wamplates.confirm_delete"))) return;
    try {
      await csrfFetch("/api/whatsapp/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wamplates.error_delete"));
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("wamplates.title")}
        description={t("wamplates.description")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "WhatsApp", href: "/dashboard/whatsapp" },
          { label: t("wamplates.breadcrumb") },
        ]}
        actions={
          <Button
            variant="primary"
            className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
            onClick={() => setCreating(true)}
          >
            <Plus size={14} />
            {t("wamplates.btn_create")}
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-[color:var(--ds-text-muted)]">Laden...</div>
      ) : (
        <>
          {/* Info box */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <p className="text-sm text-blue-600">
              <strong>Wichtig:</strong> WhatsApp-Templates müssen von Meta genehmigt werden, bevor
              sie außerhalb des 24h-Fensters gesendet werden können. Genehmigte Templates können im
              Meta Business Manager eingereicht werden. Hier gespeicherte Templates dienen als
              Vorlagen für das Kanzlei-OS.
            </p>
          </div>

          {/* Create form */}
          {creating && (
            <div className="space-y-3 rounded-xl border border-blue-500/30 bg-blue-600/5 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  Neues Template
                </h3>
                <button
                  onClick={() => setCreating(false)}
                  className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-tpl-name" className="text-xs">
                  Template-Name
                </Label>
                <Input
                  id="new-tpl-name"
                  type="text"
                  placeholder="z.B. termin_erinnerung"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
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
                      <SelectItem value="UTILITY">Utility</SelectItem>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
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
                  placeholder="Hallo {{1}}, Ihr Termin am {{2}}..."
                  value={newTemplate.body}
                  onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-blue-500/50 focus:outline-none"
                />
              </div>
              <Button
                variant="primary"
                className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
                onClick={createTemplate}
              >
                <Save size={14} />
                Speichern
              </Button>
            </div>
          )}

          {/* Template list */}
          {templates.length === 0 && !creating ? (
            <div className="py-20 text-center">
              <FileText size={32} className="mx-auto mb-3 text-[color:var(--ds-text-muted)]" />
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                Noch keine Templates. Klicke auf &quot;Neues Template&quot; um eine Vorlage zu
                erstellen.
              </p>
            </div>
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
                            Template bearbeiten
                          </h3>
                          <button
                            onClick={() => setEditing(null)}
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
                        <div className="grid grid-cols-3 gap-2">
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
                              <SelectItem value="UTILITY">Utility</SelectItem>
                              <SelectItem value="MARKETING">Marketing</SelectItem>
                              <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
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
                          className="w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-blue-500/50 focus:outline-none"
                        />
                        <Button
                          variant="primary"
                          className="gap-2 bg-blue-600 text-sm text-white hover:bg-blue-500"
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
                                "border text-xs capitalize",
                                STATUS_STYLES[template.status] ?? STATUS_STYLES.draft
                              )}
                            >
                              {template.status}
                            </Badge>
                            <button
                              onClick={() => setEditing(template)}
                              className="text-[color:var(--ds-text-muted)] hover:text-blue-600"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => deleteTemplate(template.slug)}
                              className="text-[color:var(--ds-text-muted)] hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                          <span>{template.language.toUpperCase()}</span>
                          <span>·</span>
                          <span>{template.category}</span>
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
