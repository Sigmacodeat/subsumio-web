"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Save, Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { interpretCreditScore, GDPR_NOTICE_DE } from "@/lib/credit-check";
import { generateRubrum, type RubrumParty } from "@/lib/letterhead-rubrum";
import { validateFaxNumber, formatFaxNumber } from "@/lib/fax-gateway";

const CAPABILITIES = [
  {
    name: "RSV / drebis",
    description: "Deckungsanfrage erstellen",
    key: "createRSVCaseData",
    href: "/dashboard/legal-insurance",
  },
  {
    name: "KYC",
    description: "Identitäts- und Risikoprüfung",
    key: "createKYCVerification",
    href: "/dashboard/kyc",
  },
  {
    name: "Postausgangsbuch",
    description: "Versand und Zustellung nachhalten",
    key: "createOutboundEntry",
    href: "/dashboard/outbound-register",
  },
  {
    name: "Dokumenten-Interviews",
    description: "Geführte Mandantenfragebögen",
    key: "createInterview",
    href: "/dashboard/document-interviews",
  },
  {
    name: "Red-Team",
    description: "Schriftsätze adversarial prüfen",
    key: "createRedTeamPrompt",
    href: "/dashboard/red-team",
  },
  {
    name: "Diktat-Loop",
    description: "Diktate bis zur Ablage verfolgen",
    key: "createDictationEntry",
    href: "/dashboard/dictation",
  },
  {
    name: "Vollmachten",
    description: "Geltung und Ablauf verwalten",
    key: "createPowerOfAttorney",
    href: "/dashboard/power-of-attorney",
  },
  {
    name: "Massenakten",
    description: "CSV-Portfolios prüfen und importieren",
    key: "parseCsvCases",
    href: "/dashboard/bulk-cases",
  },
  {
    name: "Vergütungsvereinbarungen",
    description: "Honorar und Budget überwachen",
    key: "computeBudgetStatus",
    href: "/dashboard/fee-agreements",
  },
  {
    name: "Mahnverfahren & ZV",
    description: "Forderungskonto und Vollstreckung",
    key: "createClaim",
    href: "/dashboard/claim-account",
  },
] as const;

function CreditCard() {
  const [score, setScore] = useState("75");
  const credit = interpretCreditScore(Number(score) || 0);
  const RISK_COLORS: Record<string, string> = {
    low: "bg-[color:var(--ds-success-solid-hover)] text-white",
    medium: "bg-[color:var(--signal-warning-800)] text-white",
    high: "bg-[color:var(--ds-danger-solid)] text-white",
  };

  return (
    <Tool title="Bonitäts-Einordnung" subtitle="Risiko-Klassifikation">
      <div>
        <Label htmlFor="credit-score">Bonitäts-Score (0-100)</Label>
        <Input
          id="credit-score"
          type="number"
          inputMode="numeric"
          min="0"
          max="100"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
      </div>
      <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[color:var(--ds-text-muted)]">Risiko-Level</span>
          <Badge className={RISK_COLORS[credit.risk_level] ?? ""}>{credit.risk_level}</Badge>
        </div>
        <Row label="Zahlungsverhalten" value={credit.payment_behavior ?? "unbekannt"} />
      </div>
      <p className="text-xs text-[color:var(--ds-text-muted)]">{GDPR_NOTICE_DE}</p>
    </Tool>
  );
}

function FaxCard() {
  const [fax, setFax] = useState("");
  const valid = fax ? validateFaxNumber(fax) : null;
  const formatted = fax && valid ? formatFaxNumber(fax) : null;

  return (
    <Tool title="Fax-Prüfung" subtitle="Format-Validierung">
      <Input
        value={fax}
        onChange={(e) => setFax(e.target.value)}
        placeholder="+43 1 1234567"
        aria-label="Faxnummer"
      />
      <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-sm">
        {!fax && <span className="text-[color:var(--ds-text-muted)]">Nummer eingeben…</span>}
        {fax && !valid && (
          <Badge className="bg-[color:var(--ds-danger-solid)] text-white">Ungültiges Format</Badge>
        )}
        {fax && valid && (
          <div className="space-y-1">
            <Badge className="bg-[color:var(--ds-success-solid-hover)] text-white">Gültig</Badge>
            {formatted && <Row label="Formatiert:" value={formatted} mono />}
          </div>
        )}
      </div>
    </Tool>
  );
}

