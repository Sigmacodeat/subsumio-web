import { NextResponse } from "next/server";
import { createHandler } from "@/lib/api-handler";
import { fetchPendingPlaybookUpdates } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "legal.playbook" as const,
  },
  async (_ctx, _body, _query, req) => {
    const brainId = req.headers.get("x-brain-id");
    if (!brainId) {
      return NextResponse.json({ pending: 0 });
    }
    const pending = await fetchPendingPlaybookUpdates(brainId);
    return NextResponse.json({
      pending: pending.length,
      contracts: pending.map((p) => ({
        slug: p.slug,
        title: p.title,
        status: p.frontmatter?.status ?? "unknown",
      })),
    });
  }
);
