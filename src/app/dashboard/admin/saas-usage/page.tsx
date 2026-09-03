// Admin SaaS Usage — internes Cost/Margin-Dashboard.
// Server component; layout.tsx already gates this to role=admin.

import { DollarSign } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { SaasUsageClient } from "@/components/admin/saas-usage-client";

export const metadata = { title: "SaaS Usage — Admin" };
export const dynamic = "force-dynamic";

export default async function SaasUsagePage() {
  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="SaaS Usage & Marge"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin", href: "/dashboard/admin" },
          { label: "SaaS Usage" },
        ]}
      />

      <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] p-4">
        <DollarSign size={18} className="text-[color:var(--ds-info-text)]" aria-hidden />
        <p className="text-xs leading-relaxed text-[color:var(--ds-info-text)]">
          Internes Cost-Tracking: LLM-Kosten (what we pay) vs Verkaufspreis (what customer pays) vs
          Marge (profit). Getrennt vom Credit-System — dies ist die Profitabilitäts-Analyse für
          Admins. Daten aus saas_usage_ledger (Migration v134).
        </p>
      </div>

      <SaasUsageClient />
    </div>
  );
}
