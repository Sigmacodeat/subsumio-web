"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Save, Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import { interpretCreditScore } from "@/lib/credit-check";
import { generateRubrum, type RubrumParty } from "@/lib/letterhead-rubrum";
import { validateFaxNumber, formatFaxNumber } from "@/lib/fax-gateway";
import { isRetiredApiPath } from "@/lib/retired-routes";

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
    description: "Versand und Zustellung nachverfolgen",
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
    description: "Schriftsätze aus Sicht der Gegenseite prüfen",
    key: "createRedTeamPrompt",
    href: "/dashboard/red-team",
  },
  {
    name: "Diktate",
    description: "Diktate von der Aufnahme bis zur Ablage verfolgen",
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
    description: "Viele Akten aus einer Tabelle (CSV) prüfen und übernehmen",
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
  const RISK_LABELS: Record<string, string> = {
    low: "Niedrig",
    medium: "Mittel",
    high: "Hoch",
    unknown: "Unbekannt",
  };
  const BEHAVIOR_LABELS: Record<string, string> = {
    good: "gut",
    average: "durchschnittlich",
    poor: "schwach",
    unknown: "unbekannt",
  };

  return (
    <Tool
      title="Bonitäts-Einordnung"
      subtitle="Ordnet einen bekannten Bonitätswert einer Risikostufe zu."
    >
      <div>
        <Label htmlFor="credit-score">Bonitätswert (0–100)</Label>
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
          <span className="text-[color:var(--ds-text-muted)]">Risikostufe</span>
          <Badge className={RISK_COLORS[credit.risk_level] ?? ""}>
            {RISK_LABELS[credit.risk_level] ?? "Unbekannt"}
          </Badge>
        </div>
        <Row
          label="Zahlungsverhalten"
          value={BEHAVIOR_LABELS[credit.payment_behavior ?? "unknown"] ?? "unbekannt"}
        />
      </div>
      <p className="text-xs text-[color:var(--ds-text-muted)]">
        Die Einordnung erfolgt nur anhand des eingegebenen Werts. Es werden keine Daten an eine
        Auskunftei übermittelt.
      </p>
    </Tool>
  );
}

