/**
 * Human-readable names for engine model ids ("anthropic:claude-sonnet-5" →
 * "Claude Sonnet 5"). Display only — which model runs is decided by the
 * engine (server/src/core/model-config.ts + the firm's model profile).
 */

const KNOWN_NAMES: Record<string, string> = {
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-haiku-4.5": "Claude Haiku 4.5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-sonnet-4.6": "Claude Sonnet 4.6",
  "claude-opus-5": "Claude Opus 5",
  "claude-opus-4-8": "Claude Opus 4.8",
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-fable-5-1": "Claude Fable 5.1",
};

/** Strip the provider prefix(es): "openrouter:anthropic/claude-x" → "claude-x". */
function bareModelId(id: string): string {
  const afterColon = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  return afterColon.includes("/") ? afterColon.slice(afterColon.lastIndexOf("/") + 1) : afterColon;
}

export function modelDisplayName(id: string): string {
  const bare = bareModelId(id.trim());
  const known = KNOWN_NAMES[bare] ?? KNOWN_NAMES[bare.replace(/-\d{8}$/, "")];
  return known ?? bare;
}
