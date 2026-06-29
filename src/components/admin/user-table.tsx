"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronRight, UserX } from "lucide-react";
import { PlanBadge } from "@/components/admin/admin-stat-card";
import type { PublicUser } from "@/lib/auth/store";

interface UserTableProps {
  users: PublicUser[];
}

type PlanFilter = "all" | "free" | "pro" | "team" | "enterprise";
type RoleFilter = "all" | "admin" | "lawyer" | "tax_advisor" | "assistant" | "client_viewer";
type IndustryFilter = "all" | "legal" | "tax" | "other" | "none";

function industryBadgeClass(industry: string | null | undefined): string {
  if (industry === "legal") return "border-blue-500/25 bg-blue-500/10 text-blue-400";
  if (industry === "tax") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-400";
  if (industry === "other") return "border-violet-500/25 bg-violet-500/10 text-violet-400";
  return "[border-color:var(--mk-border)] [color:var(--mk-text-subtle)] [background:var(--mk-surface-2)]";
}

export function UserTable({ users }: UserTableProps) {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "deactivated">("all");
  const [industryFilter, setIndustryFilter] = useState<IndustryFilter>("all");

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        if (!u.email.toLowerCase().includes(q) && !u.name.toLowerCase().includes(q)) return false;
      }
      if (planFilter !== "all" && u.plan !== planFilter) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && u.deactivatedAt) return false;
      if (statusFilter === "deactivated" && !u.deactivatedAt) return false;
      if (industryFilter !== "all") {
        if (industryFilter === "none" && u.industry) return false;
        if (industryFilter !== "none" && u.industry !== industryFilter) return false;
      }
      return true;
    });
  }, [users, search, planFilter, roleFilter, statusFilter, industryFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 [color:var(--mk-text-subtle)]"
          />
          <input
            type="text"
            placeholder="Suche nach Name oder E-Mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border [border-color:var(--mk-border)] py-2 pr-3 pl-9 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
          className="rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          <option value="all">Alle Pläne</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="team">Team</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          className="rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          <option value="all">Alle Rollen</option>
          <option value="admin">Admin</option>
          <option value="lawyer">Lawyer</option>
          <option value="tax_advisor">Tax Advisor</option>
          <option value="assistant">Assistant</option>
          <option value="client_viewer">Client Viewer</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "deactivated")}
          className="rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          <option value="all">Alle Status</option>
          <option value="active">Aktiv</option>
          <option value="deactivated">Deaktiviert</option>
        </select>
        <select
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value as IndustryFilter)}
          className="rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          <option value="all">Alle Branchen</option>
          <option value="legal">Legal</option>
          <option value="tax">Tax</option>
          <option value="other">Other</option>
          <option value="none">Ohne</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b [border-color:var(--mk-border)] text-left text-xs tracking-wider [color:var(--mk-text-subtle)] uppercase">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">E-Mail</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Rolle</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Branche</th>
                <th className="px-5 py-3 font-medium">Registriert</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center [color:var(--mk-text-subtle)]">
                    Keine Benutzer gefunden.
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className="border-b [border-color:var(--mk-border)]/50 last:border-0 hover:[background:var(--mk-surface)]/50"
                >
                  <td className="px-5 py-3 font-medium [color:var(--mk-text)]">{u.name}</td>
                  <td className="px-5 py-3 [color:var(--mk-text-muted)]">{u.email}</td>
                  <td className="px-5 py-3">
                    <PlanBadge plan={u.plan} />
                  </td>
                  <td className="px-5 py-3 [color:var(--mk-text-muted)] capitalize">{u.role}</td>
                  <td className="px-5 py-3">
                    {u.deactivatedAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-rose-400">
                        <UserX size={12} /> Inaktiv
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-400">Aktiv</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${industryBadgeClass(u.industry)}`}
                    >
                      {u.industry ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs [color:var(--mk-text-subtle)]">
                    {u.createdAt.slice(0, 10)}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="inline-flex items-center gap-1 text-xs [color:var(--mk-text-muted)] hover:[color:var(--brand-primary)]"
                    >
                      Details <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs [color:var(--mk-text-subtle)]">
        {filtered.length} von {users.length} Benutzern
      </p>
    </div>
  );
}
