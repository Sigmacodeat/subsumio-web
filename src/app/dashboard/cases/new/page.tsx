"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, AlertTriangle, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiRequestError, api } from "@/lib/api";
import { cn, encodeSlugPath } from "@/lib/utils";
import { enqueueMutation, isOnline, setCache, getCache, OFFLINE_KEYS } from "@/lib/offline-store";
import type { BrainPage } from "@/lib/types";
import type { ContactFrontmatter } from "@/lib/legal-types";
import { useDashboardForm } from "@/lib/hooks/use-dashboard-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { caseFormSchema, type CaseFormData } from "@/lib/schemas/case";
import {
  checkInternalConflict,
  type ContactRef,
  type ConflictCheckResult,
} from "@/lib/contact-conflict";

function getStatusOptions(t: (key: import("@/content/dashboard").DashboardKey) => string) {
  return [
    { value: "open", label: t("casesnew.status.open") },
    { value: "pending", label: t("casesnew.status.pending") },
    { value: "settled", label: t("casesnew.status.settled") },
    { value: "won", label: t("casesnew.status.won") },
    { value: "lost", label: t("casesnew.status.lost") },
    { value: "appealed", label: t("casesnew.status.appealed") },
    { value: "dormant", label: t("casesnew.status.dormant") },
  ] as const;
}

function getPriorityOptions(t: (key: import("@/content/dashboard").DashboardKey) => string) {
  return [
    { value: "low", label: t("casesnew.prio.low") },
    { value: "medium", label: t("casesnew.prio.medium") },
    { value: "high", label: t("casesnew.prio.high") },
    { value: "critical", label: t("casesnew.prio.critical") },
  ] as const;
}

function getJurisdictionOptions(t: (key: import("@/content/dashboard").DashboardKey) => string) {
  return [
    { value: "de", label: t("casesnew.juris.de") },
    { value: "at", label: t("casesnew.juris.at") },
    { value: "ch", label: t("casesnew.juris.ch") },
    { value: "eu", label: t("casesnew.juris.eu") },
  ] as const;
}

const LEGAL_AREA_SUGGESTIONS = [
  "Zivilrecht",
  "Strafrecht",
  "Öffentliches Recht",
  "Arbeitsrecht",
  "Familienrecht",
  "Erbrecht",
  "Mietrecht",
  "Wettbewerbsrecht",
  "Datenschutzrecht",
  "Gesellschaftsrecht",
  "Insolvenzrecht",
  "Verwaltungsrecht",
  "Baurecht",
  "Medizinrecht",
  "Urheberrecht",
  "Markenrecht",
  "Steuerrecht",
  "Sozialrecht",
  "Bankrecht",
  "Versicherungsrecht",
] as const;

const SUB_AREA_SUGGESTIONS: Record<string, string[]> = {
  Zivilrecht: ["Vertragsrecht", "Deliktsrecht", "Sachenrecht", "Schuldrecht", "Schadensersatz"],
  Strafrecht: [
    "Wirtschaftsstrafrecht",
    "Verkehrsstrafrecht",
    "Jugendstrafrecht",
    "Betäubungsmittelstrafrecht",
  ],
  "Öffentliches Recht": ["Staatsrecht", "Verwaltungsrecht", "Europarecht", "Völkerrecht"],
  Arbeitsrecht: ["Kündigungsschutz", "Arbeitsvertrag", "Tarifrecht", "Betriebsverfassungsrecht"],
  Familienrecht: ["Scheidung", "Sorgerecht", "Unterhalt", "Ehevertrag", "Güterrecht"],
  Erbrecht: ["Testament", "Erbfolge", "Erbteilung", "Pflichtteil"],
  Mietrecht: ["Wohnraummiete", "Gewerbemiete", "Mietkündigung", "Mietminderung"],
  Wettbewerbsrecht: ["UWG", "Markenverletzung", "Wettbewerbsverstoß"],
  Datenschutzrecht: ["DSGVO", "BDSG", "Datenschutzverletzung", "Auftragsverarbeitung"],
  Gesellschaftsrecht: ["GmbH", "AG", "KG", "Partnerschaftsgesellschaft"],
  Insolvenzrecht: ["Insolvenzeröffnung", "Insolvenzverwaltung", "Restschuldbefreiung"],
  Verwaltungsrecht: ["Baugenehmigung", "Umweltrecht", "Vergaberecht", "Asylrecht"],
  Baurecht: ["Bauvertrag", "Baugenehmigung", "Nachbarrecht", "Denkmalschutz"],
  Medizinrecht: ["Behandlungsfehler", "Arzthaftung", "Apothekenrecht"],
  Urheberrecht: ["Lizenz", "Verletzung", "Verlagsrecht"],
  Markenrecht: ["Markenanmeldung", "Markenverletzung", "Markenlöschung"],
  Steuerrecht: ["Einkommensteuer", "Umsatzsteuer", "Gewerbesteuer", "Steuerstrafrecht"],
  Sozialrecht: ["SGB V", "SGB VIII", "SGB IX", "Rentenrecht"],
  Bankrecht: ["Kreditrecht", "Kapitalmarktrecht", "Zahlungsverkehr"],
  Versicherungsrecht: ["Kfz-Versicherung", "Rechtsschutzversicherung", "Lebensversicherung"],
};

