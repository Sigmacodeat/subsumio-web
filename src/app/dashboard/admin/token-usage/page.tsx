// Admin Token Usage — Token-Management Dashboard wie OpenAI Global Admin Console.
// Server component; layout.tsx already gates this to role=admin.

import { Cpu } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { AdminTokenUsageClient } from "@/components/admin/token-usage-client";

export const metadata = { title: "Token-Usage — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTokenUsagePage() {
  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Token-Management"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin", href: "/dashboard/admin" },
          { label: "Token-Usage" },
        ]}
      />

      <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] p-4">
        <Cpu size={18} className="text-[color:var(--ds-info-text)]" aria-hidden />
        <p className="text-xs leading-relaxed text-[color:var(--ds-info-text)]">
          Token-genaue Abrechnung wie OpenAI/ChatGPT. 1 Credit = 1 €. Cached-Tokens kosten 10%
          (Anthropic Prompt Caching). Daten werden alle 60s aktualisiert.
        </p>
      </div>

      <AdminTokenUsageClient />
    </div>
  );
}
