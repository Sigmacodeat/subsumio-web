// Public live-demo session bootstrap (/demo → "Live-Demo öffnen").
//
// POST: creates an isolated demo session — a row in subsumio_demo_sessions
// plus a per-visitor engine source cloned from demo-template via
// POST /api/sources/clone (SQL copy, zero LLM/embedding cost). Returns the
// signed session in the regular sb_session cookie (payload.demo marks it)
// plus an unsigned sb_demo marker cookie so middleware can route expired
// demo visitors back to /demo instead of the login wall.
//
// GET: session status for the dashboard demo UI (question budget, step,
// ingest state). Requires the demo session cookie.
//
// Abuse posture: 5 session starts/hour per IP, a global cap on active
// sessions, and the per-session LLM budget enforced by the demo guard.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHandler, createPublicHandler } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { verifySession } from "@/lib/auth/session";
import { signSession, SESSION_COOKIE, getAuthSecret } from "@/lib/auth/session-core";
import {
  createDemoSessionRecord,
  getDemoSession,
  cloneDemoSource,
  countActiveDemoSessions,
  hashDemoIp,
  DEMO_SESSION_TTL_SECONDS,
  DEMO_MAX_ACTIVE_SESSIONS,
} from "@/lib/demo/session";
import { demoLiveSlugs, demoTemplateSource } from "@/content/demo-matter";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const log = logger("api/demo/session");

export const dynamic = "force-dynamic";

const DEMO_MARKER_COOKIE = "sb_demo";

const bodySchema = z.object({
  persona: z.enum(["lawyer", "assistant"]).default("lawyer"),
  jurisdiction: z.enum(["at", "de"]).default("at"),
  // Sales / campaign attribution (`/demo?ref=…`); sanitized server-side.
  ref: z.string().max(64).optional().nullable(),
});

function sessionCookies(res: NextResponse, token: string): void {
  const secure = env("NODE_ENV") === "production" && env("SUBSUMIO_E2E") !== "1";
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: DEMO_SESSION_TTL_SECONDS,
    path: "/",
  });
  res.cookies.set(DEMO_MARKER_COOKIE, "1", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: DEMO_SESSION_TTL_SECONDS + 3600,
    path: "/",
  });
}

export const POST = createPublicHandler(
  {
    body: bodySchema,
    rateLimitKey: (req: NextRequest) => `demo-session:${clientIp(req.headers)}`,
    rateLimitMax: 5,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (req, body) => {
    // A real signed-in user keeps their own session — never overwrite it.
    const existing = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (existing && !existing.demo) {
      return Response.json({ demo: false, redirect: "/dashboard" });
    }
    // Idempotent: a visitor re-clicking "Demo öffnen" keeps their sandbox.
    if (existing?.demo) {
      const ds = await getDemoSession(existing.demo.sid);
      if (ds && !ds.deletedAt && new Date(ds.expiresAt).getTime() > Date.now()) {
        return Response.json({ demo: true, sid: ds.id, redirect: "/dashboard" });
      }
    }

    if ((await countActiveDemoSessions()) >= DEMO_MAX_ACTIVE_SESSIONS) {
      return Response.json(
        {
          error: "demo_capacity",
          message: "Die Live-Demo ist gerade stark frequentiert. Bitte später erneut versuchen.",
        },
        { status: 429 }
      );
    }

    const session = await createDemoSessionRecord(body.persona, hashDemoIp(clientIp(req.headers)), {
      jurisdiction: body.jurisdiction,
      ref: body.ref ?? null,
    });
    const cloned = await cloneDemoSource(
      session.sourceId,
      demoLiveSlugs(body.jurisdiction),
      demoTemplateSource(body.jurisdiction)
    );
    if (!cloned) {
      log.error(`[demo] template clone failed for ${session.sourceId} — template seeded?`);
      return Response.json(
        { error: "demo_unavailable", message: "Die Demo ist gerade nicht verfügbar." },
        { status: 503 }
      );
    }

    const token = await signSession(
      {
        uid: `demo:${session.id}`,
        email: "demo@subsumio.invalid",
        role: session.persona === "assistant" ? "assistant" : "lawyer",
        demo: {
          sid: session.id,
          source: session.sourceId,
          persona: session.persona,
          jurisdiction: session.jurisdiction,
        },
      },
      getAuthSecret(),
      DEMO_SESSION_TTL_SECONDS,
      1
    );

    const res = NextResponse.json({ demo: true, sid: session.id, redirect: "/dashboard" });
    sessionCookies(res, token);
    return res;
  }
);

export const GET = createHandler({ action: "brain.read" }, async (ctx) => {
  if (!ctx.demo) return Response.json({ demo: false });
  const ds = await getDemoSession(ctx.demo.sid);
  if (!ds || ds.deletedAt) return Response.json({ demo: false });
  return Response.json({
    demo: true,
    sid: ds.id,
    persona: ds.persona,
    jurisdiction: ds.jurisdiction,
    questionsUsed: ds.questionsUsed,
    questionsCap: ds.questionsCap,
    ingested: ds.ingested,
    expiresAt: ds.expiresAt,
  });
});
