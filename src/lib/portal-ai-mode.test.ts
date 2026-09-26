import { describe, expect, it } from "vitest";
import { pendingPortalAiDraft, resolvePortalAiMode } from "./portal-ai-mode";
import { normalizeKanzleiSettings } from "./kanzlei-settings";

describe("resolvePortalAiMode", () => {
  it("defaults to the draft mode for unset or unknown values", () => {
    for (const v of [undefined, null, "", "DIREKT", "direct", true, 1]) {
      expect(resolvePortalAiMode(v)).toBe("entwurf");
    }
    expect(resolvePortalAiMode("aus")).toBe("aus");
    expect(resolvePortalAiMode("direkt")).toBe("direkt");
  });

  it("a stored unknown mode is normalised away, never to direct", () => {
    expect(normalizeKanzleiSettings({ portalAiMode: "yes" as never }).portalAiMode).toBe("entwurf");
    expect(normalizeKanzleiSettings({}).portalAiMode).toBeUndefined();
  });
});

describe("pendingPortalAiDraft", () => {
  it("only returns a pending draft with text", () => {
    expect(pendingPortalAiDraft({ ai_draft: { text: "x", status: "pending" } })?.text).toBe("x");
    expect(pendingPortalAiDraft({ ai_draft: { text: "x", status: "approved" } })).toBeNull();
    expect(pendingPortalAiDraft({ ai_draft: { text: " ", status: "pending" } })).toBeNull();
    expect(pendingPortalAiDraft({})).toBeNull();
  });
});
