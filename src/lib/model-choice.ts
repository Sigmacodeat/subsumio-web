import { getOrgStore, getStore } from "@/lib/auth/store";
import { AUTO_MODEL_ID, getModelById, isModelAllowedForPolicy } from "@/lib/model-config";

/**
 * The model an answer runs on, or undefined for automatic routing.
 *
 * Order: the pick in the chat (per question) → the user's saved preference →
 * automatic. A pick that is unknown, retired, or not allowed by the firm's
 * model policy falls back to automatic instead of failing the question.
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
  if (!isModelAllowedForPolicy(model, org?.modelPolicy)) return undefined;

  return model.id;
}
