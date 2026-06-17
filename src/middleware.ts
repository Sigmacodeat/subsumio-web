// Edge middleware: protects /dashboard and /admin.
//
// Referral capture (?ref=) is NOT done here anymore: a persistent
// attribution cookie is not "strictly necessary" under § 25 TTDSG, so it
// requires consent. The RefConsentBanner client component asks and sets
// the 90-day sb_ref cookie only after the visitor agrees.

import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { brandForHost, OTHER_VERTICAL_PATHS } from "@/lib/brand";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- Protected areas ---
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const login = new URL("/login", req.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    if (pathname.startsWith("/admin") && session.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  const brand = brandForHost(req.headers.get("host"));

  // --- Subsumio domain: present Subsumio standalone ---
  // On subsum.io / subsumio.com the Subsumio page IS the homepage, and the
  // other verticals fold into it (this domain never shows the whole platform).
  // The URL stays clean; only the rendered route is rewritten.
  if (brand === "subsumio") {
    // 1. Known locale variants → canonical path
    if (pathname === "/" || pathname === "/en") {
      const url = req.nextUrl.clone();
      url.pathname = "/subsumio";
      return NextResponse.rewrite(url);
    }
    if (pathname === "/de" || pathname.startsWith("/de-AT") || pathname.startsWith("/de-")) {
      const url = req.nextUrl.clone();
      url.pathname = "/de/subsumio";
      return NextResponse.rewrite(url);
    }

    // 2. Other verticals fold into Subsumio
    let target: string | null = null;
    if (OTHER_VERTICAL_PATHS.some((v) => pathname === v || pathname.startsWith(`${v}/`))) target = "/subsumio";
    else if (OTHER_VERTICAL_PATHS.some((v) => pathname === `/de${v}` || pathname.startsWith(`/de${v}/`))) target = "/de/subsumio";

    if (target && target !== pathname) {
      const url = req.nextUrl.clone();
      url.pathname = target;
      return NextResponse.rewrite(url);
    }

    // 3. Unknown paths on Subsumio domain → fall back to homepage (never 404 to
    //    an old/deleted deployment that might still be attached at Vercel edge).
    if (!pathname.startsWith("/subsumio") && !pathname.startsWith("/de/subsumio")) {
      const url = req.nextUrl.clone();
      url.pathname = pathname.startsWith("/de") ? "/de/subsumio" : "/subsumio";
      return NextResponse.rewrite(url);
    }
  }

  // --- Taxumio domain: present Taxumio standalone ---
  // On taxum.io / taxumio.com the Taxumio page IS the homepage.
  if (brand === "taxumio") {
    // 1. Known locale variants → canonical path
    if (pathname === "/" || pathname === "/en") {
      const url = req.nextUrl.clone();
      url.pathname = "/taxumio";
      return NextResponse.rewrite(url);
    }
    if (pathname === "/de" || pathname.startsWith("/de-AT") || pathname.startsWith("/de-")) {
      const url = req.nextUrl.clone();
      url.pathname = "/de/taxumio";
      return NextResponse.rewrite(url);
    }

    // 2. Other verticals fold into Taxumio
    let target: string | null = null;
    if (OTHER_VERTICAL_PATHS.some((v) => pathname === v || pathname.startsWith(`${v}/`))) target = "/taxumio";
    else if (OTHER_VERTICAL_PATHS.some((v) => pathname === `/de${v}` || pathname.startsWith(`/de${v}/`))) target = "/de/taxumio";

    if (target && target !== pathname) {
      const url = req.nextUrl.clone();
      url.pathname = target;
      return NextResponse.rewrite(url);
    }

    // 3. Unknown paths on Taxumio domain → fall back to homepage
    if (!pathname.startsWith("/taxumio") && !pathname.startsWith("/de/taxumio")) {
      const url = req.nextUrl.clone();
      url.pathname = pathname.startsWith("/de") ? "/de/taxumio" : "/taxumio";
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, static files and API routes.
  matcher: ["/((?!_next/|api/|.*\\.[a-zA-Z0-9]+$).*)"],
};
