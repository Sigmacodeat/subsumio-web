/**
 * KI-VO-Selbstauskunft: Status, die aus dem tatsächlichen Systemzustand
 * abgeleitet werden statt fest im Seitentext zu stehen.
 */
import { APPROVAL_DECIDER_ROLES } from "@/lib/approval-decision";

/** Rollen, die als menschliche Aufsicht über KI-Schreibaktionen gelten. */
const OVERSIGHT_ROLES: ReadonlySet<string> = new Set(["admin", "lawyer"]);

/**
 * Art. 14 KI-VO (menschliche Aufsicht): „compliant“ nur, solange KI-Aktionen
 * ausschließlich von Anwält:innen/Admins freigegeben werden (serverseitig in
 * approval-decision.ts erzwungen, inkl. Vier-Augen-Regel). Sobald eine andere
 * Rolle entscheiden dürfte, meldet die Seite ehrlich „partial“.
 */
export function art14OversightStatus(
  deciderRoles: ReadonlySet<string> = APPROVAL_DECIDER_ROLES
): "compliant" | "partial" {
  for (const role of deciderRoles) {
    if (!OVERSIGHT_ROLES.has(role)) return "partial";
  }
  return deciderRoles.size > 0 ? "compliant" : "partial";
}
