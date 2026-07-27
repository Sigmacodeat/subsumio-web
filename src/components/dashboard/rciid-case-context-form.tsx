"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileText,
  Target,
  ArrowDownCircle,
  Users,
  Building2,
  FileSearch,
  Gauge,
} from "lucide-react";
import type { BlockchainType } from "@/lib/rciid-client";
import { BLOCKCHAIN_LABELS } from "@/lib/crypto-wallet-detector";
import { isAddressValid } from "@/lib/crypto-checksum";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CaseContextData {
  caseContext?: {
    summary: string;
    timeline: Array<{ date: string; event: string }>;
  };
  targetAddresses?: Array<{
    address: string;
    label?: string;
    amount_btc?: number;
  }>;
  victimDeposits?: Array<{
    address: string;
    amount_btc: number;
    date: string;
    txid?: string;
  }>;
  knownRecipients?: Array<{
    address: string;
    label: string;
    source?: string;
  }>;
  exchangeLinks?: Array<{
    address: string;
    exchange: string;
    account_hint?: string;
  }>;
  evidenceRefs?: Array<{
    type: string;
    description: string;
    extracted_addresses?: string[];
  }>;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  description: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, icon, description, count, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-[color:var(--ds-border)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-[color:var(--ds-hover)]"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-[color:var(--ds-text-muted)]">{icon}</span>
        <span className="flex-1 text-sm font-medium text-[color:var(--ds-text)]">{title}</span>
        {count > 0 && (
          <Badge variant="default" className="text-xs">
            {count}
          </Badge>
        )}
      </button>
      {open && (
        <div className="border-t border-[color:var(--ds-border)] p-4">
          <p className="mb-3 text-xs text-[color:var(--ds-text-muted)]">{description}</p>
          {children}
        </div>
      )}
    </div>
  );
}

