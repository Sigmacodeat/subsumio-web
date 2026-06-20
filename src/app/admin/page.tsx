// SaaS admin — customers, plans, referral attribution, audit trail.
// Server component; middleware already gates this to role=admin, and we
// double-check server-side (defense in depth).

import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, CreditCard, Gift, Shield, ArrowLeft, ClipboardList, MessageSquare, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSessionUser } from "@/lib/auth/server";
import { getStore } from "@/lib/auth/store";
import { listMarketingLeads } from "@/lib/marketing/leads";
import AuditTrail from "@/components/admin/audit-trail";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

function TabLink({ href, icon: Icon, label, active }: { href: string; icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
        active
          ? "brand-soft brand-border brand-text"
          : "bg-[#0a0a18] border-[#1e1e3a] text-[#8888aa] hover:text-[#e8e8f0] hover:border-[#3a3a6a]"
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
}

export default async function AdminPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const tab = params?.tab || "customers";

  const users = await getStore().list();
  const leads = await listMarketingLeads();
  const paying = users.filter((u) => u.plan !== "free");
  const referred = users.filter((u) => u.referredBy);
  const mrr = paying.reduce((sum, u) => sum + (u.plan === "pro" ? 79 : u.plan === "team" ? 290 : 0), 0);

  const referralCounts = new Map<string, number>();
  for (const u of referred) {
    referralCounts.set(u.referredBy!, (referralCounts.get(u.referredBy!) ?? 0) + 1);
  }

  // Ebene-2-Attribution (Zwei-Stufen-Partnerprogramm, hart bei 2 gedeckelt):
  // X bekommt Ebene-2-Zählung für Kunden, die von X' direkt Geworbenen geworben
  // wurden. Berechnet aus der bestehenden referredBy-Kette — kein Schema-Change.
  const byCode = new Map(users.map((u) => [u.referralCode, u] as const));
  const indirectCounts = new Map<string, number>();
  let level2Total = 0;
  for (const u of referred) {
    const directReferrer = byCode.get(u.referredBy!);
    if (directReferrer?.referredBy) {
      indirectCounts.set(
        directReferrer.referredBy,
        (indirectCounts.get(directReferrer.referredBy) ?? 0) + 1,
      );
      level2Total++;
    }
  }

  const stats = [
    { icon: Users, label: "Kunden gesamt", value: String(users.length) },
    { icon: CreditCard, label: "Zahlende Kunden", value: String(paying.length) },
    { icon: CreditCard, label: "MRR", value: `${mrr} €` },
    { icon: Gift, label: "Über Empfehlung", value: String(referred.length) },
    { icon: Gift, label: "davon Ebene 2", value: String(level2Total) },
    { icon: MessageSquare, label: "Sales-Leads", value: String(leads.length) },
  ];

  return (
    <div data-tone="dark" className="min-h-screen bg-[#06060f] px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield size={18} className="brand-text" />
              <h1 className="text-2xl font-bold text-[#e8e8f0]">Admin</h1>
            </div>
            <p className="text-sm text-[#8888aa]">Kunden, Pläne und Empfehlungs-Statistik</p>
          </div>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-[#8888aa] hover:text-[#e8e8f0]">
            <ArrowLeft size={14} /> Zum Dashboard
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="p-5 rounded-xl border border-[#1e1e3a] bg-[#0d0d1a]">
                <Icon size={16} className="brand-text mb-3" />
                <p className="text-2xl font-black text-[#e8e8f0]">{s.value}</p>
                <p className="text-xs text-[#8888aa] mt-0.5">{s.label}</p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <TabLink href="/admin" icon={Users} label="Kunden" active={tab === "customers"} />
          <TabLink href="/admin?tab=leads" icon={MessageSquare} label="Sales-Leads" active={tab === "leads"} />
          <TabLink href="/admin?tab=audit" icon={ClipboardList} label="Audit-Trail" active={tab === "audit"} />
          <TabLink href="/admin/mailbox" icon={Mail} label="Mailbox" />
        </div>

        {tab === "audit" ? (
          <AuditTrail />
        ) : tab === "leads" ? (
          <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e1e3a]">
              <h2 className="text-sm font-semibold text-[#e8e8f0]">Sales-Leads aus dem Product Advisor</h2>
              <p className="text-xs text-[#8888aa] mt-1">
                Nur Chats mit expliziter Zustimmung werden gespeichert.
              </p>
            </div>
            <div className="divide-y divide-[#1e1e3a]">
              {leads.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-[#7878a0]">
                  Noch keine gespeicherten Advisor-Leads.
                </div>
              )}
              {leads.map((lead) => (
                <div key={lead.id} className="p-5 hover:bg-[#12122a]/45">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[#e8e8f0]">{lead.email}</h3>
                        <span className="rounded-full border brand-border brand-soft px-2 py-0.5 text-[11px] text-violet-300">
                          {lead.product} · {lead.plan}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          lead.leadScore === "enterprise"
                            ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                            : lead.leadScore === "high"
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                              : "border-[#2a2a4a] bg-[#111124] text-[#8888aa]"
                        }`}>
                          {lead.leadScore}
                        </span>
                      </div>
                      <p className="text-xs text-[#7878a0] mt-1">
                        {lead.createdAt.slice(0, 16).replace("T", " ")} · {lead.path}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-[#666684]">
                      Mail: {lead.notified.email ? "sent" : "not configured"} · Slack: {lead.notified.slack ? "sent" : "off"}
                    </div>
                  </div>
                  <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-[#1e1e3a] bg-[#080812] p-3 text-xs leading-relaxed text-[#aaaac4]">
                    {lead.summary}
                  </pre>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-violet-300 hover:text-violet-200">Transcript anzeigen</summary>
                    <div className="mt-3 space-y-2">
                      {lead.transcript.map((msg, i) => (
                        <div key={i} className={`rounded-lg border p-3 text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "brand-border brand-soft text-[#e8e8f0]"
                            : "border-[#1e1e3a] bg-[#080812] text-[#aaaac4]"
                        }`}>
                          <span className="font-semibold uppercase tracking-wider text-[10px] text-[#666684]">{msg.role}</span>
                          <p className="mt-1 whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Customers table */}
            <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1e1e3a]">
                <h2 className="text-sm font-semibold text-[#e8e8f0]">Kunden</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#7878a0] uppercase tracking-wider border-b border-[#1e1e3a]">
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">E-Mail</th>
                      <th className="px-5 py-3 font-medium">Plan</th>
                      <th className="px-5 py-3 font-medium">Rolle</th>
                      <th className="px-5 py-3 font-medium">Geworben von</th>
                      <th className="px-5 py-3 font-medium">Eigene Referrals</th>
                      <th className="px-5 py-3 font-medium">Ebene 2</th>
                      <th className="px-5 py-3 font-medium">Registriert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-10 text-center text-[#7878a0]">
                          Noch keine Kunden. Der erste Signup wird automatisch Admin.
                        </td>
                      </tr>
                    )}
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-[#1e1e3a]/50 last:border-0 hover:bg-[#12122a]/50">
                        <td className="px-5 py-3 text-[#e8e8f0] font-medium">{u.name}</td>
                        <td className="px-5 py-3 text-[#8888aa]">{u.email}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            u.plan === "free"
                              ? "bg-[#1e1e3a] text-[#8888aa]"
                              : "brand-soft/15 brand-text border brand-border"
                          }`}>
                            {u.plan}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[#8888aa] capitalize">{u.role}</td>
                        <td className="px-5 py-3 font-mono text-xs text-[#8888aa]">{u.referredBy ?? "—"}</td>
                        <td className="px-5 py-3 text-[#8888aa]">{referralCounts.get(u.referralCode) ?? 0}</td>
                        <td className="px-5 py-3 text-[#8888aa]">{indirectCounts.get(u.referralCode) ?? 0}</td>
                        <td className="px-5 py-3 text-[#7878a0] text-xs">{u.createdAt.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-[#7878a0]">
              Provisions-Auszahlungen an Affiliates laufen über das Affiliate-Tool (siehe Partnerprogramm;
              für die Zwei-Ebenen-Struktur braucht es FirstPromoter o. ä. — Rewardful kann kein natives 2-Tier) —
              diese Tabelle zeigt die produktinterne Attribution: direkte Referrals (Ebene 1) und
              Referrals der eigenen Geworbenen (Ebene 2).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
