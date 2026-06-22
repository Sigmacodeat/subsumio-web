import { describe, it, expect } from "vitest";
import {
  createKnowledgeAsset,
  submitForReview,
  approveAsset,
  rejectAsset,
  deprecateAsset,
  createNewVersion,
  searchKnowledgeAssets,
  createDraftingReference,
  filterAuthoritativeAssets,
  filterDeprecatedAssets,
  getAssetsByType,
  getAssetsByCategory,
  validateKnowledgeAsset,
  canSubmitForReview,
  canApprove,
  canDeprecate,
  ASSET_TYPE_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_CATEGORY_LABELS,
  type KnowledgeAsset,
  type KnowledgeAssetType,
  type KnowledgeAssetCategory,
} from "@/lib/knowledge-asset";

function createTestAsset(overrides: Partial<KnowledgeAsset> = {}): KnowledgeAsset {
  return {
    ...createKnowledgeAsset({
      type: "precedent",
      category: "litigation",
      title: "Test Precedent",
      description: "A test precedent for litigation",
      content:
        "This is the content of the test precedent. It discusses important legal principles.",
      tags: ["frist", "klage"],
      practice_areas: ["litigation"],
      created_by: "lawyer@test",
      brain_id: "brain-1",
      org_id: "org-1",
    }),
    ...overrides,
  };
}

describe("Knowledge Asset — Factory", () => {
  it("creates asset with correct defaults", () => {
    const asset = createTestAsset();
    expect(asset.id).toBeTruthy();
    expect(asset.slug).toContain("km/precedent/");
    expect(asset.status).toBe("draft");
    expect(asset.version).toBe("1.0.0");
    expect(asset.is_authoritative).toBe(false);
    expect(asset.usage_count).toBe(0);
    expect(asset.rating).toBe(0);
  });
});

describe("Knowledge Asset — Labels", () => {
  it("has labels for all types", () => {
    const types: KnowledgeAssetType[] = [
      "precedent",
      "clause",
      "playbook",
      "checklist",
      "memo",
      "after_action_review",
      "template",
      "guideline",
    ];
    for (const type of types) {
      expect(ASSET_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("has labels for all statuses", () => {
    expect(ASSET_STATUS_LABELS["draft"]).toBeTruthy();
    expect(ASSET_STATUS_LABELS["approved"]).toBeTruthy();
    expect(ASSET_STATUS_LABELS["deprecated"]).toBeTruthy();
  });

  it("has labels for all categories", () => {
    const cats: KnowledgeAssetCategory[] = [
      "litigation",
      "contract",
      "corporate",
      "tax",
      "compliance",
      "real_estate",
      "insurance",
      "employment",
      "ip",
      "general",
    ];
    for (const cat of cats) {
      expect(ASSET_CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });
});

describe("Knowledge Asset — Governance Permissions", () => {
  it("lawyer can submit for review", () => {
    expect(canSubmitForReview("lawyer")).toBe(true);
  });

  it("partner can approve", () => {
    expect(canApprove("partner")).toBe(true);
  });

  it("lawyer cannot approve", () => {
    expect(canApprove("lawyer")).toBe(false);
  });

  it("partner can deprecate", () => {
    expect(canDeprecate("partner")).toBe(true);
  });

  it("lawyer cannot deprecate", () => {
    expect(canDeprecate("lawyer")).toBe(false);
  });
});

describe("Knowledge Asset — Governance Actions", () => {
  it("submitForReview changes status to in_review", () => {
    const asset = createTestAsset();
    const result = submitForReview(asset, "lawyer@test", "lawyer");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.asset.status).toBe("in_review");
      expect(result.action.action).toBe("submit_for_review");
    }
  });

  it("submitForReview fails for unauthorized role", () => {
    const asset = createTestAsset();
    const result = submitForReview(asset, "intern@test", "intern");
    expect("error" in result).toBe(true);
  });

  it("approveAsset changes status to approved and sets authoritative", () => {
    const asset = createTestAsset({ status: "in_review" });
    const result = approveAsset(asset, "partner@test", "partner");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.asset.status).toBe("approved");
      expect(result.asset.is_authoritative).toBe(true);
      expect(result.asset.approved_by).toBe("partner@test");
    }
  });

  it("approveAsset fails for unauthorized role", () => {
    const asset = createTestAsset({ status: "in_review" });
    const result = approveAsset(asset, "lawyer@test", "lawyer");
    expect("error" in result).toBe(true);
  });

  it("approveAsset fails for already approved asset", () => {
    const asset = createTestAsset({ status: "approved" });
    const result = approveAsset(asset, "partner@test", "partner");
    expect("error" in result).toBe(true);
  });

  it("rejectAsset changes status back to draft", () => {
    const asset = createTestAsset({ status: "in_review" });
    const result = rejectAsset(asset, "partner@test", "Not good enough");
    expect(result.asset.status).toBe("draft");
    expect(result.action.reason).toBe("Not good enough");
  });

  it("deprecateAsset changes status to deprecated", () => {
    const asset = createTestAsset({ status: "approved", is_authoritative: true });
    const result = deprecateAsset(asset, "partner@test", "partner", "Outdated");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.asset.status).toBe("deprecated");
      expect(result.asset.is_authoritative).toBe(false);
      expect(result.asset.deprecation_reason).toBe("Outdated");
    }
  });

  it("deprecateAsset fails for unauthorized role", () => {
    const asset = createTestAsset({ status: "approved" });
    const result = deprecateAsset(asset, "lawyer@test", "lawyer", "Test");
    expect("error" in result).toBe(true);
  });
});

