"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil, AlertTriangle } from "lucide-react";
import { useLang } from "@/lib/use-lang";

/**
 * Editable fields of an existing Frist — what the cockpit dialog hands back.
 * The caller decides where the patch is written (standalone page vs. an entry
 * of a matter's deadlines[]).
 */
export interface DeadlineEditValues {
  description: string;
  dueDate: string;
  vorfristDate: string;
  isNotfrist: boolean;
  law: string;
  /** Required when the due date of a Notfrist moves; the server logs it. */
  changeReason?: string;
}

interface DeadlineEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row being edited — null while closed. */
  deadline: {
    description: string;
    date: string;
    vorfristDate?: string;
    isNotfrist?: boolean;
    law?: string;
    reviewStatus?: string;
  } | null;
  saving: boolean;
  onSave: (values: DeadlineEditValues) => void;
}

export function DeadlineEditDialog({
  open,
  onOpenChange,
  deadline,
  saving,
  onSave,
}: DeadlineEditDialogProps) {
  const { lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);

  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [vorfristDate, setVorfristDate] = useState("");
  const [isNotfrist, setIsNotfrist] = useState(false);
  const [law, setLaw] = useState("");
  const [changeReason, setChangeReason] = useState("");

  // Populate from the row each time the dialog opens on a different deadline.
  useEffect(() => {
    if (!open || !deadline) return;
    setDescription(deadline.description);
    setDueDate(deadline.date.slice(0, 10));
    setVorfristDate(deadline.vorfristDate ?? "");
    setIsNotfrist(deadline.isNotfrist === true);
    setLaw(deadline.law ?? "");
    setChangeReason("");
  }, [open, deadline]);

  const wasApproved = deadline?.reviewStatus === "approved";
  // Moving a Notfrist needs a written reason (checked again on the server).
  const needsReason =
    deadline?.isNotfrist === true && !!deadline.date && dueDate !== deadline.date.slice(0, 10);
  const canSubmit =
    description.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(dueDate) &&
    (!needsReason || changeReason.trim().length >= 5);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    onSave({
      description: description.trim(),
      dueDate,
      vorfristDate,
      isNotfrist,
      law: law.trim(),
      ...(needsReason ? { changeReason: changeReason.trim() } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2">
              <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
                <Pencil size={16} className="brand-text" />
              </div>
              <DialogTitle>{L("Frist bearbeiten", "Edit deadline")}</DialogTitle>
            </div>
            <DialogDescription>
              {L(
                "Datum, Vorfrist und Bezeichnung korrigieren — direkt aus dem Cockpit.",
                "Correct date, pre-deadline and description — straight from the cockpit."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-2">
            {wasApproved && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  {L(
                    "Diese Frist ist bereits freigegeben. Eine Änderung setzt die Freigabe zurück — sie muss erneut geprüft werden (geänderte Fristen müssen erkennbar bleiben).",
                    "This deadline is already approved. Editing resets the approval — it must be reviewed again (changed deadlines must stay recognisable)."
                  )}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="edit-deadline-desc" className="text-xs">
                {L("Bezeichnung", "Description")} *
              </Label>
              <Input
                id="edit-deadline-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-deadline-date" className="text-xs">
                  {L("Fälligkeitsdatum", "Due date")} *
                </Label>
                <Input
                  id="edit-deadline-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-deadline-vorfrist" className="text-xs">
                  {L("Vorfrist (optional)", "Pre-deadline (optional)")}
                </Label>
                <Input
                  id="edit-deadline-vorfrist"
                  type="date"
                  value={vorfristDate}
                  max={dueDate || undefined}
                  onChange={(e) => setVorfristDate(e.target.value)}
                />
              </div>
            </div>

            {needsReason && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-deadline-reason" className="text-xs">
                  {L(
                    "Begründung für die Änderung der Notfrist",
                    "Reason for changing the statutory deadline"
                  )}{" "}
                  *
                </Label>
                <Input
                  id="edit-deadline-reason"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  aria-describedby="edit-deadline-reason-hint"
                  required
                />
                <p
                  id="edit-deadline-reason-hint"
                  className="text-xs text-[color:var(--ds-text-muted)]"
                >
                  {L(
                    "Wird mit altem und neuem Datum im Protokoll gespeichert (mind. 5 Zeichen).",
                    "Stored in the audit trail with the old and new date (min. 5 characters)."
                  )}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="edit-deadline-law" className="text-xs">
                {L("Norm / Grundlage (optional)", "Law / basis (optional)")}
              </Label>
              <Input
                id="edit-deadline-law"
                value={law}
                onChange={(e) => setLaw(e.target.value)}
                placeholder="§ 222 ZPO"
              />
            </div>

            <label
              htmlFor="edit-deadline-notfrist"
              className="flex cursor-pointer items-start gap-3"
            >
              <Checkbox
                id="edit-deadline-notfrist"
                checked={isNotfrist}
                onCheckedChange={(v) => setIsNotfrist(v === true)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-[color:var(--ds-text)]">
                  {L("Notfrist", "Statutory deadline")}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {L(
                    "Unverlängerbare gesetzliche Frist — benötigt Vier-Augen-Kontrolle.",
                    "Non-extendable statutory deadline — requires a four-eyes check."
                  )}
                </p>
              </div>
            </label>
          </div>

          <DialogFooter className="gap-2 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {L("Abbrechen", "Cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit || saving} loading={saving}>
              {saving ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                L("Speichern", "Save")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