type ContactRole = NonNullable<ContactFrontmatter["role"]>;

interface ContactOption {
  slug: string;
  name: string;
  role: ContactRole;
}

function contactOptions(pages: BrainPage[]): ContactOption[] {
  return pages.map((p) => {
    const fm = (p.frontmatter ?? {}) as ContactFrontmatter;
    return {
      slug: p.slug,
      name: fm.name || p.title,
      role: fm.role || "other",
    };
  });
}

interface ContactSelectProps {
  id: string;
  label: string;
  value: string;
  options: ContactOption[];
  onChange: (slug: string) => void;
  disabled?: boolean;
}

function ContactSelect({ id, label, value, options, onChange, disabled }: ContactSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="mt-1.5" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.length > 0 && (
          <>
            <SelectItem value="" className="text-[color:var(--ds-text-muted)]">
              {label}
            </SelectItem>
            <SelectSeparator />
          </>
        )}
        {options.map((c) => (
          <SelectItem key={c.slug} value={c.slug}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function NewCasePage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const STATUS_OPTIONS = getStatusOptions(t);
  const PRIORITY_OPTIONS = getPriorityOptions(t);
  const JURISDICTION_OPTIONS = getJurisdictionOptions(t);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [conflictResult, setConflictResult] = useState<ConflictCheckResult | null>(null);
  const [serverConflict, setServerConflict] = useState<{
    matches: Array<{ name: string; slug: string; type: string }>;
  } | null>(null);
  const [waiverReason, setWaiverReason] = useState("");

  const form = useDashboardForm({
    schema: caseFormSchema,
    defaultValues: {
      title: "",
      caseNumber: "",
      legalArea: "",
      subArea: "",
      status: "open",
      priority: "medium",
      jurisdiction: "de",
      clientName: "",
      clientSlug: "",
      opponentName: "",
      opponentSlug: "",
      courtName: "",
      courtSlug: "",
      lawyerName: "",
      lawyerSlug: "",
      facts: "",
      tags: "",
      portalEnabled: false,
    },
    onSubmit: async (data: CaseFormData) => {
      const slug = `legal/cases/${data.caseNumber?.trim() || Date.now().toString(36)}-${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

      const pagePayload = {
        slug,
        title: data.title,
        type: "legal_case" as const,
        content: data.facts || "",
        frontmatter: {
          case_number: data.caseNumber?.trim() || slug.split("/").pop(),
          legal_area: data.legalArea || undefined,
          sub_area: data.subArea || undefined,
          jurisdiction: data.jurisdiction,
          status: data.status,
          priority: data.priority,
          client_name: data.clientName || undefined,
          client_slug: data.clientSlug || undefined,
          opponent_name: data.opponentName || undefined,
          opponent_slugs: data.opponentSlug ? [data.opponentSlug] : undefined,
          court_name: data.courtName || undefined,
          court_slug: data.courtSlug || undefined,
          own_lawyer_name: data.lawyerName || undefined,
          own_lawyer_slug: data.lawyerSlug || undefined,
          tags:
            data.tags
              ?.split(",")
              .map((t) => t.trim())
              .filter(Boolean) ?? [],
          portal_enabled: data.portalEnabled,
          version: 0,
        },
      };

      if (isOnline()) {
        setServerConflict(null);
        const fm = pagePayload.frontmatter as Record<string, unknown>;
        const hasWaiver = waiverReason.trim().length > 0;
        if (hasWaiver) {
          fm.conflict_waiver_reason = waiverReason.trim();
          fm.conflict_status = "conflict_waived";
          fm.conflict_waived_at = new Date().toISOString();
        } else {
          fm.conflict_status = "conflict_pending";
        }
        try {
          const result = (await api.brain.createPage(pagePayload)) as {
            conflictWarning?: {
              checked: boolean;
              matches?: Array<{ name: string; slug: string; type: string }>;
            };
          };
          if (result.conflictWarning?.matches?.length) {
            const names = result.conflictWarning.matches.map((m) => m.name).join(", ");
            setConflictResult({
              hasConflict: true,
              severity: "low",
              hits: [],
              checkedContacts: 0,
              warning: `Server-Kollisionsprüfung: Konflikt gefunden mit ${names}`,
            });
          }
        } catch (err) {
          if (err instanceof ApiRequestError && err.code === "conflict_detected") {
            const errorData = err.data as {
              conflictWarning?: { matches?: Array<{ name: string; slug: string; type: string }> };
            };
            setServerConflict({
              matches: errorData.conflictWarning?.matches ?? [],
            });
            return;
          }
          throw err;
        }
      } else {
        await enqueueMutation({ type: "createPage", payload: pagePayload });
        // Cache the page locally so the detail page can load it offline
        const now = new Date().toISOString();
        const fakePage: BrainPage = {
          slug,
          title: pagePayload.title,
          content: pagePayload.content || "",
          frontmatter: pagePayload.frontmatter || {},
          created_at: now,
          updated_at: now,
        };
        await setCache(`page:${slug}`, fakePage);
        // Also add to cases list cache so it appears in the list
        const cachedCases = await getCache<unknown[]>(OFFLINE_KEYS.cases);
        if (cachedCases) {
          await setCache(OFFLINE_KEYS.cases, [...cachedCases, fakePage]);
        }
      }
      router.push(`/dashboard/cases/${encodeSlugPath(slug)}`);
    },
  });

  useEffect(() => {
    let cancelled = false;
    api.brain
      .listPages({ type: "legal_contact", limit: 500 })
      .then((pages) => {
        if (!cancelled) setContacts(contactOptions(pages));
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clients = contacts.filter((c) => c.role === "client");
  const opponents = contacts.filter((c) => c.role === "opponent");
  const courts = contacts.filter((c) => c.role === "court");
  const lawyers = contacts.filter((c) => c.role === "lawyer");

  const f = form.form;
  const { register, setValue, watch } = f;
  const status = watch("status");
  const priority = watch("priority");
  const jurisdiction = watch("jurisdiction");
  const legalArea = watch("legalArea");
  const clientName = watch("clientName");
  const clientSlug = watch("clientSlug");
  const opponentName = watch("opponentName");
  const opponentSlug = watch("opponentSlug");
  const courtSlug = watch("courtSlug");
  const lawyerSlug = watch("lawyerSlug");
  const portalEnabled = watch("portalEnabled");

  useEffect(() => {
    const refs: ContactRef[] = [];
    if (clientName?.trim()) refs.push({ name: clientName.trim(), role: "client" });
    if (opponentName?.trim()) refs.push({ name: opponentName.trim(), role: "opponent" });
    if (refs.length < 2) {
      setConflictResult(null);
      return;
    }
    setConflictResult(checkInternalConflict(refs));
  }, [clientName, opponentName]);

  function applyContact(slug: string, role: ContactRole) {
    const contact = contacts.find((c) => c.slug === slug);
    const name = contact?.name ?? "";
    if (role === "client") {
      setValue("clientSlug", slug);
      if (name) setValue("clientName", name);
    } else if (role === "opponent") {
      setValue("opponentSlug", slug);
      if (name) setValue("opponentName", name);
    } else if (role === "court") {
      setValue("courtSlug", slug);
      if (name) setValue("courtName", name);
    } else if (role === "lawyer") {
      setValue("lawyerSlug", slug);
      if (name) setValue("lawyerName", name);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("casesnew.title")}
        breadcrumbs={[
          { label: t("casesnew.breadcrumb"), href: "/dashboard/cases" },
          { label: t("casesnew.breadcrumb") },
        ]}
      />

      {form.error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600"
        >
          <AlertTriangle size={16} />
          {form.error}
        </div>
      )}

      {serverConflict && (
        <div
          role="alert"
          className="mb-4 space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">{t("casesnew.section_conflict")}</p>
              <p className="text-xs opacity-90">{t("casesnew.conflict_found")}</p>
            </div>
          </div>
          <ul className="ml-6 space-y-0.5 text-xs">
            {serverConflict.matches.map((m, i) => (
              <li key={i}>
                <span className="font-medium">{m.name}</span>{" "}
                <span className="opacity-70">({m.type})</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1.5 border-t border-red-500/20 pt-2.5">
            <Label htmlFor="waiver-reason" className="text-xs font-semibold">
              {t("casesnew.waiver_label")}
            </Label>
            <p className="text-xs opacity-80">{t("casesnew.waiver_desc")}</p>
            <Input
              id="waiver-reason"
              value={waiverReason}
              onChange={(e) => setWaiverReason(e.target.value)}
              placeholder={t("casesnew.waiver_placeholder")}
            />
            <p className="text-xs opacity-70">
              {waiverReason.trim().length > 0
                ? t("casesnew.waiver_entered")
                : t("casesnew.waiver_missing")}
            </p>
          </div>
        </div>
      )}

      {conflictResult?.hasConflict && (
        <div
          role="alert"
          className={cn(
            "mb-4 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm",
            conflictResult.severity === "critical"
              ? "border-red-500/30 bg-red-500/5 text-red-600"
              : "border-amber-500/30 bg-amber-500/5 text-amber-600"
          )}
        >
          {conflictResult.severity === "critical" ? (
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          ) : (
            <Users size={16} className="mt-0.5 shrink-0" />
          )}
          <div className="space-y-1">
            <p className="font-semibold">{conflictResult.warning}</p>
            {conflictResult.hits.map((hit, i) => (
              <p key={i} className="text-xs opacity-90">
                {hit.reason}
              </p>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={form.handleSubmit} className="space-y-5">
        {/* Basic info */}
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            {t("casesnew.section_details")}
          </h2>

          <div>
            <Label htmlFor="case-title" className="mb-1.5 block text-xs">
              {t("casesnew.label_title")} *
            </Label>
            <Input
              id="case-title"
              {...register("title")}
              placeholder="z.B. Musterfall GmbH vs. Schuldner AG"
            />
            {f.formState.errors.title && (
              <p className="mt-1 text-xs text-red-600">{f.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="case-number" className="mb-1.5 block text-xs">
                {t("casesnew.label_case_number")}
              </Label>
              <Input id="case-number" {...register("caseNumber")} placeholder="z.B. 2026-001" />
            </div>
            <div>
              <Label htmlFor="case-status" className="mb-1.5 block text-xs">
                {t("cases.widget.status")}
              </Label>
              <Select
                value={status}
                onValueChange={(v) => setValue("status", v as CaseFormData["status"])}
              >
                <SelectTrigger id="case-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="case-legal-area" className="mb-1.5 block text-xs">
                {t("casesnew.label_area")}
              </Label>
              <Input
                id="case-legal-area"
                {...register("legalArea")}
                list="legal-area-suggestions"
                placeholder="z.B. Zivilrecht"
              />
              <datalist id="legal-area-suggestions">
                {LEGAL_AREA_SUGGESTIONS.map((area) => (
                  <option key={area} value={area} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="case-sub-area" className="mb-1.5 block text-xs">
                Untergebiet
              </Label>
              <Input
                id="case-sub-area"
                {...register("subArea")}
                list="sub-area-suggestions"
                placeholder="z.B. Vertragsrecht"
              />
              <datalist id="sub-area-suggestions">
                {(SUB_AREA_SUGGESTIONS[legalArea ?? ""] ?? []).map((sub) => (
                  <option key={sub} value={sub} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Jurisdiction — required, determines legal system for this case */}
          <div>
            <Label htmlFor="case-jurisdiction" className="mb-1.5 block text-xs">
              Rechtskreis *
            </Label>
            <Select
              value={jurisdiction}
              onValueChange={(v) => setValue("jurisdiction", v as CaseFormData["jurisdiction"])}
            >
              <SelectTrigger id="case-jurisdiction" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JURISDICTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {f.formState.errors.jurisdiction && (
              <p className="mt-1 text-xs text-red-600">{f.formState.errors.jurisdiction.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="case-priority" className="mb-1.5 block text-xs">
              {t("casesnew.label_priority")}
            </Label>
            <Select
              value={priority}
              onValueChange={(v) => setValue("priority", v as CaseFormData["priority"])}
            >
              <SelectTrigger id="case-priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Parties */}
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            {t("casesnew.section_parties")}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="case-client" className="mb-1.5 block text-xs">
                {t("casesnew.label_client")}
              </Label>
              <Input
                id="case-client"
                {...register("clientName", {
                  onChange: () => {
                    if (clientSlug) setValue("clientSlug", "");
                  },
                })}
                placeholder={t("casesnew.client_placeholder")}
              />
              <ContactSelect
                id="case-client-select"
                label={t("casesnew.contact_link")}
                value={clientSlug ?? ""}
                options={clients}
                onChange={(slug) => applyContact(slug, "client")}
                disabled={clients.length === 0}
              />
            </div>
            <div>
              <Label htmlFor="case-opponent" className="mb-1.5 block text-xs">
                {t("casesnew.label_opponent")}
              </Label>
              <Input
                id="case-opponent"
                {...register("opponentName", {
                  onChange: () => {
                    if (opponentSlug) setValue("opponentSlug", "");
                  },
                })}
                placeholder={t("casesnew.opponent_placeholder")}
              />
              <ContactSelect
                id="case-opponent-select"
                label={t("casesnew.contact_link")}
                value={opponentSlug ?? ""}
                options={opponents}
                onChange={(slug) => applyContact(slug, "opponent")}
                disabled={opponents.length === 0}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="case-court" className="mb-1.5 block text-xs">
                {t("casesnew.label_court")}
              </Label>
              <Input
                id="case-court"
                {...register("courtName", {
                  onChange: () => {
                    if (courtSlug) setValue("courtSlug", "");
                  },
                })}
                placeholder={t("casesnew.court_placeholder")}
              />
              <ContactSelect
                id="case-court-select"
                label={t("casesnew.contact_link")}
                value={courtSlug ?? ""}
                options={courts}
                onChange={(slug) => applyContact(slug, "court")}
                disabled={courts.length === 0}
              />
            </div>
            <div>
              <Label htmlFor="case-lawyer" className="mb-1.5 block text-xs">
                {t("casesnew.label_lawyer")}
              </Label>
              <Input
                id="case-lawyer"
                {...register("lawyerName", {
                  onChange: () => {
                    if (lawyerSlug) setValue("lawyerSlug", "");
                  },
                })}
                placeholder={t("casesnew.lawyer_placeholder")}
              />
              <ContactSelect
                id="case-lawyer-select"
                label={t("casesnew.contact_link")}
                value={lawyerSlug ?? ""}
                options={lawyers}
                onChange={(slug) => applyContact(slug, "lawyer")}
                disabled={lawyers.length === 0}
              />
            </div>
          </div>
        </div>

        {/* Facts */}
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            {t("casesnew.section_facts")}
          </h2>
          <textarea
            id="case-facts"
            {...register("facts")}
            rows={6}
            placeholder={lang === "de" ? "Beschreibe den Sachverhalt…" : "Describe the case facts…"}
            className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm leading-relaxed text-[color:var(--ds-text)] transition-colors duration-150 placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)]/20 focus:outline-none"
          />
        </div>

        {/* Tags */}
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            {t("casesnew.section_tags")}
          </h2>
          <Input
            id="case-tags"
            {...register("tags")}
            placeholder={t("casesnew.tags_placeholder")}
          />
        </div>

        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              {...register("portalEnabled")}
              checked={portalEnabled}
              className="mt-0.5 h-4 w-4 rounded accent-[color:var(--brand-primary)]"
            />
            <span>
              <span className="block text-sm font-semibold text-[color:var(--ds-text)]">
                {t("casesnew.portal_label")}
              </span>
              <span className="mt-0.5 block text-xs text-[color:var(--ds-text-muted)]">
                {t("casesnew.portal_desc")}
              </span>
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/dashboard/cases">
            <Button
              type="button"
              variant="ghost"
              className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              {t("casesnew.btn_cancel")}
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            disabled={form.status === "submitting"}
            className="brand-bg gap-2 text-white"
          >
            {form.status === "submitting" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            {t("casesnew.btn_create_short")}
          </Button>
        </div>
      </form>
    </div>
  );
}
