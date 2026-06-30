"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, CheckCircle2, Circle, AlertCircle, Loader2 } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

export interface AuditFinding {
  id: string;
  issue: string;
  amount?: number;
  accepted: boolean;
}

interface TaxAuditFindingsTableProps {
  findings: AuditFinding[];
  onChange: (findings: AuditFinding[]) => void;
  readOnly?: boolean;
}

export function TaxAuditFindingsTable({
  findings,
  onChange,
  readOnly = false,
}: TaxAuditFindingsTableProps) {
  const { lang } = useLang();
  const [addOpen, setAddOpen] = useState(false);
  const [newIssue, setNewIssue] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const addFinding = useCallback(() => {
    if (!newIssue.trim()) return;
    const finding: AuditFinding = {
      id: `finding-${Date.now().toString(36)}`,
      issue: newIssue.trim(),
      amount: newAmount ? Number(newAmount) : undefined,
      accepted: false,
    };
    onChange([...findings, finding]);
    setNewIssue("");
    setNewAmount("");
    setAddOpen(false);
  }, [findings, newIssue, newAmount, onChange]);

  const toggleAccepted = useCallback(
    (id: string) => {
      if (readOnly) return;
      onChange(findings.map((f) => (f.id === id ? { ...f, accepted: !f.accepted } : f)));
    },
    [findings, onChange, readOnly]
  );

  const removeFinding = useCallback(
    (id: string) => {
      if (readOnly) return;
      onChange(findings.filter((f) => f.id !== id));
    },
    [findings, onChange, readOnly]
  );

  const totalAmount = findings.reduce((s, f) => s + (f.amount ?? 0), 0);
  const acceptedCount = findings.filter((f) => f.accepted).length;

  if (findings.length === 0 && readOnly) {
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-8 text-center">
        <AlertCircle size={24} className="mx-auto text-[color:var(--ds-text-subtle)] opacity-50" />
        <p className="mt-2 text-sm text-[color:var(--ds-text-subtle)]">
          {lang === "en" ? "No findings recorded" : "Keine Feststellungen dokumentiert"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[color:var(--ds-text-muted)]">
            {findings.length} {lang === "en" ? "findings" : "Feststellungen"}
          </span>
          {findings.length > 0 && (
            <>
              <span className="text-[color:var(--ds-text-subtle)]">·</span>
              <span className="text-emerald-600">
                {acceptedCount} {lang === "en" ? "accepted" : "akzeptiert"}
              </span>
              <span className="text-[color:var(--ds-text-subtle)]">·</span>
              <span className="font-medium text-[color:var(--ds-text)]">
                {totalAmount.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €
              </span>
            </>
          )}
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
            className="gap-1.5"
          >
            <Plus size={14} />
            {lang === "en" ? "Add Finding" : "Feststellung hinzufügen"}
          </Button>
        )}
      </div>

      {findings.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[color:var(--ds-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                <th className="px-4 py-2 font-medium">
                  {lang === "en" ? "Issue" : "Feststellung"}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {lang === "en" ? "Amount" : "Betrag"}
                </th>
                <th className="px-4 py-2 text-center font-medium">
                  {lang === "en" ? "Status" : "Status"}
                </th>
                {!readOnly && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr
                  key={f.id}
                  className="border-b border-[color:var(--ds-border)]/50 last:border-0"
                >
                  <td className="px-4 py-2.5 text-[color:var(--ds-text)]">{f.issue}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-[color:var(--ds-text)]">
                    {f.amount != null
                      ? `${f.amount.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => toggleAccepted(f.id)}
                      disabled={readOnly}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                        f.accepted
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                          : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-subtle)]",
                        !readOnly && "cursor-pointer hover:border-[color:var(--ds-border-strong)]"
                      )}
                    >
                      {f.accepted ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                      {f.accepted
                        ? lang === "en"
                          ? "Accepted"
                          : "Akzeptiert"
                        : lang === "en"
                          ? "Open"
                          : "Offen"}
                    </button>
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeFinding(f.id)}
                        className="text-[color:var(--ds-text-subtle)] transition-colors hover:text-rose-600"
                        aria-label="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{lang === "en" ? "Add Finding" : "Feststellung hinzufügen"}</DialogTitle>
            <DialogDescription>
              {lang === "en"
                ? "Document a new audit finding"
                : "Neue Betriebsprüfungsfeststellung dokumentieren"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="finding-issue" className="text-xs">
                {lang === "en" ? "Issue Description" : "Feststellungsbeschreibung"} *
              </Label>
              <Input
                id="finding-issue"
                value={newIssue}
                onChange={(e) => setNewIssue(e.target.value)}
                placeholder={
                  lang === "en"
                    ? "e.g. Private expenses deducted as business"
                    : "z.B. Private Ausgaben als Betriebsausgaben abgesetzt"
                }
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="finding-amount" className="text-xs">
                {lang === "en" ? "Additional Tax (€)" : "Nachzahlung (€)"}
              </Label>
              <Input
                id="finding-amount"
                type="number"
                min={0}
                step={0.01}
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAddOpen(false)}
              className="text-[color:var(--ds-text-muted)]"
            >
              {lang === "en" ? "Cancel" : "Abbrechen"}
            </Button>
            <Button
              type="button"
              disabled={!newIssue.trim()}
              onClick={addFinding}
              className="brand-bg gap-2 text-white"
            >
              <Plus size={14} />
              {lang === "en" ? "Add" : "Hinzufügen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
