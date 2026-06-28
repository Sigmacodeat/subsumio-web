import { NextRequest, NextResponse } from "next/server";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { createCronHandler } from "@/lib/api-handler";
import { getRecipientsByBrain, type EnginePage } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface AutoPlaybookResponse {
  playbook_slug: string;
  playbook_title: string;
  updates: unknown[];
  applied: boolean;
  requires_approval: boolean;
  warnings: string[];
}

async function fetchExecutedContracts(brainId: string): Promise<EnginePage[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=legal_contract&limit=200`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return (data as EnginePage[]).filter((p) => {
      const fm = p.frontmatter ?? {};
      return fm.status === "executed" && !fm.playbook_processed;
    });
  } catch {
    return [];
  }
}

async function callAutoPlaybook(
  brainId: string,
  contractSlug: string,
  autoApply: boolean
): Promise<AutoPlaybookResponse | null> {
  try {
    const headers = engineHeadersForBrain(brainId);
    headers["Content-Type"] = "application/json";
    const res = await fetch(`${ENGINE_URL}/api/legal/auto-playbook`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contract_slug: contractSlug,
        auto_apply: autoApply,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as AutoPlaybookResponse;
  } catch {
    return null;
  }
}

async function markContractProcessed(brainId: string, slug: string): Promise<void> {
  try {
    await enginePatchPage(
      engineHeadersForBrain(brainId),
      {
        slug,
        frontmatter: {
          playbook_processed: true,
          playbook_processed_at: new Date().toISOString(),
        },
      },
      { timeoutMs: 15_000 }
    );
  } catch {
    // Best-effort — if this fails, the cron will retry on next run
  }
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const recipientsByBrain = await getRecipientsByBrain();
  const autoApply = _req.nextUrl.searchParams.get("auto_apply") === "true";

  let brainsChecked = 0;
  let contractsProcessed = 0;
  let playbooksUpdated = 0;
  let playbooksStaged = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [brainId] of recipientsByBrain) {
    brainsChecked++;
    const contracts = await fetchExecutedContracts(brainId);
    if (contracts.length === 0) continue;

    for (const contract of contracts) {
      const result = await callAutoPlaybook(brainId, contract.slug, autoApply);

      if (!result) {
        errors.push(`brain=${brainId} slug=${contract.slug}: engine call failed`);
        skipped++;
        continue;
      }

      if (
        result.warnings.includes("CONTRACT_NOT_FOUND") ||
        result.warnings.includes("NO_PLAYBOOK_FOUND") ||
        result.warnings.includes("NO_LLM_AVAILABLE")
      ) {
        skipped++;
        // Still mark as processed so we don't retry indefinitely
        await markContractProcessed(brainId, contract.slug);
        continue;
      }

      if (result.applied) {
        playbooksUpdated++;
      } else if (result.requires_approval) {
        playbooksStaged++;
      }

      contractsProcessed++;
      await markContractProcessed(brainId, contract.slug);
    }
  }

  return NextResponse.json({
    ok: true,
    brains_checked: brainsChecked,
    contracts_processed: contractsProcessed,
    playbooks_updated: playbooksUpdated,
    playbooks_staged: playbooksStaged,
    skipped,
    auto_apply: autoApply,
    errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
  });
});
