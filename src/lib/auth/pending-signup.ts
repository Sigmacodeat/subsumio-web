// Registration without account enumeration.
//
// POST /api/auth/signup answers the same way whether the address is new or
// already has an account: "please confirm your e-mail". Nothing is created
// at that point. For a new address the confirmation mail carries a signed
// token with the registration inside (encrypted: name, password hash, legal
// acceptance time, jurisdiction, referral, demo attribution); the account is
// created only when the link is opened (GET /api/auth/verify), which also
// signs the person in. For an address that already has an account the
// existing owner gets a notice instead ("you already have an account —
// forgot your password?") and nothing changes.
//
// Nothing is stored before confirmation, so an unconfirmed registration can
// neither block the address nor leave an account whose password somebody
// else chose. Opening a second, older link after the account exists only
// leads to the sign-in page.
import { encrypt, decrypt } from "@/lib/encryption";
import {
  bindFragment,
  signActionToken,
  verifyActionToken,
  VERIFY_TOKEN_TTL_SECONDS,
} from "@/lib/auth/tokens";

export interface PendingSignup {
  email: string;
  name: string;
  locale: "de" | "en";
  jurisdiction: "AT" | "DE";
  passwordHash: string;
  referredBy: string | null;
  /** Demo session to attribute the conversion to, if the visitor came from the demo. */
  demoSid: string | null;
  demoPersona: string | null;
  /** When AGB/Datenschutz/AVV were accepted (the signup request). */
  acceptedAt: string;
  /** Where to land after confirmation (already a safe, same-site path). */
  next: string;
}

const PENDING_UID = "pending-signup";

export async function createPendingSignupToken(p: PendingSignup): Promise<string> {
  const data = await encrypt(JSON.stringify(p));
  if (!data) throw new Error("pending signup could not be sealed");
  return signActionToken(
    { uid: PENDING_UID, purpose: "signup", bind: await bindFragment(p.email), data },
    VERIFY_TOKEN_TTL_SECONDS
  );
}

/** The registration inside a valid, unexpired signup token, or null. */
export async function readPendingSignupToken(
  token: string | null | undefined
): Promise<PendingSignup | null> {
  const payload = await verifyActionToken(token, "signup");
  if (!payload || payload.uid !== PENDING_UID || !payload.data) return null;
  try {
    const raw = await decrypt(payload.data);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingSignup;
    if (typeof p.email !== "string" || typeof p.passwordHash !== "string" || !p.passwordHash) {
      return null;
    }
    if ((await bindFragment(p.email)) !== payload.bind) return null;
    return p;
  } catch {
    return null;
  }
}
