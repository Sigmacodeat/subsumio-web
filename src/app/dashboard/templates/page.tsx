"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  FileText,
  Plus,
  Loader2,
  AlertTriangle,
  Search,
  Copy,
  Check,
  Pencil,
  Trash2,
  Save,
  X,
  FileCheck,
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

import { EmptyState } from "@/components/dashboard/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

interface TemplateItem {
  slug: string;
  title: string;
  category: string;
  jurisdiction: string;
  description: string;
  body: string;
  variables: Array<{ key: string; label: string; required: boolean }>;
  isBuiltin: boolean;
  createdAt: string;
}

const CATEGORIES = ["pleading", "contract", "opinion", "correspondence", "general"] as const;
const JURISDICTIONS = ["all", "at", "de", "ch"] as const;

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  pleading: FileCheck,
  contract: FileText,
  opinion: FileText,
  correspondence: FileText,
  general: FileText,
};

function parseTemplate(page: BrainPage): TemplateItem {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  return {
    slug: page.slug,
    title: page.title,
    category: (fm.category as string) || "general",
    jurisdiction: (fm.jurisdiction as string) || "all",
    description: (fm.description as string) || "",
    body: page.content || "",
    variables: Array.isArray(fm.variables) ? (fm.variables as TemplateItem["variables"]) : [],
    isBuiltin: Boolean(fm.is_builtin),
    createdAt:
      ((page as unknown as Record<string, unknown>).created_at as string) ||
      new Date().toISOString(),
  };
}

