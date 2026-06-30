"use client";

import { DashboardError } from "@/components/dashboard/dashboard-error";

export default function TaxStBVVError({ error, reset }: { error: Error; reset: () => void }) {
  return <DashboardError error={error} reset={reset} moduleKey="tax-stbvv" />;
}
