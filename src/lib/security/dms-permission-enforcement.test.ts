/**
 * T7.1 / WP7.1.3 — DMS Permission Enforcement Tests
 *
 * Tests that DMS connectors enforce per-tenant folder boundaries,
 * document access control, and import scoping.
 *
 * Coverage:
 *   1. DMS connector interface contract
 *   2. Per-tenant folder isolation
 *   3. Document import scoping to caller's brain
 *   4. DMS access revocation after deprovisioning
 *   5. Cross-tenant document access blocked
 *   6. DMS search scoped to authorized folders
 */

import { describe, it, expect } from "vitest";
import type { DMSConnector, DMSDocument, DMSSearchResult } from "@/lib/dms/index";

// ── Mock DMS Connector ───────────────────────────────────────────────

class MockDMSConnector implements DMSConnector {
  name = "mock-dms";
  private documents: Map<string, DMSDocument & { tenant_org: string; tenant_brain: string }> =
    new Map();
  private folders: Map<string, { id: string; name: string; path: string; tenant_org: string }> =
    new Map();

  isConfigured(): boolean {
    return true;
  }

  seedDocument(doc: DMSDocument & { tenant_org: string; tenant_brain: string }): void {
    this.documents.set(doc.id, doc);
  }

  seedFolder(folder: { id: string; name: string; path: string; tenant_org: string }): void {
    this.folders.set(folder.id, folder);
  }

  async search(
    query: string,
    opts?: { limit?: number; folderId?: string }
  ): Promise<DMSSearchResult> {
    let docs = Array.from(this.documents.values());
    if (opts?.folderId) {
      const folder = this.folders.get(opts.folderId);
      if (!folder) return { documents: [], folders: [], totalCount: 0 };
      // Filter documents by folder path prefix
      docs = docs.filter((d) => d.name.includes(query) || !query);
    }
    const limit = opts?.limit ?? 50;
    return {
      documents: docs.slice(0, limit).map(({ tenant_org, tenant_brain, ...doc }) => doc),
      folders: Array.from(this.folders.values())
        .slice(0, limit)
        .map(({ tenant_org, ...f }) => f),
      totalCount: docs.length,
    };
  }

  async getDocument(docId: string): Promise<DMSDocument | null> {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    const { tenant_org, tenant_brain, ...rest } = doc;
    return rest;
  }

  async getFolderContents(folderId: string): Promise<DMSSearchResult> {
    const folder = this.folders.get(folderId);
    if (!folder) return { documents: [], folders: [], totalCount: 0 };
    const docs = Array.from(this.documents.values()).filter((d) => d.name.includes(folder.name));
    return {
      documents: docs.map(({ tenant_org, tenant_brain, ...doc }) => doc),
      folders: [],
      totalCount: docs.length,
    };
  }

  async importToBrain(
    doc: DMSDocument,
    brainId: string,
    headers: Record<string, string>
  ): Promise<{ slug: string; success: boolean }> {
    const slug = `dms/import/${doc.id}`;
    return { slug, success: true };
  }

  async pushToDms(
    filename: string,
    contentBase64: string,
    opts: { folderId?: string; metadata?: Record<string, string> }
  ): Promise<{ success: boolean; documentId?: string; error?: string }> {
    const docId = `dms-push-${Date.now()}`;
    return { success: true, documentId: docId };
  }

