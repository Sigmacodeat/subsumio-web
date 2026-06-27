"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDialogFetch } from "@/lib/use-dialog-fetch";
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
import {
  Loader2,
  Plus,
  Sparkles,
  ArrowRight,
  SlidersHorizontal,
  FileText,
  Briefcase,
  Home,
  Users,
  Scale,
  Gavel,
  ShieldAlert,
  Building2,
  Scroll,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { api } from "@/lib/api";
import { encodeSlugPath } from "@/lib/utils";
import { isOnline, enqueueMutation } from "@/lib/offline-store";
import { useToast } from "@/components/ui/toast";
import {
  suggestCaseFromTitle,
  detectJurisdictionFromTitle,
  defaultCaseValues,
  type CaseSuggestion,
} from "@/lib/legal-case-suggest";
import type { ContactFrontmatter } from "@/lib/legal-types";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

type ContactRole = NonNullable<ContactFrontmatter["role"]>;

interface ContactOption {
  slug: string;
  name: string;
  role: ContactRole;
}

interface CaseQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (slug: string) => void;
}

interface Template {
  id: string;
  icon: typeof Briefcase;
  labelKey: string;
  descKey: string;
  defaults: {
    title: string;
    legalArea: string;
    subArea: string;
    priority: CaseSuggestion["priority"];
    jurisdiction: CaseSuggestion["jurisdiction"];
  };
}

