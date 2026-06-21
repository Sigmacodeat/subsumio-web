"use client";

import { useState } from "react";
import { Scale, X, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateRvg } from "@/lib/rvg";

export default function RvgDialog() {
  const [open, setOpen] = useState(false);
  const [streitwert, setStreitwert] = useState("");
  const [result, setResult] = useState<ReturnType<typeof calculateRvg> | null>(null);

  function compute() {
    const val = parseFloat(streitwert);
    if (val > 0) setResult(calculateRvg(val));
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border [border-color:var(--mk-border)] px-3 py-2 text-xs [color:var(--mk-text-muted)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)] hover:[color:var(--mk-text)]"
      >
        <Scale size={14} />
        RVG-Rechner
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl border [border-color:var(--mk-border)] p-5 shadow-xl [background:var(--mk-surface)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale size={18} className="text-emerald-400" />
                <h2 className="text-lg font-bold [color:var(--mk-text)]">RVG-Rechner</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[color:var(--mk-text-subtle)] hover:[color:var(--mk-text)]"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs [color:var(--mk-text-muted)]">
              Gebührenberechnung nach § 13 RVG (Rechtsanwaltsvergütungsgesetz). Inkl.
              Verfahrensgebühr (1,3), Terminsgebühr (1,2), Einigungsgebühr (1,5) und
              Auslagenpauschale.
            </p>

            <div className="flex gap-2">
              <input
                type="number"
                value={streitwert}
                onChange={(e) => setStreitwert(e.target.value)}
                placeholder="Streitwert in €"
                className="flex-1 rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-bg)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-emerald-500/50 focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && compute()}
              />
              <Button
                variant="primary"
                className="gap-2 bg-emerald-600 text-sm text-white hover:bg-emerald-500"
                onClick={compute}
              >
                <Calculator size={14} />
                Berechnen
              </Button>
            </div>

            {result && (
              <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="[color:var(--mk-text-muted)]">Streitwert</span>
                  <span className="font-medium [color:var(--mk-text)]">
                    {result.streitwert.toLocaleString("de-DE")} €
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="[color:var(--mk-text-muted)]">Basisgebühr (1,0)</span>
                  <span className="[color:var(--mk-text)]">{result.basisGebuehr.toFixed(2)} €</span>
                </div>
                <div className="space-y-1 border-t [border-color:var(--mk-border)] pt-2">
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">Verfahrensgebühr (1,3)</span>
                    <span className="[color:var(--mk-text)]">
                      {result.verfahrensgebuehr.toFixed(2)} €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">Terminsgebühr (1,2)</span>
                    <span className="[color:var(--mk-text)]">
                      {result.terminsgebuehr.toFixed(2)} €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">Einigungsgebühr (1,5)</span>
                    <span className="[color:var(--mk-text)]">
                      {result.einigungsgebuehr.toFixed(2)} €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">Auslagenpauschale</span>
                    <span className="[color:var(--mk-text)]">
                      {result.auslagenpauschale.toFixed(2)} €
                    </span>
                  </div>
                </div>
                <div className="space-y-1 border-t [border-color:var(--mk-border)] pt-2">
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">Summe netto</span>
                    <span className="font-medium [color:var(--mk-text)]">
                      {result.summeNetto.toFixed(2)} €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">MwSt (19%)</span>
                    <span className="[color:var(--mk-text)]">{result.mwst.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-400">
                    <span>Summe brutto</span>
                    <span>{result.summeBrutto.toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
