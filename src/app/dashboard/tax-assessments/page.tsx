"use client";

import { useState, useMemo } from "react";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { FileCheck, Plus, Search, AlertCircle } from "lucide-react";
import type { TaxAssessment, AssessmentType } from "@/lib/tax-types";

const TYPE_LABELS: Record<AssessmentType, string> = {
  Einschaetzung: "Einschätzung",
  Festsetzung: "Festsetzung",
  Nachforderung: "Nachforderung",
  Erstattung: "Erstattung",
  Vorauszahlung: "Vorauszahlung",
  Stundung: "Stundung",
  Haftruecklass: "Haft- und Rücklass",
};

export default function TaxAssessmentsPage() {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const [assessments] = useState<TaxAssessment[]>([]);

  const filtered = useMemo(() => {
    return assessments.filter((a) => {
      if (search) {
        const q = search.toLowerCase();
        if (!a.clientName.toLowerCase().includes(q) && !a.noticeNumber?.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [assessments, search]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t("nav.tax_assessments")}
        description="Steuerbescheide und Festsetzungen verwalten"
        actions={
          <Button>
            <Plus size={16} className="mr-2" />
            Bescheid erfassen
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mandant oder Bescheidnummer suchen..."
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileCheck size={48} className="text-[color:var(--ds-text-subtle)] opacity-50" />
          <p className="mt-4 text-sm text-[color:var(--ds-text-subtle)]">
            Keine Bescheide vorhanden. Erfassen Sie einen neuen Bescheid.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  <th className="px-5 py-3 font-medium">Mandant</th>
                  <th className="px-5 py-3 font-medium">Typ</th>
                  <th className="px-5 py-3 font-medium">Bescheid-Nr.</th>
                  <th className="px-5 py-3 font-medium">Datum</th>
                  <th className="px-5 py-3 font-medium">Faellig</th>
                  <th className="px-5 py-3 font-medium">Betrag</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-[color:var(--ds-border)]/50 last:border-0 hover:bg-[color:var(--ds-surface)]/50"
                  >
                    <td className="px-5 py-3 font-medium text-[color:var(--ds-text)]">
                      {a.clientName}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                      {TYPE_LABELS[a.type]}
                    </td>
                    <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                      {a.noticeNumber ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                      {a.noticeDate}
                    </td>
                    <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                      {a.dueDate ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                      {a.amount.toLocaleString("de-DE")} €
                    </td>
                    <td className="px-5 py-3">
                      {a.contested ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                          <AlertCircle size={12} /> Angefochten
                        </span>
                      ) : a.paidDate ? (
                        <span className="text-xs text-emerald-400">Bezahlt</span>
                      ) : (
                        <span className="text-xs text-[color:var(--ds-text-subtle)]">Offen</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
