"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, AlertTriangle, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { enqueueMutation, isOnline } from "@/lib/offline-store";
import type { BrainPage } from "@/lib/types";
import type { ContactFrontmatter } from "@/lib/legal-types";
import { useDashboardForm } from "@/lib/hooks/use-dashboard-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { caseFormSchema, type CaseFormData } from "@/lib/schemas/case";
import {
  checkInternalConflict,
  type ContactRef,
  type ConflictCheckResult,
} from "@/lib/contact-conflict";

const STATUS_OPTIONS = [
  { value: "open", label: "Offen" },
  { value: "pending", label: "Anhängig" },
  { value: "settled", label: "Erledigt" },
  { value: "won", label: "Gewonnen" },
  { value: "lost", label: "Verloren" },
  { value: "appealed", label: "Berufung" },
  { value: "dormant", label: "Ruhend" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", label: "Niedrig" },
  { value: "medium", label: "Mittel" },
  { value: "high", label: "Hoch" },
  { value: "critical", label: "Kritisch" },
] as const;

const JURISDICTION_OPTIONS = [
  { value: "de", label: "Deutschland" },
  { value: "at", label: "Österreich" },
  { value: "ch", label: "Schweiz" },
  { value: "eu", label: "EU" },
] as const;

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

export default function NewCasePage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [conflictResult, setConflictResult] = useState<ConflictCheckResult | null>(null);

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
      } else {
        await enqueueMutation({ type: "createPage", payload: pagePayload });
      }
      router.push(`/dashboard/cases/${encodeURIComponent(slug)}`);
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
  const priority = watch("priority");
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
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Neue Akte"
        breadcrumbs={[{ label: "Akten", href: "/dashboard/cases" }, { label: "Neu" }]}
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
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Grunddaten</h2>

          <div>
            <label
              htmlFor="case-title"
              className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
            >
              Titel *
            </label>
            <Input
              id="case-title"
              {...register("title")}
              placeholder="z.B. Musterfall GmbH vs. Schuldner AG"
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
            {f.formState.errors.title && (
              <p className="mt-1 text-xs text-red-600">{f.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="case-number"
                className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
              >
                Aktenzeichen
              </label>
              <Input
                id="case-number"
                {...register("caseNumber")}
                placeholder="z.B. 2026-001"
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div>
              <label
                htmlFor="case-status"
                className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
              >
                Status
              </label>
              <select
                id="case-status"
                {...register("status")}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="case-legal-area"
                className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
              >
                Rechtsgebiet
              </label>
              <Input
                id="case-legal-area"
                {...register("legalArea")}
                placeholder="z.B. Zivilrecht"
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div>
              <label
                htmlFor="case-sub-area"
                className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
              >
                Untergebiet
              </label>
              <Input
                id="case-sub-area"
                {...register("subArea")}
                placeholder="z.B. Vertragsrecht"
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
          </div>

          {/* Jurisdiction — required, determines legal system for this case */}
          <div>
            <span
              id="case-jurisdiction-label"
              className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
            >
              Rechtskreis *
            </span>
            <div className="flex gap-2" role="radiogroup" aria-labelledby="case-jurisdiction-label">
              {JURISDICTION_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={watch("jurisdiction") === o.value}
                  onClick={() => setValue("jurisdiction", o.value as CaseFormData["jurisdiction"])}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    watch("jurisdiction") === o.value
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-600"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text-muted)]"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {f.formState.errors.jurisdiction && (
              <p className="mt-1 text-xs text-red-600">{f.formState.errors.jurisdiction.message}</p>
            )}
          </div>

          <div>
            <span
              id="case-priority-label"
              className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
            >
              Priorität
            </span>
            <div className="flex gap-2" role="group" aria-labelledby="case-priority-label">
              {PRIORITY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setValue("priority", o.value as CaseFormData["priority"])}
                  aria-pressed={priority === o.value}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    priority === o.value
                      ? o.value === "critical"
                        ? "border-red-500/30 bg-red-500/10 text-red-600"
                        : o.value === "high"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                          : o.value === "low"
                            ? "border-gray-500/30 bg-gray-500/10 text-gray-400"
                            : "border-blue-500/30 bg-blue-500/10 text-blue-600"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text-muted)]"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Beteiligte</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="case-client"
                className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
              >
                Mandant
              </label>
              <Input
                id="case-client"
                {...register("clientName", {
                  onChange: () => {
                    if (clientSlug) setValue("clientSlug", "");
                  },
                })}
                placeholder="Name des Mandanten"
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
              {clients.length > 0 && (
                <select
                  value={clientSlug}
                  onChange={(e) => applyContact(e.target.value, "client")}
                  className="mt-2 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="">Kontakt verknüpfen…</option>
                  {clients.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label
                htmlFor="case-opponent"
                className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
              >
                Gegner
              </label>
              <Input
                id="case-opponent"
                {...register("opponentName", {
                  onChange: () => {
                    if (opponentSlug) setValue("opponentSlug", "");
                  },
                })}
                placeholder="Name der Gegenseite"
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
              {opponents.length > 0 && (
                <select
                  value={opponentSlug}
                  onChange={(e) => applyContact(e.target.value, "opponent")}
                  className="mt-2 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="">Kontakt verknüpfen…</option>
                  {opponents.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="case-court"
                className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
              >
                Gericht
              </label>
              <Input
                id="case-court"
                {...register("courtName", {
                  onChange: () => {
                    if (courtSlug) setValue("courtSlug", "");
                  },
                })}
                placeholder="z.B. LG Wien"
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
              {courts.length > 0 && (
                <select
                  value={courtSlug}
                  onChange={(e) => applyContact(e.target.value, "court")}
                  className="mt-2 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="">Kontakt verknüpfen…</option>
                  {courts.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label
                htmlFor="case-lawyer"
                className="mb-1.5 block text-xs text-[color:var(--ds-text-muted)]"
              >
                Zuständiger Anwalt
              </label>
              <Input
                id="case-lawyer"
                {...register("lawyerName", {
                  onChange: () => {
                    if (lawyerSlug) setValue("lawyerSlug", "");
                  },
                })}
                placeholder="Name des Anwalts"
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
              {lawyers.length > 0 && (
                <select
                  value={lawyerSlug}
                  onChange={(e) => applyContact(e.target.value, "lawyer")}
                  className="mt-2 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="">Kontakt verknüpfen…</option>
                  {lawyers.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Facts */}
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            <label htmlFor="case-facts">Sachverhalt</label>
          </h2>
          <textarea
            id="case-facts"
            {...register("facts")}
            rows={6}
            placeholder="Beschreibe den Sachverhalt…"
            className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
        </div>

        {/* Tags */}
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            <label htmlFor="case-tags">Tags</label>
          </h2>
          <Input
            id="case-tags"
            {...register("tags")}
            placeholder="Komma-getrennte Tags: z.B. Vertragsbruch, Schadensersatz"
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
          />
        </div>

        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              {...register("portalEnabled")}
              checked={portalEnabled}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-[color:var(--ds-text)]">
                Für Mandantenportal-Vorschau freigeben
              </span>
              <span className="mt-0.5 block text-xs text-[color:var(--ds-text-muted)]">
                Nur freigegebene Akten erscheinen in der Portal-Vorschau. Ein echter Mandantenlogin
                bleibt ein separates Deployment.
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
              Abbrechen
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
            Akte erstellen
          </Button>
        </div>
      </form>
    </div>
  );
}
