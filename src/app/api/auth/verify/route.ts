import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const payload = await verifyActionToken(token, "verify");
  if (!payload) {
    return NextResponse.redirect(new URL("/login?verify=invalid", req.url));
  }

  const store = getStore();
  const user = await store.getById(payload.uid);
  if (!user || (await bindFragment(user.email)) !== payload.bind) {
    return NextResponse.redirect(new URL("/login?verify=invalid", req.url));
  }

  if (!user.emailVerifiedAt) {
    await store.update(user.id, { emailVerifiedAt: new Date().toISOString() });
  }
  // Logged-in users land in the app; logged-out users hit the login redirect.
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
