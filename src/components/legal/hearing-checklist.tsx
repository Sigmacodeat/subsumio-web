"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Plus, Trash2, Check, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

const DEFAULT_CHECKLIST_DE: ChecklistItem[] = [
  { id: "akten", label: "Akten vollständig kopiert (für Gericht, Gegner, Mandant)", checked: false },
  { id: "antrag", label: "Antragsschrift finalisiert und unterschrieben", checked: false },
  { id: "beweise", label: "Beweisanträge vorbereitet", checked: false },
  { id: "zeugen", label: "Zeugenladung überprüft / Zeugenliste final", checked: false },
  { id: "sachverstaendige", label: "Sachverständige informiert / vorbereitet", checked: false },
  { id: "kleidung", label: "Robe/Talar vorbereitet (falls erforderlich)", checked: false },
  { id: "orte", label: "Ortskenntnis Gericht / Parkmöglichkeit geprüft", checked: false },
  { id: "mandant", label: "Mandant instruiert (Verhalten, Ablauf, Kleidung)", checked: false },
  { id: "argumente", label: "Hauptargumente strukturiert (Pro/Contra)", checked: false },
  { id: "rechtsmittel", label: "Rechtsmittel-frist notiert", checked: false },
];

const DEFAULT_CHECKLIST_EN: ChecklistItem[] = [
  { id: "files", label: "Case files fully copied (court, opposing, client)", checked: false },
  { id: "motion", label: "Motion finalized and signed", checked: false },
  { id: "evidence", label: "Evidence motions prepared", checked: false },
  { id: "witnesses", label: "Witness summons verified / witness list final", checked: false },
  { id: "experts", label: "Experts informed / prepared", checked: false },
  { id: "robe", label: "Robe/gown prepared (if required)", checked: false },
  { id: "location", label: "Court location / parking checked", checked: false },
  { id: "client", label: "Client instructed (behavior, procedure, dress)", checked: false },
  { id: "arguments", label: "Main arguments structured (Pro/Contra)", checked: false },
  { id: "appeal", label: "Appeal deadline noted", checked: false },
];

export function HearingChecklist() {
  const { t, lang } = useLang();
  const ctx = useMatterDetail();
  const { addToast } = useToast();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageSlug, setPageSlug] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");

  const caseSlug = ctx.caseData?.slug ?? "";

  const load = useCallback(async () => {
    if (!caseSlug) return;
    try {
      const pages = await api.brain.listPages({ type: "legal_hearing_checklist", limit: 50 });
      const existing = pages.find((p) => p.frontmatter?.case_slug === caseSlug);
      if (existing) {
        setPageSlug(existing.slug);
        const loaded = (existing.frontmatter?.items as ChecklistItem[]) ?? [];
        if (loaded.length > 0) {
          setItems(loaded);
        } else {
          setItems(lang === "en" ? [...DEFAULT_CHECKLIST_EN] : [...DEFAULT_CHECKLIST_DE]);
        }
      } else {
        setPageSlug(null);
        setItems(lang === "en" ? [...DEFAULT_CHECKLIST_EN] : [...DEFAULT_CHECKLIST_DE]);
      }
    } catch {
      addToast({ type: "error", title: t("common.error") });
    } finally {
      setLoading(false);
    }
  }, [caseSlug, lang, addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(updated: ChecklistItem[]) {
    setItems(updated);
    try {
      const slug = pageSlug ?? `legal/hearing-checklists/${Date.now().toString(36)}`;
      if (pageSlug) {
        await api.brain.updatePage({
          slug,
          frontmatter: { case_slug: caseSlug, items: updated, updated_at: new Date().toISOString() },
        });
      } else {
        await api.brain.createPage({
          slug,
          title: `Verhandlungs-Checkliste ${ctx.caseData?.title ?? ""}`,
          type: "legal_hearing_checklist",
          content: "",
          frontmatter: {
            case_slug: caseSlug,
            items: updated,
            created_at: new Date().toISOString(),
          },
        });
        setPageSlug(slug);
      }
      addToast({ type: "success", title: t("mattertab.hearing_checklist_saved") });
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  function toggleItem(id: string) {
    const updated = items.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    void save(updated);
  }

  function addCustomItem() {
    if (!customLabel.trim()) return;
    const newItem: ChecklistItem = {
      id: `custom-${Date.now().toString(36)}`,
      label: customLabel.trim(),
      checked: false,
    };
    void save([...items, newItem]);
    setCustomLabel("");
  }

  function deleteItem(id: string) {
    void save(items.filter((item) => item.id !== id));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  const completedCount = items.filter((i) => i.checked).length;

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center gap-2">
        <Gavel size={16} className="text-[color:var(--brand-primary)]" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("mattertab.hearing_checklist")}
        </h3>
        <span className="ml-auto text-xs text-[color:var(--ds-text-subtle)]">
          {completedCount}/{items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-[color:var(--ds-text-muted)]">
          {t("mattertab.hearing_checklist_empty")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="group flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                  item.checked
                    ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white"
                    : "border-[color:var(--ds-border)] hover:border-[color:var(--brand-primary)]"
                )}
                aria-label={item.label}
              >
                {item.checked && <Check size={12} />}
              </button>
              <span
                className={cn(
                  "flex-1 text-sm",
                  item.checked
                    ? "text-[color:var(--ds-text-subtle)] line-through"
                    : "text-[color:var(--ds-text)]"
                )}
              >
                {item.label}
              </span>
              <button
                type="button"
                onClick={() => deleteItem(item.id)}
                aria-label={t("common.delete")}
                className="rounded p-1 text-[color:var(--ds-text-subtle)] opacity-0 transition-opacity hover:text-[color:var(--ds-danger-text)] group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-t border-[color:var(--ds-border)] pt-3">
        <Input
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustomItem();
            }
          }}
          placeholder={lang === "en" ? "Add custom item…" : "Eigene Position hinzufügen…"}
          className="text-sm"
        />
        <Button size="sm" variant="outline" onClick={addCustomItem} disabled={!customLabel.trim()}>
          <Plus size={14} />
        </Button>
      </div>
    </div>
  );
}
