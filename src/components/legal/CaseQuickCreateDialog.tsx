"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Check,
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
import { useMe } from "@/lib/queries/auth";
import {
  suggestCaseFromTitle,
  detectJurisdictionFromTitle,
  defaultCaseValues,
  type CaseSuggestion,
} from "@/lib/legal-case-suggest";
import type { ContactFrontmatter } from "@/lib/legal-types";
import type { BrainPage } from "@/lib/types";
import {
  defaultAcceptanceWorkflow,
  inferKycRequired,
  inferPoaRequired,
} from "@/lib/intake-acceptance";
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
  { value: "at", labelKey: "casesnew.juris.at" },
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
  const { data: me } = useMe();

  const [title, setTitle] = useState("");
  const [clientSlug, setClientSlug] = useState("");
  const [opponentSlug, setOpponentSlug] = useState("");
  const [legalArea, setLegalArea] = useState("");
  const [subArea, setSubArea] = useState("");
  const [jurisdiction, setJurisdiction] = useState<"at" | "eu">("at");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [caseNumber, setCaseNumber] = useState("");

  const [suggestion, setSuggestion] = useState<CaseSuggestion | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [_conflictCheck, setConflictCheck] = useState<
    "idle" | "checking" | "critical" | "clear" | "error"
  >("idle");

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
          jurisdiction: "at",
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
          jurisdiction: "at",
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
          jurisdiction: "at",
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
          jurisdiction: "at",
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
          subArea: "Verlassenschaftsverfahren",
          priority: "medium",
          jurisdiction: "at",
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
          jurisdiction: "at",
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
          jurisdiction: "at",
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
          jurisdiction: "at",
        },
      },
    ],
    []
  );

  const { data: contacts, loading: loadingContacts } = useDialogFetch<ContactOption[]>(
    open,
    async () => {
      const pages = await api.brain.listAllPages({ type: "legal_contact" });
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
    if (detectedJurisdiction === "at" || detectedJurisdiction === "eu") {
      setJurisdiction(detectedJurisdiction);
    } else if (newSuggestion?.jurisdiction === "at" || newSuggestion?.jurisdiction === "eu") {
      setJurisdiction(newSuggestion.jurisdiction);
    }
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
      setJurisdiction(tpl.defaults.jurisdiction === "eu" ? "eu" : "at");
    },
    [templates]
  );

  const templateRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // APG-Radiogroup: Pfeiltasten bewegen Fokus + Auswahl, Home/End an die Ränder
  const handleTemplateKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const last = templates.length - 1;
      let next: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = index === last ? 0 : index + 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = index === 0 ? last : index - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = last;
      if (next === null) return;
      e.preventDefault();
      templateRefs.current[next]?.focus();
      applyTemplate(templates[next].id);
    },
    [templates, applyTemplate]
  );

  const resetForm = useCallback(() => {
    setTitle("");
    setClientSlug("");
    setOpponentSlug("");
    setLegalArea("");
    setSubArea("");
    setJurisdiction(defaultCaseValues().jurisdiction === "eu" ? "eu" : "at");
    setPriority(defaultCaseValues().priority);
    setCaseNumber("");
    setSuggestion(null);
    setShowAdvanced(false);
    setSelectedTemplate(null);
    setConflictCheck("idle");
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);

    const client = clients.find((c) => c.slug === clientSlug);
    const opponent = opponents.find((c) => c.slug === opponentSlug);
    // Each party with its side in the new matter (§ 10 Abs 1 RAO): the client
    // must not be an opponent elsewhere, the opponent not an existing client.
    const parties: Array<{ name: string; side: "client" | "opponent" }> = [];
    if (client?.name?.trim()) parties.push({ name: client.name.trim(), side: "client" });
    if (opponent?.name?.trim()) parties.push({ name: opponent.name.trim(), side: "opponent" });

    if (isOnline() && parties.length > 0) {
      setConflictCheck("checking");
      for (const party of parties) {
        let conflictResult: Awaited<ReturnType<typeof api.legal.conflictCheck>>;
        try {
          conflictResult = await api.legal.conflictCheck(party.name, party.side);
        } catch (err) {
          setConflictCheck("error");
          addToast({
            type: "error",
            title: err instanceof Error ? err.message : "Kollisionsprüfung fehlgeschlagen",
          });
          setSubmitting(false);
          return;
        }
        if (conflictResult.severity === "critical") {
          setConflictCheck("critical");
          addToast({
            type: "error",
            title: "Kritische Kollision erkannt",
            description: conflictResult.explanation,
          });
          setSubmitting(false);
          return;
        }
      }
      setConflictCheck("clear");
    }

    const now = new Date().toISOString();
    // The conflict check on record is always the SERVER's: /api/pages runs it
    // when the matter is written (also when an offline create syncs) and fills
    // this block. The dialog never claims a check of its own.
    const acceptance = defaultAcceptanceWorkflow();

    const kycRequired = inferKycRequired(legalArea, client?.name);
    const poaRequired = inferPoaRequired(legalArea);

    const slug = `legal/cases/${caseNumber?.trim() || Date.now().toString(36)}-${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`;

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
        mandate_acceptance: {
          intake_slug: "quick-create",
          accepted_at: now,
          accepted_by: me?.email ?? "CaseQuickCreateDialog",
          conflict_check: acceptance.conflict_check,
          kyc: { ...acceptance.kyc, required: kycRequired },
          poa: { ...acceptance.poa, required: poaRequired },
          engagement_letter: acceptance.engagement_letter,
        },
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
            <p className="text-xs font-medium text-[color:var(--ds-text-muted)]">
              {t("casesnew.quick_templates" as DashboardKey)}
            </p>
            <div
              role="radiogroup"
              aria-label={t("casesnew.quick_templates" as DashboardKey)}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {templates.map((tpl, index) => {
                const Icon = tpl.icon;
                const active = selectedTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    ref={(el) => {
                      templateRefs.current[index] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    tabIndex={active || (selectedTemplate === null && index === 0) ? 0 : -1}
                    onKeyDown={(e) => handleTemplateKeyDown(e, index)}
                    onClick={() => applyTemplate(tpl.id)}
                    className={cn(
                      "group relative flex min-w-0 flex-col items-center gap-2 rounded-xl border px-2.5 py-3 text-center transition-[background-color,border-color,color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--ds-surface-elevated)] focus-visible:outline-none active:scale-[0.98] motion-reduce:transition-none",
                      active
                        ? "border-[color:var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_10%,transparent)]"
                        : "border-[color:var(--ds-border-strong)] hover:border-[color:var(--ds-text-subtle)] hover:bg-[color:var(--ds-hover)]"
                    )}
                  >
                    {active ? (
                      <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[color:var(--brand-primary)] text-white">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors duration-[var(--ds-duration-fast)]",
                        active
                          ? "brand-border bg-[color:var(--brand-glow)] text-[color:var(--brand-text)]"
                          : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] group-hover:text-[color:var(--ds-text)]"
                      )}
                    >
                      <Icon size={16} />
                    </span>
                    <span
                      className={cn(
                        "w-full min-w-0 text-xs leading-snug font-medium break-words hyphens-auto",
                        active ? "text-[color:var(--brand-text)]" : "text-[color:var(--ds-text)]"
                      )}
                    >
                      {t(tpl.labelKey as DashboardKey)}
                    </span>
                    <span className="line-clamp-2 w-full min-w-0 text-[11px] leading-snug break-words hyphens-auto text-[color:var(--ds-text-muted)]">
                      {t(tpl.descKey as DashboardKey)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-title" className="text-xs text-[color:var(--ds-text-muted)]">
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
                <Label htmlFor="quick-client" className="text-xs text-[color:var(--ds-text-muted)]">
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
                <Label
                  htmlFor="quick-opponent"
                  className="text-xs text-[color:var(--ds-text-muted)]"
                >
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
              <Label
                htmlFor="quick-jurisdiction"
                className="text-xs text-[color:var(--ds-text-muted)]"
              >
                {t("casesnew.label_jurisdiction" as DashboardKey)}
              </Label>
              <Select value={jurisdiction} onValueChange={(v) => setJurisdiction(v as "at" | "eu")}>
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
              className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
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
              <div className="space-y-4 rounded-xl border border-[color:var(--ds-border-strong)] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="quick-case-number"
                      className="text-xs text-[color:var(--ds-text-muted)]"
                    >
                      {t("casesnew.label_case_number" as DashboardKey)}
                    </Label>
                    <Input
                      id="quick-case-number"
                      value={caseNumber}
                      onChange={(e) => setCaseNumber(e.target.value)}
                      placeholder={t("caseqc.placeholder_file_no")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="quick-priority"
                      className="text-xs text-[color:var(--ds-text-muted)]"
                    >
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
                    <Label
                      htmlFor="quick-legal-area"
                      className="text-xs text-[color:var(--ds-text-muted)]"
                    >
                      {t("casesnew.label_area" as DashboardKey)}
                    </Label>
                    <Input
                      id="quick-legal-area"
                      value={legalArea}
                      onChange={(e) => setLegalArea(e.target.value)}
                      placeholder={t("caseqc.placeholder_area")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="quick-sub-area"
                      className="text-xs text-[color:var(--ds-text-muted)]"
                    >
                      {t("casesnew.label_sub_area" as DashboardKey)}
                    </Label>
                    <Input
                      id="quick-sub-area"
                      value={subArea}
                      onChange={(e) => setSubArea(e.target.value)}
                      placeholder={t("caseqc.placeholder_subject")}
                    />
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-[color:var(--ds-text-muted)]">
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
              <Checkbox
                id="quick-create-another"
                checked={createAnother}
                onCheckedChange={(v) => setCreateAnother(v === true)}
              />
              <Label
                htmlFor="quick-create-another"
                className="text-xs font-normal text-[color:var(--ds-text-muted)]"
              >
                {t("casesnew.create_another" as DashboardKey)}
              </Label>
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
