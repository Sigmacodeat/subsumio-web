"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  Users,
  Plus,
  Mail,
  Phone,
  ShieldAlert,
  AlertTriangle,
  UserCircle,
  Pencil,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { api } from "@/lib/api";
import {
  ContactCreateDialog,
  type ContactCreateResult,
} from "@/components/legal/ContactCreateDialog";
import { WhatsAppClientInvitePanel } from "@/components/legal/WhatsAppClientInvitePanel";
import type { CaseDetail } from "@/lib/matter-detail-types";
import type { BrainPage } from "@/lib/types";

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
  client: "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  opponent: "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
  court: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  lawyer: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  witness: "bg-[color:var(--ds-category-purple-bg)] text-[color:var(--ds-category-purple-text)]",
  expert: "bg-[color:var(--ds-category-indigo-bg)] text-[color:var(--ds-category-indigo-text)]",
  authority: "bg-[color:var(--ds-neutral-text)]/15 text-[color:var(--ds-neutral-text)]",
  other: "bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]",
};

/** Firm contacts are searched on the server from this many characters on. */
export const CONTACT_SEARCH_MIN = 2;
const CONTACT_SEARCH_LIMIT = 50;
const CONTACT_SEARCH_DEBOUNCE_MS = 300;

function toContact(p: BrainPage) {
  const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
  return {
    slug: p.slug,
    name: String(fm.name ?? p.title ?? ""),
    role: String(fm.role ?? "other"),
    email: fm.email as string | undefined,
    phone: fm.phone as string | undefined,
  };
}

/** Slugs of the contacts a matter links to (client, opponents, court, own lawyer). */
function linkedContactSlugs(caseData: CaseDetail | null | undefined): string[] {
  if (!caseData) return [];
  const slugs = new Set<string>();
  if (caseData.clientSlug) slugs.add(caseData.clientSlug);
  caseData.opponentSlugs?.forEach((s) => slugs.add(s));
  if (caseData.courtSlug) slugs.add(caseData.courtSlug);
  if (caseData.ownLawyerSlug) slugs.add(caseData.ownLawyerSlug);
  return [...slugs];
}

