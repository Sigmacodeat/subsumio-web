// Edge middleware: minimal Subsumio-only pass-through.
// Dashboard/admin routes were removed; no auth protection needed.

import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|api/|.*\\.[a-zA-Z0-9]+$).*)"],
};