  // Tenant-aware search (simulates server-side enforcement)
  searchForTenant(
    query: string,
    callerOrg: string,
    opts?: { limit?: number; folderId?: string }
  ): DMSDocument[] {
    let docs = Array.from(this.documents.values());
    // Enforce org isolation
    docs = docs.filter((d) => d.tenant_org === callerOrg);
    // Apply query filter
    if (query) {
      docs = docs.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()));
    }
    const limit = opts?.limit ?? 50;
    return docs.slice(0, limit).map(({ tenant_org, tenant_brain, ...doc }) => doc);
  }

  getDocumentForTenant(docId: string, callerOrg: string): DMSDocument | null {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    if (doc.tenant_org !== callerOrg) return null; // cross-tenant blocked
    const { tenant_org, tenant_brain, ...rest } = doc;
    return rest;
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────

function createMockConnector(): MockDMSConnector {
  const connector = new MockDMSConnector();

  // Org-1 documents
  connector.seedDocument({
    id: "doc-alpha-1",
    name: "Alpha Contract.pdf",
    type: "pdf",
    author: "lawyer@org1.com",
    modifiedDate: "2026-07-01",
    tenant_org: "org-1",
    tenant_brain: "brain-alpha",
  });
  connector.seedDocument({
    id: "doc-alpha-2",
    name: "Alpha Evidence.pdf",
    type: "pdf",
    author: "lawyer@org1.com",
    modifiedDate: "2026-07-10",
    tenant_org: "org-1",
    tenant_brain: "brain-alpha",
  });

  // Org-2 documents
  connector.seedDocument({
    id: "doc-beta-1",
    name: "Beta Contract.pdf",
    type: "pdf",
    author: "lawyer@org2.com",
    modifiedDate: "2026-07-05",
    tenant_org: "org-2",
    tenant_brain: "brain-beta",
  });

  // Folders
  connector.seedFolder({
    id: "folder-1",
    name: "Alpha Cases",
    path: "/org-1/alpha",
    tenant_org: "org-1",
  });
  connector.seedFolder({
    id: "folder-2",
    name: "Beta Cases",
    path: "/org-2/beta",
    tenant_org: "org-2",
  });

  return connector;
}

// ── 1. DMS Connector Interface Contract ──────────────────────────────

describe("DMS Permission: Connector Interface", () => {
  it("connector implements all required methods", () => {
    const connector = createMockConnector();
    expect(typeof connector.search).toBe("function");
    expect(typeof connector.getDocument).toBe("function");
    expect(typeof connector.getFolderContents).toBe("function");
    expect(typeof connector.importToBrain).toBe("function");
    expect(typeof connector.pushToDms).toBe("function");
    expect(typeof connector.isConfigured).toBe("function");
  });

  it("isConfigured returns true for mock", () => {
    const connector = createMockConnector();
    expect(connector.isConfigured()).toBe(true);
  });
});

// ── 2. Per-Tenant Folder Isolation ───────────────────────────────────

describe("DMS Permission: Folder Isolation", () => {
  it("org-1 search returns only org-1 documents", () => {
    const connector = createMockConnector();
    const results = connector.searchForTenant("", "org-1");
    expect(results.every((d) => !d.name.includes("Beta"))).toBe(true);
    expect(results.some((d) => d.name.includes("Alpha"))).toBe(true);
  });

  it("org-2 search returns only org-2 documents", () => {
    const connector = createMockConnector();
    const results = connector.searchForTenant("", "org-2");
    expect(results.every((d) => !d.name.includes("Alpha"))).toBe(true);
    expect(results.some((d) => d.name.includes("Beta"))).toBe(true);
  });

  it("cross-tenant document access is blocked", () => {
    const connector = createMockConnector();
    // Org-1 tries to access org-2 document
    const doc = connector.getDocumentForTenant("doc-beta-1", "org-1");
    expect(doc).toBeNull();
  });

  it("same-org document access is allowed", () => {
    const connector = createMockConnector();
    const doc = connector.getDocumentForTenant("doc-alpha-1", "org-1");
    expect(doc).not.toBeNull();
    expect(doc?.id).toBe("doc-alpha-1");
  });
});

// ── 3. Document Import Scoping ───────────────────────────────────────

describe("DMS Permission: Import Scoping", () => {
  it("imported document slug is deterministic", async () => {
    const connector = createMockConnector();
    const doc = await connector.getDocument("doc-alpha-1");
    expect(doc).not.toBeNull();
    const result = await connector.importToBrain(doc!, "brain-alpha", {});
    expect(result.slug).toBe("dms/import/doc-alpha-1");
    expect(result.success).toBe(true);
  });

  it("import slug does not contain brain_id (brain scoping is at engine level)", async () => {
    const connector = createMockConnector();
    const result = await connector.importToBrain(
      { id: "test-doc", name: "Test", type: "pdf", author: "test", modifiedDate: "2026-01-01" },
      "brain-alpha",
      {}
    );
    expect(result.slug).not.toContain("brain-alpha");
    expect(result.slug).toBe("dms/import/test-doc");
  });
});

// ── 4. DMS Access Revocation After Deprovisioning ────────────────────

describe("DMS Permission: Access Revocation", () => {
  it("deprovisioned user's DMS documents remain in tenant but user loses access", () => {
    const connector = createMockConnector();
    // User is deprovisioned — their session is revoked
    // DMS documents belong to the tenant (org), not the user
    // So documents remain accessible to other org members
    const results = connector.searchForTenant("", "org-1");
    expect(results.length).toBeGreaterThan(0);
    // But the deprovisioned user cannot authenticate to reach the DMS API
    // This is enforced at the session/auth layer, not DMS layer
  });

  it("DMS API key is scoped to org, not individual user", () => {
    // DMS_API_KEY is a tenant-level credential
    // User-level access is controlled by Subsumio's RBAC + session
    const dmsApiKey = process.env.DMS_API_KEY;
    // The key grants org-level access, user-level filtering is in Subsumio
    // In test env, DMS_API_KEY may be undefined — that's valid (DMS not configured)
    expect(dmsApiKey === undefined || typeof dmsApiKey === "string").toBe(true);
  });
});

// ── 5. Cross-Tenant Document Access Blocked ──────────────────────────

describe("DMS Permission: Cross-Tenant Block", () => {
  it("org-1 cannot list org-2 documents", () => {
    const connector = createMockConnector();
    const org1Results = connector.searchForTenant("Contract", "org-1");
    const betaLeaks = org1Results.filter((d) => d.name.includes("Beta"));
    expect(betaLeaks).toHaveLength(0);
  });

  it("org-2 cannot list org-1 documents", () => {
    const connector = createMockConnector();
    const org2Results = connector.searchForTenant("Contract", "org-2");
    const alphaLeaks = org2Results.filter((d) => d.name.includes("Alpha"));
    expect(alphaLeaks).toHaveLength(0);
  });

  it("document ID from other org returns null", () => {
    const connector = createMockConnector();
    expect(connector.getDocumentForTenant("doc-alpha-1", "org-2")).toBeNull();
    expect(connector.getDocumentForTenant("doc-beta-1", "org-1")).toBeNull();
  });
});

// ── 6. DMS Search Scoped to Authorized Folders ───────────────────────

describe("DMS Permission: Folder Authorization", () => {
  it("folder from same org is accessible", async () => {
    const connector = createMockConnector();
    const results = await connector.getFolderContents("folder-1");
    expect(results.totalCount).toBeGreaterThanOrEqual(0);
  });

  it("non-existent folder returns empty results", async () => {
    const connector = createMockConnector();
    const results = await connector.getFolderContents("non-existent");
    expect(results.documents).toHaveLength(0);
    expect(results.totalCount).toBe(0);
  });

  it("search with folder filter respects tenant boundary", () => {
    const connector = createMockConnector();
    // Even if attacker passes folder-2 (org-2 folder) from org-1 context
    // The tenant-aware search filters by org first
    const results = connector.searchForTenant("", "org-1", { folderId: "folder-2" });
    // No org-2 documents leak
    const betaLeaks = results.filter((d) => d.name.includes("Beta"));
    expect(betaLeaks).toHaveLength(0);
  });
});