export function ContactsTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  const [linkedLoadFailed, setLinkedLoadFailed] = useState(false);
  // "Alle Kontakte": a server-side search over every contact of the firm
  // (name, e-mail) — not the firm-wide list the matter view preloads, which
  // holds only the most recently edited contacts.
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ReturnType<typeof toContact>[] | null>(
    null
  );
  const [searchState, setSearchState] = useState<"idle" | "loading" | "failed">("idle");
  const searchTerm = search.trim();
  useEffect(() => {
    if (searchTerm.length < CONTACT_SEARCH_MIN) {
      setSearchResults(null);
      setSearchState("idle");
      return;
    }
    let cancelled = false;
    setSearchState("loading");
    const timer = setTimeout(() => {
      api.brain
        .listPages({ type: "legal_contact", q: searchTerm, limit: CONTACT_SEARCH_LIMIT })
        .then((pages) => {
          if (cancelled) return;
          setSearchResults(pages.map(toContact));
          setSearchState("idle");
        })
        .catch(() => {
          if (cancelled) return;
          setSearchResults(null);
          setSearchState("failed");
        });
    }, CONTACT_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  // The matter's own contacts are loaded by slug — the firm-wide contact list
  // in the context is only the most recently edited ones, so the client,
  // opponent or court of an older matter may be missing from it.
  const linkedKey = linkedContactSlugs(ctx.caseData).join("\u0000");
  const { contacts, contactsLoading, setContactsList } = ctx;
  useEffect(() => {
    if (contactsLoading || !linkedKey) return;
    const known = new Set(contacts.map((c) => c.slug));
    const missing = linkedKey.split("\u0000").filter((s) => !known.has(s));
    if (missing.length === 0) return;
    let cancelled = false;
    api.brain
      .getPages(missing)
      .then((pages) => {
        if (cancelled) return;
        setLinkedLoadFailed(false);
        const loaded = Object.values(pages ?? {})
          .filter((p) => p?.slug)
          .map(toContact);
        if (loaded.length === 0) return;
        setContactsList((prev) => {
          const have = new Set(prev.map((c) => c.slug));
          return [...prev, ...loaded.filter((c) => !have.has(c.slug))];
        });
      })
      .catch(() => {
        if (!cancelled) setLinkedLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedKey, contacts, contactsLoading, setContactsList]);

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
  const otherContacts = (searchResults ?? []).filter((c) => !caseLinkedSlugs.has(c.slug));
  const clientContact = ctx.contacts.find((c) => c.slug === caseData.clientSlug);

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
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs font-medium", roleColor)}>
              {roleLabels[contact.role] || contact.role}
            </span>
            {isLinked && (
              <Badge variant="success" className="shrink-0 text-xs">
                {t("contactstab.linked")}
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
              className="hover:brand-text flex items-center gap-1"
            >
              <Pencil size={11} />
              {t("contactstab.edit")}
            </Link>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="max-w-3xl space-y-4">
        {/* Conflict Warning */}
        {ctx.contactConflict && (
          <div
            role="alert"
            className={cn(
              "flex items-start gap-2.5 rounded-xl border px-4 py-3",
              ctx.contactConflict.severity === "critical"
                ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
                : "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
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
              {t("contactstab.case_contacts")}
            </h3>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              {t("contactstab.case_contacts_desc")}
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
            {t("contactstab.add_contact")}
          </Button>
        </div>

        <WhatsAppClientInvitePanel
          caseData={caseData}
          clientContact={clientContact}
          disabled={isArchived}
        />

        {linkedLoadFailed && (
          <div
            role="alert"
            className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]"
          >
            {lang === "en"
              ? "Some contacts linked to this matter could not be loaded."
              : "Einige mit der Akte verknüpfte Kontakte konnten nicht geladen werden."}
          </div>
        )}

        {/* Loading State */}
        {ctx.contactsLoading && (
          <div className="space-y-2 py-2" role="status" aria-live="polite">
            <span className="sr-only">{t("cases.detail_contacts_loading")}</span>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
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
              {t("contactstab.linked_to_case")}
            </h4>
            {caseContacts.map(renderContactCard)}
          </div>
        )}

        {/* All contacts of the firm — searched on the server */}
        {!ctx.contactsLoading && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
              {t("contactstab.all_contacts")}
            </h4>
            <label className="relative block">
              <span className="sr-only">
                {lang === "en" ? "Search all contacts" : "Alle Kontakte durchsuchen"}
              </span>
              <Search
                size={14}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  lang === "en" ? "Search by name or e-mail…" : "Nach Name oder E-Mail suchen…"
                }
                className="h-9 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pr-3 pl-8 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)]"
              />
            </label>
            {searchTerm.length < CONTACT_SEARCH_MIN && (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {lang === "en"
                  ? "Type at least two characters to search every contact of the firm."
                  : "Mindestens zwei Zeichen eingeben, um alle Kontakte der Kanzlei zu durchsuchen."}
              </p>
            )}
            {searchState === "loading" && (
              <p role="status" className="text-xs text-[color:var(--ds-text-muted)]">
                {lang === "en" ? "Searching…" : "Suche läuft…"}
              </p>
            )}
            {searchState === "failed" && (
              <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
                {lang === "en"
                  ? "The search is currently unavailable."
                  : "Die Suche ist derzeit nicht verfügbar."}
              </p>
            )}
            {searchState === "idle" && searchResults !== null && otherContacts.length === 0 && (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {lang === "en" ? "No further contacts found." : "Keine weiteren Kontakte gefunden."}
              </p>
            )}
            {otherContacts.map(renderContactCard)}
            {searchResults !== null && searchResults.length >= CONTACT_SEARCH_LIMIT && (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {lang === "en"
                  ? `Showing the first ${CONTACT_SEARCH_LIMIT} matches — refine the search.`
                  : `Die ersten ${CONTACT_SEARCH_LIMIT} Treffer — Suche verfeinern.`}
              </p>
            )}
          </div>
        )}

        {/* Link to full contacts page */}
        {!ctx.contactsLoading && ctx.contacts.length > 0 && (
          <div className="pt-2">
            <Link
              href="/dashboard/contacts"
              className="brand-text text-xs font-medium hover:underline"
            >
              {t("contactstab.manage_all")}
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
