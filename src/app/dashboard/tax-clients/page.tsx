"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Search,
  Loader2,
  Trash2,
  Pencil,
  Save,
  X,
  AlertCircle,
  Mail,
  Phone,
  MapPin,
  Building2,
  User,
  FileText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";

const CLIENT_TYPE_LABELS: Record<string, string> = {
  person: "Privatperson",
  company: "GmbH/AG",
  partnership: "GbR/OHG",
  estate: "Nachlass",
};

const CLIENT_TYPE_VARIANTS: Record<string, "default" | "info" | "warning" | "success"> = {
  person: "default",
  company: "info",
  partnership: "warning",
  estate: "success",
};

interface ClientForm {
  name: string;
  type: string;
  taxId: string;
  vatId: string;
  contactEmail: string;
  contactPhone: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  notes: string;
}

const EMPTY_FORM: ClientForm = {
  name: "",
  type: "person",
  taxId: "",
  vatId: "",
  contactEmail: "",
  contactPhone: "",
  street: "",
  postalCode: "",
  city: "",
  country: "DE",
  notes: "",
};

export default function TaxClientsPage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [clients, setClients] = useState<BrainPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.tax.clients.list({ limit: 200, search: search || undefined });
      setClients(data);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditSlug(null);
    setCreateOpen(true);
  }

  function openEdit(client: BrainPage) {
    const fm = (client.frontmatter ?? {}) as Record<string, unknown>;
    const addr = (fm.address as Record<string, unknown>) ?? {};
    setForm({
      name: String(fm.name ?? client.title ?? ""),
      type: String(fm.client_type ?? "person"),
      taxId: String(fm.tax_id ?? ""),
      vatId: String(fm.vat_id ?? ""),
      contactEmail: String(fm.contact_email ?? ""),
      contactPhone: String(fm.contact_phone ?? ""),
      street: String(addr.street ?? ""),
      postalCode: String(addr.postal_code ?? ""),
      city: String(addr.city ?? ""),
      country: String(addr.country ?? "DE"),
      notes: String(fm.notes ?? ""),
    });
    setEditSlug(client.slug);
    setCreateOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.taxId.trim()) {
      addToast({ type: "error", title: t("tax.clients.error_required") });
      return;
    }
    setSaving(true);
    try {
      if (editSlug) {
        await api.tax.clients.update(editSlug, {
          name: form.name.trim(),
          type: form.type,
          taxId: form.taxId.trim(),
          vatId: form.vatId || null,
          contactEmail: form.contactEmail || null,
          contactPhone: form.contactPhone || null,
          street: form.street || null,
          postalCode: form.postalCode || null,
          city: form.city || null,
          country: form.country,
          notes: form.notes.trim() || null,
        });
        addToast({ type: "success", title: t("tax.detail.saved") });
      } else {
        await api.tax.clients.create({
          name: form.name.trim(),
          type: form.type,
          taxId: form.taxId.trim(),
          vatId: form.vatId || undefined,
          contactEmail: form.contactEmail || undefined,
          contactPhone: form.contactPhone || undefined,
          street: form.street || undefined,
          postalCode: form.postalCode || undefined,
          city: form.city || undefined,
          country: form.country,
          notes: form.notes.trim() || undefined,
        });
        addToast({ type: "success", title: t("tax.clients.created") });
      }
      setCreateOpen(false);
      await load();
    } catch (err) {
      addToast({
        type: "error",
        title: t("tax.detail.save_failed"),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(slug: string) {
    setDeleting(true);
    try {
      await api.tax.clients.remove(slug);
      addToast({ type: "success", title: t("tax.detail.deleted") });
      setDeleteOpen(null);
      await load();
    } catch (err) {
      addToast({
        type: "error",
        title: t("tax.detail.delete_failed"),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("tax.clients.title")}
        description={t("tax.clients.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("tax.clients.breadcrumb") },
        ]}
        actions={[
          <Button key="create" size="sm" onClick={openCreate} className="brand-bg gap-2 text-white">
            <Plus size={14} /> {t("tax.clients.create")}
          </Button>,
        ]}
      />

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("tax.clients.search_placeholder")}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[color:var(--ds-text-subtle)]" size={24} />
        </div>
      ) : clients.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16">
          <Users size={32} className="text-[color:var(--ds-border)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">{t("tax.clients.empty")}</p>
          <Button size="sm" onClick={openCreate} className="brand-bg gap-2 text-white">
            <Plus size={14} /> {t("tax.clients.create")}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => {
            const fm = (client.frontmatter ?? {}) as Record<string, unknown>;
            const addr = (fm.address as Record<string, unknown>) ?? {};
            return (
              <Card key={client.slug} className="space-y-3 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                      {fm.client_type === "company" ? (
                        <Building2 size={18} className="text-blue-500" />
                      ) : (
                        <User size={18} className="text-blue-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                        {String(fm.name ?? client.title)}
                      </p>
                      <Badge
                        variant={
                          CLIENT_TYPE_VARIANTS[String(fm.client_type ?? "person")] ?? "default"
                        }
                        className="mt-1"
                      >
                        {CLIENT_TYPE_LABELS[String(fm.client_type ?? "person")] ??
                          String(fm.client_type)}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(client)}
                      className="h-8 w-8 p-0"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteOpen(client.slug)}
                      className="h-8 w-8 p-0 text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
                  <p className="flex items-center gap-2">
                    <FileText size={12} /> St-Nr: {String(fm.tax_id ?? "—")}
                  </p>
                  {Boolean(fm.vat_id) && (
                    <p className="flex items-center gap-2">
                      <FileText size={12} /> USt-IdNr: {String(fm.vat_id)}
                    </p>
                  )}
                  {Boolean(fm.contact_email) && (
                    <p className="flex items-center gap-2">
                      <Mail size={12} /> {String(fm.contact_email)}
                    </p>
                  )}
                  {Boolean(fm.contact_phone) && (
                    <p className="flex items-center gap-2">
                      <Phone size={12} /> {String(fm.contact_phone)}
                    </p>
                  )}
                  {Boolean(addr.city) && (
                    <p className="flex items-center gap-2">
                      <MapPin size={12} /> {String(addr.postal_code ?? "")} {String(addr.city)}
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editSlug ? t("tax.clients.edit") : t("tax.clients.create")}</DialogTitle>
            <DialogDescription>{t("tax.clients.form_desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.clients.label_name")} *
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.clients.label_type")}
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  {Object.entries(CLIENT_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.clients.label_tax_id")} *
                </label>
                <Input
                  value={form.taxId}
                  onChange={(e) => setForm((p) => ({ ...p, taxId: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.clients.label_vat_id")}
                </label>
                <Input
                  value={form.vatId}
                  onChange={(e) => setForm((p) => ({ ...p, vatId: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.clients.label_email")}
                </label>
                <Input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.clients.label_phone")}
                </label>
                <Input
                  value={form.contactPhone}
                  onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.clients.label_street")}
                </label>
                <Input
                  value={form.street}
                  onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                    PLZ
                  </label>
                  <Input
                    value={form.postalCode}
                    onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                    {t("tax.clients.label_city")}
                  </label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {t("tax.clients.label_country")}
                </label>
                <select
                  value={form.country}
                  onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                  className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                >
                  <option value="DE">Deutschland</option>
                  <option value="AT">Österreich</option>
                  <option value="CH">Schweiz</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("tax.detail.label_notes")}
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t("tax.detail.cancel")}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !form.name.trim() || !form.taxId.trim()}
              className="brand-bg gap-2 text-white"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? t("tax.detail.saving") : t("tax.detail.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen !== null} onOpenChange={(v) => !v && setDeleteOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle size={18} /> {t("tax.detail.delete_title")}
            </DialogTitle>
            <DialogDescription>{t("tax.detail.delete_desc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(null)}>
              {t("tax.detail.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteOpen && void handleDelete(deleteOpen)}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {t("tax.detail.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
