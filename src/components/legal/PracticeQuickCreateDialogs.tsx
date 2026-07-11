"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useDialogFetch } from "@/lib/use-dialog-fetch";
import { useLang } from "@/lib/use-lang";
import { useToast } from "@/components/ui/toast";
import type { BrainPage } from "@/lib/types";
import { Loader2 } from "lucide-react";

type DialogKind = "wiedervorlage" | "phone" | null;
type CaseOption = Pick<BrainPage, "slug" | "title">;

export function PracticeQuickCreateDialogs() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [kind, setKind] = useState<DialogKind>(null);
  const [submitting, setSubmitting] = useState(false);
  const [caseSlug, setCaseSlug] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [caller, setCaller] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [results, setResults] = useState("");
  const [followUp, setFollowUp] = useState("");
  const { data: cases = [] } = useDialogFetch<CaseOption[]>(kind !== null, async () =>
    (await api.brain.listPages({ type: "legal_case", limit: 250 })).map(({ slug, title }) => ({
      slug,
      title,
    }))
  );
  const safeCases = cases ?? [];

  useEffect(() => {
    const openWiedervorlage = () => setKind("wiedervorlage");
    const openPhone = () => setKind("phone");
    window.addEventListener("subsumio:create-wiedervorlage", openWiedervorlage);
    window.addEventListener("subsumio:create-phone-note", openPhone);
    return () => {
      window.removeEventListener("subsumio:create-wiedervorlage", openWiedervorlage);
      window.removeEventListener("subsumio:create-phone-note", openPhone);
    };
  }, []);

  function close() {
    setKind(null);
    setCaseSlug("");
    setDescription("");
    setCaller("");
    setSubject("");
    setNotes("");
    setResults("");
    setFollowUp("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      if (kind === "wiedervorlage") {
        await api.brain.createPage({
          slug: `legal/wiedervorlagen/${Date.now().toString(36)}`,
          title: description.trim(),
          type: "legal_follow_up",
          content: description.trim(),
          frontmatter: {
            date,
            case_slug: caseSlug || undefined,
            completed: false,
            created_at: now,
          },
        });
      } else if (kind === "phone") {
        await api.brain.createPage({
          slug: `legal/phone-notes/${Date.now().toString(36)}`,
          title: subject.trim(),
          type: "legal_phone_note",
          content: notes.trim(),
          frontmatter: {
            caller: caller.trim(),
            case_slug: caseSlug || undefined,
            occurred_at: now,
            results: results.trim(),
            follow_up: followUp.trim(),
          },
        });
      }
      addToast({
        type: "success",
        title: t(kind === "phone" ? "practice.phone.created" : "practice.followup.created"),
      });
      window.dispatchEvent(new Event("subsumio:practice-data-changed"));
      close();
    } catch (error) {
      addToast({
        type: "error",
        title: error instanceof Error ? error.message : t("common.error"),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {t(kind === "phone" ? "practice.phone.title" : "practice.followup.new")}
            </DialogTitle>
            <DialogDescription>
              {t(kind === "phone" ? "practice.phone.description" : "practice.followup.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-5">
            {kind === "phone" && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="phone-caller">{t("practice.phone.caller")}</Label>
                  <Input
                    id="phone-caller"
                    value={caller}
                    onChange={(e) => setCaller(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="phone-subject">{t("practice.phone.subject")}</Label>
                  <Input
                    id="phone-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                </div>
              </>
            )}
            {kind === "wiedervorlage" && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="followup-description">{t("practice.followup.label")}</Label>
                  <Input
                    id="followup-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="followup-date">{t("practice.date")}</Label>
                  <Input
                    id="followup-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="practice-case">{t("practice.case_optional")}</Label>
              <select
                id="practice-case"
                value={caseSlug}
                onChange={(e) => setCaseSlug(e.target.value)}
                className="h-10 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 text-sm"
              >
                <option value="">{t("practice.no_case")}</option>
                {safeCases.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
            {kind === "phone" && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="phone-notes">{t("practice.phone.notes")}</Label>
                  <Textarea
                    id="phone-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    required
                    rows={5}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="phone-results">{t("practice.phone.results")}</Label>
                  <Textarea
                    id="phone-results"
                    value={results}
                    onChange={(e) => setResults(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="phone-followup">{t("practice.phone.followup")}</Label>
                  <Input
                    id="phone-followup"
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
