"use client";

import { useState, useCallback, useEffect } from "react";
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
import { Loader2, Plus, FileText, ChevronDown } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { TaxReturnType, TaxReturnStatus } from "@/lib/tax-types";
import { cn } from "@/lib/utils";

interface TaxReturnQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const TYPE_OPTIONS: Array<{ value: TaxReturnType; labelDe: string; labelEn: string }> = [
  { value: "ESt", labelDe: "Einkommensteuer", labelEn: "Income Tax" },
  { value: "USt", labelDe: "Umsatzsteuer", labelEn: "VAT" },
  { value: "GewSt", labelDe: "Gewerbesteuer", labelEn: "Trade Tax" },
  { value: "KSt", labelDe: "Körperschaftsteuer", labelEn: "Corporate Tax" },
  { value: "LSt", labelDe: "Lohnsteuer", labelEn: "Wage Tax" },
  { value: "ErbSt", labelDe: "Erbschaftsteuer", labelEn: "Inheritance Tax" },
  { value: "GrESt", labelDe: "Grunderwerbsteuer", labelEn: "Real Estate Transfer Tax" },
  { value: "UStVA", labelDe: "USt-Voranmeldung", labelEn: "VAT Pre-Registration" },
  { value: "other", labelDe: "Sonstige", labelEn: "Other" },
];

const STATUS_OPTIONS: Array<{ value: TaxReturnStatus; labelDe: string; labelEn: string }> = [
  { value: "draft", labelDe: "Entwurf", labelEn: "Draft" },
  { value: "in_progress", labelDe: "In Bearbeitung", labelEn: "In Progress" },
  { value: "review", labelDe: "Zur Prüfung", labelEn: "In Review" },
  { value: "submitted", labelDe: "Eingereicht", labelEn: "Submitted" },
];

export function TaxReturnQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: TaxReturnQuickCreateDialogProps) {
  const { t, lang } = useLang();
  const { addToast } = useToast();

  const [clientName, setClientName] = useState("");
  const [type, setType] = useState<TaxReturnType>("ESt");
  const [year, setYear] = useState(new Date().getFullYear());
  const [status, setStatus] = useState<TaxReturnStatus>("draft");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const resetForm = useCallback(() => {
    setClientName("");
    setType("ESt");
    setYear(new Date().getFullYear());
    setStatus("draft");
    setDueDate("");
    setNotes("");
    setShowAdvanced(false);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) return;
    setSubmitting(true);
    try {
      await api.tax.returns.create({
        clientName: clientName.trim(),
        type,
        year,
        status,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
      });
      addToast({
        type: "success",
        title: lang === "en" ? "Tax return created" : "Steuererklärung erstellt",
      });
      if (createAnother) {
        resetForm();
        setSubmitting(false);
        return;
      }
      onOpenChange(false);
      if (onCreated) onCreated();
    } catch (err) {
      addToast({
        type: "error",
        title: lang === "en" ? "Creation failed" : "Erstellung fehlgeschlagen",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = clientName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
                <FileText size={16} className="brand-text" />
              </div>
              <DialogTitle>{lang === "en" ? "New Tax Return" : "Neue Steuererklärung"}</DialogTitle>
            </div>
            <DialogDescription>
              {lang === "en"
                ? "Create a new tax return quickly"
                : "Neue Steuererklärung schnell anlegen"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tax-return-client" className="text-xs">
                {lang === "en" ? "Client" : "Mandant"} *
              </Label>
              <Input
                id="tax-return-client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={lang === "en" ? "Client name" : "Mandantenname"}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tax-return-type" className="text-xs">
                  {lang === "en" ? "Tax Type" : "Steuerart"}
                </Label>
                <Select value={type} onValueChange={(v) => setType(v as TaxReturnType)}>
                  <SelectTrigger id="tax-return-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {lang === "en" ? o.labelEn : o.labelDe}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tax-return-year" className="text-xs">
                  {lang === "en" ? "Year" : "Jahr"}
                </Label>
                <Input
                  id="tax-return-year"
                  type="number"
                  min={2000}
                  max={new Date().getFullYear() + 1}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
            >
              <ChevronDown
                size={13}
                className={cn("transition-transform", showAdvanced && "rotate-180")}
              />
              {showAdvanced
                ? lang === "en"
                  ? "Hide advanced"
                  : "Erweitert ausblenden"
                : lang === "en"
                  ? "Show advanced"
                  : "Erweitert einblenden"}
            </button>

            {showAdvanced && (
              <div className="space-y-4 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tax-return-status" className="text-xs">
                      {lang === "en" ? "Status" : "Status"}
                    </Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as TaxReturnStatus)}>
                      <SelectTrigger id="tax-return-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {lang === "en" ? o.labelEn : o.labelDe}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tax-return-due" className="text-xs">
                      {lang === "en" ? "Due Date" : "Frist"}
                    </Label>
                    <Input
                      id="tax-return-due"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tax-return-notes" className="text-xs">
                    {lang === "en" ? "Notes" : "Notizen"}
                  </Label>
                  <textarea
                    id="tax-return-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-[color:var(--ds-border)] px-6 py-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
                <input
                  type="checkbox"
                  checked={createAnother}
                  onChange={(e) => setCreateAnother(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[color:var(--ds-border)]"
                />
                {lang === "en" ? "Create another" : "Weitere anlegen"}
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-[color:var(--ds-text-muted)]"
              >
                {lang === "en" ? "Cancel" : "Abbrechen"}
              </Button>
              <Button
                type="submit"
                disabled={submitting || !canSubmit}
                className="brand-bg gap-2 text-white"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {lang === "en" ? "Create" : "Erstellen"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
