"use client";

import Link from "next/link";
import {
  Users,
  Plus,
  Mail,
  Phone,
  Building2,
  ShieldAlert,
  AlertTriangle,
  Loader2,
  UserCircle,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { ContactCreateDialog, type ContactCreateResult } from "@/components/legal/ContactCreateDialog";
import type { CaseDetail } from "@/lib/matter-detail-types";

const ROLE_LABELS_DE: Record<string, string> = {
  client: "Mandant",
  opponent: "Gegner",
  court: "Gericht",
  lawyer: "Anwalt",
  other: "Sonstiger",
  witness: "Zeuge",
  expert: "Sachverständiger",
  authority: "Behörde",
};

const ROLE_LABELS_EN: Record<string, string> = {
  client: "Client",
  opponent: "Opponent",
  court: "Court",
  lawyer: "Lawyer",
  other: "Other",
  witness: "Witness",
  expert: "Expert",
  authority: "Authority",
};

const ROLE_COLORS: Record<string, string> = {
  client: "bg-emerald-600/15 text-emerald-600",
  opponent: "bg-red-600/15 text-red-600",
  court: "bg-blue-600/15 text-blue-600",
  lawyer: "bg-amber-600/15 text-amber-600",
  witness: "bg-purple-600/15 text-purple-600",
  expert: "bg-indigo-600/15 text-indigo-600",
  authority: "bg-gray-600/15 text-gray-600",
  other: "bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]",
};

export function ContactsTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  if (!ctx.caseData) return null;
  const caseData = ctx.caseData;
  const isArchived = caseData.status === "archived";
  const roleLabels = lang === "en" ? ROLE_LABELS_EN : ROLE_LABELS_DE;

  const caseLinkedSlugs = new Set<string>();
  if (caseData.clientSlug) caseLinkedSlugs.add(caseData.clientSlug);
  if (caseData.opponentSlugs) caseData.opponentSlugs.forEach((s) => caseLinkedSlugs.add(s));
  if (caseData.courtSlug) caseLinkedSlugs.add(caseData.courtSlug);
  if (caseData.ownLawyerSlug) caseLinkedSlugs.add(caseData.ownLawyerSlug);

  const caseContacts = ctx.contacts.filter((c) => caseLinkedSlugs.has(c.slug));
  const otherContacts = ctx.contacts.filter((c) => !caseLinkedSlugs.has(c.slug));

  const handleCreated = (contact: ContactCreateResult) => {
    ctx.setContactsList((prev) => [
      ...prev,
      {
        slug: contact.slug,
        name: contact.name,
        role: contact.role,
        email: contact.email,
        phone: contact.phone,
      },
    ]);
    if (contact.role === "client") {
      const updated: CaseDetail = {
        ...caseData,
        clientSlug: contact.slug,
        clientName: contact.name,
      };
      ctx.setCaseData(updated);
      ctx.saveCaseUpdate({ clientSlug: updated.clientSlug, clientName: updated.clientName });
    } else if (contact.role === "opponent") {
      const updated: CaseDetail = {
        ...caseData,
        opponentSlugs: [contact.slug],
        opponentName: contact.name,
      };
      ctx.setCaseData(updated);
      ctx.saveCaseUpdate({
        opponentSlugs: updated.opponentSlugs,
        opponentName: updated.opponentName,
      });
    } else if (contact.role === "court") {
      const updated: CaseDetail = {
        ...caseData,
        courtSlug: contact.slug,
        courtName: contact.name,
      };
      ctx.setCaseData(updated);
      ctx.saveCaseUpdate({ courtSlug: updated.courtSlug, courtName: updated.courtName });
    }
  };

  const renderContactCard = (contact: (typeof ctx.contacts)[number]) => {
    const isLinked = caseLinkedSlugs.has(contact.slug);
    const roleColor = ROLE_COLORS[contact.role] || ROLE_COLORS.other;
    return (
      <div
        key={contact.slug}
        className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-hover)]">
          <UserCircle size={20} className="text-[color:var(--ds-text-muted)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
              {contact.name}
            </span>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                roleColor
              )}
            >
              {roleLabels[contact.role] || contact.role}
            </span>
            {isLinked && (
              <Badge variant="success" className="shrink-0 text-[10px]">
                {lang === "en" ? "Linked" : "Verknüpft"}
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-center gap-1 hover:text-[color:var(--ds-text)]"
              >
                <Mail size={11} />
                {contact.email}
              </a>
            )}
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-1 hover:text-[color:var(--ds-text)]"
              >
                <Phone size={11} />
                {contact.phone}
              </a>
            )}
            <Link
              href={`/dashboard/contacts?slug=${encodeURIComponent(contact.slug)}`}
              className="flex items-center gap-1 hover:brand-text"
            >
              <Pencil size={11} />
              {lang === "en" ? "Edit" : "Bearbeiten"}
            </Link>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="max-w-3xl space-y-4">
        {/* Conflict Warning */}
        {ctx.contactConflict && (
          <div
            role="alert"
            className={cn(
              "flex items-start gap-2.5 rounded-xl border px-4 py-3",
              ctx.contactConflict.severity === "critical"
                ? "border-red-500/30 bg-red-500/5 text-red-600"
                : "border-amber-500/30 bg-amber-500/5 text-amber-600"
            )}
          >
            {ctx.contactConflict.severity === "critical" ? (
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            )}
            <div className="space-y-1">
              <p className="text-sm font-semibold">{ctx.contactConflict.warning}</p>
              {ctx.contactConflict.hits.slice(0, 3).map((hit, i) => (
                <p key={i} className="text-xs opacity-90">
                  {hit.reason}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {lang === "en" ? "Case Contacts" : "Aktenkontakte"}
            </h3>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              {lang === "en"
                ? "Contacts linked to this case and all available contacts."
                : "Mit dieser Akte verknüpfte Kontakte und alle verfügbaren Kontakte."}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={isArchived}
            onClick={() => {
              ctx.setContactDialogRole("other");
              ctx.setContactDialogName(undefined);
              ctx.setContactDialogOpen(true);
              ctx.setPendingSuggestedPartyIndex(null);
            }}
            className="gap-1.5 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          >
            <Plus size={13} />
            {lang === "en" ? "Add Contact" : "Kontakt hinzufügen"}
          </Button>
        </div>

        {/* Loading State */}
        {ctx.contactsLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-[color:var(--ds-text-muted)]">
            <Loader2 size={16} className="animate-spin" />
            {t("cases.detail_contacts_loading")}
          </div>
        )}

        {/* Empty State */}
        {!ctx.contactsLoading && ctx.contacts.length === 0 && (
          <div className="space-y-3 py-12 text-center">
            <Users size={40} className="mx-auto text-[color:var(--ds-border)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {t("cases.detail_no_contacts")}
            </p>
            <Link
              href="/dashboard/contacts"
              className="brand-text inline-block text-sm hover:underline"
            >
              {t("cases.detail_create_contact")}
            </Link>
          </div>
        )}

        {/* Case-Linked Contacts */}
        {!ctx.contactsLoading && caseContacts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
              {lang === "en" ? "Linked to this case" : "Mit dieser Akte verknüpft"}
            </h4>
            {caseContacts.map(renderContactCard)}
          </div>
        )}

        {/* Other Contacts */}
        {!ctx.contactsLoading && otherContacts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
              {lang === "en" ? "All contacts" : "Alle Kontakte"}
            </h4>
            {otherContacts.map(renderContactCard)}
          </div>
        )}

        {/* Link to full contacts page */}
        {!ctx.contactsLoading && ctx.contacts.length > 0 && (
          <div className="pt-2">
            <Link
              href="/dashboard/contacts"
              className="brand-text text-xs font-medium hover:underline"
            >
              {lang === "en" ? "Manage all contacts →" : "Alle Kontakte verwalten →"}
            </Link>
          </div>
        )}
      </div>

      {/* Contact Create Dialog */}
      <ContactCreateDialog
        open={ctx.contactDialogOpen}
        onOpenChange={(open) => {
          ctx.setContactDialogOpen(open);
          if (!open) ctx.setPendingSuggestedPartyIndex(null);
        }}
        defaultRole={ctx.contactDialogRole}
        defaultName={ctx.contactDialogName}
        existingContacts={ctx.contacts}
        onCreated={handleCreated}
      />
    </div>
  );
}
