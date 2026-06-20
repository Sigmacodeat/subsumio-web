"use client";

import { useState } from "react";
import {
  ShieldAlert,
  Loader2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Users,
  Building2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { ConflictCheckResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

const SEVERITY_CONFIG: Record<ConflictCheckResponse["severity"], {
  label: string;
  iconClass: string;
  icon: React.ElementType;
}> = {
  none: { label: "Kein Konflikt", iconClass: "text-emerald-600", icon: CheckCircle2 },
  low: { label: "Geringes Risiko", iconClass: "text-amber-600", icon: AlertTriangle },
  critical: { label: "Kritischer Konflikt", iconClass: "text-red-600", icon: ShieldAlert },
};

export default function KollisionspruefungPage() {
  const [searchName, setSearchName] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ConflictCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Die eigentliche Prüfung läuft SERVERSEITIG über alle Akten des Brains
  // (kein 200-Zeilen-Limit, kein Frontmatter-Roundtrip). Siehe
  // POST /api/legal/conflict-check.
  async function performCheck(name: string) {
    if (!name.trim()) return;
    setChecking(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.legal.conflictCheck(name.trim());
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prüfung fehlgeschlagen — Engine nicht erreichbar.");
    } finally {
      setChecking(false);
    }
  }

  const cfg = result ? SEVERITY_CONFIG[result.severity] : null;
  const Icon = cfg?.icon ?? CheckCircle2;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Kollisionsprüfung"
        description="Interessenkonflikte nach § 43a BRAO prüfen"
      />

      {/* Search */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <p className="text-sm text-[color:var(--ds-text-muted)] mb-3">
          Gib einen Namen (Mandant, Gegner oder Dritte) ein, um zu prüfen ob ein Interessenkonflikt besteht.
          Die Prüfung läuft über alle Akten dieses Brains, inkl. Teiltreffer bei ähnlichen Namen.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); void performCheck(searchName); }}
        >
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-muted)]" aria-hidden="true" />
            <label htmlFor="conflict-name" className="sr-only">Name für Kollisionsprüfung</label>
            <Input
              id="conflict-name"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Name eingeben…"
              className="pl-9 bg-[color:var(--ds-surface)] border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)]"
            />
          </div>
          <Button
            type="submit"
            disabled={checking || !searchName.trim()}
            variant="primary"
            className="brand-bg brand-bg text-white gap-2"
          >
            {checking ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ShieldAlert size={16} aria-hidden="true" />}
            Prüfen
          </Button>
        </form>
      </div>

      {/* Results */}
      <div aria-live="polite">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-600" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            {error}
          </div>
        )}

        {result && cfg && (
          <div
            className={cn(
              "rounded-xl border p-4",
              result.severity === "critical"
                ? "border-red-500/20 bg-red-500/5"
                : result.severity === "low"
                ? "border-amber-500/20 bg-amber-500/5"
                : "border-emerald-500/20 bg-emerald-500/5"
            )}
          >
            <div className="flex items-center gap-3 mb-3">
              <Icon size={20} className={cn("shrink-0", cfg.iconClass)} aria-hidden="true" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[color:var(--ds-text)]">{result.name}</span>
                  <Badge
                    variant="default"
                    className={cn(
                      "text-[10px] border",
                      result.severity === "critical"
                        ? "bg-red-500/10 text-red-600 border-red-500/20"
                        : result.severity === "low"
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    )}
                  >
                    {cfg.label}
                  </Badge>
                </div>
                <p className="text-sm text-[color:var(--ds-text-muted)] mt-1">{result.explanation}</p>
              </div>
            </div>

            {result.matches.length > 0 && (
              <div className="space-y-1.5 mt-3">
                <p className="text-xs text-[color:var(--ds-text-muted)] uppercase tracking-wider font-semibold">
                  Beteiligte Akten ({result.matches.length})
                </p>
                {result.matches.map((m) => (
                  <div
                    key={`${m.slug}-${m.role}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)]"
                  >
                    {m.role === "client" ? (
                      <Users size={14} className="text-emerald-600 shrink-0" aria-hidden="true" />
                    ) : (
                      <Building2 size={14} className="text-red-600 shrink-0" aria-hidden="true" />
                    )}
                    <span className="text-sm text-[color:var(--ds-text)] flex-1">{m.title}</span>
                    {!m.exact && (
                      <Badge variant="default" className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-600">
                        Ähnlicher Name: {m.matched_name}
                      </Badge>
                    )}
                    <Badge variant="default" className="text-[10px] bg-[color:var(--ds-hover)] border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]">
                      {m.role === "client" ? "Mandant" : "Gegner"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-[color:var(--ds-text-muted)] border-t border-[color:var(--ds-border)] pt-4">
        <p>
          <strong>Hinweis:</strong> Diese Kollisionsprüfung ist ein Unterstützungstool und ersetzt
          nicht die anwaltliche Pflichtprüfung nach § 43a BRAO. Sie prüft ausschließlich die im
          Brain erfassten Akten. Bei Unsicherheit konsultieren Sie die Berufsregeln Ihrer
          Rechtsanwaltskammer.
        </p>
      </div>
    </div>
  );
}
