// Demo "document intake" step — clones the inbox-stage pages (incoming
// Klagebeantwortung, the extracted Replik deadline, the opposing counsel
// contact) into the visitor's session source. Idempotent: the engine's
// ON CONFLICT DO NOTHING inserts make a second click a no-op.

import { createHandler } from "@/lib/api-handler";
import {
  getDemoSession,
  updateDemoSession,
  cloneDemoSource,
  recordDemoEvent,
} from "@/lib/demo/session";
import { demoInboxSlugs, demoTemplateSource } from "@/content/demo-matter";

export const dynamic = "force-dynamic";

export const POST = createHandler({ action: "brain.write" }, async (ctx) => {
  if (!ctx.demo) {
    return Response.json({ error: "not_a_demo_session" }, { status: 400 });
  }
  const ds = await getDemoSession(ctx.demo.sid);
  if (!ds || ds.deletedAt) {
    return Response.json({ error: "demo_expired" }, { status: 410 });
  }
  const slugs = demoInboxSlugs(ds.jurisdiction);
  if (ds.ingested) {
    return Response.json({ ok: true, already: true, slugs });
  }

  const cloned = await cloneDemoSource(ds.sourceId, slugs, demoTemplateSource(ds.jurisdiction));
  if (!cloned) {
    return Response.json(
      { error: "demo_unavailable", message: "Dokument konnte nicht eingelesen werden." },
      { status: 503 }
    );
  }

  await updateDemoSession(ds.id, { ingested: true });
  await recordDemoEvent(ds.id, "ingest");
  return Response.json({ ok: true, slugs });
});
