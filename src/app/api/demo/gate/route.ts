// Progressive demo gate: after the free question budget is exhausted the
// visitor can leave an e-mail address to unlock more questions. Creates a
// sales lead (same store as the concierge leads) and raises the cap.

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import {
  getDemoSession,
  updateDemoSession,
  recordDemoEvent,
  DEMO_QUESTIONS_FREE,
  DEMO_QUESTIONS_AFTER_GATE,
} from "@/lib/demo/session";
import { saveLead } from "@/lib/concierge/store";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().max(200),
  // Honeypot — must stay empty; bots fill it.
  company: z.string().max(0).optional().or(z.literal("")),
});

export const POST = createHandler({ action: "brain.read", body: bodySchema }, async (ctx, body) => {
  if (!ctx.demo) {
    return Response.json({ error: "not_a_demo_session" }, { status: 400 });
  }
  const ds = await getDemoSession(ctx.demo.sid);
  if (!ds || ds.deletedAt) {
    return Response.json({ error: "demo_expired" }, { status: 410 });
  }

  const newCap = DEMO_QUESTIONS_FREE + DEMO_QUESTIONS_AFTER_GATE;
  if (ds.questionsCap >= newCap) {
    return Response.json({ ok: true, questionsCap: ds.questionsCap, already: true });
  }

  await saveLead({
    kind: "question",
    name: "Live-Demo Besucher",
    email: body.email,
    sessionId: ds.id,
    page: "/demo",
    profile: { source: "demo_gate", persona: ds.persona },
  });
  await updateDemoSession(ds.id, { questionsCap: newCap, email: body.email });
  await recordDemoEvent(ds.id, "gate");
  return Response.json({ ok: true, questionsCap: newCap });
});
