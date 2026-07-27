"use client";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf";
import { parseCsvCases } from "@/lib/bulk-cases";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
const sample =
  "case_number,client_name,client_email,opponent_name,matter,legal_area,court,dispute_value,mandate_id\n2026-001,Max Mustermann,max@example.de,Gegner GmbH,Forderung,Zivilrecht,LG Berlin,10000,PORTFOLIO-1";
export default function BulkCasesPage() {
  const { t } = useLang();
  const tr = (key: string) => t(key as DashboardKey);
  const [csv, setCsv] = useState(sample);
  const [result, setResult] = useState<{
    total: number;
    created: number;
    errors: number;
    results: Array<{ slug: string; case_number: string; status: string }>;
  } | null>(null);
  const preview = useMemo(() => parseCsvCases(csv), [csv]);
  async function submit() {
    const r = await csrfFetch("/api/bulk-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv_text: csv }),
    });
    const j = await r.json();
    if (r.ok) setResult(j.data);
  }
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={tr("workspace.bulk.title")}
        description={tr("workspace.bulk.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: "Massenakten" },
        ]}
      />
      <section className="space-y-3 rounded-xl border p-5">
        <div className="flex justify-between">
          <h2 className="font-semibold">{tr("workspace.bulk.import")}</h2>
          <span className="text-sm">
            {preview.length} {tr("workspace.bulk.valid")}
          </span>
        </div>
        <textarea
          aria-label={tr("workspace.bulk.csv_label")}
          className="min-h-56 w-full rounded-lg border bg-transparent p-3 font-mono text-xs"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <Button onClick={() => void submit()} disabled={!preview.length}>
          {tr("workspace.bulk.submit_prefix")} {preview.length} {tr("workspace.bulk.submit_suffix")}
        </Button>
      </section>
      <section className="overflow-x-auto rounded-xl border p-5">
        <h2 className="mb-3 font-semibold">{tr("workspace.bulk.preview")}</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>{tr("workspace.bulk.case")}</th>
              <th>{tr("workspace.bulk.client")}</th>
              <th>{tr("workspace.bulk.matter")}</th>
              <th>{tr("workspace.bulk.portfolio")}</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((r, i) => (
              <tr key={`${r.case_number}-${i}`} className="border-t">
                <td className="py-2">{r.case_number}</td>
                <td>{r.client_name}</td>
                <td>{r.matter}</td>
                <td>{r.mandate_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {result && (
        <div className="rounded-xl border border-green-500 p-4 text-sm">
          {result.created}/{result.total} {tr("workspace.bulk.created")} · {result.errors}{" "}
          {tr("workspace.bulk.errors")}
        </div>
      )}
    </div>
  );
}
