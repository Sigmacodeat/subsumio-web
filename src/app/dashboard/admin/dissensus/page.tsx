import type { Metadata } from "next";
import { DissensusDashboard } from "@/components/admin/dissensus-dashboard";

export const metadata: Metadata = {
  title: "Dissensus Dashboard — Admin — Subsumio",
  description: "Wo und warum Modelle uneinig sind — Ensemble-Critic Dissensus-Analyse",
};

export default function DissensusPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <DissensusDashboard />
    </div>
  );
}
