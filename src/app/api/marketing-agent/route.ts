import { NextRequest, NextResponse } from "next/server";
import { hit, clientIp } from "@/lib/auth/rate-limit";
import { profileForIndustry } from "@/lib/industry-pack";
import { PRICING, type Lang } from "@/content/site";
import { createMarketingLead, summarizeLead } from "@/lib/marketing/leads";

type FieldKey = "industry" | "teamSize" | "useCase" | "hosting" | "timeline" | "email";

interface AdvisorMessage {
  role: "user" | "assistant";
  content: string;
}

interface AdvisorContext {
  lang?: Lang;
  path?: string;
  industry?: string | null;
  fields?: Partial<Record<FieldKey, string>>;
  messages?: AdvisorMessage[];
  consent?: boolean;
}

const INDUSTRY_WORDS: Record<string, string[]> = {
  legal: ["law", "legal", "kanzlei", "anwalt", "rechts", "subsumio", "akte", "frist"],
};

const ROUTE_INDUSTRY: Record<string, string> = {
  "/subsumio": "legal",
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function langOf(input: AdvisorContext): Lang {
  return input.lang === "de" ? "de" : "en";
}

function localizedPath(lang: Lang, href: string): string {
  if (href.startsWith("mailto:")) return href;
  return lang === "de" ? `/de${href}` : href;
}

function latestUserText(messages: AdvisorMessage[] | undefined): string {
  return [...(messages ?? [])].reverse().find((m) => m.role === "user")?.content ?? "";
}

function inferIndustry(ctx: AdvisorContext, text: string): string | null {
  if (ctx.industry && profileForIndustry(ctx.industry)) return ctx.industry;
  const path = (ctx.path ?? "").replace(/^\/de/, "") || "/";
  for (const [prefix, industry] of Object.entries(ROUTE_INDUSTRY)) {
    if (path.startsWith(prefix)) return industry;
  }
  const lower = text.toLowerCase();
  for (const [industry, words] of Object.entries(INDUSTRY_WORDS)) {
    if (words.some((word) => lower.includes(word))) return industry;
  }
  return null;
}

function extractFields(fields: AdvisorContext["fields"], text: string): Partial<Record<FieldKey, string>> {
  const next = { ...(fields ?? {}) };
  const lower = text.toLowerCase();
  const email = text.match(EMAIL_RE)?.[0];
  if (email) next.email = email.toLowerCase();
  if (!next.teamSize) {
    const seatMatch = lower.match(/(\d{1,4})\s*(seat|seats|user|users|people|employees|brokers|lawyers|consultants|advisors|personen|mitglieder|leute|anwälte|berater|makler|team)/);
    if (seatMatch) next.teamSize = seatMatch[1];
    else if (/^\s*25\+\s*$/.test(text)) next.teamSize = "25";
    else if (/^\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\s*$/.test(text)) next.teamSize = text.match(/\d{1,3}\s*$/)?.[0] ?? text;
    else if (/^\s*\d{1,4}\s*$/.test(text)) next.teamSize = text.trim();
  }
  if (!next.hosting) {
    if (/(self.?host|on.?prem|eigene hardware|own infrastructure|eigene infra)/i.test(text)) next.hosting = "self-hosted";
    if (/(eu cloud|hosted|managed|cloud|gehostet)/i.test(text)) next.hosting = "eu-cloud";
  }
  if (!next.timeline) {
    if (/(now|asap|sofort|diese woche|this week|dringend)/i.test(text)) next.timeline = "now";
    else if (/(quarter|quartal|month|monat|soon|bald)/i.test(text)) next.timeline = "quarter";
    else if (/(later|später|evaluieren|explore)/i.test(text)) next.timeline = "later";
  }
  if (!next.useCase) {
    if (/(search|suche|finden|knowledge|wissen|gedächtnis)/i.test(text)) next.useCase = "knowledge search";
    if (/(compliance|audit|dsgvo|gdpr|ai act|aml)/i.test(text)) next.useCase = "compliance";
    if (/(onboard|einarbeitung|new hire|neue mitarbeiter)/i.test(text)) next.useCase = "onboarding";
    if (/(deadline|frist|renewal|wiedervorlage)/i.test(text)) next.useCase = "deadline memory";
  }
  return next;
}

function planFor(fields: Partial<Record<FieldKey, string>>): "free" | "pro" | "team" | "enterprise" {
  const seats = Number.parseInt(fields.teamSize ?? "", 10);
  const hosting = fields.hosting ?? "";
  const text = Object.values(fields).join(" ").toLowerCase();
  if (seats >= 25 || hosting === "self-hosted" || /sso|saml|scim|on.?prem|soc|iso|enterprise/.test(text)) return "enterprise";
  if (seats >= 2) return "team";
  if (fields.useCase || fields.industry) return "pro";
  return "free";
}

function scoreLead(fields: Partial<Record<FieldKey, string>>, plan: string): "low" | "medium" | "high" | "enterprise" {
  if (plan === "enterprise") return "enterprise";
  const filled = ["industry", "teamSize", "useCase", "hosting", "timeline", "email"].filter((key) => fields[key as FieldKey]).length;
  if (filled >= 4 || fields.email) return "high";
  if (filled >= 2) return "medium";
  return "low";
}

function missingQuestion(lang: Lang, fields: Partial<Record<FieldKey, string>>, industry: string | null): string | null {
  if (!industry) return lang === "de" ? "Welche Branche passt am ehesten?" : "Which industry fits you best?";
  if (!fields.useCase) return lang === "de" ? "Was ist euer dringendster Schmerz: Suche, Onboarding, Compliance, Fristen oder Dokumentenchaos?" : "What is the urgent pain: search, onboarding, compliance, deadlines or document chaos?";
  if (!fields.teamSize) return lang === "de" ? "Wie groß ist das Team, das mit dem Brain arbeiten soll?" : "How many people should work with the brain?";
  if (!fields.hosting) return lang === "de" ? "Bevorzugt ihr EU Cloud, Self-hosting oder On-prem?" : "Do you prefer EU cloud, self-hosting or on-prem?";
  if (!fields.timeline) return lang === "de" ? "Geht es um sofort starten, dieses Quartal oder nur Evaluierung?" : "Are you looking to start now, this quarter, or just evaluating?";
  return null;
}

function chipsFor(lang: Lang, fields: Partial<Record<FieldKey, string>>, industry: string | null): string[] {
  if (!industry) return lang === "de"
    ? ["Kanzlei"]
    : ["Law firm"];
  if (!fields.useCase) return lang === "de"
    ? ["Wissen schneller finden", "Team onboarden", "Fristen/Renewals", "Compliance-Nachweise"]
    : ["Find knowledge faster", "Onboard the team", "Deadlines/renewals", "Compliance evidence"];
  if (!fields.teamSize) return ["1", "2-5", "6-25", "25+"];
  if (!fields.hosting) return ["EU Cloud", "Self-hosted", "On-prem"];
  if (!fields.timeline) return lang === "de" ? ["Sofort", "Dieses Quartal", "Nur evaluieren"] : ["Now", "This quarter", "Just evaluating"];
  return lang === "de" ? ["Mit dieser Konfiguration starten", "Enterprise sprechen", "Vergleich ansehen"] : ["Start with this setup", "Talk enterprise", "See comparison"];
}

function answerProductQuestion(lang: Lang, text: string, industry: string | null): string | null {
  const lower = text.toLowerCase();
  const profile = industry ? profileForIndustry(industry) : null;
  if (/(price|pricing|preis|kosten|plan|tarif)/.test(lower)) {
    return lang === "de"
      ? `Kurz: Open Source ist kostenlos, Pro startet bei ${PRICING.de.tiers[1].price}/Monat, Team bei ${PRICING.de.tiers[2].price}/Monat. Für SSO, On-prem, 25+ Seats oder regulierte Rollouts ist Enterprise richtig.`
      : `Short version: Open Source is free, Pro starts at ${PRICING.en.tiers[1].price}/month, Team at ${PRICING.en.tiers[2].price}/month. SSO, on-prem, 25+ seats or regulated rollouts belong in Enterprise.`;
  }
  if (/(security|privacy|gdpr|dsgvo|hosting|self.?host|on.?prem|daten)/.test(lower)) {
    return lang === "de"
      ? "Security-Logik: Public Chat sieht keine Tenant-Daten. Für das Produkt selbst habt ihr die Wahl zwischen Open-Source Self-hosting, eigener Infrastruktur oder gemanagter EU-Cloud. Team-Zugriffe sind pro Nutzer gescoped."
      : "Security model: this public chat never sees tenant data. The product can run as open-source self-hosting, on your infrastructure, or in managed EU cloud. Team access is scoped per user.";
  }
  if (/(compare|better|besser|unterschied|chatgpt|notion|glean|dms|drive)/.test(lower)) {
    return lang === "de"
      ? "Der Unterschied: Chatbots beantworten Prompts, DMS/Drive speichern Dateien. Subsumio baut ein dauerhaftes Brain über eure eigenen Daten: Hybrid-Suche, Graph, belegte Synthese und explizite Lücken."
      : "The difference: chatbots answer prompts, DMS/Drive store files. Subsumio builds a durable brain over your own data: hybrid search, graph, cited synthesis and explicit gaps.";
  }
  if (profile && /(what|was|kann|does|product|produkt|lösung|solution)/.test(lower)) {
    return lang === "de"
      ? `${profile.brand} ist Subsumio für ${profile.label.de}: ${profile.signature.proof.de}`
      : `${profile.brand} is Subsumio for ${profile.label.en}: ${profile.signature.proof.en}`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const limit = await hit(`marketing-agent:${clientIp(req.headers)}`, 30, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: AdvisorContext;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const lang = langOf(body);
  const text = latestUserText(body.messages).slice(0, 600);
  const industry = inferIndustry(body, text);
  const fields = extractFields({ ...(body.fields ?? {}), ...(industry ? { industry } : {}) }, text);
  const profile = industry ? profileForIndustry(industry) : null;
  const productAnswer = answerProductQuestion(lang, text, industry);
  const plan = planFor(fields);
  const leadScore = scoreLead(fields, plan);
  const question = missingQuestion(lang, fields, industry);
  const planLabel = plan === "enterprise" ? "Enterprise" : plan === "team" ? "Team" : plan === "pro" ? "Pro" : "Open Source";
  const signupIndustry = industry ? `?industry=${encodeURIComponent(industry)}${plan === "team" ? "&plan=team" : ""}` : "";
  const ctaHref = plan === "enterprise"
    ? "mailto:hello@subsum.eu?subject=Subsumio%20Enterprise"
    : localizedPath(lang, `/signup${signupIndustry}`);

  const intro = productAnswer ?? (lang === "de"
    ? profile
      ? `${profile.brand} passt grundsätzlich gut für ${profile.label.de}. Ich qualifiziere kurz, damit du nicht im falschen Plan landest.`
      : "Ich kann dich zu Subsumio beraten: KI-Legal-Software für Kanzleien in AT, DE und CH."
    : profile
      ? `${profile.brand} looks like a good fit for ${profile.label.en}. I’ll qualify the setup so you don’t land in the wrong plan.`
      : "I can advise you on Subsumio: AI legal software for law firms in AT, DE and CH.");

  const recommendation = lang === "de"
    ? `Empfehlung bisher: ${planLabel}${profile ? ` · ${profile.brand}` : ""}. Lead-Fit: ${leadScore}.`
    : `Current recommendation: ${planLabel}${profile ? ` · ${profile.brand}` : ""}. Lead fit: ${leadScore}.`;

  const privacy = lang === "de"
    ? "Bitte keine vertraulichen Mandanten- oder Patientendaten in diesen öffentlichen Chat schreiben."
    : "Please don’t enter confidential client or patient data in this public chat.";

  const reply = [intro, recommendation, question ? question : (lang === "de" ? "Du kannst mit dieser Konfiguration starten oder Enterprise direkt anschreiben." : "You can start with this setup or talk to Enterprise directly."), privacy].join("\n\n");
  const transcript = [...(body.messages ?? []), { role: "assistant" as const, content: reply }].slice(-12);
  const summary = summarizeLead({
    email: fields.email ?? "",
    lang,
    path: body.path ?? "/",
    industry,
    product: profile?.brand ?? "Subsumio",
    plan: planLabel,
    leadScore,
    fields: Object.fromEntries(Object.entries(fields).filter((entry): entry is [string, string] => Boolean(entry[1]))),
    transcript,
  });

  let savedLead: { id: string; notified: { email: boolean; slack: boolean } } | null = null;
  if (body.consent === true && fields.email) {
    const lead = await createMarketingLead({
      email: fields.email,
      lang,
      path: body.path ?? "/",
      industry,
      product: profile?.brand ?? "Subsumio",
      plan: planLabel,
      leadScore,
      fields: Object.fromEntries(Object.entries(fields).filter((entry): entry is [string, string] => Boolean(entry[1]))),
      transcript,
      summary,
      consent: true,
    });
    savedLead = { id: lead.id, notified: lead.notified };
  }

  return NextResponse.json({
    reply,
    fields,
    industry,
    leadScore,
    recommendation: {
      plan,
      label: planLabel,
      product: profile?.brand ?? "Subsumio",
      cta: lang === "de" ? (plan === "enterprise" ? "Enterprise anfragen" : "Mit Setup starten") : (plan === "enterprise" ? "Talk enterprise" : "Start with setup"),
      href: ctaHref,
      compareHref: localizedPath(lang, "/compare"),
    },
    chips: chipsFor(lang, fields, industry),
    capture: {
      eligible: Boolean(fields.email),
      saved: Boolean(savedLead),
      leadId: savedLead?.id ?? null,
      summary,
      message: savedLead
        ? (lang === "de" ? "Gespeichert. Wir melden uns mit Kontext." : "Saved. We’ll follow up with context.")
        : fields.email
          ? (lang === "de" ? "E-Mail erkannt. Mit Zustimmung kann ich diesen Verlauf ans Team geben." : "Email detected. With consent, I can pass this conversation to the team.")
          : (lang === "de" ? "Wenn du möchtest, gib eine E-Mail an und aktiviere die Übergabe." : "If you want follow-up, share an email and enable handoff."),
    },
  });
}