describe("Knowledge Asset — Version Management", () => {
  it("createNewVersion increments version and stores history", () => {
    const asset = createTestAsset({ version: "1.0.0" });
    const updated = createNewVersion(asset, "New content", "Updated content", "lawyer@test");
    expect(updated.version).toBe("1.0.1");
    expect(updated.versions).toHaveLength(1);
    expect(updated.versions[0].version).toBe("1.0.0");
    expect(updated.content).toBe("New content");
    expect(updated.status).toBe("draft");
  });

  it("createNewVersion resets authoritative flag", () => {
    const asset = createTestAsset({ status: "approved", is_authoritative: true, version: "2.1.0" });
    const updated = createNewVersion(asset, "New content", "Major update", "lawyer@test");
    expect(updated.is_authoritative).toBe(false);
    expect(updated.status).toBe("draft");
    expect(updated.version).toBe("2.1.1");
  });
});

describe("Knowledge Asset — Search", () => {
  it("finds assets by title match", () => {
    const assets = [
      createTestAsset({ id: "a1", title: "Klage auf Schadensersatz" }),
      createTestAsset({ id: "a2", title: "Mietvertrag Kündigung" }),
    ];
    // Approve both for authoritative search
    assets[0].status = "approved";
    assets[0].is_authoritative = true;
    assets[1].status = "approved";
    assets[1].is_authoritative = true;

    const results = searchKnowledgeAssets(assets, "Klage");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].asset.title).toContain("Klage");
  });

  it("only returns authoritative assets by default", () => {
    const assets = [
      createTestAsset({ id: "a1", title: "Test Asset One" }),
      createTestAsset({ id: "a2", title: "Test Asset Two" }),
    ];
    assets[0].status = "approved";
    assets[0].is_authoritative = true;
    // assets[1] stays as draft

    const results = searchKnowledgeAssets(assets, "Test");
    expect(results).toHaveLength(1);
    expect(results[0].asset.id).toBe("a1");
  });

  it("can search non-authoritative with flag", () => {
    const assets = [createTestAsset({ id: "a1", title: "Test Asset One" })];
    const results = searchKnowledgeAssets(assets, "Test", { authoritative_only: false });
    expect(results.length).toBeGreaterThan(0);
  });

  it("filters by type", () => {
    const assets = [
      createTestAsset({ id: "a1", title: "Test", type: "precedent" }),
      createTestAsset({ id: "a2", title: "Test", type: "clause" }),
    ];
    assets[0].status = "approved";
    assets[0].is_authoritative = true;
    assets[1].status = "approved";
    assets[1].is_authoritative = true;

    const results = searchKnowledgeAssets(assets, "Test", { types: ["clause"] });
    expect(results).toHaveLength(1);
    expect(results[0].asset.type).toBe("clause");
  });

  it("filters by category", () => {
    const assets = [
      createTestAsset({ id: "a1", title: "Test", category: "litigation" }),
      createTestAsset({ id: "a2", title: "Test", category: "contract" }),
    ];
    assets[0].status = "approved";
    assets[0].is_authoritative = true;
    assets[1].status = "approved";
    assets[1].is_authoritative = true;

    const results = searchKnowledgeAssets(assets, "Test", { categories: ["contract"] });
    expect(results).toHaveLength(1);
  });

  it("filters by tags", () => {
    const assets = [
      createTestAsset({ id: "a1", title: "Test", tags: ["frist", "klage"] }),
      createTestAsset({ id: "a2", title: "Test", tags: ["vertrag"] }),
    ];
    assets[0].status = "approved";
    assets[0].is_authoritative = true;
    assets[1].status = "approved";
    assets[1].is_authoritative = true;

    const results = searchKnowledgeAssets(assets, "Test", { tags: ["frist"] });
    expect(results).toHaveLength(1);
  });

  it("filters by min rating", () => {
    const assets = [
      createTestAsset({ id: "a1", title: "Test", rating: 4.5 }),
      createTestAsset({ id: "a2", title: "Test", rating: 2.0 }),
    ];
    assets[0].status = "approved";
    assets[0].is_authoritative = true;
    assets[1].status = "approved";
    assets[1].is_authoritative = true;

    const results = searchKnowledgeAssets(assets, "Test", { min_rating: 3.0 });
    expect(results).toHaveLength(1);
    expect(results[0].asset.rating).toBe(4.5);
  });

  it("respects limit", () => {
    const assets: KnowledgeAsset[] = [];
    for (let i = 0; i < 10; i++) {
      const a = createTestAsset({ id: `a${i}`, title: `Test Asset ${i}` });
      a.status = "approved";
      a.is_authoritative = true;
      assets.push(a);
    }
    const results = searchKnowledgeAssets(assets, "Test", { limit: 3 });
    expect(results).toHaveLength(3);
  });

  it("returns matched fields", () => {
    const asset = createTestAsset({
      id: "a1",
      title: "Klage",
      description: "Important",
      tags: ["frist"],
    });
    asset.status = "approved";
    asset.is_authoritative = true;
    const results = searchKnowledgeAssets([asset], "Klage");
    expect(results[0].matched_fields).toContain("title");
  });

  it("generates highlighted snippet", () => {
    const asset = createTestAsset({
      id: "a1",
      content: "This is a long content about important legal principles regarding fristen.",
    });
    asset.status = "approved";
    asset.is_authoritative = true;
    const results = searchKnowledgeAssets([asset], "fristen");
    expect(results[0].highlighted_snippet).toBeTruthy();
    expect(results[0].highlighted_snippet).toContain("fristen");
  });
});

