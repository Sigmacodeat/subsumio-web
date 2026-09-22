// Live-Demo Analytics — First-Party-Funnel der öffentlichen /demo-Sandbox.
// Server component; ops/layout.tsx gates this to platform operators.

import { Suspense } from "react";
import { FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DemoAnalytics } from "@/components/ops/demo-analytics";

export const metadata = { title: "Live-Demo — Betreiber-Konsole" };
export const dynamic = "force-dynamic";

export default function OpsDemoPage() {
  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Live-Demo Analytics"
        breadcrumbs={[{ label: "Betreiber-Konsole", href: "/ops" }, { label: "Live-Demo" }]}
      />

      <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] p-4">
        <FlaskConical size={18} className="shrink-0 text-[color:var(--ds-info-text)]" aria-hidden />
        <p className="text-xs leading-relaxed text-[color:var(--ds-info-text)]">
          First-Party-Messung der öffentlichen Sandbox unter /demo: Funnel von Session-Start bis
          Registrierung, Abbruch-Stufen, Segmente (Rolle, Rechtsraum, Quelle), Kosten &amp;
          Kapazität. Serverseitig aus subsumio_demo_sessions/events — unabhängig von Ad-Blockern und
          Consent-Status.
        </p>
      </div>

      <Suspense
        fallback={<div className="h-40 animate-pulse rounded-xl bg-[color:var(--ds-surface-2)]" />}
      >
        <DemoAnalytics />
      </Suspense>
    </div>
  );
}
