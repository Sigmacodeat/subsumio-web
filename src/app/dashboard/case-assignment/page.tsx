"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, UserPlus, Mail, Crown } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTeam } from "@/lib/queries/settings";
import { cn, encodeSlugPath } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";

interface CasePage {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
}

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface CaseAssignment {
  caseSlug: string;
  caseTitle: string;
  caseStatus: string;
  lawyerId?: string;
  lawyerName?: string;
  lawyerSlug?: string;
  legalArea?: string;
  priority?: string;
  caseNumber?: string;
}

async function fetchCaseAssignments(): Promise<CaseAssignment[]> {
  // listAllPages pages past the engine's 200-row cap and drops tombstones;
  // archived matters need no owner, so they are left out of the workload.
  const pages = await api.brain.listAllPages({ type: "legal_case" });
  return (pages as CasePage[])
    .filter((p) => String(p.frontmatter?.status ?? "") !== "archived")
    .map((p) => {
      const fm = p.frontmatter ?? {};
      return {
        caseSlug: p.slug,
        caseTitle: p.title,
        caseStatus: String(fm.status ?? "active"),
        lawyerId: fm.own_lawyer_id as string | undefined,
        lawyerName: fm.own_lawyer_name as string | undefined,
        lawyerSlug: fm.own_lawyer_slug as string | undefined,
        legalArea: fm.legal_area as string | undefined,
        priority: fm.priority as string | undefined,
        caseNumber: fm.case_number as string | undefined,
      };
    });
}

