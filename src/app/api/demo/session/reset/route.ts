// Reset a live-demo session: purge the visitor's isolated engine source and
// re-clone the live stage of the template. The LLM question budget is
// intentionally NOT reset — otherwise "reset" would be a free cap bypass.

import { createHandler } from "@/lib/api-handler";
import {
  getDemoSession,
  updateDemoSession,
  cloneDemoSource,
  purgeDemoSource,
  recordDemoEvent,
} from "@/lib/demo/session";
import { demoLiveSlugs, demoTemplateSource } from "@/content/demo-matter";

export const dynamic = "force-dynamic";

export const POST = createHandler({ action: "brain.write" }, async (ctx) => {
  if (!ctx.demo) {
    return Response.json({ error: "not_a_demo_session" }, { status: 400 });
  }
  const ds = await getDemoSession(ctx.demo.sid);
  if (!ds || ds.deletedAt) {
    return Response.json({ error: "demo_expired" }, { status: 410 });
  }

  await purgeDemoSource(ds.sourceId);
  const cloned = await cloneDemoSource(
    ds.sourceId,
    demoLiveSlugs(ds.jurisdiction),
    demoTemplateSource(ds.jurisdiction)
  );
  if (!cloned) {
    return Response.json(
      { error: "demo_unavailable", message: "Demo-Reset fehlgeschlagen." },
      { status: 503 }
    );
  }

  await updateDemoSession(ds.id, { ingested: false, step: 0 });
  await recordDemoEvent(ds.id, "reset");
  return Response.json({ ok: true });
});
