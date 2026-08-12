"use client";

import { useState } from "react";
import { Timer, Loader2, Plus, X } from "lucide-react";
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
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";

interface QuickTimeEntryProps {
  caseSlug: string;
}

const ACTIVITY_TYPES = [
  { value: "research", label_de: "Recherche", label_en: "Research" },
  { value: "drafting", label_de: "Entwurf", label_en: "Drafting" },
  { value: "court", label_de: "Gericht", label_en: "Court" },
  { value: "meeting", label_de: "Besprechung", label_en: "Meeting" },
  { value: "other", label_de: "Sonstiges", label_en: "Other" },
];

export function QuickTimeEntry({ caseSlug }: QuickTimeEntryProps) {
  const { lang } = useLang();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState("15");
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("other");
  const [billable, setBillable] = useState(true);

  async function submit() {
    const mins = parseInt(minutes, 10);
    if (!mins || mins <= 0) return;
    if (!description.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: caseSlug,
          description: description.trim(),
          minutes: mins,
          date: new Date().toISOString().slice(0, 10),
          billable,
          activity_type: activityType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Fehler beim Speichern");
      addToast({ type: "success", title: `${mins} min gebucht` });
      setOpen(false);
      setDescription("");
      setMinutes("15");
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Fehler beim Speichern",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setOpen(true)}>
        <Timer size={13} />
        {lang === "en" ? "Log time" : "Zeit buchen"}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer size={14} className="text-[color:var(--brand-primary)]" />
          <span className="text-sm font-semibold">
            {lang === "en" ? "Quick time entry" : "Schnelle Zeiterfassung"}
          </span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setOpen(false)}>
          <X size={14} />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <Label className="text-xs">{lang === "en" ? "Minutes" : "Minuten"}</Label>
          <Input
            type="number" inputMode="numeric"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="mt-1 h-9 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">{lang === "en" ? "Activity" : "Tätigkeit"}</Label>
          <Select value={activityType} onValueChange={setActivityType}>
            <SelectTrigger className="mt-1 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPES.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {lang === "en" ? a.label_en : a.label_de}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{lang === "en" ? "Billable" : "Abrechenbar"}</Label>
          <Select value={billable ? "yes" : "no"} onValueChange={(v) => setBillable(v === "yes")}>
            <SelectTrigger className="mt-1 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">{lang === "en" ? "Yes" : "Ja"}</SelectItem>
              <SelectItem value="no">{lang === "en" ? "No" : "Nein"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">{lang === "en" ? "Description" : "Beschreibung"}</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={lang === "en" ? "What did you work on?" : "Womit haben Sie gearbeitet?"}
          className="mt-1 h-9 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && description.trim() && !busy) {
              void submit();
            }
          }}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => setOpen(false)}>
          {lang === "en" ? "Cancel" : "Abbrechen"}
        </Button>
        <Button
          size="sm"
          variant="primary"
          className="text-xs"
          disabled={busy || !description.trim() || !minutes}
          onClick={() => void submit()}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {lang === "en" ? "Save" : "Speichern"}
        </Button>
      </div>
    </div>
  );
}