const JURISDICTION_OPTIONS = [
  { value: "de", labelKey: "casesnew.juris.de" },
  { value: "at", labelKey: "casesnew.juris.at" },
  { value: "ch", labelKey: "casesnew.juris.ch" },
  { value: "eu", labelKey: "casesnew.juris.eu" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", labelKey: "casesnew.prio.low" },
  { value: "medium", labelKey: "casesnew.prio.medium" },
  { value: "high", labelKey: "casesnew.prio.high" },
  { value: "critical", labelKey: "casesnew.prio.critical" },
] as const;

export function CaseQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: CaseQuickCreateDialogProps) {
  const { t, lang } = useLang();
  const router = useRouter();
  const { addToast } = useToast();

  const [title, setTitle] = useState("");
  const [clientSlug, setClientSlug] = useState("");
  const [opponentSlug, setOpponentSlug] = useState("");
  const [legalArea, setLegalArea] = useState("");
  const [subArea, setSubArea] = useState("");
  const [jurisdiction, setJurisdiction] = useState<"de" | "at" | "ch" | "eu">("de");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [caseNumber, setCaseNumber] = useState("");

  const [suggestion, setSuggestion] = useState<CaseSuggestion | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const templates: Template[] = useMemo(
    () => [
      {
        id: "rental",
        icon: Home,
        labelKey: "casesnew.template.rental",
        descKey: "casesnew.template.rental_desc",
        defaults: {
          title: "",
          legalArea: "Mietrecht",
          subArea: "Wohnraummiete",
          priority: "medium",
          jurisdiction: "de",
        },
      },
      {
        id: "employment",
        icon: Users,
        labelKey: "casesnew.template.employment",
        descKey: "casesnew.template.employment_desc",
        defaults: {
          title: "",
          legalArea: "Arbeitsrecht",
          subArea: "Kündigungsschutz",
          priority: "high",
          jurisdiction: "de",
        },
      },
      {
        id: "contract",
        icon: FileText,
        labelKey: "casesnew.template.contract",
        descKey: "casesnew.template.contract_desc",
        defaults: {
          title: "",
          legalArea: "Zivilrecht",
          subArea: "Vertragsrecht",
          priority: "medium",
          jurisdiction: "de",
        },
      },
      {
        id: "family",
        icon: Scale,
        labelKey: "casesnew.template.family",
        descKey: "casesnew.template.family_desc",
        defaults: {
          title: "",
          legalArea: "Familienrecht",
          subArea: "Scheidung",
          priority: "high",
          jurisdiction: "de",
        },
      },
      {
        id: "inheritance",
        icon: Scroll,
        labelKey: "casesnew.template.inheritance",
        descKey: "casesnew.template.inheritance_desc",
        defaults: {
          title: "",
          legalArea: "Erbrecht",
          subArea: "Testamentsvollstreckung",
          priority: "medium",
          jurisdiction: "de",
        },
      },
      {
        id: "insolvency",
        icon: ShieldAlert,
        labelKey: "casesnew.template.insolvency",
        descKey: "casesnew.template.insolvency_desc",
        defaults: {
          title: "",
          legalArea: "Insolvenzrecht",
          subArea: "Insolvenzeröffnung",
          priority: "critical",
          jurisdiction: "de",
        },
      },
      {
        id: "criminal",
        icon: Gavel,
        labelKey: "casesnew.template.criminal",
        descKey: "casesnew.template.criminal_desc",
        defaults: {
          title: "",
          legalArea: "Strafrecht",
          subArea: "Wirtschaftsstrafrecht",
          priority: "critical",
          jurisdiction: "de",
        },
      },
      {
        id: "corporate",
        icon: Building2,
        labelKey: "casesnew.template.corporate",
        descKey: "casesnew.template.corporate_desc",
        defaults: {
          title: "",
          legalArea: "Gesellschaftsrecht",
          subArea: "Gesellschafterstreit",
          priority: "high",
          jurisdiction: "de",
        },
      },
    ],
    []
  );

  const { data: contacts, loading: loadingContacts } = useDialogFetch<ContactOption[]>(
    open,
    async () => {
      const pages = await api.brain.listPages({ type: "legal_contact", limit: 500 });
      return pages.map((p: BrainPage) => {
        const fm = (p.frontmatter ?? {}) as ContactFrontmatter;
        return {
          slug: p.slug,
          name: fm.name || p.title,
          role: fm.role || "other",
        };
      });
    }
  );

  useEffect(() => {
    const newSuggestion = suggestCaseFromTitle(title, lang);
    const detectedJurisdiction = detectJurisdictionFromTitle(title);
    setSuggestion(newSuggestion);
    if (newSuggestion?.legalArea) setLegalArea(newSuggestion.legalArea);
    if (newSuggestion?.subArea) setSubArea(newSuggestion.subArea);
    if (newSuggestion?.priority) setPriority(newSuggestion.priority ?? "medium");
    if (detectedJurisdiction) setJurisdiction(detectedJurisdiction);
    else if (newSuggestion?.jurisdiction) setJurisdiction(newSuggestion.jurisdiction ?? "de");
  }, [title, lang]);

  const clients = useMemo(() => (contacts ?? []).filter((c) => c.role === "client"), [contacts]);
  const opponents = useMemo(
    () => (contacts ?? []).filter((c) => c.role === "opponent"),
    [contacts]
  );

  const applyTemplate = useCallback(
    (templateId: string) => {
      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) return;
      setSelectedTemplate(templateId);
      setLegalArea(tpl.defaults.legalArea);
      setSubArea(tpl.defaults.subArea);
      setPriority(tpl.defaults.priority ?? "medium");
      setJurisdiction(tpl.defaults.jurisdiction ?? "de");
    },
    [templates]
  );

  const resetForm = useCallback(() => {
    setTitle("");
    setClientSlug("");
    setOpponentSlug("");
    setLegalArea("");
    setSubArea("");
    setJurisdiction(defaultCaseValues().jurisdiction);
    setPriority(defaultCaseValues().priority);
    setCaseNumber("");
    setSuggestion(null);
    setShowAdvanced(false);
    setSelectedTemplate(null);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);

    const slug = `legal/cases/${caseNumber?.trim() || Date.now().toString(36)}-${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`;

    const client = clients.find((c) => c.slug === clientSlug);
    const opponent = opponents.find((c) => c.slug === opponentSlug);

    const pagePayload = {
      slug,
      title: title.trim(),
      type: "legal_case" as const,
      content: "",
      frontmatter: {
        case_number: caseNumber?.trim() || slug.split("/").pop(),
        legal_area: legalArea || undefined,
        sub_area: subArea || undefined,
        jurisdiction,
        status: "open",
        priority,
        client_name: client?.name || undefined,
        client_slug: clientSlug || undefined,
        opponent_name: opponent?.name || undefined,
        opponent_slugs: opponentSlug ? [opponentSlug] : undefined,
        version: 0,
      },
    };

    try {
      if (isOnline()) {
        await api.brain.createPage(pagePayload);
      } else {
        await enqueueMutation({ type: "createPage", payload: pagePayload });
      }
      addToast({ type: "success", title: t("casesnew.toast_created" as DashboardKey) });
      if (createAnother) {
        resetForm();
        setSubmitting(false);
        return;
      }
      onOpenChange(false);
      if (onCreated) onCreated(slug);
      else router.push(`/dashboard/cases/${encodeSlugPath(slug)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("casesnew.error_create" as DashboardKey);
      addToast({ type: "error", title: msg });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
                <Plus size={16} className="brand-text" />
              </div>
              <DialogTitle>{t("casesnew.quick_title")}</DialogTitle>
            </div>
            <DialogDescription>{t("casesnew.quick_desc")}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-2">
            {/* Templates */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {templates.map((tpl) => {
                const Icon = tpl.icon;
                const active = selectedTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 text-center transition-colors",
                      active
                        ? "border-[color:var(--brand-primary)]/50 bg-[color:var(--brand-glow)]"
                        : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:bg-[color:var(--ds-hover)]"
                    )}
                  >
                    <Icon
                      size={16}
                      className={active ? "brand-text" : "text-[color:var(--ds-text-muted)]"}
                    />
                    <span
                      className={cn(
                        "text-xs font-medium",
                        active ? "text-[color:var(--ds-text)]" : "text-[color:var(--ds-text-muted)]"
                      )}
                    >
                      {t(tpl.labelKey as DashboardKey)}
                    </span>
                    <span className="text-[10px] text-[color:var(--ds-text-subtle)]">
                      {t(tpl.descKey as DashboardKey)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-title" className="text-xs">
                {t("casesnew.label_title" as DashboardKey)} *
              </Label>
              <div className="relative">
                <Input
                  id="quick-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("casesnew.quick_title_placeholder" as DashboardKey)}
                  className="pr-9"
                  autoFocus
                />
                {suggestion && (
                  <div className="absolute top-1/2 right-3 -translate-y-1/2">
                    <Sparkles size={14} className="brand-text" />
                  </div>
                )}
              </div>
              {suggestion && (
                <p className="flex items-center gap-1 text-xs text-[color:var(--brand-primary)]">
                  <Sparkles size={11} />
                  {suggestion.reason}
                  {suggestion.legalArea && (
                    <span className="ml-1 rounded bg-[color:var(--brand-glow)] px-1 py-0.5">
                      {suggestion.legalArea}
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Parties */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-client" className="text-xs">
                  {t("casesnew.label_client" as DashboardKey)}
                </Label>
                <Select value={clientSlug} onValueChange={setClientSlug} disabled={loadingContacts}>
                  <SelectTrigger id="quick-client">
                    <SelectValue
                      placeholder={t("casesnew.quick_client_placeholder" as DashboardKey)}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      {t("casesnew.quick_client_none" as DashboardKey)}
                    </SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-opponent" className="text-xs">
                  {t("casesnew.label_opponent" as DashboardKey)}
                </Label>
                <Select
                  value={opponentSlug}
                  onValueChange={setOpponentSlug}
                  disabled={loadingContacts}
                >
                  <SelectTrigger id="quick-opponent">
                    <SelectValue
                      placeholder={t("casesnew.quick_opponent_placeholder" as DashboardKey)}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      {t("casesnew.quick_opponent_none" as DashboardKey)}
                    </SelectItem>
                    {opponents.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Jurisdiction */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-jurisdiction" className="text-xs">
                {t("casesnew.label_jurisdiction" as DashboardKey)}
              </Label>
              <Select
                value={jurisdiction}
                onValueChange={(v) => setJurisdiction(v as "de" | "at" | "ch" | "eu")}
              >
                <SelectTrigger id="quick-jurisdiction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JURISDICTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {t(o.labelKey as DashboardKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
            >
              <SlidersHorizontal size={13} />
              {showAdvanced
                ? t("casesnew.quick_hide_advanced" as DashboardKey)
                : t("casesnew.quick_show_advanced" as DashboardKey)}
              <ArrowRight
                size={12}
                className={cn("transition-transform", showAdvanced ? "rotate-90" : "")}
              />
            </button>

            {/* Advanced fields */}
            {showAdvanced && (
              <div className="space-y-4 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-case-number" className="text-xs">
                      {t("casesnew.label_case_number" as DashboardKey)}
                    </Label>
                    <Input
                      id="quick-case-number"
                      value={caseNumber}
                      onChange={(e) => setCaseNumber(e.target.value)}
                      placeholder={lang === "en" ? "e.g. 2026-001" : "z.B. 2026-001"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-priority" className="text-xs">
                      {t("casesnew.label_priority" as DashboardKey)}
                    </Label>
                    <Select
                      value={priority}
                      onValueChange={(v) =>
                        setPriority(v as "low" | "medium" | "high" | "critical")
                      }
                    >
                      <SelectTrigger id="quick-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {t(o.labelKey as DashboardKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-legal-area" className="text-xs">
                      {t("casesnew.label_area" as DashboardKey)}
                    </Label>
                    <Input
                      id="quick-legal-area"
                      value={legalArea}
                      onChange={(e) => setLegalArea(e.target.value)}
                      placeholder={lang === "en" ? "e.g. Rental law" : "z.B. Mietrecht"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-sub-area" className="text-xs">
                      {t("casesnew.label_sub_area" as DashboardKey)}
                    </Label>
                    <Input
                      id="quick-sub-area"
                      value={subArea}
                      onChange={(e) => setSubArea(e.target.value)}
                      placeholder={lang === "en" ? "e.g. Residential lease" : "z.B. Wohnraummiete"}
                    />
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-[color:var(--ds-text-subtle)]">
              {t("casesnew.quick_full_form_hint" as DashboardKey)}{" "}
              <Link
                href="/dashboard/cases/new"
                onClick={() => onOpenChange(false)}
                className="brand-text inline-flex items-center gap-0.5 hover:underline"
              >
                {t("casesnew.quick_full_form_link" as DashboardKey)}
                <ArrowRight size={11} />
              </Link>
            </p>
          </div>

          <DialogFooter className="border-t border-[color:var(--ds-border)] px-6 py-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
                <input
                  type="checkbox"
                  checked={createAnother}
                  onChange={(e) => setCreateAnother(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[color:var(--ds-border)]"
                />
                {t("casesnew.create_another" as DashboardKey)}
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-[color:var(--ds-text-muted)]"
              >
                {t("casesnew.btn_cancel" as DashboardKey)}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting || !canSubmit}
                className="brand-bg gap-2 text-white"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {t("casesnew.btn_create" as DashboardKey)}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
