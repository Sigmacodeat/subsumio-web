"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Filter,
  Inbox,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";

// ── Types ─────────────────────────────────────────────────────────────

interface TriageEntry {
  id: string;
  source: string;
  query: string;
  answer_excerpt: string;
  user_verdict: "correct" | "incorrect" | "incomplete";
  user_comment?: string;
  flagged_citations?: string[];
  jurisdiction?: "DE" | "AT" | "CH";
  triage_state: "candidate" | "confirmed" | "rejected" | "needs_info";
  created_at: string;
  reviewed_at?: string;
  error_class?: string;
  root_cause?: string;
  severity?: string;
  correction?: string;
  review_notes?: string;
  mined_to_fixture: boolean;
}

interface TriageStats {
  total: number;
  by_state: Record<string, number>;
  by_error_class: Record<string, number>;
  by_root_cause: Record<string, number>;
  by_severity: Record<string, number>;
  by_source: Record<string, number>;
  confirmation_rate: number;
  rejection_rate: number;
  pending_count: number;
  mined_count: number;
  unmined_confirmed: number;
}

interface Labels {
  error_classes: Record<string, string>;
  root_causes: Record<string, string>;
  severities: Record<string, string>;
  triage_states: Record<string, string>;
  feedback_sources: Record<string, string>;
}

