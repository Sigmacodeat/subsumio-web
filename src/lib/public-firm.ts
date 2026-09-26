/**
 * Receiving firm of the public forms (/erstanfrage, /termin, /mandat).
 *
 * A visitor sends facts, the opposing party and possibly sensitive data. The
 * forms therefore run only when the receiving firm is unambiguous and can be
 * named as controller (Art. 13 DSGVO):
 *
 *  - The target brain comes from an explicit configuration for exactly this
 *    purpose (SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID, for bookings optionally
 *    SUBSUMIO_PUBLIC_BOOKING_BRAIN_ID). There is no fallback to the WhatsApp
 *    default firm or any other brain — without it the form is not offered.
 *  - The firm's settings name it: kanzleiName, an address and an e-mail
 *    address. Without them the form is not offered either.
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { KANZLEI_SETTINGS_SLUG } from "@/lib/kanzlei-settings";

export type PublicForm = "intake" | "booking";

export interface PublicFirm {
  name: string;
  address: string;
  email: string;
  phone?: string;
  /** Link to the firm's own privacy policy, when configured. */
  privacyUrl?: string;
}

/** Target brain for a public form — explicit configuration only. */
export function resolvePublicFormBrainId(form: PublicForm): string | null {
  const intake = process.env.SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID?.trim() || null;
  if (form === "intake") return intake;
  return process.env.SUBSUMIO_PUBLIC_BOOKING_BRAIN_ID?.trim() || intake;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Firm identity from the kanzlei_settings frontmatter, or null if incomplete. */
export function publicFirmFromSettings(fm: Record<string, unknown> | undefined): PublicFirm | null {
  const f = fm ?? {};
  const name = str(f.kanzleiName);
  const email = str(f.kanzleiEmail);
  const street = str(f.street);
  const cityLine = [str(f.zip), str(f.city)].filter(Boolean).join(" ");
  const address =
    str(f.kanzleiAdresse) ?? ([street, cityLine].filter(Boolean).join(", ") || undefined);
  if (!name || !email || !address) return null;
  const privacyUrl = str(f.datenschutzUrl);
  return {
    name,
    address,
    email,
    ...(str(f.kanzleiTelefon) ? { phone: str(f.kanzleiTelefon) } : {}),
    // Only http(s) links — the value is rendered as a link on a public page.
    ...(privacyUrl && /^https?:\/\//i.test(privacyUrl) ? { privacyUrl } : {}),
  };
}

/** Reads the firm's settings. Any read failure → null (form not offered). */
export async function loadPublicFirm(brainId: string): Promise<PublicFirm | null> {
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${encodeURIComponent(KANZLEI_SETTINGS_SLUG)}`,
      { headers: engineHeadersForBrain(brainId), signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const page = (await res.json().catch(() => null)) as {
      frontmatter?: Record<string, unknown>;
    } | null;
    return publicFirmFromSettings(page?.frontmatter);
  } catch {
    return null;
  }
}
