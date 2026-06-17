"use client";

import { useRef, useState } from "react";
import { ShieldCheck, ShieldAlert, Archive, Loader2, FileSearch } from "lucide-react";
import { sha256Hex, sha256HexBytes, invoiceContentString, type InvoiceHashFields } from "@/lib/gobd";
import type { BrainPage } from "@/lib/types";

type VerifyState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "match"; computed: string }
  | { kind: "mismatch"; computed: string }
  | { kind: "error"; message: string };

/** Frontmatter → InvoiceHashFields für die Neuberechnung. Liest exakt die Felder,
 *  die `invoiceContentString` erwartet — fehlende Werte fallen auf Defaults zurück. */
function invoiceFieldsFromFrontmatter(fm: Record<string, unknown>): InvoiceHashFields {
  const items = Array.isArray(fm.items) ? (fm.items as InvoiceHashFields["items"]) : [];
  return {
    number: String(fm.invoice_number ?? ""),
    client: String(fm.client ?? ""),
    caseNumber: fm.case_number != null ? String(fm.case_number) : undefined,
    date: String(fm.date ?? ""),
    subtotal: Number(fm.subtotal ?? 0),
    tax: Number(fm.tax ?? 0),
    total: Number(fm.total ?? 0),
    items,
  };
}

/**
 * Verifikations-Panel für GoBD-gestempelte Belege. Zeigt Aufbewahrungsfrist +
 * gespeicherten Inhalts-Hash und erlaubt die Soll/Ist-Prüfung:
 *   - Rechnungen: Hash aus den Frontmatter-Feldern neu rechnen (kein Datei-Upload nötig).
 *   - Hochgeladene Belege (Datei-Hash): Originaldatei wählen → Bytes neu hashen.
 * Rendert nichts, wenn die Seite keinen `content_hash` trägt.
 */
export function GobdIntegrityPanel({ page }: { page: BrainPage }) {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  const storedHash = typeof fm.content_hash === "string" ? fm.content_hash : null;
  const [state, setState] = useState<VerifyState>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!storedHash) return null;

  const isInvoice = (page.type ?? fm.type) === "invoice" || !!fm.invoice_number;
  const retentionUntil = typeof fm.retention_until === "string" ? fm.retention_until : null;
  const hashedAt = typeof fm.hashed_at === "string" ? fm.hashed_at : null;

  async function verifyInvoice() {
    setState({ kind: "checking" });
    try {
      const computed = await sha256Hex(invoiceContentString(invoiceFieldsFromFrontmatter(fm)));
      setState({ kind: computed === storedHash ? "match" : "mismatch", computed });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function verifyFile(file: File) {
    setState({ kind: "checking" });
    try {
      const computed = await sha256HexBytes(await file.arrayBuffer());
      setState({ kind: computed === storedHash ? "match" : "mismatch", computed });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="mt-10 rounded-xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Archive size={15} className="text-violet-400" />
        <h3 className="text-sm font-semibold text-[#e8e8f0]">GoBD-Beleg — Integrität</h3>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {retentionUntil && (
          <div className="flex justify-between gap-2">
            <dt className="text-[#8a8aa8]">Aufbewahrung bis</dt>
            <dd className="text-[#e8e8f0] font-mono">{retentionUntil}</dd>
          </div>
        )}
        {hashedAt && (
          <div className="flex justify-between gap-2">
            <dt className="text-[#8a8aa8]">Gestempelt am</dt>
            <dd className="text-[#e8e8f0] font-mono">{hashedAt.split("T")[0]}</dd>
          </div>
        )}
        <div className="sm:col-span-2 flex flex-col gap-1">
          <dt className="text-[#8a8aa8]">Gespeicherter Hash (SHA-256)</dt>
          <dd className="text-[#8888aa] font-mono break-all">{storedHash}</dd>
        </div>
      </dl>

      {/* Soll/Ist-Prüfung */}
      <div className="space-y-3">
        {isInvoice ? (
          <button
            onClick={verifyInvoice}
            disabled={state.kind === "checking"}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-violet-600/15 text-violet-300 border border-violet-500/30 hover:bg-violet-600/25 transition-all disabled:opacity-50"
          >
            {state.kind === "checking" ? <Loader2 size={13} className="animate-spin" /> : <FileSearch size={13} />}
            Integrität prüfen
          </button>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={state.kind === "checking"}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-violet-600/15 text-violet-300 border border-violet-500/30 hover:bg-violet-600/25 transition-all disabled:opacity-50"
            >
              {state.kind === "checking" ? <Loader2 size={13} className="animate-spin" /> : <FileSearch size={13} />}
              Originaldatei prüfen
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void verifyFile(file);
                e.target.value = "";
              }}
            />
            <p className="text-[11px] text-[#8a8aa8]">
              Wähle die Originaldatei — sie wird lokal im Browser gehasht und gegen den
              gespeicherten Wert geprüft. Die Datei verlässt den Browser nicht.
            </p>
          </div>
        )}

        {state.kind === "match" && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
            <ShieldCheck size={15} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-300">
              <strong>Unverändert seit Ausstellung.</strong> Der neu berechnete Hash stimmt
              mit dem gespeicherten überein.
            </div>
          </div>
        )}
        {state.kind === "mismatch" && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10">
            <ShieldAlert size={15} className="text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs text-red-300 space-y-1">
              <div><strong>Verändert seit Ausstellung.</strong> Der berechnete Hash weicht ab.</div>
              <div className="font-mono break-all text-red-400/80">Ist: {state.computed}</div>
            </div>
          </div>
        )}
        {state.kind === "error" && (
          <div className="text-xs text-red-400">Prüfung fehlgeschlagen: {state.message}</div>
        )}
      </div>
    </div>
  );
}