export default function CaseAssignmentPage() {
  const { addToast } = useToast();
  const { t, lang } = useLang();
  const isEn = lang === "en";
  const queryClient = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [assigningSlug, setAssigningSlug] = useState<string | null>(null);
  // Sections showing all their matters instead of the first 10.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const teamQuery = useTeam();
  const assignmentsQuery = useQuery({
    queryKey: ["case-assignments"],
    queryFn: fetchCaseAssignments,
    staleTime: 30_000,
  });

  const teamMembers: TeamMember[] = useMemo(
    () => teamQuery.data?.members ?? [],
    [teamQuery.data?.members]
  );
  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data]);

  // Group assignments by lawyer
  const byLawyer = useMemo(() => {
    const map = new Map<string, { member: TeamMember | null; cases: CaseAssignment[] }>();

    // Initialize all team members (keyed by e-mail — the id written on assignment)
    for (const member of teamMembers) {
      map.set(member.email, { member, cases: [] });
    }
    map.set("__unassigned__", { member: null, cases: [] });

    for (const assignment of assignments) {
      // Match on the stored id (e-mail) first, then on the display name, so a
      // member is never listed twice (once with cases, once empty).
      const member =
        teamMembers.find((m) => assignment.lawyerId && m.email === assignment.lawyerId) ??
        teamMembers.find((m) => assignment.lawyerName && m.name === assignment.lawyerName);
      const key = member?.email ?? assignment.lawyerName ?? "__unassigned__";
      if (!map.has(key)) {
        map.set(key, { member: null, cases: [] });
      }
      map.get(key)!.cases.push(assignment);
    }

    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "__unassigned__") return 1;
      if (b[0] === "__unassigned__") return -1;
      return b[1].cases.length - a[1].cases.length;
    });
  }, [teamMembers, assignments]);

  const unassignedCount = assignments.filter((a) => !a.lawyerName).length;
  const totalAssigned = assignments.length - unassignedCount;

  const assignLawyer = async (caseSlug: string, lawyerName: string, lawyerEmail: string) => {
    setAssigningSlug(caseSlug);
    try {
      const res = await csrfFetch(
        "/api/pages/" + caseSlug.split("/").map(encodeURIComponent).join("/"),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merge: true,
            frontmatter: {
              own_lawyer_id: lawyerEmail,
              own_lawyer_name: lawyerName,
            },
          }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const title = assignments.find((a) => a.caseSlug === caseSlug)?.caseTitle ?? caseSlug;
      addToast({
        type: "success",
        title: isEn ? "Case assigned" : "Akte zugewiesen",
        description: `${title} → ${lawyerName}`,
        duration: 3000,
      });
      void queryClient.invalidateQueries({ queryKey: ["case-assignments"] });
    } catch {
      addToast({
        type: "error",
        title: isEn ? "Assignment failed" : "Zuweisung fehlgeschlagen",
        description: isEn
          ? "The case was not changed. Please try again."
          : "Die Akte wurde nicht geändert. Bitte versuchen Sie es erneut.",
        duration: 5000,
      });
    } finally {
      setAssigningSlug(null);
    }
  };

  const isLoading = teamQuery.isLoading || assignmentsQuery.isLoading;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("nav.case_assignment")}
        description={
          isEn
            ? "Assign a responsible lawyer to each active case and see the workload per person."
            : "Jeder aktiven Akte einen Sachbearbeiter zuweisen und die Auslastung je Person sehen."
        }
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("cases.title"), href: "/dashboard/cases" },
          { label: t("nav.case_assignment") },
        ]}
      />

      {/* Stats — neutral tiles; only a non-zero "unassigned" gets a signal colour */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] lg:grid-cols-4">
        {[
          { label: isEn ? "Team members" : "Teammitglieder", value: teamMembers.length, tone: "" },
          { label: isEn ? "Active cases" : "Aktive Akten", value: assignments.length, tone: "" },
          { label: isEn ? "Assigned" : "Zugewiesen", value: totalAssigned, tone: "" },
          {
            label: isEn ? "Unassigned" : "Ohne Sachbearbeiter",
            value: unassignedCount,
            tone: "text-[color:var(--ds-warning-text)]",
          },
        ].map((k) => (
          <div key={k.label} className="bg-[color:var(--ds-surface)] px-4 py-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">{k.label}</div>
            <div
              className={cn(
                "mt-1 text-2xl leading-none font-semibold tabular-nums",
                k.value > 0 && k.tone ? k.tone : "text-[color:var(--ds-text)]"
              )}
            >
              {isLoading ? <Skeleton className="h-6 w-8" /> : k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isEn ? "Search cases …" : "Akten durchsuchen …"}
          aria-label={isEn ? "Search cases" : "Akten durchsuchen"}
          className="pl-9"
        />
      </div>

      {/* Team workload sections */}
      {isLoading ? (
        <div className="space-y-3" role="status" aria-live="polite">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : assignmentsQuery.isError || teamQuery.isError ? (
        <EmptyState
          title={isEn ? "Assignments could not be loaded" : "Zuweisungen konnten nicht geladen werden"}
          description={
            isEn
              ? "This is a loading error, not an empty list."
              : "Das ist ein Ladefehler, keine leere Liste."
          }
          actionLabel={isEn ? "Try again" : "Erneut versuchen"}
          onAction={() => {
            void assignmentsQuery.refetch();
            void teamQuery.refetch();
          }}
        />
      ) : assignments.length === 0 ? (
        <EmptyState
          title={isEn ? "No active cases" : "Keine aktiven Akten"}
          description={
            isEn
              ? "As soon as cases exist, you can assign them here."
              : "Sobald Akten angelegt sind, können Sie sie hier zuweisen."
          }
          actionLabel={t("cases.new")}
          onAction={() => router.push("/dashboard/cases/new")}
        />
      ) : (
        <div className="space-y-4">
          {byLawyer.map(([key, group]) => {
            const lawyerKey = key;
            const isUnassigned = key === "__unassigned__";
            const member = group.member;
            const cases = search
              ? group.cases.filter(
                  (c) =>
                    c.caseTitle.toLowerCase().includes(search.toLowerCase()) ||
                    (c.caseNumber ?? "").toLowerCase().includes(search.toLowerCase())
                )
              : group.cases;

            if (cases.length === 0 && search) return null;

            return (
              <section
                key={key}
                className={cn(
                  "rounded-xl border p-4",
                  "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                )}
              >
                {/* Section header */}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isUnassigned ? (
                      <UserPlus size={16} className="text-[color:var(--ds-warning-text)]" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]">
                        <span className="text-xs font-semibold text-[color:var(--ds-text-muted)]">
                          {(member?.name ?? key).charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                          {isUnassigned
                            ? isEn
                              ? "Unassigned"
                              : "Ohne Sachbearbeiter"
                            : (member?.name ?? key)}
                        </span>
                        <Badge variant="default" className="text-xs">
                          {cases.length}{" "}
                          {isEn
                            ? cases.length === 1
                              ? "case"
                              : "cases"
                            : cases.length === 1
                              ? "Akte"
                              : "Akten"}
                        </Badge>
                        {member?.role === "owner" && (
                          <Crown
                            size={12}
                            className="text-[color:var(--ds-text-muted)]"
                            aria-label={isEn ? "Owner" : "Inhaber"}
                          />
                        )}
                      </div>
                      {member?.email && (
                        <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                          <Mail size={10} />
                          {member.email}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Case list */}
                {cases.length === 0 ? (
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {isEn ? "No cases assigned." : "Keine Akten zugewiesen."}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {(expanded.has(lawyerKey) ? cases : cases.slice(0, 10)).map((c) => {
                      // Members are identified by e-mail — a member without a
                      // display name must be assignable too.
                      const currentMember =
                        teamMembers.find((m) => c.lawyerId && m.email === c.lawyerId) ??
                        teamMembers.find((m) => c.lawyerName && m.name === c.lawyerName);
                      return (
                        <div
                          key={c.caseSlug}
                          className="flex items-center justify-between gap-2 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-3 py-2"
                        >
                          <Link
                            href={`/dashboard/cases/${encodeSlugPath(c.caseSlug)}`}
                            className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
                          >
                            {c.caseNumber && (
                              <span className="hidden shrink-0 font-mono text-xs text-[color:var(--ds-text-muted)] tabular-nums sm:inline">
                                {c.caseNumber}
                              </span>
                            )}
                            <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                              {c.caseTitle}
                            </span>
                            {c.legalArea && (
                              <span className="hidden shrink-0 text-xs text-[color:var(--ds-text-muted)] md:inline">
                                {c.legalArea}
                              </span>
                            )}
                            {(c.priority === "high" || c.priority === "critical") && (
                              <Badge variant="warning" className="shrink-0 text-xs">
                                {isEn
                                  ? c.priority === "critical"
                                    ? "Critical"
                                    : "High"
                                  : c.priority === "critical"
                                    ? "Kritisch"
                                    : "Hoch"}
                              </Badge>
                            )}
                          </Link>

                          {/* Assign dropdown */}
                          {assigningSlug === c.caseSlug ? (
                            <Loader2
                              size={14}
                              className="shrink-0 animate-spin text-[color:var(--ds-text-muted)]"
                            />
                          ) : (
                            <select
                              aria-label={
                                isEn
                                  ? `Responsible lawyer for ${c.caseTitle}`
                                  : `Sachbearbeiter für ${c.caseTitle}`
                              }
                              value={currentMember?.email ?? ""}
                              onChange={(e) => {
                                const selected = teamMembers.find((m) => m.email === e.target.value);
                                if (selected) {
                                  void assignLawyer(
                                    c.caseSlug,
                                    selected.name ?? selected.email,
                                    selected.email
                                  );
                                }
                              }}
                              className="shrink-0 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                            >
                              <option value="">{isEn ? "Assign …" : "Zuweisen …"}</option>
                              {teamMembers.map((m) => (
                                <option key={m.id} value={m.email}>
                                  {m.name ?? m.email}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                    {cases.length > 10 && (
                      <button
                        type="button"
                        className="px-1 text-xs text-[color:var(--brand-primary)] hover:underline"
                        aria-expanded={expanded.has(lawyerKey)}
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(lawyerKey)) next.delete(lawyerKey);
                            else next.add(lawyerKey);
                            return next;
                          })
                        }
                      >
                        {expanded.has(lawyerKey)
                          ? isEn
                            ? "Show fewer"
                            : "Weniger anzeigen"
                          : isEn
                            ? `Show all (+${cases.length - 10})`
                            : `Alle anzeigen (+${cases.length - 10} weitere)`}
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
