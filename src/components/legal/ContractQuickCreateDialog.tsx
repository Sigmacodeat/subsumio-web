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
import { Loader2, Save, FileText } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { OFFLINE_KEYS, enqueueMutation, getCache, isOnline, setCache } from "@/lib/offline-store";
import type { BrainPage } from "@/lib/types";

interface ContractQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  presetCaseSlug?: string;
}

interface ContractItem {
  slug: string;
  title: string;
  parties?: string;
  contractType?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  riskScore?: number;
  status?: "draft" | "reviewed" | "approved" | "signed";
  createdAt: string;
  content: string;
}

const CONTRACT_TYPES: Array<{ value: string; labelKey: DashboardKey }> = [
  { value: "Kaufvertrag", labelKey: "contracts.quick_type_kauf" },
  { value: "Dienstvertrag", labelKey: "contracts.quick_type_dienst" },
  { value: "Werkvertrag", labelKey: "contracts.quick_type_werk" },
  { value: "Mietvertrag", labelKey: "contracts.quick_type_miete" },
  { value: "NDA / Geheimhaltung", labelKey: "contracts.quick_type_nda" },
  { value: "Arbeitsvertrag", labelKey: "contracts.quick_type_arbeit" },
  { value: "Lizenzvertrag", labelKey: "contracts.quick_type_lizenz" },
  { value: "GmbH-Vertrag", labelKey: "contracts.quick_type_gmbh" },
  { value: "Sonstige", labelKey: "contracts.quick_type_sonst" },
];

function parseContract(page: BrainPage): ContractItem {
  const fm = page.frontmatter ?? {};
  return {
    slug: page.slug,
    title: page.title,
    parties: (fm.parties as string) || undefined,
    contractType: (fm.contract_type as string) || undefined,
    riskLevel: (fm.risk_level as ContractItem["riskLevel"]) || undefined,
    riskScore: (fm.risk_score as number) || undefined,
    status: (fm.contract_status as ContractItem["status"]) || "draft",
    createdAt:
      ((page as unknown as Record<string, unknown>).createdAt as string) ||
      ((page as unknown as Record<string, unknown>).created_at as string) ||
      new Date().toISOString(),
    content: page.content || "",
  };
}

export function ContractQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
  presetCaseSlug,
}: ContractQuickCreateDialogProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Kaufvertrag");
  const [parties, setParties] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setTitle("");
    setType("Kaufvertrag");
    setParties("");
    setContent("");
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const slug = `legal/contracts/${title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      const payload = {
        slug,
        title: title.trim(),
        type: "legal_contract" as const,
        content: content.trim(),
        frontmatter: {
          contract_type: type,
          parties: parties.trim(),
          contract_status: "draft",
          risk_level: null,
          risk_score: null,
          case_slug: presetCaseSlug || undefined,
        },
      };
      if (isOnline()) {
        await api.brain.createPage(payload);
      } else {
        await enqueueMutation({ type: "createPage", payload });
      }
      const cached = await getCache<ContractItem[]>(OFFLINE_KEYS.contracts);
      const nextContracts = [
        parseContract({
          slug,
          title: title.trim(),
          type: "legal_contract",
          content: content.trim(),
          frontmatter: payload.frontmatter,
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as BrainPage),
        ...(cached ?? []),
      ];
      await setCache(OFFLINE_KEYS.contracts, nextContracts);
      addToast({ type: "success", title: t("contracts.quick_created" as DashboardKey) });
      onOpenChange(false);
      if (onCreated) onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("contracts.error_create" as DashboardKey);
      addToast({ type: "error", title: msg });
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = title.trim().length > 0 && content.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--brand-primary)]/20 bg-[color:var(--brand-primary)]/10">
                <FileText size={16} className="brand-text" />
              </div>
              <DialogTitle>{t("contracts.quick_title" as DashboardKey)}</DialogTitle>
            </div>
            <DialogDescription>{t("contracts.quick_desc" as DashboardKey)}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-2">
            {/* Title + Parties */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-contract-title" className="text-xs">
                  {t("contracts.quick_label_title" as DashboardKey)} *
                </Label>
                <Input
                  id="quick-contract-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={lang === "en" ? "Contract name" : "Vertragsbezeichnung"}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-contract-parties" className="text-xs">
                  {t("contracts.quick_label_parties" as DashboardKey)}
                </Label>
                <Input
                  id="quick-contract-parties"
                  value={parties}
                  onChange={(e) => setParties(e.target.value)}
                  placeholder={
                    lang === "en" ? "e.g. Buyer A — Seller B" : "z.B. Käufer A — Verkäufer B"
                  }
                />
              </div>
            </div>

            {/* Contract type */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-contract-type" className="text-xs">
                {t("contracts.quick_label_type" as DashboardKey)}
              </Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="quick-contract-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value}>
                      {t(ct.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-contract-content" className="text-xs">
                {t("contracts.quick_label_content" as DashboardKey)} *
              </Label>
              <textarea
                id="quick-contract-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder={
                  lang === "en" ? "Insert contract text…" : "Vertragstext hier einfügen…"
                }
                className="w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
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
                {t("contracts.quick_cancel" as DashboardKey)}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={saving || !canSubmit}
                className="brand-bg gap-2 text-white"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {t("contracts.quick_save" as DashboardKey)}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
