import type { Metadata } from "next";
import { DecisionRecordsClient } from "@/components/admin/decision-records-client";

export const metadata: Metadata = {
  title: "Decision Records — Admin — Subsumio",
  description: "Audit-Trail für Agent-Entscheidungen (TRACE / EBTE)",
};

export default function DecisionRecordsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <DecisionRecordsClient />
    </div>
  );
}
