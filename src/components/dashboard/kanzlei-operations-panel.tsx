"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSearch,
  Inbox,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLang } from "@/lib/use-lang";

interface OperationsData {
  items: Array<{
    id: string;
    kind: string;
    title: string;
    summary: string;
    priority: string;
    status: string;
    caseSlug?: string;
    dueAt?: string;
    pipelineStage?: string;
    currentLayer?: number;
    error?: string;
  }>;
  counts?: Record<string, number>;
}

async function loadOperations(): Promise<OperationsData> {
  const response = await fetch("/api/dashboard/operations?limit=200", {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Operationsdaten konnten nicht geladen werden.");
  const payload = (await response.json()) as { data?: OperationsData };
  return payload.data ?? { items: [], counts: {} };
}

export function KanzleiOperationsPanel() {
  const { lang } = useLang();
  const query = useQuery({
    queryKey: ["kanzlei-operations"],
    queryFn: loadOperations,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }
  if (query.isError) {
    return (
      <div
        className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4 text-sm text-[color:var(--ds-danger-text)]"
        role="alert"
      >
        Operationsdaten konnten nicht geladen werden.{" "}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void query.refetch()}
          className="h-auto p-0 underline"
        >
          Erneut versuchen
        </Button>
      </div>
    );
  }

  const counts = query.data?.counts ?? {};
  const total = query.data?.items.length ?? 0;
  const items = query.data?.items.slice(0, 5) ?? [];
  const itemLabel = (kind: string) =>
    ({
      communication: lang === "en" ? "Communication" : "Kommunikation",
      document_review: lang === "en" ? "Document review" : "Dokumentprüfung",
      case_analysis: lang === "en" ? "Case analysis" : "Fallanalyse",
      approval: lang === "en" ? "Approval" : "Freigabe",
      deadline: lang === "en" ? "Deadline" : "Frist",
      appointment: lang === "en" ? "Appointment" : "Termin",
    })[kind] ?? kind;
  const statusLabel = (item: { status: string; pipelineStage?: string; currentLayer?: number }) => {
    const stage = item.pipelineStage ?? item.status;
    const labels: Record<string, string> = {
      // Document lifecycle
      received: "Empfangen",
      stored: "Gespeichert",
      ocr: "OCR/Extraktion",
      embedding: "Embedding",
      embedded: "Copilot-bereit",
      // Case analysis stages
      running: item.currentLayer
        ? lang === "en"
          ? `Analyzing (step ${item.currentLayer}/7)`
          : `Wird analysiert (Schritt ${item.currentLayer}/7)`
        : lang === "en"
          ? "Running"
          : "Läuft",
      awaiting_review: "Anwaltliche Prüfung",
      needs_human_review: "Menschliche Prüfung",
      completed: "Abgeschlossen",
      completed_with_warnings: "Mit Warnungen",
      revised: "Überarbeitet",
      failed: "Fehler",
      // Generic
      processing: "In Verarbeitung",
      pending: "Ausstehend",
    };
    return labels[stage] ?? stage;
  };
  const itemHref = (kind: string, caseSlug?: string) =>
    ({
      communication: "/dashboard/communications",
      document_review: "/dashboard/review-queue",
      case_analysis: caseSlug ? `/dashboard/cases/${caseSlug}` : "/dashboard/cases",
      approval: "/dashboard/approvals",
      deadline: "/dashboard/deadlines",
      appointment: "/dashboard/calendar",
    })[kind] ?? "/dashboard";
  const actions = [
    {
      href: "/dashboard/communications",
      label: lang === "en" ? "Open communications" : "Kommunikation öffnen",
      count: counts.communication ?? 0,
      icon: Inbox,
    },
    {
      href: "/dashboard/approvals",
      label: lang === "en" ? "Review approvals" : "Freigaben prüfen",
      count: counts.approval ?? 0,
      icon: ShieldCheck,
    },
    {
      href: "/dashboard/review-queue",
      label: lang === "en" ? "Review documents" : "Dokumente prüfen",
      count: counts.document_review ?? 0,
      icon: FileSearch,
    },
    {
      href: "/dashboard/cases",
      label: lang === "en" ? "Case analysis" : "Fallanalyse",
      count: counts.case_analysis ?? 0,
      icon: Scale,
    },
    {
      href: "/dashboard/deadlines",
      label: lang === "en" ? "Check deadlines" : "Fristen prüfen",
      count: (counts.critical ?? 0) + (counts.high ?? 0),
      icon: Clock,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-[color:var(--ds-border)]">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck size={17} className="text-[color:var(--brand-primary)]" />
            {lang === "en" ? "Law firm operations" : "Kanzlei-Operationen"}
          </CardTitle>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {lang === "en"
              ? "The next actions across your matters."
              : "Die nächsten Aktionen über alle Akten hinweg."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/operations"
            className="text-xs font-medium text-[color:var(--brand-primary)] transition-colors hover:text-[color:var(--brand-primary-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
          >
            {lang === "en" ? "View all" : "Alle anzeigen"}
          </Link>
          <Badge
            variant="default"
            className="border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
          >
            {total} {lang === "en" ? "items" : "Vorgänge"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        {actions.map(({ href, label, count, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 transition-all hover:-translate-y-0.5 hover:border-[color:var(--ds-border-strong)] hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <Icon size={16} className="text-[color:var(--brand-primary)]" />
              <span className="text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">
                {count}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs font-medium text-[color:var(--ds-text-muted)] group-hover:text-[color:var(--ds-text)]">
              <span>{label}</span>
              <ArrowRight size={12} />
            </div>
          </Link>
        ))}
        {total === 0 && (
          <div className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)] sm:col-span-2 lg:col-span-5">
            <CheckCircle2 size={16} className="text-[color:var(--ds-success-text)]" /> Keine offenen
            Vorgänge.
          </div>
        )}
      </CardContent>
      {items.length > 0 && (
        <div className="border-t border-[color:var(--ds-border)] px-4 py-3">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
            {lang === "en" ? "Next actions" : "Nächste Aktionen"}
          </h3>
          <ul className="divide-y divide-[color:var(--ds-border)]">
            {items.map((item) => {
              const isFailed = item.pipelineStage === "failed" || item.status === "failed";
              return (
                <li key={item.id}>
                  <Link
                    href={itemHref(item.kind, item.caseSlug)}
                    className="group flex min-h-11 items-center gap-3 py-2 text-sm transition-colors hover:text-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1 truncate text-[color:var(--ds-text)]">
                      {item.title}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge
                        variant="default"
                        className={
                          isFailed
                            ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[10px] text-[color:var(--ds-danger-text)]"
                            : "text-[10px]"
                        }
                      >
                        {itemLabel(item.kind)}
                      </Badge>
                      <span
                        className={`max-w-32 truncate text-[10px] ${isFailed ? "text-[color:var(--ds-danger-text)]" : "text-[color:var(--ds-text-muted)]"}`}
                      >
                        {statusLabel(item)}
                      </span>
                    </div>
                    <ArrowRight
                      size={13}
                      className="shrink-0 text-[color:var(--ds-text-muted)] transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
