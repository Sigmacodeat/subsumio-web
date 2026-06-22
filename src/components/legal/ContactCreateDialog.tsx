"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Loader2, Plus, AlertTriangle, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { isOnline, enqueueMutation } from "@/lib/offline-store";
import { contactFormSchema, type ContactFormData } from "@/lib/schemas/contact";
import type { ContactFrontmatter } from "@/lib/legal-types";

type ContactRole = NonNullable<ContactFrontmatter["role"]>;

export interface ContactCreateResult {
  slug: string;
  name: string;
  role: ContactRole;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

interface ContactCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRole: ContactRole;
  defaultName?: string;
  existingContacts: Array<{
    slug: string;
    name: string;
    email?: string;
    phone?: string;
    role: string;
  }>;
  onCreated: (contact: ContactCreateResult) => void;
}

function slugifyContact(name: string): string {
  return `contact/${name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-|-$/g, "")}-${Date.now()}`;
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function ContactCreateDialog({
  open,
  onOpenChange,
  defaultRole,
  defaultName,
  existingContacts,
  onCreated,
}: ContactCreateDialogProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<ContactRole>(defaultRole);
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{
    slug: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setName(defaultName ?? "");
      setRole(defaultRole);
      setCompany("");
      setEmail("");
      setPhone("");
      setAddress("");
      setNotes("");
      setError(null);
      setDuplicate(null);
    }
  }, [open, defaultName, defaultRole]);

  // P2.2: Duplicate detection — check existing contacts by normalized name/email/phone
  const checkDuplicate = useCallback(
    (fieldName: string, fieldValue: string) => {
      if (!fieldValue.trim()) {
        setDuplicate(null);
        return;
      }
      const normalized = normalizeForCompare(fieldValue);
      const match = existingContacts.find((c) => {
        if (fieldName === "name" && normalizeForCompare(c.name) === normalized) return true;
        if (fieldName === "email" && c.email && normalizeForCompare(c.email) === normalized)
          return true;
        if (fieldName === "phone" && c.phone && normalizeForCompare(c.phone) === normalized)
          return true;
        return false;
      });
      setDuplicate(match ? { slug: match.slug, name: match.name } : null);
    },
    [existingContacts]
  );

  async function handleSubmit() {
    setError(null);

    const result = contactFormSchema.safeParse({
      name: name.trim(),
      role,
      company: company.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? "Ungültige Eingabe");
      return;
    }

    setSubmitting(true);
    try {
      const slug = slugifyContact(result.data.name);
      const pagePayload = {
        slug,
        title: result.data.name,
        type: "legal_contact" as const,
        content: result.data.notes || "",
        frontmatter: {
          type: "legal_contact" as const,
          role: result.data.role,
          name: result.data.name,
          company: result.data.company,
          email: result.data.email,
          phone: result.data.phone,
          address: result.data.address,
          notes: result.data.notes,
        },
      };
      if (isOnline()) {
        await api.brain.createPage(pagePayload);
      } else {
        await enqueueMutation({ type: "createPage", payload: pagePayload });
      }
      onCreated({
        slug,
        name: result.data.name,
        role: result.data.role,
        company: result.data.company,
        email: result.data.email,
        phone: result.data.phone,
        address: result.data.address,
        notes: result.data.notes,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kontakt konnte nicht erstellt werden");
    } finally {
      setSubmitting(false);
    }
  }

  function useExistingContact() {
    if (!duplicate) return;
    const existing = existingContacts.find((c) => c.slug === duplicate.slug);
    if (!existing) return;
    onCreated({
      slug: existing.slug,
      name: existing.name,
      role: existing.role as ContactRole,
      email: existing.email,
      phone: existing.phone,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kontakt erstellen</DialogTitle>
          <DialogDescription>Neuen Kontakt anlegen und direkt zur Akte zuweisen.</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {duplicate && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle size={14} />
              <span>Kontakt &quot;{duplicate.name}&quot; existiert bereits.</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={useExistingContact}
              className="shrink-0 gap-1.5 text-xs text-amber-700 hover:bg-amber-500/10"
            >
              <UserCheck size={13} /> Verwenden
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">Name *</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                checkDuplicate("name", e.target.value);
              }}
              placeholder="Vor- und Nachname"
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">Rolle</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ContactRole)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            >
              <option value="client">Mandant</option>
              <option value="opponent">Gegner</option>
              <option value="court">Gericht</option>
              <option value="lawyer">Anwalt</option>
              <option value="other">Sonstige</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                Unternehmen
              </label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Firma"
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">E-Mail</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  checkDuplicate("email", e.target.value);
                }}
                placeholder="email@beispiel.at"
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">Telefon</label>
            <Input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                checkDuplicate("phone", e.target.value);
              }}
              placeholder="+43…"
              className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">Adresse</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="Straße, PLZ Ort"
              className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[color:var(--ds-text-muted)]"
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="brand-bg brand-bg gap-2 text-white"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {submitting ? "Wird erstellt…" : "Erstellen & Zuweisen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
