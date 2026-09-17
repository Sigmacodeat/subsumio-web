// Plattform-Betreiber (Subsumio-SaaS-Team) — bewusst getrennt von KanzleiRole.
//
// KanzleiRole "admin" verwaltet genau EINE Kanzlei. Betreiberfunktionen
// (kanzleiübergreifende Nutzung und Margen, Nutzer aller Mandanten, Korpus,
// Backup/DR, Feature-Flags, Support-Mailbox) dürfen nie an dieser Rolle hängen,
// sonst sieht jeder Kanzlei-Admin die Daten aller Kunden.
//
// Fail-closed:
//   - PLATFORM_OPERATOR_EMAILS leer oder nicht gesetzt → niemand ist Betreiber.
//   - Betreiber brauchen aktive 2FA.
//   - Deaktivierte Konten sind nie Betreiber.
//   - Die Konsole und ihre APIs laufen nur auf OPS_HOSTS (Produktion:
//     ops.subsum.io). Der Session-Cookie ist host-gebunden, eine Anmeldung in
//     der Kanzlei-App gilt dort also nicht.
//
// Edge-safe: nur process.env, keine Node-APIs (wird auch von der Middleware genutzt).

export const DEFAULT_OPS_HOSTS = ["ops.subsum.io"] as const;
const DEV_OPS_HOSTS = ["ops.localhost"] as const;

export interface OperatorCandidate {
  email?: string | null;
  twoFactorEnabled?: boolean | null;
  deactivatedAt?: string | null;
}

/** Hostname without port, lowercased ("OPS.subsum.io:443" → "ops.subsum.io"). */
function hostname(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function operatorEmails(): Set<string> {
  return new Set(parseList(process.env.PLATFORM_OPERATOR_EMAILS));
}

export function opsHosts(): Set<string> {
  const configured = parseList(process.env.OPS_HOSTS).map(hostname);
  if (configured.length > 0) return new Set(configured);
  return new Set(
    process.env.NODE_ENV === "production"
      ? DEFAULT_OPS_HOSTS
      : [...DEFAULT_OPS_HOSTS, ...DEV_OPS_HOSTS]
  );
}

export function isOpsHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return opsHosts().has(hostname(host));
}

export function isPlatformOperator(user: OperatorCandidate | null | undefined): boolean {
  if (!user?.email) return false;
  if (user.deactivatedAt) return false;
  if (user.twoFactorEnabled !== true) return false;
  return operatorEmails().has(user.email.trim().toLowerCase());
}
