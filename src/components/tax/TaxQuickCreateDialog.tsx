"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, FileText } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { TaxReturnType, TaxReturnStatus } from "@/lib/tax-types";

interface TaxQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const TYPE_OPTIONS: Array<{ value: TaxReturnType; label: string }> = [
  { value: "ESt", label: "Einkommensteuer" },
  { value: "USt", label: "Umsatzsteuer" },
  { value: "GewSt", label: "Gewerbesteuer" },
  { value: "KSt", label: "Körperschaftsteuer" },
  { value: "LSt", label: "Lohnsteuer" },
  { value: "UStVA", label: "USt-Voranmeldung" },
  { value: "LStA", label: "Lohnsteuer-Anmeldung" },
  { value: "ZM", label: "Zusammenfassende Meldung" },
  { value: "GrESt", label: "Grunderwerbsteuer" },
  { value: "ErbSt", label: "Erbschaftsteuer" },
  { value: "other", label: "Sonstige" },
];

export function TaxQuickCreateDialog({ open, onOpenChange, onCreated }: TaxQuickCreateDialogProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [clientName, setClientName] = useState("");
  const [type, setType] = useState<TaxReturnType>("ESt");
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);

  const resetForm = useCallback(() => {
    setClientName("");
    setType("ESt");
    setYear(new Date().getFullYear() - 1);
    setDueDate("");
    setNotes("");
    setCreateAnother(false);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/tax/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: clientName.trim(),
          type,
          year,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
          status: "draft" as TaxReturnStatus,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast({ type: "success", title: "Steuererklärung erstellt" });
        if (createAnother) {
          resetForm();
          setSubmitting(false);
          return;
        }
        onOpenChange(false);
        if (onCreated) onCreated();
        router.push("/dashboard/tax-returns");
      } else {
        addToast({ type: "error", title: data?.error ?? "Fehler beim Erstellen" });
      }
    } catch {
      addToast({ type: "error", title: "Netzwerkfehler" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={18} />
            Neue Steuererklärung
          </DialogTitle>
          <DialogDescription>
            Schnellerfassung einer neuen Steuererklärung für einen Mandanten.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tax-client">Mandant</Label>
            <Input
              id="tax-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Name des Mandanten"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tax-type">Art der Erklärung</Label>
              <Select value={type} onValueChange={(v) => setType(v as TaxReturnType)}>
                <SelectTrigger id="tax-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax-year">Jahr</Label>
              <Input
                id="tax-year"
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear() - 1)}
                min={2000}
                max={new Date().getFullYear() + 1}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax-due">Fälligkeit (optional)</Label>
            <Input
              id="tax-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax-notes">Notizen (optional)</Label>
            <Input
              id="tax-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="z.B. Verlängerung beantragt, Sonderausgaben beachten"
            />
          </div>

          <DialogFooter className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
              <input
                type="checkbox"
                checked={createAnother}
                onChange={(e) => setCreateAnother(e.target.checked)}
                className="rounded border-[color:var(--ds-border)]"
              />
              Weitere erstellen
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={submitting || !clientName.trim()}>
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Erstellen
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