describe("Knowledge Asset — Drafting Integration", () => {
  it("createDraftingReference creates reference", () => {
    const asset = createTestAsset({ status: "approved", is_authoritative: true });
    const ref = createDraftingReference(asset, "lawyer@test", "Used in draft for case 123");
    expect(ref.asset_id).toBe(asset.id);
    expect(ref.asset_version).toBe(asset.version);
    expect(ref.is_authoritative).toBe(true);
  });

  it("filterAuthoritativeAssets returns only approved+authoritative", () => {
    const assets = [
      createTestAsset({ id: "a1", status: "approved", is_authoritative: true }),
      createTestAsset({ id: "a2", status: "draft", is_authoritative: false }),
      createTestAsset({ id: "a3", status: "deprecated", is_authoritative: false }),
    ];
    const filtered = filterAuthoritativeAssets(assets);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("a1");
  });

  it("filterDeprecatedAssets returns only deprecated", () => {
    const assets = [
      createTestAsset({ id: "a1", status: "approved" }),
      createTestAsset({ id: "a2", status: "deprecated" }),
    ];
    const filtered = filterDeprecatedAssets(assets);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("a2");
  });

  it("getAssetsByType filters correctly", () => {
    const assets = [
      createTestAsset({ id: "a1", type: "precedent" }),
      createTestAsset({ id: "a2", type: "clause" }),
    ];
    expect(getAssetsByType(assets, "precedent")).toHaveLength(1);
  });

  it("getAssetsByCategory filters correctly", () => {
    const assets = [
      createTestAsset({ id: "a1", category: "litigation" }),
      createTestAsset({ id: "a2", category: "contract" }),
    ];
    expect(getAssetsByCategory(assets, "contract")).toHaveLength(1);
  });
});

describe("Knowledge Asset — Validation", () => {
  it("validates a correct asset", () => {
    const asset = createTestAsset({ status: "approved", approved_by: "partner@test" });
    const result = validateKnowledgeAsset(asset);
    expect(result.valid).toBe(true);
  });

  it("detects missing title", () => {
    const asset = createTestAsset();
    asset.title = "";
    const result = validateKnowledgeAsset(asset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Title"))).toBe(true);
  });

  it("detects approved without approved_by", () => {
    const asset = createTestAsset({ status: "approved" });
    const result = validateKnowledgeAsset(asset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("approved_by"))).toBe(true);
  });

  it("detects authoritative without approved status", () => {
    const asset = createTestAsset({ status: "draft", is_authoritative: true });
    const result = validateKnowledgeAsset(asset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("authoritative"))).toBe(true);
  });

  it("warns about deprecated without reason", () => {
    const asset = createTestAsset({ status: "deprecated" });
    const result = validateKnowledgeAsset(asset);
    expect(result.warnings.some((w) => w.includes("deprecation"))).toBe(true);
  });

  it("warns about privileged+public", () => {
    const asset = createTestAsset({
      privilege_level: "attorney_client",
      confidentiality_level: "public",
    });
    const result = validateKnowledgeAsset(asset);
    expect(result.warnings.some((w) => w.includes("public"))).toBe(true);
  });

  it("detects invalid rating", () => {
    const asset = createTestAsset({ rating: 6 });
    const result = validateKnowledgeAsset(asset);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Rating"))).toBe(true);
  });
});