function AddressInput({
  value,
  onChange,
  blockchain = "BTC",
  showBlockchain = true,
  placeholder = "bc1q... oder 0x...",
}: {
  value: string;
  onChange: (v: string) => void;
  blockchain?: BlockchainType;
  showBlockchain?: boolean;
  placeholder?: string;
}) {
  const [addr, setAddr] = useState(value);
  const [bc, setBc] = useState(blockchain);

  const valid = useMemo(() => {
    if (!addr || addr.length < 20) return null;
    return isAddressValid(addr, bc);
  }, [addr, bc]);

  return (
    <div className="flex items-center gap-2">
      {showBlockchain && (
        <select
          value={bc}
          onChange={(e) => setBc(e.target.value as BlockchainType)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-2 text-xs"
        >
          {Object.entries(BLOCKCHAIN_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      )}
      <Input
        value={addr}
        onChange={(e) => {
          setAddr(e.target.value);
          onChange(e.target.value);
        }}
        placeholder={placeholder}
        className="flex-1 font-mono text-xs"
      />
      {valid === true && <CheckCircle2 size={14} className="text-[color:var(--ds-success-text)]" />}
      {valid === false && <AlertCircle size={14} className="text-[color:var(--ds-danger-text)]" />}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface RciidCaseContextFormProps {
  value: CaseContextData;
  onChange: (data: CaseContextData) => void;
  missingDataHints?: string[];
}

export function RciidCaseContextForm({
  value,
  onChange,
  missingDataHints = [],
}: RciidCaseContextFormProps) {
  // ── Case Context (Summary + Timeline) ───────────────────────────────────
  const [summary, setSummary] = useState(value.caseContext?.summary ?? "");
  const [timeline, setTimeline] = useState(value.caseContext?.timeline ?? []);

  // ── Target Addresses ────────────────────────────────────────────────────
  const [targetAddresses, setTargetAddresses] = useState(value.targetAddresses ?? []);

  // ── Victim Deposits ─────────────────────────────────────────────────────
  const [victimDeposits, setVictimDeposits] = useState(value.victimDeposits ?? []);

  // ── Known Recipients ────────────────────────────────────────────────────
  const [knownRecipients, setKnownRecipients] = useState(value.knownRecipients ?? []);

  // ── Exchange Links ──────────────────────────────────────────────────────
  const [exchangeLinks, setExchangeLinks] = useState(value.exchangeLinks ?? []);

  // ── Evidence Refs ───────────────────────────────────────────────────────
  const [evidenceRefs, setEvidenceRefs] = useState(value.evidenceRefs ?? []);

  const updateParent = useCallback(() => {
    onChange({
      caseContext: summary.trim() ? { summary: summary.trim(), timeline } : undefined,
      targetAddresses: targetAddresses.length > 0 ? targetAddresses : undefined,
      victimDeposits: victimDeposits.length > 0 ? victimDeposits : undefined,
      knownRecipients: knownRecipients.length > 0 ? knownRecipients : undefined,
      exchangeLinks: exchangeLinks.length > 0 ? exchangeLinks : undefined,
      evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : undefined,
    });
  }, [
    summary,
    timeline,
    targetAddresses,
    victimDeposits,
    knownRecipients,
    exchangeLinks,
    evidenceRefs,
    onChange,
  ]);

  // ── Data Quality Score (live preview) ───────────────────────────────────
  const qualityScore = useMemo(() => {
    let score = 1;
    if (summary.trim().length > 50) score++;
    if (timeline.length > 0) score++;
    if (targetAddresses.length > 0) score++;
    if (victimDeposits.length > 0) score++;
    if (knownRecipients.length > 0 || exchangeLinks.length > 0) score++;
    return Math.min(score, 5);
  }, [summary, timeline, targetAddresses, victimDeposits, knownRecipients, exchangeLinks]);

  const automatablePct = Math.round((qualityScore / 5) * 100);

  const isHinted = (section: string) =>
    missingDataHints.some((h) => h.toLowerCase().includes(section.toLowerCase()));

  // ── Timeline handlers ───────────────────────────────────────────────────
  function addTimelineEntry() {
    setTimeline([...timeline, { date: "", event: "" }]);
  }
  function updateTimelineEntry(idx: number, field: "date" | "event", v: string) {
    const next = [...timeline];
    next[idx] = { ...next[idx], [field]: v };
    setTimeline(next);
    setTimeout(updateParent, 0);
  }
  function removeTimelineEntry(idx: number) {
    setTimeline(timeline.filter((_, i) => i !== idx));
    setTimeout(updateParent, 0);
  }

  // ── Target Address handlers ─────────────────────────────────────────────
  function addTargetAddress() {
    setTargetAddresses([...targetAddresses, { address: "", label: "" }]);
  }
  function updateTargetAddress(idx: number, field: string, v: string) {
    const next = [...targetAddresses];
    next[idx] = { ...next[idx], [field]: v };
    setTargetAddresses(next);
    setTimeout(updateParent, 0);
  }
  function removeTargetAddress(idx: number) {
    setTargetAddresses(targetAddresses.filter((_, i) => i !== idx));
    setTimeout(updateParent, 0);
  }

  // ── Victim Deposit handlers ─────────────────────────────────────────────
  function addVictimDeposit() {
    setVictimDeposits([...victimDeposits, { address: "", amount_btc: 0, date: "" }]);
  }
  function updateVictimDeposit(idx: number, field: string, v: string | number) {
    const next = [...victimDeposits];
    next[idx] = { ...next[idx], [field]: v };
    setVictimDeposits(next);
    setTimeout(updateParent, 0);
  }
  function removeVictimDeposit(idx: number) {
    setVictimDeposits(victimDeposits.filter((_, i) => i !== idx));
    setTimeout(updateParent, 0);
  }

  // ── Known Recipient handlers ────────────────────────────────────────────
  function addKnownRecipient() {
    setKnownRecipients([...knownRecipients, { address: "", label: "" }]);
  }
  function updateKnownRecipient(idx: number, field: string, v: string) {
    const next = [...knownRecipients];
    next[idx] = { ...next[idx], [field]: v };
    setKnownRecipients(next);
    setTimeout(updateParent, 0);
  }
  function removeKnownRecipient(idx: number) {
    setKnownRecipients(knownRecipients.filter((_, i) => i !== idx));
    setTimeout(updateParent, 0);
  }

  // ── Exchange Link handlers ──────────────────────────────────────────────
  function addExchangeLink() {
    setExchangeLinks([...exchangeLinks, { address: "", exchange: "" }]);
  }
  function updateExchangeLink(idx: number, field: string, v: string) {
    const next = [...exchangeLinks];
    next[idx] = { ...next[idx], [field]: v };
    setExchangeLinks(next);
    setTimeout(updateParent, 0);
  }
  function removeExchangeLink(idx: number) {
    setExchangeLinks(exchangeLinks.filter((_, i) => i !== idx));
    setTimeout(updateParent, 0);
  }

  // ── Evidence Ref handlers ───────────────────────────────────────────────
  function addEvidenceRef() {
    setEvidenceRefs([...evidenceRefs, { type: "screenshot", description: "" }]);
  }
  function updateEvidenceRef(idx: number, field: string, v: string) {
    const next = [...evidenceRefs];
    next[idx] = { ...next[idx], [field]: v };
    setEvidenceRefs(next);
    setTimeout(updateParent, 0);
  }
  function removeEvidenceRef(idx: number) {
    setEvidenceRefs(evidenceRefs.filter((_, i) => i !== idx));
    setTimeout(updateParent, 0);
  }

  return (
    <div className="space-y-3">
      {/* Quality Score Preview */}
      <div className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
        <Gauge size={16} className="text-[color:var(--ds-text-muted)]" />
        <div className="flex-1">
          <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
            Datenqualitäts-Score (Vorschau):
          </span>
          <div className="mt-1 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`h-2 w-8 rounded-full ${
                  s <= qualityScore
                    ? s <= 2
                      ? "bg-[color:var(--ds-danger-text)]"
                      : s <= 4
                        ? "bg-[color:var(--ds-warning-text)]"
                        : "bg-[color:var(--ds-success-text)]"
                    : "bg-[color:var(--ds-hover)]"
                }`}
              />
            ))}
          </div>
        </div>
        <span className="text-sm font-semibold text-[color:var(--ds-text)]">{qualityScore}/5</span>
        <span className="text-xs text-[color:var(--ds-text-muted)]">
          ({automatablePct}% automatisierbar)
        </span>
      </div>

      {/* Missing Data Hints */}
      {missingDataHints.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]" />
          <div>
            <p className="text-xs font-medium text-[color:var(--ds-warning-text)]">
              RCIID meldet fehlende Daten:
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-[color:var(--ds-warning-text)]">
              {missingDataHints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Section 1: Case Context (Summary + Timeline) */}
      <Section
        title="Sachverhalt & Timeline"
        icon={<FileText size={14} />}
        description="Zusammenfassung des Falls und zeitlicher Ablauf der relevanten Ereignisse."
        count={timeline.length + (summary.trim() ? 1 : 0)}
        defaultOpen={isHinted("context") || isHinted("summary") || isHinted("timeline")}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              Zusammenfassung
            </label>
            <textarea
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                setTimeout(updateParent, 0);
              }}
              placeholder="Kurze Zusammenfassung des Sachverhalts: Was ist passiert, seit wann, betroffene Personen..."
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
              rows={3}
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-[color:var(--ds-text-muted)]">
              Timeline-Ereignisse
            </label>
            {timeline.map((entry, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <Input
                  value={entry.date}
                  onChange={(e) => updateTimelineEntry(i, "date", e.target.value)}
                  placeholder="2026-01-15"
                  className="w-32 text-xs"
                />
                <Input
                  value={entry.event}
                  onChange={(e) => updateTimelineEntry(i, "event", e.target.value)}
                  placeholder="Ereignis Beschreibung"
                  className="flex-1 text-xs"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeTimelineEntry(i)}
                  className="h-8 w-8 p-0"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addTimelineEntry}>
              <Plus size={12} className="mr-1" />
              Ereignis hinzufügen
            </Button>
          </div>
        </div>
      </Section>

      {/* Section 2: Target Addresses */}
      <Section
        title="Target-Adressen"
        icon={<Target size={14} />}
        description="Wallet-Adressen der Täter/Verdächtigen. Diese Adressen sollen von RCIID untersucht werden."
        count={targetAddresses.length}
        defaultOpen={isHinted("target")}
      >
        <div className="space-y-2">
          {targetAddresses.map((ta, i) => (
            <div key={i} className="flex items-center gap-2">
              <AddressInput
                value={ta.address}
                onChange={(v) => updateTargetAddress(i, "address", v)}
              />
              <Input
                value={ta.label ?? ""}
                onChange={(e) => updateTargetAddress(i, "label", e.target.value)}
                placeholder="Label"
                className="w-28 text-xs"
              />
              <Input
                type="number"
                step="0.00000001"
                value={ta.amount_btc ?? ""}
                onChange={(e) => updateTargetAddress(i, "amount_btc", e.target.value)}
                placeholder="BTC"
                className="w-24 text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeTargetAddress(i)}
                className="h-8 w-8 p-0"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addTargetAddress}>
            <Plus size={12} className="mr-1" />
            Target-Adresse hinzufügen
          </Button>
        </div>
      </Section>

      {/* Section 3: Victim Deposits */}
      <Section
        title="Opfer-Einzahlungen"
        icon={<ArrowDownCircle size={14} />}
        description="Einzahlungen der Opfer auf Krypto-Adressen. Wichtig für die Rückverfolgung."
        count={victimDeposits.length}
        defaultOpen={isHinted("victim") || isHinted("deposit")}
      >
        <div className="space-y-2">
          {victimDeposits.map((vd, i) => (
            <div key={i} className="flex items-center gap-2">
              <AddressInput
                value={vd.address}
                onChange={(v) => updateVictimDeposit(i, "address", v)}
              />
              <Input
                type="number"
                step="0.00000001"
                value={vd.amount_btc || ""}
                onChange={(e) =>
                  updateVictimDeposit(i, "amount_btc", parseFloat(e.target.value) || 0)
                }
                placeholder="BTC"
                className="w-24 text-xs"
              />
              <Input
                value={vd.date}
                onChange={(e) => updateVictimDeposit(i, "date", e.target.value)}
                placeholder="2026-01-15"
                className="w-28 text-xs"
              />
              <Input
                value={vd.txid ?? ""}
                onChange={(e) => updateVictimDeposit(i, "txid", e.target.value)}
                placeholder="TX-ID (optional)"
                className="w-32 text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeVictimDeposit(i)}
                className="h-8 w-8 p-0"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addVictimDeposit}>
            <Plus size={12} className="mr-1" />
            Opfer-Einzahlung hinzufügen
          </Button>
        </div>
      </Section>

      {/* Section 4: Known Recipients */}
      <Section
        title="Bekannte Empfänger"
        icon={<Users size={14} />}
        description="Adressen, die bereits als Empfänger bekannt sind (z.B. Cash-Out-Adressen)."
        count={knownRecipients.length}
        defaultOpen={isHinted("recipient")}
      >
        <div className="space-y-2">
          {knownRecipients.map((kr, i) => (
            <div key={i} className="flex items-center gap-2">
              <AddressInput
                value={kr.address}
                onChange={(v) => updateKnownRecipient(i, "address", v)}
              />
              <Input
                value={kr.label}
                onChange={(e) => updateKnownRecipient(i, "label", e.target.value)}
                placeholder="Label/Name"
                className="w-28 text-xs"
              />
              <Input
                value={kr.source ?? ""}
                onChange={(e) => updateKnownRecipient(i, "source", e.target.value)}
                placeholder="Quelle (optional)"
                className="w-32 text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeKnownRecipient(i)}
                className="h-8 w-8 p-0"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addKnownRecipient}>
            <Plus size={12} className="mr-1" />
            Empfänger hinzufügen
          </Button>
        </div>
      </Section>

      {/* Section 5: Exchange Links */}
      <Section
        title="Exchange-Konten"
        icon={<Building2 size={14} />}
        description="Verknüpfungen von Wallet-Adressen mit Krypto-Börsen (Exchanges)."
        count={exchangeLinks.length}
        defaultOpen={isHinted("exchange")}
      >
        <div className="space-y-2">
          {exchangeLinks.map((el, i) => (
            <div key={i} className="flex items-center gap-2">
              <AddressInput
                value={el.address}
                onChange={(v) => updateExchangeLink(i, "address", v)}
              />
              <Input
                value={el.exchange}
                onChange={(e) => updateExchangeLink(i, "exchange", e.target.value)}
                placeholder="Binance, Kraken..."
                className="w-28 text-xs"
              />
              <Input
                value={el.account_hint ?? ""}
                onChange={(e) => updateExchangeLink(i, "account_hint", e.target.value)}
                placeholder="Account-Hinweis (optional)"
                className="w-32 text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeExchangeLink(i)}
                className="h-8 w-8 p-0"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addExchangeLink}>
            <Plus size={12} className="mr-1" />
            Exchange-Verknüpfung hinzufügen
          </Button>
        </div>
      </Section>

      {/* Section 6: Evidence Refs */}
      <Section
        title="Beweismittel"
        icon={<FileSearch size={14} />}
        description="Referenzen auf Beweismittel (Screenshots, E-Mails, Verträge) mit ggf. extrahierten Adressen."
        count={evidenceRefs.length}
        defaultOpen={isHinted("evidence")}
      >
        <div className="space-y-2">
          {evidenceRefs.map((er, i) => (
            <div key={i} className="flex items-start gap-2">
              <select
                value={er.type}
                onChange={(e) => updateEvidenceRef(i, "type", e.target.value)}
                className="mt-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-2 text-xs"
              >
                <option value="screenshot">Screenshot</option>
                <option value="email">E-Mail</option>
                <option value="contract">Vertrag</option>
                <option value="bank_statement">Kontoauszug</option>
                <option value="tx_history">Transaktionsverlauf</option>
                <option value="chat_log">Chat-Verlauf</option>
                <option value="other">Sonstiges</option>
              </select>
              <Input
                value={er.description}
                onChange={(e) => updateEvidenceRef(i, "description", e.target.value)}
                placeholder="Beschreibung des Beweismittels"
                className="flex-1 text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeEvidenceRef(i)}
                className="mt-1 h-8 w-8 p-0"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={addEvidenceRef}>
            <Plus size={12} className="mr-1" />
            Beweismittel hinzufügen
          </Button>
        </div>
      </Section>
    </div>
  );
}
