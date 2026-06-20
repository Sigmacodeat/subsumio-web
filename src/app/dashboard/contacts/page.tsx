"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { OFFLINE_KEYS, isOnline, enqueueMutation, getCache, setCache } from "@/lib/offline-store";
import type { BrainPage } from "@/lib/types";
import type { ContactFrontmatter } from "@/lib/legal-types";
import { useDashboardForm } from "@/lib/hooks/use-dashboard-form";
import { contactFormSchema } from "@/lib/schemas/contact";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchBar } from "@/components/dashboard/search-bar";
import { FilterChip } from "@/components/dashboard/filter-chip";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";

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

const ROLE_LABEL: Record<ContactRole, string> = {
  client: "Mandant",
  opponent: "Gegner",
  court: "Gericht",
  lawyer: "Anwalt",
  other: "Sonstige",
};

const ROLE_COLORS: Record<ContactRole, string> = {
  client: "bg-blue-500/10 border-blue-500/20 text-blue-600",
  opponent: "bg-red-500/10 border-red-500/20 text-red-600",
  court: "bg-violet-500/10 border-violet-500/20 text-violet-600",
  lawyer: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  other: "bg-gray-500/10 border-gray-500/20 text-gray-500",
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

export default function ContactsPage() {
  const { addToast } = useToast();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [cases, setCases] = useState<BrainPage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [contactPages, casePages] = await Promise.all([
        api.brain.listPages({ type: "legal_contact", limit: 200 }),
        api.brain.listPages({ type: "legal_case", limit: 200 }).catch(() => [] as BrainPage[]),
      ]);
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
        setLoadError(
          "Cloud-Brain gerade nicht erreichbar. Es werden zwischengespeicherte Kontakte angezeigt."
        );
      } else {
        setLoadError(err instanceof Error ? err.message : "Kontakte konnten nicht geladen werden.");
        setContacts([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

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
      addToast({ type: "success", title: "Kontakt angelegt", description: contact.name });
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
      addToast({ type: "success", title: "Kontakt aktualisiert", description: data.name.trim() });
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

  function startEdit(contact: ContactItem) {
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
  }

  async function deleteContact(slug: string) {
    const contact = contacts.find((c) => c.slug === slug);
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
        title: "Kontakt gelöscht",
        description: contact?.name ?? "Kontakt entfernt",
        duration: 6000,
      });
    } catch (err) {
      setContacts(backup);
      await setCache<ContactsCache>(OFFLINE_KEYS.contacts, { contacts: backup, cases });
      addToast({
        type: "error",
        title: "Löschen fehlgeschlagen",
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader title="Kontakte" description="Mandanten, Gegner, Gerichte und Ansprechpartner" />

      {/* Create form */}
      <form
        onSubmit={createForm.handleSubmit}
        className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
      >
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Kontakt anlegen</h2>
        {createForm.error && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertTriangle size={14} /> {createForm.error}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_150px]">
          <div>
            <Input
              {...createForm.form.register("name")}
              placeholder="Name"
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
            {createForm.form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-600">
                {createForm.form.formState.errors.name.message}
              </p>
            )}
          </div>
          <select
            {...createForm.form.register("role")}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            {Object.entries(ROLE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            {...createForm.form.register("company")}
            placeholder="Firma / Organisation"
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
          />
          <div>
            <Input
              {...createForm.form.register("email")}
              placeholder="E-Mail"
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
            {createForm.form.formState.errors.email && (
              <p className="mt-1 text-xs text-red-600">
                {createForm.form.formState.errors.email.message}
              </p>
            )}
          </div>
          <Input
            {...createForm.form.register("phone")}
            placeholder="Telefon"
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
          />
        </div>
        <textarea
          {...createForm.form.register("address")}
          rows={2}
          placeholder="Adresse"
          className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
        <div className="flex gap-3">
          <textarea
            {...createForm.form.register("notes")}
            rows={2}
            placeholder="Notizen"
            className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
          <Button
            type="submit"
            disabled={createForm.status === "submitting"}
            className="brand-bg brand-bg gap-2 self-start text-white"
          >
            {createForm.status === "submitting" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            {createForm.status === "submitting" ? "Speichern…" : "Anlegen"}
          </Button>
        </div>
      </form>

      {/* Role filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="Alle"
          active={roleFilter === "all"}
          onClick={() => setRoleFilter("all")}
        />
        {Object.entries(ROLE_LABEL).map(([key, label]) => {
          const count = roleCounts[key] || 0;
          return (
            <FilterChip
              key={key}
              label={`${label} (${count})`}
              active={roleFilter === key}
              onClick={() => setRoleFilter(roleFilter === key ? "all" : key)}
            />
          );
        })}
      </div>

      {/* Search */}
      <SearchBar
        placeholder="Kontakte suchen…"
        onSearch={setQuery}
        onClear={() => setQuery("")}
        className="max-w-md"
      />

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
            Erneut versuchen
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
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <Skeleton className="h-3 w-40 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] px-6 py-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
            <UserCircle size={26} className="text-[color:var(--ds-text-subtle)]" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
            Keine Kontakte gefunden
          </h3>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            {contacts.length === 0
              ? "Lege deinen ersten Kontakt an über das Formular oben."
              : "Passe deine Suche oder Filter an."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((contact) => {
            const linked = findLinkedCases(contact.slug, cases);
            const isEditing = editingSlug === contact.slug;
            if (isEditing) {
              return (
                <form
                  key={contact.slug}
                  onSubmit={editForm.handleSubmit}
                  className="brand-border space-y-3 rounded-xl border bg-[color:var(--ds-surface)] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                      Kontakt bearbeiten
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingSlug(null)}
                      aria-label="Bearbeiten abbrechen"
                      className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {editForm.error && (
                    <div className="flex items-center gap-2 text-xs text-red-600">
                      <AlertTriangle size={14} /> {editForm.error}
                    </div>
                  )}
                  <div className="space-y-2">
                    <div>
                      <Input
                        {...editForm.form.register("name")}
                        placeholder="Name"
                        className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
                      />
                      {editForm.form.formState.errors.name && (
                        <p className="mt-1 text-xs text-red-600">
                          {editForm.form.formState.errors.name.message}
                        </p>
                      )}
                    </div>
                    <select
                      {...editForm.form.register("role")}
                      className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    >
                      {Object.entries(ROLE_LABEL).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        {...editForm.form.register("company")}
                        placeholder="Firma"
                        className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
                      />
                      <div>
                        <Input
                          {...editForm.form.register("email")}
                          placeholder="E-Mail"
                          className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
                        />
                        {editForm.form.formState.errors.email && (
                          <p className="mt-1 text-xs text-red-600">
                            {editForm.form.formState.errors.email.message}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        {...editForm.form.register("phone")}
                        placeholder="Telefon"
                        className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
                      />
                    </div>
                    <textarea
                      {...editForm.form.register("address")}
                      rows={2}
                      placeholder="Adresse"
                      className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    />
                    <textarea
                      {...editForm.form.register("notes")}
                      rows={2}
                      placeholder="Notizen"
                      className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={editForm.status === "submitting"}
                      className="brand-bg brand-bg gap-2 text-xs text-white"
                    >
                      {editForm.status === "submitting" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} />
                      )}
                      {editForm.status === "submitting" ? "Speichern…" : "Speichern"}
                    </Button>
                  </div>
                </form>
              );
            }
            return (
              <div
                key={contact.slug}
                className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-colors hover:border-[color:var(--ds-border-strong)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[color:var(--ds-text)]">
                      {contact.name}
                    </div>
                    {contact.company && (
                      <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {contact.company}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge
                      variant="default"
                      className={`border text-xs ${ROLE_COLORS[contact.role]}`}
                    >
                      {ROLE_LABEL[contact.role]}
                    </Badge>
                    <button
                      onClick={() => startEdit(contact)}
                      aria-label={`${contact.name} bearbeiten`}
                      className="hover:brand-text brand-bg/10 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-all"
                      title="Bearbeiten"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => deleteContact(contact.slug)}
                      aria-label={`${contact.name} löschen`}
                      className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-all hover:bg-red-500/10 hover:text-red-600"
                      title="Löschen"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-[color:var(--ds-text-muted)]">
                  {contact.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={12} />
                      {contact.email}
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={12} />
                      {contact.phone}
                    </div>
                  )}
                  {contact.address && (
                    <div className="leading-relaxed whitespace-pre-wrap">{contact.address}</div>
                  )}
                </div>
                {linked.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                      Verknüpfte Akten
                    </div>
                    {linked.map((c) => (
                      <Link
                        key={c.slug}
                        href={`/dashboard/cases/${encodeURIComponent(c.slug)}`}
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
      )}
    </div>
  );
}
