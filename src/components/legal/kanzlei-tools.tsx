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
import { calculateGkg } from "@/lib/fachrechner";
import { computePKHMeansTest, PKH_FREIBETRAEGE_2026 } from "@/lib/pkh-beratungshilfe";
import { searchCourts } from "@/lib/court-directory";
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
    name: "Peer-Benchmark",
    description: "Anonymisierte Kanzlei-Kennzahlen",
    key: "buildBenchmarkExport",
    href: "/dashboard/peer-benchmark",
  },
  {
    name: "DATEV-Direktanbindung",
    description: "Geplant — noch keine echte DATEV-API-Anbindung, siehe DATEV-Export für CSV",
    key: "createDatevExport",
    href: "/dashboard/datev-direct",
    comingSoon: true,
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
    name: "White-Label PWA",
    description: "Mandantenportal branden",
    key: "generateWhiteLabelManifest",
    href: "/dashboard/white-label",
  },
  {
    name: "Entscheider-Analytics",
    description: "Gerichtsdaten aggregieren",
    key: "aggregateCourtAnalytics",
    href: "/dashboard/court-analytics",
  },
  {
    name: "Diktat-Loop",
    description: "Diktate bis zur Ablage verfolgen",
    key: "createDictationEntry",
    href: "/dashboard/dictation",
  },
  {
    name: "FAO-Tracking",
    description: "Fortbildungsstunden und Nachweise",
    key: "computeAnnualStatus",
    href: "/dashboard/fao-tracking",
  },
  {
    name: "Vollmachten",
    description: "Geltung und Ablauf verwalten",
    key: "createPowerOfAttorney",
    href: "/dashboard/power-of-attorney",
  },
  {
    name: "Online-Terminbuchung",
    description: "Verfügbare Beratungsslots verwalten",
    key: "generateSlots",
    href: "/dashboard/online-booking",
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

function fmtEUR(n: number) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function GkgCard() {
  const { addToast } = useToast();
  const [streitwert, setStreitwert] = useState("10000");
  const [caseSlug, setCaseSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const result = calculateGkg(Number(streitwert) || 0);

  const saveToCase = async () => {
    if (!caseSlug) {
      addToast({ type: "error", title: "Akten-Slug eingeben" });
      return;
    }
    setSaving(true);
    try {
      await api.brain.createPage({
        slug: `${caseSlug}/gkg-berechnung-${Date.now()}`,
        title: `GKG-Berechnung — ${fmtEUR(result.streitwert)}`,
        type: "gkg_calculation",
        frontmatter: { ...result, calculated_at: new Date().toISOString() },
      });
      addToast({ type: "success", title: "In Akte übernommen" });
    } catch {
      addToast({ type: "error", title: "Speichern fehlgeschlagen" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Tool title="GKG-Rechner" subtitle="Gerichtskosten nach § 3 GKG">
      <div className="grid gap-3">
        <div>
          <Label>Streitwert (€)</Label>
          <Input type="number" value={streitwert} onChange={(e) => setStreitwert(e.target.value)} />
        </div>
        <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-sm">
          <Row label="Streitwert" value={fmtEUR(result.streitwert)} />
          <Row label="Verfahrensgebühr (3,0)" value={fmtEUR(result.verfahrensgebuehr)} />
          <Row label="Terminsgebühr (1,0)" value={fmtEUR(result.terminsgebuehr)} />
          <Row label="Auslagenpauschale" value={fmtEUR(result.auslagenpauschale)} />
          <div className="mt-1 flex justify-between border-t border-[color:var(--ds-border)] pt-1.5">
            <span className="font-semibold">Gerichtskosten gesamt</span>
            <span className="font-bold">{fmtEUR(result.summe)}</span>
          </div>
        </div>
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

function PkhCard() {
  const { addToast } = useToast();
  const [income, setIncome] = useState("2000");
  const [deductions, setDeductions] = useState("500");
  const [adults, setAdults] = useState("1");
  const [children, setChildren] = useState("0");
  const [caseSlug, setCaseSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const result = computePKHMeansTest({
    monthly_income: Number(income) || 0,
    monthly_deductions: Number(deductions) || 0,
    family_size: (Number(adults) || 1) + (Number(children) || 0),
    adults: Number(adults) || 1,
    children: Number(children) || 0,
  });

  const saveToCase = async () => {
    if (!caseSlug) {
      addToast({ type: "error", title: "Akten-Slug eingeben" });
      return;
    }
    setSaving(true);
    try {
      await api.brain.createPage({
        slug: `${caseSlug}/pkh-pruefung-${Date.now()}`,
        title: `PKH-Prüfung — ${result.eligible ? "berechtigt" : "nicht berechtigt"}`,
        type: "pkh_means_test",
        frontmatter: { ...result, calculated_at: new Date().toISOString() },
      });
      addToast({ type: "success", title: "In Akte übernommen" });
    } catch {
      addToast({ type: "error", title: "Speichern fehlgeschlagen" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Tool title="PKH-Schnellprüfung" subtitle="Prozesskostenhilfe §§ 114-127 ZPO">
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Einkommen (€)</Label>
            <Input type="number" value={income} onChange={(e) => setIncome(e.target.value)} />
          </div>
          <div>
            <Label>Abzüge (€)</Label>
            <Input
              type="number"
              value={deductions}
              onChange={(e) => setDeductions(e.target.value)}
            />
          </div>
          <div>
            <Label>Erwachsene</Label>
            <Input
              type="number"
              min="1"
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
            />
          </div>
          <div>
            <Label>Kinder</Label>
            <Input
              type="number"
              min="0"
              value={children}
              onChange={(e) => setChildren(e.target.value)}
            />
          </div>
        </div>
        <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-sm">
          <Row label="Nettoeinkommen" value={fmtEUR(result.net_income)} />
          <Row label="Freibetrag gesamt" value={fmtEUR(result.total_freibetrag)} />
          <Row label="Verfügbares Einkommen" value={fmtEUR(result.disposable_income)} />
          <div className="mt-1 flex items-center justify-between border-t border-[color:var(--ds-border)] pt-1.5">
            <span className="font-semibold">Ergebnis</span>
            {result.eligible ? (
              <Badge className="bg-[color:var(--ds-success-solid)] text-[color:var(--ds-success-text)]">
                Voraussichtlich berechtigt
              </Badge>
            ) : (
              <Badge className="bg-[color:var(--ds-warning-solid)] text-[color:var(--ds-warning-text)]">
                Nicht berechtigt — Raten: {fmtEUR(result.monthly_contribution)}/Mo
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Freibeträge 2026: {fmtEUR(PKH_FREIBETRAEGE_2026.per_person)}/Person,{" "}
          {fmtEUR(PKH_FREIBETRAEGE_2026.additional_adult)}/zusätzl. Erwachs.,{" "}
          {fmtEUR(PKH_FREIBETRAEGE_2026.per_child)}/Kind
        </p>
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

function CourtCard() {
  const [courtQuery, setCourtQuery] = useState("");
  const courts = useMemo(
    () => searchCourts({ name: courtQuery, city: courtQuery }).slice(0, 8),
    [courtQuery]
  );

  return (
    <Tool title="Gerichtsverzeichnis" subtitle="SAFE-ID und Zuständigkeit">
      <Input
        value={courtQuery}
        onChange={(e) => setCourtQuery(e.target.value)}
        placeholder="Gericht oder Ort…"
      />
      <div className="mt-2 space-y-1">
        {courtQuery && courts.length === 0 && (
          <p className="text-xs text-[color:var(--ds-text-muted)]">Keine Treffer.</p>
        )}
        {courts.map((court) => (
          <div
            key={court.id}
            className="flex items-center justify-between rounded-lg bg-[color:var(--ds-surface-2)] px-3 py-2 text-xs"
          >
            <div>
              <span className="font-medium">{court.name}</span>
              {court.city && (
                <span className="text-[color:var(--ds-text-muted)]"> · {court.city}</span>
              )}
            </div>
            <Badge variant="default">{court.safe_id || "keine SAFE-ID"}</Badge>
          </div>
        ))}
      </div>
    </Tool>
  );
}

function CreditCard() {
  const [score, setScore] = useState("75");
  const credit = interpretCreditScore(Number(score) || 0);
  const RISK_COLORS: Record<string, string> = {
    low: "bg-[color:var(--ds-success-solid)] text-[color:var(--ds-success-text)]",
    medium: "bg-[color:var(--ds-warning-solid)] text-[color:var(--ds-warning-text)]",
    high: "bg-[color:var(--ds-danger-solid)] text-[color:var(--ds-danger-text)]",
  };

  return (
    <Tool title="Bonitäts-Einordnung" subtitle="Risiko-Klassifikation">
      <div>
        <Label>Bonitäts-Score (0-100)</Label>
        <Input
          type="number"
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
      <Input value={fax} onChange={(e) => setFax(e.target.value)} placeholder="+49 30 1234567" />
      <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-sm">
        {!fax && <span className="text-[color:var(--ds-text-muted)]">Nummer eingeben…</span>}
        {fax && !valid && (
          <Badge className="bg-[color:var(--ds-danger-solid)] text-[color:var(--ds-danger-text)]">
            Ungültiges Format
          </Badge>
        )}
        {fax && valid && (
          <div className="space-y-1">
            <Badge className="bg-[color:var(--ds-success-solid)] text-[color:var(--ds-success-text)]">
              Gültig
            </Badge>
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
            <Label>Gericht</Label>
            <Input
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="z.B. LG Berlin"
            />
          </div>
          <div>
            <Label>Aktenzeichen</Label>
            <Input
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="z.B. 2 O 123/26"
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
          />
          {parties.length > 1 && (
            <Button
              size="sm"
              variant="secondary"
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
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-8">
      <PageHeader
        title="Kanzlei-Werkzeuge"
        description="Fachrechner, Register, Integrationen und Compliance an einem Ort"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Werkzeuge" }]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <GkgCard />
        <PkhCard />
        <CourtCard />
        <CreditCard />
        <FaxCard />
        <RubrumCard />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((capability) => {
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
        <Link href="/dashboard/bea">
          <Button>beA / XJustiz öffnen</Button>
        </Link>
        <Link href="/dashboard/fibu">
          <Button variant="secondary">FiBu öffnen</Button>
        </Link>
        <Link href="/dashboard/autonomous">
          <Button variant="secondary">Autopilot öffnen</Button>
        </Link>
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
        className="flex-1"
      />
      <Button onClick={onSave} disabled={saving} size="sm">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
        In Akte
      </Button>
    </div>
  );
}
