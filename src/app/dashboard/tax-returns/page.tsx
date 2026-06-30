"use client";

import { useState, useMemo } from "react";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Search } from "lucide-react";
import type { TaxReturn, TaxReturnType, TaxReturnStatus } from "@/lib/tax-types";

const STATUS_COLORS: Record<TaxReturnStatus, string> = {
  draft: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  review: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  submitted: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  assessed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  corrected: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  closed: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const TYPE_LABELS: Record<TaxReturnType, string> = {
  ESt: "Einkommensteuer",
  USt: "Umsatzsteuer",
  GewSt: "Gewerbesteuer",
  KSt: "Körperschaftsteuer",
  SolZ: "Solidaritätszuschlag",
  VSt: "Vermögensteuer",
  GrESt: "Grunderwerbsteuer",
  ErbSt: "Erbschaftsteuer",
  LSt: "Lohnsteuer",
  UStVA: "USt-Voranmeldung",
  LStA: "Lohnsteuer-Anmeldung",
  ZM: "Zusammenfassende Meldung",
  other: "Sonstige",
};

export default function TaxReturnsPage() {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaxReturnStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<TaxReturnType | "all">("all");

  // Placeholder: in production this would fetch from API
  const [returns] = useState<TaxReturn[]>([]);

  const filtered = useMemo(() => {
    return returns.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (!r.clientName.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      return true;
    });
  }, [returns, search, statusFilter, typeFilter]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t("nav.tax_returns")}
        description="Steuererklaerungen verwalten und Status verfolgen"
        actions={
          <Button>
            <Plus size={16} className="mr-2" />
            Neue Erklaerung
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
            placeholder="Mandant suchen..."
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TaxReturnType | "all")}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          <option value="all">Alle Typen</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaxReturnStatus | "all")}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          <option value="all">Alle Status</option>
          <option value="draft">Entwurf</option>
          <option value="in_progress">In Bearbeitung</option>
          <option value="review">Zur Pruefung</option>
          <option value="submitted">Eingereicht</option>
          <option value="assessed">Veranlagt</option>
          <option value="corrected">Korrigiert</option>
          <option value="closed">Abgeschlossen</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText size={48} className="text-[color:var(--ds-text-subtle)] opacity-50" />
          <p className="mt-4 text-sm text-[color:var(--ds-text-subtle)]">
            Keine Steuererklaerungen vorhanden. Erstellen Sie eine neue Erklaerung.
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
                  <th className="px-5 py-3 font-medium">Jahr</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Faellig</th>
                  <th className="px-5 py-3 font-medium">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[color:var(--ds-border)]/50 last:border-0 hover:bg-[color:var(--ds-surface)]/50"
                  >
                    <td className="px-5 py-3 font-medium text-[color:var(--ds-text)]">
                      {r.clientName}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                      {TYPE_LABELS[r.type]}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">{r.year}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                      {r.dueDate ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--ds-text-muted)]">
                      {r.taxAmount != null ? `${r.taxAmount.toLocaleString("de-DE")} €` : "—"}
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
