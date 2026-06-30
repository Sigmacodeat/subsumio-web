"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  User,
  Users,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Briefcase,
} from "lucide-react";
import type { TaxClient } from "@/lib/tax-types";
import { useLang } from "@/lib/use-lang";

interface TaxClientProfileCardProps {
  client: TaxClient;
  stats?: {
    openReturns?: number;
    openAssessments?: number;
    openAudits?: number;
    totalAssessed?: number;
  };
}

const TYPE_ICONS = {
  person: User,
  company: Building2,
  partnership: Users,
  estate: Briefcase,
} as const;

const TYPE_LABELS = {
  de: {
    person: "Privatperson",
    company: "Unternehmen",
    partnership: "Personengesellschaft",
    estate: "Nachlass",
  },
  en: { person: "Individual", company: "Company", partnership: "Partnership", estate: "Estate" },
} as const;

export function TaxClientProfileCard({ client, stats }: TaxClientProfileCardProps) {
  const { lang } = useLang();
  const TypeIcon = TYPE_ICONS[client.type] ?? User;
  const langKey = (lang === "en" ? "en" : "de") as "de" | "en";
  const typeLabel = TYPE_LABELS[langKey][client.type];

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="brand-soft brand-border flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border">
          <TypeIcon size={22} className="brand-text" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-[color:var(--ds-text)]">
            {client.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="default">{typeLabel}</Badge>
            <span className="text-xs text-[color:var(--ds-text-subtle)]">StNr: {client.taxId}</span>
            {client.vatId && (
              <span className="text-xs text-[color:var(--ds-text-subtle)]">
                USt-IdNr: {client.vatId}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {client.contactEmail && <InfoRow icon={Mail} label="Email" value={client.contactEmail} />}
        {client.contactPhone && (
          <InfoRow icon={Phone} label="Telefon" value={client.contactPhone} />
        )}
        {client.address && (
          <InfoRow
            icon={MapPin}
            label="Adresse"
            value={`${client.address.street}, ${client.address.postalCode} ${client.address.city}`}
          />
        )}
        <InfoRow
          icon={Calendar}
          label={lang === "en" ? "Fiscal Year" : "Wirtschaftsjahr"}
          value={`${client.fiscalYearStart.slice(5)} – ${client.fiscalYearEnd.slice(5)}`}
        />
        {client.industryCode && (
          <InfoRow
            icon={Briefcase}
            label={lang === "en" ? "Industry" : "Branche"}
            value={client.industryCode}
          />
        )}
      </div>

      {stats && (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[color:var(--ds-border)] pt-4 sm:grid-cols-4">
          <StatItem
            icon={FileText}
            label={lang === "en" ? "Open Returns" : "Offene Erklärungen"}
            value={stats.openReturns ?? 0}
            colorVar="--ds-text"
          />
          <StatItem
            icon={FileText}
            label={lang === "en" ? "Open Assessments" : "Offene Bescheide"}
            value={stats.openAssessments ?? 0}
            colorVar="--ds-text"
          />
          <StatItem
            icon={FileText}
            label={lang === "en" ? "Open Audits" : "Offene Prüfungen"}
            value={stats.openAudits ?? 0}
            colorVar="--ds-text"
          />
          <StatItem
            icon={FileText}
            label={lang === "en" ? "Total Assessed" : "Festgesetzt gesamt"}
            value={`${(stats.totalAssessed ?? 0).toLocaleString(lang === "en" ? "en-GB" : "de-DE")} €`}
            colorVar="--brand-primary"
          />
        </div>
      )}
    </Card>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="shrink-0 text-[color:var(--ds-text-subtle)]" />
      <div className="min-w-0">
        <p className="text-xs text-[color:var(--ds-text-subtle)]">{label}</p>
        <p className="truncate text-sm text-[color:var(--ds-text)]">{value}</p>
      </div>
    </div>
  );
}

function StatItem({
  icon: Icon,
  label,
  value,
  colorVar,
}: {
  icon: typeof FileText;
  label: string;
  value: string | number;
  colorVar: string;
}) {
  return (
    <div className="text-center">
      <Icon size={14} className="mx-auto mb-1" style={{ color: `var(${colorVar})` }} />
      <p className="text-xs text-[color:var(--ds-text-muted)]">{label}</p>
      <p className="text-sm font-bold" style={{ color: `var(${colorVar})` }}>
        {value}
      </p>
    </div>
  );
}
