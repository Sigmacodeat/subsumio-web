"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ClipboardCheck, AlertTriangle } from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_BADGE_VARIANT,
  type FixtureReviewStatus,
} from "@/lib/eval-fixture-review";

const FIXTURE_FILES = [
  { value: "at-legal-retrieval.jsonl", label: "AT Legal Retrieval (80 Fragen)" },
];

interface ReviewSummary {
  slug: string;
  frontmatter: {
    status: FixtureReviewStatus;
    proposed_slug: string;
    reasoning: string;
    proposed_by: string;
    proposed_at: string;
    reviewer_note?: string;
  };
}

interface FixtureQuestion {
  question_id: string;
  question: string;
  expected_slug: string;
  legal_area?: string;
  question_type?: string;
  needs_legal_review?: boolean;
  review_note?: string;
  reviews: ReviewSummary[];
}

export default function EvalReviewPage() {
  const [fixtureFile, setFixtureFile] = useState(FIXTURE_FILES[0].value);
  const [activeQuestion, setActiveQuestion] = useState<FixtureQuestion | null>(null);
  const [proposedSlug, setProposedSlug] = useState("");
  const [reasoning, setReasoning] = useState("");
  const queryClient = useQueryClient();

  const questionsQuery = useQuery<{ questions: FixtureQuestion[]; total: number; flagged: number }>(
    {
      queryKey: ["eval-fixture-questions", fixtureFile],
      queryFn: async () => {
        const res = await fetch(
          `/api/eval-fixture-reviews/questions?fixture_file=${encodeURIComponent(fixtureFile)}`,
          { credentials: "same-origin" }
        );
        if (!res.ok) throw new Error("Konnte Fixture-Fragen nicht laden");
        const json = await res.json();
        return json.data ?? json;
      },
    }
  );

  const proposeMutation = useMutation({
    mutationFn: async (params: {
      question: FixtureQuestion;
      proposed_slug: string;
      reasoning: string;
    }) => {
      const res = await fetch("/api/eval-fixture-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          fixture_file: fixtureFile,
          question_id: params.question.question_id,
          question: params.question.question,
          current_expected_slug: params.question.expected_slug,
          proposed_slug: params.proposed_slug,
          legal_area: params.question.legal_area,
          reasoning: params.reasoning,
        }),
      });
      if (!res.ok) throw new Error("Vorschlag konnte nicht gespeichert werden");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eval-fixture-questions", fixtureFile] });
      setActiveQuestion(null);
      setProposedSlug("");
      setReasoning("");
    },
  });

  const decideMutation = useMutation({
    mutationFn: async (params: {
      slug: string;
      status: "approved" | "rejected" | "needs_discussion";
      reviewer_note?: string;
    }) => {
      const res = await fetch("/api/eval-fixture-reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Entscheidung konnte nicht gespeichert werden");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eval-fixture-questions", fixtureFile] });
    },
  });

  const questions = useMemo(
    () => questionsQuery.data?.questions ?? [],
    [questionsQuery.data?.questions]
  );
  const flagged = questionsQuery.data?.flagged ?? 0;

  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    for (const q of questions) {
      const latest = q.reviews[0];
      if (!latest) continue;
      if (latest.frontmatter.status === "pending") pending++;
      if (latest.frontmatter.status === "approved") approved++;
    }
    return { pending, approved };
  }, [questions]);

  function openReviewDialog(q: FixtureQuestion) {
    setActiveQuestion(q);
    setProposedSlug(q.expected_slug);
    setReasoning("");
  }

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Eval-Fixture-Review"
        description="Jurist:innen prüfen und korrigieren Ground-Truth-Zuordnungen der Retrieval-Eval strukturiert — nie durch den optimierenden Agenten selbst."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={fixtureFile} onValueChange={setFixtureFile}>
          <SelectTrigger className="w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIXTURE_FILES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="default">{questionsQuery.data?.total ?? 0} Fragen</Badge>
        {flagged > 0 && (
          <Badge variant="warning" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {flagged} bereits markiert
          </Badge>
        )}
        {stats.pending > 0 && <Badge variant="info">{stats.pending} offene Vorschläge</Badge>}
        {stats.approved > 0 && (
          <Badge variant="success" className="gap-1">
            <ClipboardCheck className="h-3 w-3" />
            {stats.approved} freigegeben
          </Badge>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[color:var(--ds-border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Frage</TableHead>
              <TableHead>Aktueller expected_slug</TableHead>
              <TableHead>Rechtsgebiet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {questionsQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-[color:var(--ds-text-muted)]">
                  Lädt…
                </TableCell>
              </TableRow>
            )}
            {questionsQuery.isError && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-[color:var(--ds-danger-text)]">
                  Fehler beim Laden der Fixture-Fragen.
                </TableCell>
              </TableRow>
            )}
            {questions.map((q) => {
              const latest = q.reviews[0];
              return (
                <TableRow key={q.question_id}>
                  <TableCell className="font-mono text-xs">{q.question_id}</TableCell>
                  <TableCell className="max-w-md">{q.question}</TableCell>
                  <TableCell className="font-mono text-xs">{q.expected_slug}</TableCell>
                  <TableCell>{q.legal_area ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {q.needs_legal_review && (
                        <Badge variant="warning" className="w-fit gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          markiert
                        </Badge>
                      )}
                      {latest ? (
                        <Badge
                          variant={STATUS_BADGE_VARIANT[latest.frontmatter.status]}
                          className="w-fit"
                        >
                          {STATUS_LABELS[latest.frontmatter.status]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-[color:var(--ds-text-muted)]">
                          kein Vorschlag
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {latest && latest.frontmatter.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            decideMutation.mutate({ slug: latest.slug, status: "approved" })
                          }
                        >
                          Freigeben
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            decideMutation.mutate({ slug: latest.slug, status: "rejected" })
                          }
                        >
                          Ablehnen
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => openReviewDialog(q)}>
                        Korrektur vorschlagen
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={activeQuestion !== null}
        onOpenChange={(open) => !open && setActiveQuestion(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Korrektur vorschlagen</DialogTitle>
            <DialogDescription>
              {activeQuestion?.question_id}: {activeQuestion?.question}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Aktueller expected_slug</label>
              <div className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 font-mono text-xs">
                {activeQuestion?.expected_slug}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Vorgeschlagener expected_slug
              </label>
              <Textarea
                value={proposedSlug}
                onChange={(e) => setProposedSlug(e.target.value)}
                rows={2}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Begründung (RIS-Fundstelle / Gesetzestext-Zitat)
              </label>
              <Textarea
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                rows={4}
                placeholder="z.B. '§8 GewO = Allgemeine Voraussetzungen für die Ausübung von Gewerben, RIS-Kurztitel...' — Vorschlag wird nie automatisch übernommen, nur als Vorschlag gespeichert."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActiveQuestion(null)}>
              Abbrechen
            </Button>
            <Button
              disabled={
                !activeQuestion ||
                !proposedSlug.trim() ||
                !reasoning.trim() ||
                proposeMutation.isPending
              }
              onClick={() =>
                activeQuestion &&
                proposeMutation.mutate({
                  question: activeQuestion,
                  proposed_slug: proposedSlug,
                  reasoning,
                })
              }
            >
              Vorschlag speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
