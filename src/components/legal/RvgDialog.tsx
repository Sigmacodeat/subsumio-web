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
        className="flex items-center gap-2 px-3 py-2 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] text-xs [color:var(--mk-text-muted)] hover:[color:var(--mk-text)] hover:[border-color:var(--mk-border-strong)] transition-all"
      >
        <Scale size={14} />
        RVG-Rechner
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale size={18} className="text-emerald-400" />
                <h2 className="text-lg font-bold [color:var(--mk-text)]">RVG-Rechner</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-[#8a8aa8] hover:[color:var(--mk-text)]">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs [color:var(--mk-text-muted)]">
              Gebührenberechnung nach § 13 RVG (Rechtsanwaltsvergütungsgesetz).
              Inkl. Verfahrensgebühr (1,3), Terminsgebühr (1,2), Einigungsgebühr (1,5) und Auslagenpauschale.
            </p>

            <div className="flex gap-2">
              <input
                type="number"
                value={streitwert}
                onChange={(e) => setStreitwert(e.target.value)}
                placeholder="Streitwert in €"
                className="flex-1 [background:var(--mk-bg)] border [border-color:var(--mk-border)] rounded-lg px-3 py-2 text-sm [color:var(--mk-text)] placeholder:text-[#8a8aa8] focus:outline-none focus:border-emerald-500/50"
                onKeyDown={(e) => e.key === "Enter" && compute()}
              />
              <Button
                variant="primary"
                className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-sm"
                onClick={compute}
              >
                <Calculator size={14} />
                Berechnen
              </Button>
            </div>

            {result && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="[color:var(--mk-text-muted)]">Streitwert</span>
                  <span className="[color:var(--mk-text)] font-medium">{result.streitwert.toLocaleString("de-DE")} €</span>
                </div>
                <div className="flex justify-between">
                  <span className="[color:var(--mk-text-muted)]">Basisgebühr (1,0)</span>
                  <span className="[color:var(--mk-text)]">{result.basisGebuehr.toFixed(2)} €</span>
                </div>
                <div className="border-t [border-color:var(--mk-border)] pt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">Verfahrensgebühr (1,3)</span>
                    <span className="[color:var(--mk-text)]">{result.verfahrensgebuehr.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">Terminsgebühr (1,2)</span>
                    <span className="[color:var(--mk-text)]">{result.terminsgebuehr.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">Einigungsgebühr (1,5)</span>
                    <span className="[color:var(--mk-text)]">{result.einigungsgebuehr.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">Auslagenpauschale</span>
                    <span className="[color:var(--mk-text)]">{result.auslagenpauschale.toFixed(2)} €</span>
                  </div>
                </div>
                <div className="border-t [border-color:var(--mk-border)] pt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">Summe netto</span>
                    <span className="[color:var(--mk-text)] font-medium">{result.summeNetto.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="[color:var(--mk-text-muted)]">MwSt (19%)</span>
                    <span className="[color:var(--mk-text)]">{result.mwst.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-emerald-400 font-bold">
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
