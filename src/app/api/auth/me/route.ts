import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { getStore } from "@/lib/auth/store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  // Referral stats: O(1) SQL COUNT in Postgres, O(n) in file-based dev mode.
  const referrals = await getStore().countReferrals(user.referralCode);

  return NextResponse.json({ user, referrals });
}

/**
 * PATCH /api/auth/me
 * Update own profile: name, locale. Email changes require re-verification
 * and are intentionally excluded here.
 */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const patch: { name?: string; locale?: "en" | "de" } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name.length < 1 || name.length > 120) {
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }
    patch.name = name;
  }

  if (body.locale !== undefined) {
    if (body.locale !== "en" && body.locale !== "de") {
      return NextResponse.json({ error: "invalid_locale", allowed: ["en", "de"] }, { status: 400 });
    }
    patch.locale = body.locale;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const updated = await getStore().update(user.id, patch);
  if (!updated) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  return NextResponse.json({ user: updated });
}