export default function TemplateLibraryPage() {
  const { t } = useLang();
  const confirm = useConfirm();

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterJurisdiction, setFilterJurisdiction] = useState<string>("all");

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formJurisdiction, setFormJurisdiction] = useState("all");
  const [formDescription, setFormDescription] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formVariables, setFormVariables] = useState<
    Array<{ key: string; label: string; required: boolean }>
  >([]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await api.legal.templates.list({ limit: 200 });
      const items = (Array.isArray(pages) ? pages : []).map(parseTemplate);
      setTemplates(items);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("templates.err_load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const filtered = useMemo(() => {
    let result = templates;
    if (filterCategory !== "all") {
      result = result.filter((t) => t.category === filterCategory);
    }
    if (filterJurisdiction !== "all") {
      result = result.filter(
        (t) => t.jurisdiction === filterJurisdiction || t.jurisdiction === "all"
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q)
      );
    }
    return result;
  }, [templates, search, filterCategory, filterJurisdiction]);

  function resetForm() {
    setFormTitle("");
    setFormCategory("general");
    setFormJurisdiction("all");
    setFormDescription("");
    setFormBody("");
    setFormVariables([]);
    setSaveError(null);
  }

  function startCreate() {
    resetForm();
    setEditingSlug(null);
    setCreating(true);
  }

  function startEdit(template: TemplateItem) {
    setFormTitle(template.title);
    setFormCategory(template.category);
    setFormJurisdiction(template.jurisdiction);
    setFormDescription(template.description);
    setFormBody(template.body);
    setFormVariables([...template.variables]);
    setEditingSlug(template.slug);
    setCreating(true);
  }

  function addVariable() {
    setFormVariables((prev) => [...prev, { key: "", label: "", required: true }]);
  }

  function updateVariable(
    index: number,
    field: "key" | "label" | "required",
    value: string | boolean
  ) {
    setFormVariables((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  }

  function removeVariable(index: number) {
    setFormVariables((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveTemplate() {
    if (!formTitle.trim() || !formBody.trim()) {
      setSaveError(t("templates.toast_error"));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        title: formTitle.trim(),
        category: formCategory,
        jurisdiction: formJurisdiction,
        description: formDescription.trim(),
        body: formBody.trim(),
        variables: formVariables.filter((v) => v.key.trim() && v.label.trim()),
      };
      if (editingSlug) {
        await api.legal.templates.update(editingSlug, payload);
        setTemplates((prev) =>
          prev.map((t) => (t.slug === editingSlug ? { ...t, ...payload } : t))
        );
      } else {
        const result = await api.legal.templates.create(payload);
        const newItem: TemplateItem = {
          slug: result.slug,
          ...payload,
          isBuiltin: false,
          createdAt: new Date().toISOString(),
        };
        setTemplates((prev) => [newItem, ...prev]);
      }
      setCreating(false);
      resetForm();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("templates.toast_error"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(slug: string) {
    const ok = await confirm({
      title: t("templates.confirm_delete_title"),
      message: t("templates.confirm_delete_msg"),
      confirmLabel: t("templates.btn_delete"),
      cancelLabel: t("templates.btn_cancel"),
    });
    if (!ok) return;
    try {
      await api.legal.templates.delete(slug);
      setTemplates((prev) => prev.filter((t) => t.slug !== slug));
      if (selectedTemplate?.slug === slug) setSelectedTemplate(null);
    } catch {
      // best-effort
    }
  }

  function copyTemplate(template: TemplateItem) {
    void navigator.clipboard.writeText(template.body);
    setCopied(true);
    setSelectedTemplate(template);
    setTimeout(() => setCopied(false), 2000);
  }

  const categoryLabel = (cat: string) => t(`templates.cat_${cat}` as DashboardKey);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("templates.title")}
        description={t("templates.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("templates.title") }]}
        actions={
          <Button
            onClick={startCreate}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <Plus size={15} /> {t("templates.btn_new")}
          </Button>
        }
      />

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("templates.search")}
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pl-10 text-[color:var(--ds-text)]"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("templates.all_categories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("templates.all_categories")}</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {categoryLabel(cat)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterJurisdiction} onValueChange={setFilterJurisdiction}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("templates.all_jurisdictions")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("templates.all_jurisdictions")}</SelectItem>
              {JURISDICTIONS.map((j) => (
                <SelectItem key={j} value={j}>
                  {j === "all" ? "DACH" : j.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      )}

      {/* Error */}
      {loadError && !loading && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={16} />
          {loadError}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadTemplates()}
            className="ml-auto"
          >
            {t("cases.retry")}
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && filtered.length === 0 && (
        <EmptyState
          icon={FileText}
          title={t("templates.empty_title")}
          description={t("templates.empty_desc")}
          actionLabel={t("templates.btn_new")}
          onAction={startCreate}
        />
      )}

      {/* Template grid */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => {
            const Icon = CATEGORY_ICONS[template.category] ?? FileText;
            return (
              <div
                key={template.slug}
                className={cn(
                  "group relative flex flex-col rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-all hover:border-[color:var(--brand-primary)]/30 hover:shadow-md",
                  selectedTemplate?.slug === template.slug &&
                    "ring-2 ring-[color:var(--brand-primary)]/40"
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10">
                      <Icon size={16} className="brand-text" />
                    </div>
                    <h3 className="line-clamp-2 text-sm font-semibold text-[color:var(--ds-text)]">
                      {template.title}
                    </h3>
                  </div>
                  {template.isBuiltin && (
                    <Badge variant="default" className="shrink-0 text-xs">
                      Built-in
                    </Badge>
                  )}
                </div>

                {template.description && (
                  <p className="mb-3 line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                    {template.description}
                  </p>
                )}

                <div className="mb-3 flex flex-wrap gap-1.5">
                  <Badge variant="default" className="text-xs">
                    {categoryLabel(template.category)}
                  </Badge>
                  {template.jurisdiction !== "all" && (
                    <Badge variant="default" className="text-xs">
                      {template.jurisdiction.toUpperCase()}
                    </Badge>
                  )}
                  {template.variables.length > 0 && (
                    <Badge variant="default" className="text-xs">
                      {template.variables.length} {t("templates.label_variables")}
                    </Badge>
                  )}
                </div>

                <div className="mt-auto flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyTemplate(template)}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {copied && selectedTemplate?.slug === template.slug ? (
                      <>
                        <Check size={14} /> {t("templates.btn_copied")}
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> {t("templates.btn_copy")}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(template)}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Pencil size={14} /> {t("templates.btn_edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void deleteTemplate(template.slug)}
                    className="h-8 gap-1.5 text-xs text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[color:var(--ds-text)]">
                {editingSlug ? t("templates.btn_edit") : t("templates.btn_new")}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreating(false);
                  resetForm();
                }}
              >
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="tpl-title">{t("templates.label_title")}</Label>
                <Input
                  id="tpl-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="z.B. Klageschrift Mietrecht"
                />
              </div>

              {/* Category + Jurisdiction */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("templates.label_category")}</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {categoryLabel(cat)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("templates.label_jurisdiction")}</Label>
                  <Select value={formJurisdiction} onValueChange={setFormJurisdiction}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JURISDICTIONS.map((j) => (
                        <SelectItem key={j} value={j}>
                          {j === "all" ? "DACH" : j.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="tpl-desc">{t("templates.label_description")}</Label>
                <Input
                  id="tpl-desc"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Kurze Beschreibung der Vorlage"
                />
              </div>

              {/* Body */}
              <div className="space-y-2">
                <Label htmlFor="tpl-body">{t("templates.label_body")}</Label>
                <Textarea
                  id="tpl-body"
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  rows={10}
                  placeholder="Vorlagen-Text mit {{variablen}}…"
                  className="font-mono text-sm"
                />
              </div>

              {/* Variables */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("templates.label_variables")}</Label>
                  <Button variant="ghost" size="sm" onClick={addVariable} className="h-7 text-xs">
                    <Plus size={12} /> {t("templates.var_add")}
                  </Button>
                </div>
                {formVariables.length > 0 && (
                  <div className="space-y-2">
                    {formVariables.map((v, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={v.key}
                          onChange={(e) => updateVariable(i, "key", e.target.value)}
                          placeholder={t("templates.var_key")}
                          className="w-32 text-xs"
                        />
                        <Input
                          value={v.label}
                          onChange={(e) => updateVariable(i, "label", e.target.value)}
                          placeholder={t("templates.var_label")}
                          className="flex-1 text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateVariable(i, "required", !v.required)}
                          className="h-8 px-2 text-xs"
                        >
                          {v.required ? t("templates.var_required") : "—"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeVariable(i)}
                          className="h-8 px-2 text-xs text-red-600"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Error */}
              {saveError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
                  <AlertTriangle size={14} />
                  {saveError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCreating(false);
                    resetForm();
                  }}
                >
                  {t("templates.btn_cancel")}
                </Button>
                <Button onClick={() => void saveTemplate()} disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {t("templates.btn_save")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
