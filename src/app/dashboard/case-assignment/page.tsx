"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Users, Loader2, Search, UserPlus, UserCheck, Mail, Crown, Briefcase } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { csrfFetch } from "@/lib/csrf";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTeam } from "@/lib/queries/settings";
import { cn } from "@/lib/utils";

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
}

async function fetchCaseAssignments(): Promise<CaseAssignment[]> {
  const pages = await api.brain.listPages({ type: "legal_case", limit: 500 });
  return (pages as CasePage[]).map((p) => {
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
    };
  });
}

export default function CaseAssignmentPage() {
  const { addToast } = useToast();
  const { t, lang } = useLang();
  const isEn = lang === "en";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [assigningSlug, setAssigningSlug] = useState<string | null>(null);
  const [selectedLawyer, setSelectedLawyer] = useState<string>("");

  const teamQuery = useTeam();
  const assignmentsQuery = useQuery({
    queryKey: ["case-assignments"],
    queryFn: fetchCaseAssignments,
    staleTime: 30_000,
  });

  const teamMembers: TeamMember[] = teamQuery.data?.members ?? [];
  const assignments = assignmentsQuery.data ?? [];

  // Group assignments by lawyer
  const byLawyer = useMemo(() => {
    const map = new Map<string, { member: TeamMember | null; cases: CaseAssignment[] }>();

    // Initialize all team members
    for (const member of teamMembers) {
      map.set(member.email, { member, cases: [] });
    }
    map.set("__unassigned__", { member: null, cases: [] });

    for (const assignment of assignments) {
      const key = assignment.lawyerName ?? "__unassigned__";
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

  const filteredAssignments = useMemo(() => {
    if (!search) return assignments;
    const q = search.toLowerCase();
    return assignments.filter(
      (a) => a.caseTitle.toLowerCase().includes(q) || a.caseSlug.toLowerCase().includes(q)
    );
  }, [assignments, search]);

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
      addToast({
        type: "success",
        title: isEn ? "Case assigned" : "Akte zugewiesen",
        description: `${caseSlug} → ${lawyerName}`,
        duration: 3000,
      });
      void queryClient.invalidateQueries({ queryKey: ["case-assignments"] });
    } catch (err) {
      addToast({
        type: "error",
        title: isEn ? "Assignment failed" : "Zuweisung fehlgeschlagen",
        description: err instanceof Error ? err.message : "Unknown error",
        duration: 5000,
      });
    } finally {
      setAssigningSlug(null);
    }
  };

  const isLoading = teamQuery.isLoading || assignmentsQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={isEn ? "Case Assignment & Team View" : "Akten-Zuweisung & Team-Übersicht"}
        description={
          isEn
            ? "Assign cases to team members and see workload distribution at a glance."
            : "Weisen Sie Akten Teammitgliedern zu und sehen Sie die Arbeitslastverteilung auf einen Blick."
        }
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: isEn ? "Team & Assignments" : "Team & Zuweisungen" },
        ]}
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[color:var(--ds-text-muted)]" />
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              {isEn ? "Team members" : "Teammitglieder"}
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-text)] tabular-nums">
            {teamMembers.length}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="flex items-center gap-2">
            <Briefcase size={16} className="text-[color:var(--ds-text-muted)]" />
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              {isEn ? "Total cases" : "Akten gesamt"}
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-text)] tabular-nums">
            {assignments.length}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-4">
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-[color:var(--ds-success-text)]" />
            <span className="text-xs text-[color:var(--ds-success-text)]">
              {isEn ? "Assigned" : "Zugewiesen"}
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-success-text)] tabular-nums">
            {totalAssigned}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-[color:var(--ds-warning-text)]" />
            <span className="text-xs text-[color:var(--ds-warning-text)]">
              {isEn ? "Unassigned" : "Unzugewiesen"}
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-[color:var(--ds-warning-text)] tabular-nums">
            {unassignedCount}
          </p>
        </div>
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
          placeholder={isEn ? "Search cases..." : "Akten durchsuchen..."}
          className="pl-9"
        />
      </div>

      {/* Team workload sections */}
      <div className="space-y-4">
        {byLawyer.map(([key, group]) => {
          const isUnassigned = key === "__unassigned__";
          const member = group.member;
          const cases = search
            ? group.cases.filter(
                (c) =>
                  c.caseTitle.toLowerCase().includes(search.toLowerCase()) ||
                  c.caseSlug.toLowerCase().includes(search.toLowerCase())
              )
            : group.cases;

          if (cases.length === 0 && search) return null;

          return (
            <section
              key={key}
              className={cn(
                "rounded-xl border p-4",
                isUnassigned
                  ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
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
                            : "Unzugewiesen"
                          : (member?.name ?? key)}
                      </span>
                      <Badge variant="default" className="text-xs">
                        {cases.length} {isEn ? "cases" : "Akten"}
                      </Badge>
                      {member?.role === "owner" && (
                        <Crown size={12} className="text-[color:var(--ds-warning-text)]" />
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
                  {isEn ? "No cases." : "Keine Akten."}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {cases.slice(0, 10).map((c) => {
                    const encoded = c.caseSlug.split("/").map(encodeURIComponent).join("/");
                    return (
                      <div
                        key={c.caseSlug}
                        className="flex items-center justify-between gap-2 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-3 py-2"
                      >
                        <Link
                          href={`/dashboard/cases/${encoded}`}
                          className="flex min-w-0 flex-1 items-center gap-2 hover:opacity-80"
                        >
                          <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                            {c.caseTitle}
                          </span>
                          {c.legalArea && (
                            <Badge variant="default" className="shrink-0 text-[10px]">
                              {c.legalArea}
                            </Badge>
                          )}
                          {c.priority === "high" && (
                            <Badge className="shrink-0 border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[10px] text-[color:var(--ds-danger-text)]">
                              {isEn ? "HIGH" : "HOCH"}
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
                            value={c.lawyerName ?? ""}
                            onChange={(e) => {
                              const selected = teamMembers.find((m) => m.name === e.target.value);
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
                            <option value="">{isEn ? "Assign..." : "Zuweisen..."}</option>
                            {teamMembers.map((m) => (
                              <option key={m.id} value={m.name ?? m.email}>
                                {m.name ?? m.email}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                  {cases.length > 10 && (
                    <p className="px-1 text-xs text-[color:var(--ds-text-subtle)]">
                      {isEn ? `+${cases.length - 10} more` : `+${cases.length - 10} weitere`}
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Unassigned cases quick-assign (if search is active and matches unassigned) */}
      {search && filteredAssignments.some((a) => !a.lawyerName) && (
        <section className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-warning-text)]">
            <UserPlus size={14} />
            {isEn ? "Unassigned cases" : "Unzugeordnete Akten"}
          </h3>
          <div className="space-y-1.5">
            {filteredAssignments
              .filter((a) => !a.lawyerName)
              .map((c) => {
                const encoded = c.caseSlug.split("/").map(encodeURIComponent).join("/");
                return (
                  <div
                    key={c.caseSlug}
                    className="flex items-center justify-between gap-2 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-3 py-2"
                  >
                    <Link
                      href={`/dashboard/cases/${encoded}`}
                      className="truncate text-sm text-[color:var(--ds-text)] hover:opacity-80"
                    >
                      {c.caseTitle}
                    </Link>
                    <select
                      value=""
                      onChange={(e) => {
                        const selected = teamMembers.find((m) => m.name === e.target.value);
                        if (selected)
                          void assignLawyer(
                            c.caseSlug,
                            selected.name ?? selected.email,
                            selected.email
                          );
                      }}
                      className="shrink-0 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                    >
                      <option value="">{isEn ? "Assign..." : "Zuweisen..."}</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.name ?? m.email}>
                          {m.name ?? m.email}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}
