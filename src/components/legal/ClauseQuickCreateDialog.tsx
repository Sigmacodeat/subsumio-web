"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Check, Library } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

interface ClauseQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  presetCaseSlug?: string;
}

const CATEGORY_OPTIONS: Array<{ value: string; labelKey: DashboardKey }> = [
  { value: "nda", labelKey: "clauses.cat_nda" },
  { value: "employment", labelKey: "clauses.cat_employment" },
  { value: "service", labelKey: "clauses.cat_service" },
  { value: "sale", labelKey: "clauses.cat_sale" },
  { value: "lease", labelKey: "clauses.cat_lease" },
  { value: "partnership", labelKey: "clauses.cat_partnership" },
  { value: "licensing", labelKey: "clauses.cat_licensing" },
  { value: "settlement", labelKey: "clauses.cat_settlement" },
  { value: "general", labelKey: "clauses.cat_general" },
];

export function ClauseQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
  presetCaseSlug,
}: ClauseQuickCreateDialogProps) {
  const { t } = useLang();
  const { addToast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);

  const resetForm = useCallback(() => {
    setTitle("");
    setCategory("general");
    setContent("");
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setCreating(true);
    try {
      await api.brain.createPage({
        slug: `clause/${category}/${Date.now()}`,
        title: title.trim(),
        type: "clause_library",
        content: content.trim(),
        frontmatter: { category, tags: [category], case_slug: presetCaseSlug || undefined },
      });
      addToast({ type: "success", title: t("clauses.toast_created" as DashboardKey) });
      onOpenChange(false);
      if (onCreated) onCreated();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("clauses.toast_create_failed" as DashboardKey);
      addToast({ type: "error", title: msg });
    } finally {
      setCreating(false);
    }
  }

  const canSubmit = title.trim().length > 0 && content.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                <Library size={16} className="text-emerald-600" />
              </div>
              <DialogTitle>{t("clauses.quick_title" as DashboardKey)}</DialogTitle>
            </div>
            <DialogDescription>{t("clauses.quick_desc" as DashboardKey)}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-clause-title" className="text-xs">
                {t("clauses.placeholder_title" as DashboardKey)} *
              </Label>
              <Input
                id="quick-clause-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("clauses.placeholder_title" as DashboardKey)}
                autoFocus
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-clause-cat" className="text-xs">
                {t("clauses.quick_category" as DashboardKey)}
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="quick-clause-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {t(o.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-clause-content" className="text-xs">
                {t("clauses.placeholder_body" as DashboardKey)} *
              </Label>
              <textarea
                id="quick-clause-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("clauses.placeholder_body" as DashboardKey)}
                className="h-32 w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-emerald-500/50 focus:outline-none"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-[color:var(--ds-border)] px-6 py-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-[color:var(--ds-text-muted)]"
              >
                {t("signature.btn_cancel" as DashboardKey)}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={creating || !canSubmit}
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {t("clauses.btn_create" as DashboardKey)}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
