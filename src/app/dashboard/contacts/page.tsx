"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import Link from "next/link";
import { useLang } from "@/lib/use-lang";
import {
  Mail,
  Phone,
  Plus,
  UserCircle,
  Pencil,
  Trash2,
  X,
  Save,
  AlertTriangle,
  RotateCcw,
  Loader2,
  MoreVertical,
  Building2,
  Search,
  Scale,
  FileClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { encodeSlugPath } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { OFFLINE_KEYS, isOnline, enqueueMutation, getCache, setCache } from "@/lib/offline-store";
import type { BrainPage } from "@/lib/types";
import type { ContactFrontmatter } from "@/lib/legal-types";
import type { DashboardKey } from "@/content/dashboard";
import { useDashboardForm } from "@/lib/hooks/use-dashboard-form";
import { contactFormSchema, type ContactFormData } from "@/lib/schemas/contact";
import { PageHeader } from "@/components/dashboard/page-header";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  checkContactConflict,
  type ContactRef,
  type ConflictCheckResult,
} from "@/lib/contact-conflict";

type ContactRole = NonNullable<ContactFrontmatter["role"]>;

interface ContactItem {
  slug: string;
  title: string;
  role: ContactRole;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

interface ContactsCache {
  contacts: ContactItem[];
  cases: BrainPage[];
}

const ROLE_KEYS: ContactRole[] = ["client", "opponent", "court", "lawyer", "other"];

const ROLE_COLORS: Record<ContactRole, string> = {
  client: "bg-blue-500/10 border-blue-500/20 text-blue-600",
  opponent: "bg-red-500/10 border-red-500/20 text-red-600",
  court: "bg-violet-500/10 border-violet-500/20 text-violet-600",
  lawyer: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  other: "bg-gray-500/10 border-gray-500/20 text-gray-500",
};

const ROLE_DOT: Record<ContactRole, string> = {
  client: "bg-blue-500",
  opponent: "bg-red-500",
  court: "bg-violet-500",
  lawyer: "bg-emerald-500",
  other: "bg-gray-400",
};

function parseContact(page: BrainPage): ContactItem {
  const fm = (page.frontmatter ?? {}) as ContactFrontmatter;
  return {
    slug: page.slug,
    title: page.title,
    role: fm.role || "client",
    name: fm.name || page.title,
    company: fm.company,
    email: fm.email,
    phone: fm.phone,
    address: fm.address,
    notes: fm.notes || page.content || "",
  };
}

function findLinkedCases(
  contactSlug: string,
  cases: BrainPage[]
): { slug: string; title: string; caseNumber: string }[] {
  return cases
    .filter((p) => {
      const fm = p.frontmatter as Record<string, unknown>;
      if (fm.client_slug === contactSlug) return true;
      if (fm.court_slug === contactSlug) return true;
      const opp = fm.opponent_slugs;
      if (Array.isArray(opp) && opp.includes(contactSlug)) return true;
      return false;
    })
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      caseNumber: String((p.frontmatter as Record<string, unknown>).case_number ?? p.slug),
    }));
}