const STATE_COLORS: Record<string, string> = {
  candidate: "bg-blue-100 text-blue-800 border-blue-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-gray-100 text-gray-800 border-gray-200",
  needs_info: "bg-amber-100 text-amber-800 border-amber-200",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const VERDICT_COLORS: Record<string, string> = {
  correct: "bg-green-100 text-green-800",
  incorrect: "bg-red-100 text-red-800",
  incomplete: "bg-yellow-100 text-yellow-800",
};

// ── Page ──────────────────────────────────────────────────────────────

export default function FeedbackTriagePage() {
  const queryClient = useQueryClient();
  const [filterState, setFilterState] = useState<string>("candidate");
  const [selectedEntry, setSelectedEntry] = useState<TriageEntry | null>(null);
  const [decision, setDecision] = useState<"confirm" | "reject" | "needs_info">("confirm");
  const [errorClass, setErrorClass] = useState<string>("");
  const [rootCause, setRootCause] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [correction, setCorrection] = useState<string>("");
  const [reviewNotes, setReviewNotes] = useState<string>("");

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["triage-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/feedback-triage?action=stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const json = await res.json();
      return json.data as TriageStats;
    },
    refetchInterval: 30_000,
  });

  const { data: labelsData } = useQuery({
    queryKey: ["triage-labels"],
    queryFn: async () => {
      const res = await fetch("/api/admin/feedback-triage?action=labels");
      if (!res.ok) throw new Error("Failed to fetch labels");
      const json = await res.json();
      return json.data as Labels;
    },
    staleTime: Infinity,
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ["triage-queue", filterState],
    queryFn: async () => {
      const params = new URLSearchParams({ action: "queue" });
      if (filterState !== "all") params.set("state", filterState);
      const res = await fetch(`/api/admin/feedback-triage?${params}`);
      if (!res.ok) throw new Error("Failed to fetch queue");
      const json = await res.json();
      return json.data as { entries: TriageEntry[]; total: number };
    },
    refetchInterval: 15_000,
  });

  const decideMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/feedback-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", ...payload }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["triage-stats"] });
      queryClient.invalidateQueries({ queryKey: ["triage-queue"] });
      setSelectedEntry(null);
      setCorrection("");
      setReviewNotes("");
    },
  });

  const handleOpenReview = (entry: TriageEntry) => {
    setSelectedEntry(entry);
    setDecision("confirm");
    setErrorClass("");
    setRootCause("");
    setSeverity("");
    setCorrection("");
    setReviewNotes("");
  };

  const handleSubmitDecision = useCallback(() => {
    if (!selectedEntry) return;
    const payload: Record<string, unknown> = {
      triage_id: selectedEntry.id,
      decision,
    };
    if (decision === "confirm") {
      payload.error_class = errorClass;
      payload.root_cause = rootCause;
      payload.severity = severity;
      payload.correction = correction;
    }
    if (reviewNotes) payload.review_notes = reviewNotes;
    decideMutation.mutate(payload);
  }, [
    selectedEntry,
    decision,
    errorClass,
    rootCause,
    severity,
    correction,
    reviewNotes,
    decideMutation,
  ]);

  const stats = statsData;
  const labels = labelsData;
  const entries = queueData?.entries ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback-Triage"
        description="Nutzerfeedback → Kandidat → Jurist bestätigt Fehlerklasse, Korrektur & Root Cause"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin", href: "/dashboard/admin" },
          { label: "Feedback-Triage" },
        ]}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Gesamt</p>
                <p className="text-2xl font-bold">{stats?.total ?? "—"}</p>
              </div>
              <ClipboardList className="text-muted-foreground h-8 w-8" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Wartend</p>
                <p className="text-2xl font-bold">{stats?.pending_count ?? "—"}</p>
              </div>
              <Inbox className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Bestätigt</p>
                <p className="text-2xl font-bold">
                  {stats ? `${(stats.confirmation_rate * 100).toFixed(0)}%` : "—"}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Unmined Fixtures</p>
                <p className="text-2xl font-bold">{stats?.unmined_confirmed ?? "—"}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <Filter className="text-muted-foreground h-4 w-4" />
        <Select value={filterState} onValueChange={setFilterState}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter nach Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="candidate">Kandidaten</SelectItem>
            <SelectItem value="confirmed">Bestätigt</SelectItem>
            <SelectItem value="rejected">Zurückgewiesen</SelectItem>
            <SelectItem value="needs_info">Info benötigt</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["triage-queue"] })}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Aktualisieren
        </Button>
      </div>

      {/* Queue */}
      <div className="space-y-3">
        {queueLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-12 text-center">
              Keine Einträge in diesem Filter
            </CardContent>
          </Card>
        ) : (
          entries.map((entry) => (
            <Card key={entry.id} className="transition-shadow hover:shadow-md">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="default" className={STATE_COLORS[entry.triage_state] ?? ""}>
                        {labels?.triage_states[entry.triage_state] ?? entry.triage_state}
                      </Badge>
                      <Badge variant="default" className={VERDICT_COLORS[entry.user_verdict] ?? ""}>
                        {entry.user_verdict}
                      </Badge>
                      {entry.jurisdiction && <Badge variant="accent">{entry.jurisdiction}</Badge>}
                      {entry.severity && (
                        <Badge variant="default" className={SEVERITY_COLORS[entry.severity] ?? ""}>
                          {labels?.severities[entry.severity] ?? entry.severity}
                        </Badge>
                      )}
                      {entry.mined_to_fixture && (
                        <Badge variant="success">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Gemined
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm font-medium">{entry.query}</p>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                      {entry.answer_excerpt}
                    </p>
                    {entry.user_comment && (
                      <p className="text-muted-foreground mt-1 text-xs italic">
                        &ldquo;{entry.user_comment}&rdquo;
                      </p>
                    )}
                    {entry.error_class && labels && (
                      <p className="mt-1 text-xs">
                        <span className="text-muted-foreground">Fehlerklasse:</span>{" "}
                        {labels.error_classes[entry.error_class] ?? entry.error_class}
                      </p>
                    )}
                    {entry.root_cause && labels && (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Root Cause:</span>{" "}
                        {labels.root_causes[entry.root_cause] ?? entry.root_cause}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-1 text-xs">
                      {new Date(entry.created_at).toLocaleString("de-DE")}
                    </p>
                  </div>
                  {entry.triage_state === "candidate" && (
                    <Button size="sm" variant="outline" onClick={() => handleOpenReview(entry)}>
                      Review
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Review Dialog */}
      <Dialog
        open={selectedEntry !== null}
        onOpenChange={(open) => !open && setSelectedEntry(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Triage-Review</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm font-medium">Query:</p>
                <p className="text-muted-foreground bg-muted rounded p-2 text-sm">
                  {selectedEntry.query}
                </p>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">AI-Antwort:</p>
                <p className="text-muted-foreground bg-muted rounded p-2 text-sm">
                  {selectedEntry.answer_excerpt}
                </p>
              </div>
              {selectedEntry.user_comment && (
                <div>
                  <p className="mb-1 text-sm font-medium">Nutzer-Kommentar:</p>
                  <p className="text-muted-foreground text-sm italic">
                    &ldquo;{selectedEntry.user_comment}&rdquo;
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={decision === "confirm" ? "primary" : "outline"}
                  onClick={() => setDecision("confirm")}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Bestätigen
                </Button>
                <Button
                  size="sm"
                  variant={decision === "reject" ? "primary" : "outline"}
                  onClick={() => setDecision("reject")}
                >
                  <XCircle className="mr-1 h-3 w-3" />
                  Zurückweisen
                </Button>
                <Button
                  size="sm"
                  variant={decision === "needs_info" ? "primary" : "outline"}
                  onClick={() => setDecision("needs_info")}
                >
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Info benötigt
                </Button>
              </div>

              {decision === "confirm" && labels && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium">Fehlerklasse</label>
                      <Select value={errorClass} onValueChange={setErrorClass}>
                        <SelectTrigger>
                          <SelectValue placeholder="Wählen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(labels.error_classes).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Root Cause</label>
                      <Select value={rootCause} onValueChange={setRootCause}>
                        <SelectTrigger>
                          <SelectValue placeholder="Wählen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(labels.root_causes).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Severity</label>
                      <Select value={severity} onValueChange={setSeverity}>
                        <SelectTrigger>
                          <SelectValue placeholder="Wählen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(labels.severities).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Korrektur (min. 10 Zeichen)</label>
                    <Textarea
                      value={correction}
                      onChange={(e) => setCorrection(e.target.value)}
                      placeholder="Was hätte die AI antworten sollen?"
                      rows={3}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium">Review-Notizen</label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Optionale Notizen..."
                  rows={2}
                />
              </div>

              {decideMutation.isError && (
                <p className="text-sm text-red-600">
                  {decideMutation.error instanceof Error
                    ? decideMutation.error.message
                    : "Fehler aufgetreten"}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedEntry(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={handleSubmitDecision}
              disabled={
                decideMutation.isPending || (decision === "confirm" && correction.length < 10)
              }
            >
              {decideMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Entscheidung speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
