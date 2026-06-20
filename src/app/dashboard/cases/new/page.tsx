"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Plus,
  AlertTriangle,
} from "lucide-react";
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

  const form = useDashboardForm({
    schema: caseFormSchema,
    defaultValues: {
      title: "",
      caseNumber: "",
      legalArea: "",
      subArea: "",
      status: "open",
      priority: "medium",
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
          tags: data.tags?.split(",").map((t) => t.trim()).filter(Boolean) ?? [],
          portal_enabled: data.portalEnabled,
          version: 0,
        },
      };

      if (isOnline()) {
        await api.brain.createPage(pagePayload);
      } else {
        await enqueueMutation({ type: "createPage", payload: pagePayload });
      }
      router.push(`/dashboard/cases/${encodeURIComponent(slug)}`);
    },
  });

  useEffect(() => {
    let cancelled = false;
    api.brain.listPages({ type: "legal_contact", limit: 500 })
      .then((pages) => { if (!cancelled) setContacts(contactOptions(pages)); })
      .catch(() => { if (!cancelled) setContacts([]); });
    return () => { cancelled = true; };
  }, []);

  const clients = contacts.filter((c) => c.role === "client");
  const opponents = contacts.filter((c) => c.role === "opponent");
  const courts = contacts.filter((c) => c.role === "court");
  const lawyers = contacts.filter((c) => c.role === "lawyer");

  const f = form.form;
  const { register, setValue, watch } = f;
  const priority = watch("priority");
  const clientSlug = watch("clientSlug");
  const opponentSlug = watch("opponentSlug");
  const courtSlug = watch("courtSlug");
  const lawyerSlug = watch("lawyerSlug");
  const portalEnabled = watch("portalEnabled");

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
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="Neue Akte"
        breadcrumbs={[{ label: "Akten", href: "/dashboard/cases" }, { label: "Neu" }]}
      />

      {form.error && (
        <div role="alert" className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-600 text-sm">
          <AlertTriangle size={16} />
          {form.error}
        </div>
      )}

      <form onSubmit={form.handleSubmit} className="space-y-5">
        {/* Basic info */}
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Grunddaten</h2>

          <div>
            <label htmlFor="case-title" className="block text-xs text-[color:var(--ds-text-muted)] mb-1.5">Titel *</label>
            <Input
              id="case-title"
              {...register("title")}
              placeholder="z.B. Musterfall GmbH vs. Schuldner AG"
              className="bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
            {f.formState.errors.title && (
              <p className="text-xs text-red-600 mt-1">{f.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="case-number" className="block text-xs text-[color:var(--ds-text-muted)] mb-1.5">Aktenzeichen</label>
              <Input
                id="case-number"
                {...register("caseNumber")}
                placeholder="z.B. 2026-001"
                className="bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div>
              <label htmlFor="case-status" className="block text-xs text-[color:var(--ds-text-muted)] mb-1.5">Status</label>
              <select
                id="case-status"
                {...register("status")}
                className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="case-legal-area" className="block text-xs text-[color:var(--ds-text-muted)] mb-1.5">Rechtsgebiet</label>
              <Input
                id="case-legal-area"
                {...register("legalArea")}
                placeholder="z.B. Zivilrecht"
                className="bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div>
              <label htmlFor="case-sub-area" className="block text-xs text-[color:var(--ds-text-muted)] mb-1.5">Untergebiet</label>
              <Input
                id="case-sub-area"
                {...register("subArea")}
                placeholder="z.B. Vertragsrecht"
                className="bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
          </div>

          <div>
            <span id="case-priority-label" className="block text-xs text-[color:var(--ds-text-muted)] mb-1.5">Priorität</span>
            <div className="flex gap-2" role="group" aria-labelledby="case-priority-label">
              {PRIORITY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setValue("priority", o.value as CaseFormData["priority"])}
                  aria-pressed={priority === o.value}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all",
                    priority === o.value
                      ? o.value === "critical"
                        ? "bg-red-500/10 border-red-500/30 text-red-600"
                        : o.value === "high"
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
                        : o.value === "low"
                        ? "bg-gray-500/10 border-gray-500/30 text-gray-400"
                        : "bg-blue-500/10 border-blue-500/30 text-blue-600"
                      : "bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text-muted)]"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Beteiligte</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="case-client" className="block text-xs text-[color:var(--ds-text-muted)] mb-1.5">Mandant</label>
              <Input
                id="case-client"
                {...register("clientName", { onChange: () => { if (clientSlug) setValue("clientSlug", ""); } })}
                placeholder="Name des Mandanten"
                className="bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
              {clients.length > 0 && (
                <select
                  value={clientSlug}
                  onChange={(e) => applyContact(e.target.value, "client")}
                  className="mt-2 w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-xs text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]"
                >
                  <option value="">Kontakt verknüpfen…</option>
                  {clients.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label htmlFor="case-opponent" className="block text-xs text-[color:var(--ds-text-muted)] mb-1.5">Gegner</label>
              <Input
                id="case-opponent"
                {...register("opponentName", { onChange: () => { if (opponentSlug) setValue("opponentSlug", ""); } })}
                placeholder="Name der Gegenseite"
                className="bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
              {opponents.length > 0 && (
                <select
                  value={opponentSlug}
                  onChange={(e) => applyContact(e.target.value, "opponent")}
                  className="mt-2 w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-xs text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]"
                >
                  <option value="">Kontakt verknüpfen…</option>
                  {opponents.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="case-court" className="block text-xs text-[color:var(--ds-text-muted)] mb-1.5">Gericht</label>
              <Input
                id="case-court"
                {...register("courtName", { onChange: () => { if (courtSlug) setValue("courtSlug", ""); } })}
                placeholder="z.B. LG Wien"
                className="bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
              {courts.length > 0 && (
                <select
                  value={courtSlug}
                  onChange={(e) => applyContact(e.target.value, "court")}
                  className="mt-2 w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-xs text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]"
                >
                  <option value="">Kontakt verknüpfen…</option>
                  {courts.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label htmlFor="case-lawyer" className="block text-xs text-[color:var(--ds-text-muted)] mb-1.5">Zuständiger Anwalt</label>
              <Input
                id="case-lawyer"
                {...register("lawyerName", { onChange: () => { if (lawyerSlug) setValue("lawyerSlug", ""); } })}
                placeholder="Name des Anwalts"
                className="bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
              {lawyers.length > 0 && (
                <select
                  value={lawyerSlug}
                  onChange={(e) => applyContact(e.target.value, "lawyer")}
                  className="mt-2 w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-xs text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)]"
                >
                  <option value="">Kontakt verknüpfen…</option>
                  {lawyers.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Facts */}
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]"><label htmlFor="case-facts">Sachverhalt</label></h2>
          <textarea
            id="case-facts"
            {...register("facts")}
            rows={6}
            placeholder="Beschreibe den Sachverhalt…"
            className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus:border-[color:var(--brand-primary)] resize-y"
          />
        </div>

        {/* Tags */}
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]"><label htmlFor="case-tags">Tags</label></h2>
          <Input
            id="case-tags"
            {...register("tags")}
            placeholder="Komma-getrennte Tags: z.B. Vertragsbruch, Schadensersatz"
            className="bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
          />
        </div>

        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register("portalEnabled")}
              checked={portalEnabled}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-[color:var(--ds-text)]">Für Mandantenportal-Vorschau freigeben</span>
              <span className="block text-xs text-[color:var(--ds-text-muted)] mt-0.5">
                Nur freigegebene Akten erscheinen in der Portal-Vorschau. Ein echter Mandantenlogin bleibt ein separates Deployment.
              </span>
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/dashboard/cases">
            <Button type="button" variant="ghost" className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]">
              Abbrechen
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            disabled={form.status === "submitting"}
            className="brand-bg text-white gap-2"
          >
            {form.status === "submitting" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Akte erstellen
          </Button>
        </div>
      </form>
    </div>
  );
}