function RubrumCard() {
  const { addToast } = useToast();
  const [court, setCourt] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [plaintiffs, setPlaintiffs] = useState<RubrumParty[]>([{ name: "", role: "plaintiff" }]);
  const [defendants, setDefendants] = useState<RubrumParty[]>([{ name: "", role: "defendant" }]);
  const [caseSlug, setCaseSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const rubrum = useMemo(() => {
    const vp = plaintiffs.filter((p) => p.name.trim());
    const vd = defendants.filter((p) => p.name.trim());
    if (!court && !caseNumber && vp.length === 0 && vd.length === 0) return "";
    return generateRubrum({ court, case_number: caseNumber, plaintiffs: vp, defendants: vd });
  }, [court, caseNumber, plaintiffs, defendants]);

  const saveToCase = async () => {
    if (!caseSlug) {
      addToast({ type: "error", title: "Akten-Slug eingeben" });
      return;
    }
    if (!rubrum) {
      addToast({ type: "error", title: "Rubrum zuerst ausfüllen" });
      return;
    }
    setSaving(true);
    try {
      await api.brain.createPage({
        slug: `${caseSlug}/rubrum-${Date.now()}`,
        title: `Rubrum — ${caseNumber || "ohne Akz"}`,
        type: "rubrum",
        content: rubrum,
        frontmatter: { court, case_number: caseNumber, generated_at: new Date().toISOString() },
      });
      addToast({ type: "success", title: "Rubrum in Akte übernommen" });
    } catch {
      addToast({ type: "error", title: "Speichern fehlgeschlagen" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Tool title="Rubrum-Generator" subtitle="Aktenbasiert — keine Musterdaten">
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="rubrum-court">Gericht</Label>
            <Input
              id="rubrum-court"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="z. B. Landesgericht für ZRS Wien"
            />
          </div>
          <div>
            <Label htmlFor="rubrum-case-number">Aktenzeichen</Label>
            <Input
              id="rubrum-case-number"
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="z. B. 12 Cg 34/26x"
            />
          </div>
        </div>
        <PartyList label="Kläger" parties={plaintiffs} setParties={setPlaintiffs} />
        <PartyList label="Beklagte" parties={defendants} setParties={setDefendants} />
        {rubrum && <Result>{rubrum}</Result>}
        <SaveToCase
          caseSlug={caseSlug}
          setCaseSlug={setCaseSlug}
          onSave={saveToCase}
          saving={saving}
        />
      </div>
    </Tool>
  );
}

function PartyList({
  label,
  parties,
  setParties,
}: {
  label: string;
  parties: RubrumParty[];
  setParties: (p: RubrumParty[]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`${label} hinzufügen`}
          onClick={() =>
            setParties([...parties, { name: "", role: parties[0]?.role ?? "plaintiff" }])
          }
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {parties.map((p, idx) => (
        <div key={idx} className="mt-1 flex gap-1">
          <Input
            value={p.name}
            onChange={(e) => {
              const n = [...parties];
              n[idx] = { ...p, name: e.target.value };
              setParties(n);
            }}
            placeholder={`${label.slice(0, -1)} ${idx + 1}`}
            aria-label={`${label.slice(0, -1)} ${idx + 1}`}
          />
          {parties.length > 1 && (
            <Button
              size="sm"
              variant="secondary"
              aria-label={`${label.slice(0, -1)} ${idx + 1} entfernen`}
              onClick={() => setParties(parties.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export function KanzleiTools() {
  const capabilities = CAPABILITIES;
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-8">
      <PageHeader
        title="Kanzlei-Werkzeuge"
        description="Operative Hilfen und spezialisierte Kanzleiabläufe an einem Ort"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Werkzeuge" }]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <CreditCard />
        <FaxCard />
        <RubrumCard />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map((capability) => {
          const comingSoon = "comingSoon" in capability && capability.comingSoon;
          const href = "href" in capability ? capability.href : undefined;
          const content = (
            <>
              <h2 className="text-sm font-semibold">{capability.name}</h2>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                {capability.description}
              </p>
              {comingSoon && (
                <span className="mt-2 inline-block rounded-full bg-[color:var(--ds-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--ds-text-muted)]">
                  Bald verfügbar
                </span>
              )}
            </>
          );
          return href ? (
            <Link
              key={capability.name}
              href={href}
              className="block rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition hover:border-[color:var(--ds-border-strong)] hover:shadow-sm"
            >
              {content}
            </Link>
          ) : (
            <div
              key={capability.name}
              data-capability={capability.key}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 opacity-60"
            >
              {content}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" asChild>
          <Link href="/dashboard/fibu">FiBu öffnen</Link>
        </Button>
      </div>
    </div>
  );
}

function Tool({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-[color:var(--ds-text-muted)]">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-[color:var(--ds-text-muted)]">{label}</span>
      <span className={mono ? "font-mono font-medium" : "font-medium"}>{value}</span>
    </div>
  );
}
function Result({ children }: { children: React.ReactNode }) {
  return (
    <pre className="rounded-lg bg-[color:var(--ds-surface-2)] p-3 font-mono text-xs whitespace-pre-wrap">
      {children}
    </pre>
  );
}
function SaveToCase({
  caseSlug,
  setCaseSlug,
  onSave,
  saving,
}: {
  caseSlug: string;
  setCaseSlug: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Input
        value={caseSlug}
        onChange={(e) => setCaseSlug(e.target.value)}
        placeholder="legal/cases/…"
        aria-label="Akten-Slug"
        className="flex-1"
      />
      <Button onClick={onSave} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
        In Akte
      </Button>
    </div>
  );
}
