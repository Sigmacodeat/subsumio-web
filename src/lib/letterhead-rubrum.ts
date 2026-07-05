/**
 * Briefkopf & Rubrum-Generator
 * =============================
 * Law firm letterhead as settings asset + rubrum auto-generation
 * from case parties (plaintiff/defendant/case-number/court).
 */

export interface LetterheadConfig {
  firm_name: string;
  address_line_1: string;
  address_line_2?: string;
  zip_city: string;
  phone?: string;
  fax?: string;
  email?: string;
  website?: string;
  logo_url?: string;
  lawyers: Array<{
    name: string;
    title: string;
    bar_number?: string;
  }>;
  tax_number?: string;
  vat_id?: string;
  bank_details?: {
    iban: string;
    bic: string;
    bank_name: string;
  };
}

export interface RubrumParty {
  role: "plaintiff" | "defendant" | "third_party";
  name: string;
  address?: string;
  legal_form?: string;
  representative?: string;
}

export interface RubrumData {
  court: string;
  case_number: string;
  plaintiffs: RubrumParty[];
  defendants: RubrumParty[];
  date?: string;
}

export function generateRubrum(data: RubrumData): string {
  const lines: string[] = [];

  if (data.court) lines.push(`Gericht: ${data.court}`);
  if (data.case_number) lines.push(`Aktenzeichen: ${data.case_number}`);
  lines.push("");

  const formatParty = (p: RubrumParty): string => {
    const parts = [p.name];
    if (p.legal_form) parts.push(`(${p.legal_form})`);
    if (p.address) parts.push(`, ${p.address}`);
    if (p.representative) parts.push(`, vertreten durch: ${p.representative}`);
    return parts.join("");
  };

  if (data.plaintiffs.length > 0) {
    lines.push("Kläger:");
    data.plaintiffs.forEach((p, i) => {
      lines.push(`  ${i + 1}. ${formatParty(p)}`);
    });
    lines.push("");
  }

  if (data.defendants.length > 0) {
    lines.push("Beklagte:");
    data.defendants.forEach((p, i) => {
      lines.push(`  ${i + 1}. ${formatParty(p)}`);
    });
    lines.push("");
  }

  if (data.date) lines.push(`Datum: ${data.date}`);

  return lines.join("\n");
}

export function generateLetterhead(config: LetterheadConfig): string {
  const lines: string[] = [];
  if (config.logo_url) lines.push(`![Logo](${config.logo_url})`);
  lines.push("");
  lines.push(`**${config.firm_name}**`);
  lines.push(config.address_line_1);
  if (config.address_line_2) lines.push(config.address_line_2);
  lines.push(config.zip_city);
  lines.push("");
  const contactParts: string[] = [];
  if (config.phone) contactParts.push(`Tel: ${config.phone}`);
  if (config.fax) contactParts.push(`Fax: ${config.fax}`);
  if (config.email) contactParts.push(`E-Mail: ${config.email}`);
  if (config.website) contactParts.push(`Web: ${config.website}`);
  if (contactParts.length > 0) lines.push(contactParts.join(" · "));
  lines.push("");
  if (config.lawyers.length > 0) {
    lines.push("Anwälte:");
    config.lawyers.forEach((l) => {
      const parts = [l.name, l.title];
      if (l.bar_number) parts.push(`(RA-Nr. ${l.bar_number})`);
      lines.push(`  ${parts.join(", ")}`);
    });
  }
  return lines.join("\n");
}
