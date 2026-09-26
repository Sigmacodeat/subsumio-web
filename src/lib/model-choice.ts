import { getOrgStore, getStore } from "@/lib/auth/store";
import { AUTO_MODEL_ID, getModelById, isModelAllowedForPolicy } from "@/lib/model-config";
import { ModelPolicyError } from "@/lib/eu-policy-refusal";

/**
 * The model an answer runs on, or undefined for automatic routing.
 *
 * Order: the pick in the chat (per question) → the user's saved preference →
 * automatic. A pick that is unknown or retired falls back to automatic.
 *
 * "Nur EU" (org modelPolicy eu_only) is never answered by a silent switch:
 * a pick in the chat that processes outside the EU throws ModelPolicyError
 * (the route answers 403 with the reason). A saved non-EU preference falls
 * back to automatic — and automatic routing itself is held to EU-only by the
 * engine for this firm (x-subsumio-model-policy), which refuses with a clear
 * message when no EU route is configured.
 */
export async function resolveModelChoice(
  userId: string,
  requested: string | undefined
): Promise<string | undefined> {
  const user = await getStore().getById(userId);
  const candidate = requested ?? user?.preferredModel ?? AUTO_MODEL_ID;
  if (candidate === AUTO_MODEL_ID) return undefined;

  const model = getModelById(candidate);
  if (!model) return undefined;

  const org = user?.orgId ? await getOrgStore().getById(user.orgId) : null;
  if (!isModelAllowedForPolicy(model, org?.modelPolicy)) {
    if (requested !== undefined) throw new ModelPolicyError();
    return undefined;
  }

  return model.id;
}