function slugifyContact(name: string): string {
  return `contact/${name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-|-$/g, "")}-${Date.now()}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ContactsPage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const confirm = useConfirm();

  const roleLabel = (role: ContactRole): string => t(`contacts.role_${role}` as DashboardKey);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [cases, setCases] = useState<BrainPage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const batch = await api.brain.batchListPages(["legal_contact", "legal_case"], 200);
      const contactPages = batch["legal_contact"] ?? [];
      const casePages = batch["legal_case"] ?? [];
      const nextContacts = contactPages.map(parseContact);
      setContacts(nextContacts);
      setCases(casePages);
      await setCache<ContactsCache>(OFFLINE_KEYS.contacts, {
        contacts: nextContacts,
        cases: casePages,
      });
    } catch (err) {
      const cached = await getCache<ContactsCache>(OFFLINE_KEYS.contacts);
      if (cached) {
        setContacts(cached.contacts);
        setCases(cached.cases);
        setLoadError(t("contacts.err_offline_cache"));
      } else {
        setLoadError(err instanceof Error ? err.message : t("contacts.err_load_failed"));
        setContacts([]);
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  const createForm = useDashboardForm({
    schema: contactFormSchema,
    defaultValues: {
      name: "",
      role: "client",
      company: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
    },
    onSubmit: async (data) => {
      const contact: ContactItem = {
        slug: slugifyContact(data.name),
        title: data.name.trim(),
        role: data.role,
        name: data.name.trim(),
        company: data.company?.trim() || undefined,
        email: data.email?.trim() || undefined,
        phone: data.phone?.trim() || undefined,
        address: data.address?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
      };
      const pagePayload = {
        slug: contact.slug,
        title: contact.title,
        type: "legal_contact" as const,
        content: contact.notes || "",
        frontmatter: {
          type: "legal_contact" as const,
          role: contact.role,
          name: contact.name,
          company: contact.company,
          email: contact.email,
          phone: contact.phone,
          address: contact.address,
          notes: contact.notes,
        },
      };
      if (isOnline()) {
        await api.brain.createPage(pagePayload);
      } else {
        await enqueueMutation({ type: "createPage", payload: pagePayload });
      }
      const nextContacts = [contact, ...contacts];
      setContacts(nextContacts);
      await setCache<ContactsCache>(OFFLINE_KEYS.contacts, { contacts: nextContacts, cases });
      createForm.resetForm();
      addToast({ type: "success", title: t("contacts.toast_created"), description: contact.name });
    },
  });

  const editForm = useDashboardForm({
    schema: contactFormSchema,
    defaultValues: {
      name: "",
      role: "client",
      company: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
    },
    onSubmit: async (data) => {
      if (!editingSlug) return;
      const updatePayload = {
        slug: editingSlug,
        title: data.name.trim(),
        content: data.notes?.trim() || "",
        frontmatter: {
          type: "legal_contact" as const,
          role: data.role,
          name: data.name.trim(),
          company: data.company?.trim() || undefined,
          email: data.email?.trim() || undefined,
          phone: data.phone?.trim() || undefined,
          address: data.address?.trim() || undefined,
          notes: data.notes?.trim() || undefined,
        },
      };
      if (isOnline()) {
        await api.brain.updatePage(updatePayload);
      } else {
        await enqueueMutation({ type: "updatePage", payload: updatePayload });
      }
      const nextContacts = contacts.map((c) =>
        c.slug === editingSlug
          ? {
              ...c,
              name: data.name.trim(),
              title: data.name.trim(),
              role: data.role,
              company: data.company?.trim() || undefined,
              email: data.email?.trim() || undefined,
              phone: data.phone?.trim() || undefined,
              address: data.address?.trim() || undefined,
              notes: data.notes?.trim() || undefined,
            }
          : c
      );
      setContacts(nextContacts);
      await setCache<ContactsCache>(OFFLINE_KEYS.contacts, { contacts: nextContacts, cases });
      setEditingSlug(null);
      addToast({
        type: "success",
        title: t("contacts.toast_updated"),
        description: data.name.trim(),
      });
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadContacts();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadContacts]);

  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return contacts.filter((contact) => {
      const matchesSearch = [
        contact.name,
        contact.company,
        contact.email,
        contact.phone,
        contact.address,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
      const matchesRole = roleFilter === "all" || contact.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [contacts, query, roleFilter]);

  const roleCounts = contacts.reduce(
    (acc, c) => {
      acc[c.role] = (acc[c.role] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalLinked = useMemo(
    () => contacts.reduce((sum, c) => sum + findLinkedCases(c.slug, cases).length, 0),
    [contacts, cases]
  );

  // Conflict check for create modal
  const [conflict, setConflict] = useState<ConflictCheckResult | null>(null);

  const runConflictCheck = useCallback(
    (candidateName: string, candidateRole: ContactRole, candidateCompany: string) => {
      if (!candidateName.trim()) {
        setConflict(null);
        return;
      }
      const existingRefs: ContactRef[] = contacts.map((c) => ({
        slug: c.slug,
        name: c.name,
        role: c.role,
        company: c.company,
      }));
      const result = checkContactConflict(
        {
          name: candidateName.trim(),
          role: candidateRole,
          company: candidateCompany.trim() || undefined,
        },
        existingRefs
      );
      setConflict(result.hasConflict ? result : null);
    },
    [contacts]
  );

  function openCreate() {
    createForm.resetForm();
    setConflict(null);
    setCreateOpen(true);
  }

  function openEdit(contact: ContactItem) {
    setEditingSlug(contact.slug);
    editForm.form.reset({
      name: contact.name,
      role: contact.role,
      company: contact.company ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      address: contact.address ?? "",
      notes: contact.notes ?? "",
    });
    setEditOpen(true);
  }

  async function deleteContact(slug: string) {
    const contact = contacts.find((c) => c.slug === slug);
    const confirmed = await confirm({
      title: t("contacts.delete_confirm_title"),
      message: t("contacts.delete_confirm_msg"),
      confirmLabel: t("contacts.delete_confirm_btn"),
      variant: "danger",
    });
    if (!confirmed) return;

    const nextContacts = contacts.filter((c) => c.slug !== slug);
    const backup = contacts;
    setContacts(nextContacts);
    await setCache<ContactsCache>(OFFLINE_KEYS.contacts, { contacts: nextContacts, cases });

    try {
      if (isOnline()) {
        await api.brain.deletePage(slug);
      } else {
        await enqueueMutation({ type: "deletePage", payload: { slug } });
      }
      addToast({
        type: "success",
        title: t("contacts.toast_deleted"),
        description: contact?.name ?? t("contacts.toast_deleted_fallback"),
        duration: 6000,
      });
    } catch (err) {
      setContacts(backup);
      await setCache<ContactsCache>(OFFLINE_KEYS.contacts, { contacts: backup, cases });
      addToast({
        type: "error",
        title: t("contacts.toast_delete_failed"),
        description: err instanceof Error ? err.message : t("contacts.err_unknown"),
      });
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("contacts.title")}
        description={t("contacts.description")}
        actions={
          <Button onClick={openCreate} className="brand-bg brand-bg gap-2 text-white">
            <Plus size={16} />
            {t("contacts.btn_new_contact")}
          </Button>
        }
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <HubLink href="/dashboard/opponents" icon={Scale} label={t("nav.opponents")} />
        <HubLink
          href="/dashboard/kollisionspruefung"
          icon={AlertTriangle}
          label={t("nav.kollisionspruefung")}
        />
        <HubLink
          href="/dashboard/document-requests"
          icon={FileClock}
          label={t("nav.document_requests")}
        />
      </div>

      {/* Stats bar */}
      {!loading && contacts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t("contacts.stats_total")} value={contacts.length} />
          <StatCard
            label={t("contacts.stats_clients")}
            value={roleCounts.client ?? 0}
            dotClass={ROLE_DOT.client}
          />
          <StatCard
            label={t("contacts.stats_opponents")}
            value={roleCounts.opponent ?? 0}
            dotClass={ROLE_DOT.opponent}
          />
          <StatCard label={t("contacts.stats_linked")} value={totalLinked} />
        </div>
      )}

      {/* Filter + Search row */}
      {!loading && contacts.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              label={t("contacts.filter_all")}
              active={roleFilter === "all"}
              onClick={() => setRoleFilter("all")}
            />
            {ROLE_KEYS.map((key) => {
              const count = roleCounts[key] || 0;
              return (
                <FilterChip
                  key={key}
                  label={`${roleLabel(key)} (${count})`}
                  active={roleFilter === key}
                  onClick={() => setRoleFilter(roleFilter === key ? "all" : key)}
                />
              );
            })}
          </div>
          <div className="relative sm:w-64">
            <Search
              size={15}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("contacts.search_live_placeholder")}
              aria-label={t("contacts.search_live_placeholder")}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2.5 pr-9 pl-9 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
                aria-label="Suche löschen"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error with retry */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadContacts()}
            className="shrink-0 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
          >
            <RotateCcw size={13} />
            {t("contacts.btn_retry")}
          </Button>
        </div>
      )}

      {/* Contact cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32 rounded" />
                    <Skeleton className="h-3 w-20 rounded" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <Skeleton className="h-3 w-40 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={<UserCircle size={26} className="text-[color:var(--ds-text-subtle)]" />}
          title={t("contacts.empty_title")}
          hint={t("contacts.empty_hint_fresh")}
          cta={
            <Button onClick={openCreate} className="brand-bg brand-bg gap-2 text-white">
              <Plus size={16} />
              {t("contacts.empty_cta")}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={26} className="text-[color:var(--ds-text-subtle)]" />}
          title={t("contacts.no_results_title")}
          hint={t("contacts.no_results_hint")}
        />
      ) : (
        <>
          <p className="text-xs text-[color:var(--ds-text-subtle)]">
            {t("contacts.result_count").replace("{{count}}", String(filtered.length))}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filtered.map((contact) => {
              const linked = findLinkedCases(contact.slug, cases);
              return (
                <div
                  key={contact.slug}
                  className="group space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,box-shadow] duration-200 hover:border-[color:var(--ds-border-strong)] hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${ROLE_COLORS[contact.role]}`}
                      >
                        {getInitials(contact.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                          {contact.name}
                        </div>
                        {contact.company && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                            <Building2 size={11} className="shrink-0" />
                            <span className="truncate">{contact.company}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge
                        variant="default"
                        className={`border text-xs ${ROLE_COLORS[contact.role]}`}
                      >
                        {roleLabel(contact.role)}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-150 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                            aria-label={t("contacts.aria_menu")}
                          >
                            <MoreVertical size={15} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => openEdit(contact)}
                            className="gap-2 text-xs"
                          >
                            <Pencil size={13} />
                            {t("contacts.aria_edit_action")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => void deleteContact(contact.slug)}
                            className="gap-2 text-xs text-red-600 focus:text-red-700"
                          >
                            <Trash2 size={13} />
                            {t("contacts.aria_delete_action")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs text-[color:var(--ds-text-muted)]">
                    {contact.email && (
                      <div className="flex items-center gap-2">
                        <Mail size={12} className="shrink-0" />
                        <a
                          href={`mailto:${contact.email}`}
                          className="transition-colors hover:text-[color:var(--ds-text)]"
                        >
                          {contact.email}
                        </a>
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={12} className="shrink-0" />
                        <a
                          href={`tel:${contact.phone.replace(/\s/g, "")}`}
                          className="transition-colors hover:text-[color:var(--ds-text)]"
                        >
                          {contact.phone}
                        </a>
                      </div>
                    )}
                    {contact.address && (
                      <div className="leading-relaxed whitespace-pre-wrap">{contact.address}</div>
                    )}
                  </div>
                  {linked.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                        {t("contacts.linked_cases")}
                      </div>
                      {linked.map((c) => (
                        <Link
                          key={c.slug}
                          href={`/dashboard/cases/${encodeSlugPath(c.slug)}`}
                          className="brand-text block truncate text-xs hover:underline"
                        >
                          {c.caseNumber} — {c.title}
                        </Link>
                      ))}
                    </div>
                  )}
                  {contact.notes && (
                    <p className="line-clamp-3 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                      {contact.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("contacts.modal_create_title")}</DialogTitle>
            <DialogDescription>{t("contacts.modal_create_desc")}</DialogDescription>
          </DialogHeader>

          {createForm.error && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertTriangle size={14} /> {createForm.error}
            </div>
          )}

          {conflict && (
            <ConflictAlert
              conflict={conflict}
              onUseExisting={() => {
                const topHit = conflict.hits[0];
                if (!topHit?.contact.slug) return;
                const existing = contacts.find((c) => c.slug === topHit.contact.slug);
                if (!existing) return;
                setCreateOpen(false);
                openEdit(existing);
              }}
            />
          )}

          <ContactFormFields
            form={createForm.form}
            roleLabel={roleLabel}
            onNameChange={(v) =>
              runConflictCheck(
                v,
                createForm.form.watch("role"),
                createForm.form.watch("company") ?? ""
              )
            }
            onRoleChange={(v) =>
              runConflictCheck(
                createForm.form.watch("name"),
                v,
                createForm.form.watch("company") ?? ""
              )
            }
            onCompanyChange={(v) =>
              runConflictCheck(createForm.form.watch("name"), createForm.form.watch("role"), v)
            }
            t={t}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              className="text-[color:var(--ds-text-muted)]"
            >
              {t("contacts.modal_btn_cancel")}
            </Button>
            <Button
              type="button"
              disabled={createForm.status === "submitting"}
              onClick={createForm.handleSubmit}
              className="brand-bg brand-bg gap-2 text-white"
            >
              {createForm.status === "submitting" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {createForm.status === "submitting"
                ? t("contacts.modal_btn_creating")
                : t("contacts.modal_btn_create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditingSlug(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("contacts.modal_edit_title")}</DialogTitle>
            <DialogDescription>{t("contacts.modal_edit_desc")}</DialogDescription>
          </DialogHeader>

          {editForm.error && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertTriangle size={14} /> {editForm.error}
            </div>
          )}

          <ContactFormFields form={editForm.form} roleLabel={roleLabel} t={t} />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditOpen(false);
                setEditingSlug(null);
              }}
              className="text-[color:var(--ds-text-muted)]"
            >
              {t("contacts.modal_btn_cancel")}
            </Button>
            <Button
              type="button"
              disabled={editForm.status === "submitting"}
              onClick={editForm.handleSubmit}
              className="brand-bg brand-bg gap-2 text-white"
            >
              {editForm.status === "submitting" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {editForm.status === "submitting"
                ? t("contacts.modal_btn_saving")
                : t("contacts.modal_btn_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function HubLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Search;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function StatCard({ label, value, dotClass }: { label: string; value: number; dotClass?: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className="flex items-center gap-2">
        {dotClass && <span className={`h-2 w-2 rounded-full ${dotClass}`} />}
        <span className="text-xs font-medium text-[color:var(--ds-text-subtle)]">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">{value}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] px-6 py-16 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
        {icon}
      </div>
      <h3 className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
        {hint}
      </p>
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}

function ConflictAlert({
  conflict,
  onUseExisting,
}: {
  conflict: ConflictCheckResult;
  onUseExisting: () => void;
}) {
  return (
    <div
      role="alert"
      className={
        conflict.severity === "critical"
          ? "space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-xs"
          : "space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={
            conflict.severity === "critical"
              ? "flex items-center gap-2 font-medium text-red-700"
              : "flex items-center gap-2 font-medium text-amber-700"
          }
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span>{conflict.warning}</span>
        </div>
        {conflict.hits[0]?.contact.slug && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onUseExisting}
            className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-2)]"
          >
            Bearbeiten
          </Button>
        )}
      </div>
      {conflict.hits.slice(0, 3).map((hit, i) => (
        <p key={i} className="pl-6 text-[color:var(--ds-text-muted)]">
          {hit.reason}
        </p>
      ))}
    </div>
  );
}

function ContactFormFields({
  form,
  roleLabel,
  t,
  onNameChange,
  onRoleChange,
  onCompanyChange,
}: {
  form: UseFormReturn<ContactFormData>;
  roleLabel: (role: ContactRole) => string;
  t: (key: DashboardKey) => string;
  onNameChange?: (value: string) => void;
  onRoleChange?: (value: ContactRole) => void;
  onCompanyChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
          {t("contacts.label_name")} *
        </label>
        <Input
          {...form.register("name")}
          onChange={(e) => {
            form.register("name").onChange(e);
            onNameChange?.(e.target.value);
          }}
          placeholder={t("contacts.placeholder_name")}
          className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
          autoFocus
        />
        {form.formState.errors.name && (
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
          {t("contacts.label_role")}
        </label>
        <Select
          value={form.watch("role") as string}
          onValueChange={(v) => {
            form.setValue("role", v as ContactRole);
            onRoleChange?.(v as ContactRole);
          }}
        >
          <SelectTrigger className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {roleLabel(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
            {t("contacts.label_company")}
          </label>
          <Input
            {...form.register("company")}
            onChange={(e) => {
              form.register("company").onChange(e);
              onCompanyChange?.(e.target.value);
            }}
            placeholder={t("contacts.placeholder_company")}
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
            {t("contacts.label_email")}
          </label>
          <Input
            {...form.register("email")}
            type="email"
            placeholder={t("contacts.placeholder_email")}
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
          />
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
          {t("contacts.label_phone")}
        </label>
        <Input
          {...form.register("phone")}
          placeholder={t("contacts.placeholder_phone")}
          className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
          {t("contacts.label_address")}
        </label>
        <textarea
          {...form.register("address")}
          rows={2}
          placeholder={t("contacts.placeholder_address")}
          className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
          {t("contacts.label_notes")}
        </label>
        <textarea
          {...form.register("notes")}
          rows={2}
          placeholder={t("contacts.placeholder_notes")}
          className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
      </div>
    </div>
  );
}