function FaxCard() {
  const [fax, setFax] = useState("");
  const valid = fax ? validateFaxNumber(fax) : null;
  const formatted = fax && valid ? formatFaxNumber(fax) : null;

  return (
    <Tool
      title="Fax-Prüfung"
      subtitle="Prüft, ob eine Faxnummer vollständig und richtig aufgebaut ist."
    >
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
  const casesQuery = useQuery({
    queryKey: ["kanzlei-tools", "cases"],
    queryFn: () => api.brain.listAllPages({ type: "legal_case", max: 1000 }),
    staleTime: 60_000,
  });
  const cases = (casesQuery.data ?? [])
    .filter((c) => (c.frontmatter as Record<string, unknown> | undefined)?.status !== "archived")
    .sort((a, b) => a.title.localeCompare(b.title, "de"));
  const [saving, setSaving] = useState(false);

  const rubrum = useMemo(() => {
    const vp = plaintiffs.filter((p) => p.name.trim());
    const vd = defendants.filter((p) => p.name.trim());
    if (!court && !caseNumber && vp.length === 0 && vd.length === 0) return "";
    return generateRubrum({ court, case_number: caseNumber, plaintiffs: vp, defendants: vd });
  }, [court, caseNumber, plaintiffs, defendants]);

  const saveToCase = async () => {
    if (!caseSlug) {
      addToast({ type: "error", title: "Bitte wählen Sie eine Akte aus." });
      return;
    }
    if (!rubrum) {
      addToast({ type: "error", title: "Bitte füllen Sie das Rubrum zuerst aus." });
      return;
    }
    setSaving(true);
    try {
      await api.brain.createPage({
        slug: `${caseSlug}/rubrum-${Date.now()}`,
        title: `Rubrum — ${caseNumber || "ohne Aktenzeichen"}`,
        type: "rubrum",
        content: rubrum,
        frontmatter: { court, case_number: caseNumber, generated_at: new Date().toISOString() },
      });
      addToast({ type: "success", title: "Rubrum in Akte übernommen" });
    } catch {
      addToast({
        type: "error",
        title: "Das Rubrum konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Tool
      title="Rubrum-Generator"
      subtitle="Erstellt den Kopf eines Schriftsatzes aus Gericht, Aktenzeichen und Parteien."
    >
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
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
        <PartyList
          label="Kläger"
          singular="Kläger"
          parties={plaintiffs}
          setParties={setPlaintiffs}
        />
        <PartyList
          label="Beklagte"
          singular="Beklagter"
          parties={defendants}
          setParties={setDefendants}
        />
        {rubrum && <Result>{rubrum}</Result>}
        <SaveToCase
          caseSlug={caseSlug}
          setCaseSlug={setCaseSlug}
          cases={cases.map((c) => ({ slug: c.slug, title: c.title }))}
          loading={casesQuery.isLoading}
          onSave={saveToCase}
          saving={saving}
        />
      </div>
    </Tool>
  );
}

function PartyList({
  label,
  singular,
  parties,
  setParties,
}: {
  label: string;
  singular: string;
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
          aria-label={`${singular} hinzufügen`}
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
            placeholder={`${singular} ${idx + 1}`}
            aria-label={`${singular} ${idx + 1}`}
          />
          {parties.length > 1 && (
            <Button
              size="sm"
              variant="secondary"
              aria-label={`${singular} ${idx + 1} entfernen`}
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

type RechnerKey =
  | "gkg"
  | "streitwert"
  | "familienrecht"
  | "arbeitsrecht"
  | "verkehrsrecht"
  | "mietrecht"
  | "erbrecht";

const RECHNER_OPTIONS: Array<{ key: RechnerKey; label: string }> = [
  { key: "gkg", label: "GKG-Gerichtskosten" },
  { key: "streitwert", label: "Streitwert bestimmen" },
  { key: "familienrecht", label: "Familienrecht" },
  { key: "arbeitsrecht", label: "Arbeitsrecht" },
  { key: "verkehrsrecht", label: "Verkehrsrecht" },
  { key: "mietrecht", label: "Mietrecht" },
  { key: "erbrecht", label: "Erbrecht" },
];

const eur = (n: number) => n.toLocaleString("de-AT", { style: "currency", currency: "EUR" });

function FachrechnerCard() {
  const [rechner, setRechner] = useState<RechnerKey>("gkg");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | number | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));
  const num = (k: string) => (fields[k] ? Number(fields[k]) : undefined);

  async function calculate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const input: Record<string, unknown> = {};
      switch (rechner) {
        case "gkg":
          input.streitwert = num("streitwert") ?? 0;
          break;
        case "streitwert":
          input.art = fields.streitwertArt ?? "einmalig";
          input.betrag = num("betrag") ?? 0;
          if (num("faktor")) input.faktor = num("faktor");
          break;
        case "familienrecht":
          input.verfahrensart = fields.verfahrensart ?? "ehesachen";
          input.streitwert = num("streitwert") ?? 0;
          if (num("einkommenMonatlich")) input.einkommenMonatlich = num("einkommenMonatlich");
          break;
        case "arbeitsrecht":
          input.streitwert = num("streitwert") ?? 0;
          input.withTermin = fields.withTermin === "on" || fields.withTermin === "true";
          break;
        case "verkehrsrecht":
          for (const k of [
            "reparaturkosten",
            "gutachterkosten",
            "mietwagenkosten",
            "nutzungsausfall",
            "heilbehandlungskosten",
            "schmerzensgeld",
            "verdienstausfall",
            "generalpauschale",
          ]) {
            if (num(k)) input[k] = num(k);
          }
          break;
        case "mietrecht":
          input.art = fields.mietArt ?? "raeumungsklage";
          input.streitwert = num("streitwert") ?? 0;
          if (num("monatsmiete")) input.monatsmiete = num("monatsmiete");
          if (num("monateRueckstand")) input.monateRueckstand = num("monateRueckstand");
          break;
        case "erbrecht":
          input.art = fields.erbArt ?? "erbschein";
          input.nachlasswert = num("nachlasswert") ?? 0;
          break;
      }
      const res = await fetch("/api/fachrechner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ rechner, input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data.data ?? data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Berechnung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  const renderResult = (v: unknown, depth = 0): React.ReactNode => {
    if (typeof v === "number") return <span className="font-medium tabular-nums">{eur(v)}</span>;
    if (typeof v === "string") return <span className="font-medium">{v}</span>;
    if (Array.isArray(v))
      return (
        <div className="space-y-0.5">
          {v.map((item, i) => (
            <div key={i}>{renderResult(item, depth + 1)}</div>
          ))}
        </div>
      );
    if (v && typeof v === "object") {
      return (
        <div className={depth > 0 ? "space-y-0.5" : "divide-y divide-[color:var(--ds-border)]"}>
          {Object.entries(v as Record<string, unknown>).map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 py-0.5">
              <span className="text-[color:var(--ds-text-muted)]">{k}</span>
              <span className="text-right">{renderResult(val, depth + 1)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const money = (k: string, label: string) => (
    <div key={k}>
      <Label htmlFor={`fr-${k}`}>{label}</Label>
      <Input
        id={`fr-${k}`}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={fields[k] ?? ""}
        onChange={set(k)}
      />
    </div>
  );
  const select = (k: string, label: string, options: Array<[string, string]>) => (
    <div key={k}>
      <Label htmlFor={`fr-${k}`}>{label}</Label>
      <select
        id={`fr-${k}`}
        value={fields[k] ?? ""}
        onChange={set(k)}
        className="h-9 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 text-sm text-[color:var(--ds-text)]"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Tool
      title="Fachrechner (DE)"
      subtitle="Gerichtskosten, Streitwert und rechtsgebietsbezogene Berechnungen."
    >
      <div>
        <Label htmlFor="fr-rechner">Rechner</Label>
        <select
          id="fr-rechner"
          value={rechner}
          onChange={(e) => {
            setRechner(e.target.value as RechnerKey);
            setResult(null);
            setError(null);
          }}
          className="h-9 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 text-sm text-[color:var(--ds-text)]"
        >
          {RECHNER_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(rechner === "gkg" || rechner === "familienrecht" || rechner === "arbeitsrecht") &&
          money("streitwert", "Streitwert (EUR)")}
        {rechner === "streitwert" && (
          <>
            {select("streitwertArt", "Art", [
              ["einmalig", "Einmalige Leistung"],
              ["unterhalt_monatlich", "Unterhalt (monatlich)"],
              ["rente_monatlich", "Rente (monatlich)"],
              ["wohnung_miete", "Wohnung/Miete"],
            ])}
            {money("betrag", "Betrag (EUR)")}
            {money("faktor", "Faktor (optional)")}
          </>
        )}
        {rechner === "familienrecht" && (
          <>
            {select("verfahrensart", "Verfahrensart", [
              ["ehesachen", "Ehesache"],
              ["folgesachen", "Folgesache"],
              ["elterliche_sorge", "Elterliche Sorge"],
              ["unterhalt", "Unterhalt"],
              ["verfahrenskostenhilfe", "Verfahrenskostenhilfe"],
            ])}
            {money("einkommenMonatlich", "Einkommen monatlich (opt.)")}
          </>
        )}
        {rechner === "arbeitsrecht" && (
          <label className="flex items-center gap-2 pt-6 text-sm text-[color:var(--ds-text)]">
            <input
              type="checkbox"
              checked={fields.withTermin === "on"}
              onChange={set("withTermin")}
            />
            mit Termin
          </label>
        )}
        {rechner === "verkehrsrecht" && (
          <>
            {money("reparaturkosten", "Reparaturkosten")}
            {money("gutachterkosten", "Gutachterkosten")}
            {money("mietwagenkosten", "Mietwagenkosten")}
            {money("nutzungsausfall", "Nutzungsausfall")}
            {money("schmerzensgeld", "Schmerzensgeld")}
            {money("verdienstausfall", "Verdienstausfall")}
          </>
        )}
        {rechner === "mietrecht" && (
          <>
            {select("mietArt", "Art", [
              ["raeumungsklage", "Räumungsklage"],
              ["mieterhoehung", "Mieterhöhung"],
              ["mietminderung", "Mietminderung"],
              ["betriebskostenabrechnung", "Betriebskostenabrechnung"],
            ])}
            {money("streitwert", "Streitwert (EUR)")}
            {money("monatsmiete", "Monatsmiete (opt.)")}
            {money("monateRueckstand", "Monate Rückstand (opt.)")}
          </>
        )}
        {rechner === "erbrecht" && (
          <>
            {select("erbArt", "Art", [
              ["erbschein", "Erbschein"],
              ["nachlassverwaltung", "Nachlassverwaltung"],
              ["erbstreitigkeit", "Erbstreitigkeit"],
            ])}
            {money("nachlasswert", "Nachlasswert (EUR)")}
          </>
        )}
      </div>
      <Button onClick={() => void calculate()} disabled={busy} size="sm">
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
        Berechnen
      </Button>
      {error && (
        <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
          {error}
        </p>
      )}
      {result !== null && (
        <div className="rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-sm">
          {typeof result === "number" ? (
            <Row label="Ergebnis:" value={eur(result)} />
          ) : (
            renderResult(result)
          )}
        </div>
      )}
    </Tool>
  );
}

export function KanzleiTools() {
  const capabilities = CAPABILITIES;
  // The Fachrechner (GKG, Streitwert, RVG-nahe Rechner) is German law and
  // its API is a DE surface — same gating as the sidebar's DE_ONLY_HREFS.
  // Austrian firms price court fees and fees in the invoice dialog
  // (RATG/AHK/GGG); for them the card would only answer 410.
  const { data: me } = useMe();
  // Retired for the pilot, the API answers 410 for everyone — no card then.
  const showGermanCalculators =
    me?.user?.jurisdiction === "DE" && !isRetiredApiPath("/api/fachrechner");
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-8">
      <PageHeader
        title="Kanzlei-Werkzeuge"
        description="Kleine Prüf- und Schreibhilfen sowie spezialisierte Kanzleiabläufe an einem Ort."
        breadcrumbs={[{ label: "Übersicht", href: "/dashboard" }, { label: "Kanzlei-Werkzeuge" }]}
        actions={
          <Button variant="secondary" asChild>
            <Link href="/dashboard/fibu" className="whitespace-nowrap">
              Finanzbuchhaltung öffnen
            </Link>
          </Button>
        }
      />
      <h2 className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
        Prüf- und Schreibhilfen
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <CreditCard />
        <FaxCard />
        <RubrumCard />
        {showGermanCalculators && <FachrechnerCard />}
      </div>
      <h2 className="text-xs font-medium tracking-wide text-[color:var(--ds-text-muted)] uppercase">
        Weitere Kanzleiabläufe
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map((capability) => {
          const comingSoon = "comingSoon" in capability && capability.comingSoon;
          const href = "href" in capability ? capability.href : undefined;
          const content = (
            <>
              <h3 className="text-sm font-semibold">{capability.name}</h3>
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
              className="block rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,box-shadow] duration-[var(--ds-duration-fast)] hover:border-[color:var(--ds-border-strong)] hover:shadow-sm"
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
        <h3 className="font-semibold">{title}</h3>
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
  cases,
  loading,
  onSave,
  saving,
}: {
  caseSlug: string;
  setCaseSlug: (v: string) => void;
  cases: { slug: string; title: string }[];
  loading: boolean;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <select
        value={caseSlug}
        onChange={(e) => setCaseSlug(e.target.value)}
        aria-label="Akte, in der das Rubrum abgelegt wird"
        disabled={loading}
        className="h-9 min-w-0 flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 text-sm text-[color:var(--ds-text)]"
      >
        <option value="">{loading ? "Akten werden geladen …" : "Akte auswählen"}</option>
        {cases.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.title}
          </option>
        ))}
      </select>
      <Button onClick={onSave} disabled={saving} size="sm" className="whitespace-nowrap">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
        In Akte ablegen
      </Button>
    </div>
  );
}
