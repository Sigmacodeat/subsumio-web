/**
 * T7.5 / WP7.5.1 — Security Assurance Tests
 *
 * Tests for:
 *   1. Threat model coverage (STRIDE)
 *   2. SBOM generation capability
 *   3. Dependency scan configuration
 *   4. SAST/DAST pipeline configuration
 *   5. Secret scan coverage
 *   6. Pentest backlog tracking
 *   7. CI security workflow validation
 *   8. Security header presence
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function readFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf-8");
}

function fileExists(path: string): boolean {
  return existsSync(join(ROOT, path));
}

// ── 1. Threat Model Coverage (STRIDE) ────────────────────────────────

describe("Security Assurance: Threat Model (STRIDE)", () => {
  it("threat model document exists", () => {
    expect(fileExists("docs/audits/EPIC7-T7.5-SECURITY-ASSURANCE.md")).toBe(true);
  });

  it("threat model covers all STRIDE categories", () => {
    const doc = readFile("docs/audits/EPIC7-T7.5-SECURITY-ASSURANCE.md");
    expect(doc).toContain("Spoofing");
    expect(doc).toContain("Tampering");
    expect(doc).toContain("Repudiation");
    expect(doc).toContain("Information disclosure");
    expect(doc).toContain("DoS");
    expect(doc).toContain("Elevation of privilege");
  });

  it("threat model documents attack surface", () => {
    const doc = readFile("docs/audits/EPIC7-T7.5-SECURITY-ASSURANCE.md");
    expect(doc).toContain("Attack Surface");
    expect(doc).toContain("Public endpoints");
    expect(doc).toContain("SCIM endpoint");
    expect(doc).toContain("Admin endpoints");
  });

  it("threat model maps mitigations to EPIC 7 work packages", () => {
    const doc = readFile("docs/audits/EPIC7-T7.5-SECURITY-ASSURANCE.md");
    expect(doc).toContain("T7.1");
    expect(doc).toContain("T7.2");
    expect(doc).toContain("T7.3");
    expect(doc).toContain("T7.4");
  });
});

// ── 2. SBOM ──────────────────────────────────────────────────────────

describe("Security Assurance: SBOM", () => {
  it("package.json exists for frontend", () => {
    expect(fileExists("package.json")).toBe(true);
  });

  it("package.json exists for server", () => {
    expect(fileExists("server/package.json")).toBe(true);
  });

  it("bun.lock exists for reproducible builds", () => {
    expect(fileExists("bun.lock")).toBe(true);
  });

  it("frontend package.json has security-relevant dependencies", () => {
    const pkg = JSON.parse(readFile("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    // zod for validation
    expect(deps).toHaveProperty("zod");
  });

  it("server package.json has security-relevant dependencies", () => {
    const pkg = JSON.parse(readFile("server/package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    // At least some dependencies should exist
    expect(Object.keys(deps).length).toBeGreaterThan(0);
  });

  it("threat model documents SBOM generation approach", () => {
    const doc = readFile("docs/audits/EPIC7-T7.5-SECURITY-ASSURANCE.md");
    expect(doc).toContain("SBOM");
    expect(doc).toContain("SPDX");
  });
});

// ── 3. Dependency Scanning ───────────────────────────────────────────

describe("Security Assurance: Dependency Scanning", () => {
  it("CI workflow includes gitleaks secret scan", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("gitleaks");
    expect(ci).toContain("gitleaks-action");
  });

  it("CI workflow includes Snyk dependency scan", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("snyk");
    expect(ci).toContain("SNYK_TOKEN");
  });

  it("CI workflow includes bun audit", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("bun audit");
    expect(ci).toContain("--audit-level=high");
  });

  it("Dependabot is configured for npm", () => {
    const dep = readFile(".github/dependabot.yml");
    expect(dep).toContain("npm");
    expect(dep).toContain("weekly");
  });

  it("Dependabot is configured for server npm", () => {
    const dep = readFile(".github/dependabot.yml");
    expect(dep).toContain("/server");
  });

  it("Dependabot is configured for GitHub Actions", () => {
    const dep = readFile(".github/dependabot.yml");
    expect(dep).toContain("github-actions");
  });

  it("production gate requires security-scan to pass", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("security-scan");
    expect(ci).toContain("gitleaks");
    // Both are in the production-gate needs list
    const prodGateSection = ci.substring(ci.indexOf("production-gate"));
    expect(prodGateSection).toContain("gitleaks");
    expect(prodGateSection).toContain("security-scan");
  });
});

// ── 4. SAST/DAST ─────────────────────────────────────────────────────

describe("Security Assurance: SAST/DAST", () => {
  it("ESLint config exists for static analysis", () => {
    expect(fileExists("eslint.config.mjs")).toBe(true);
  });

  it("TypeScript strict config exists", () => {
    expect(fileExists("tsconfig.json")).toBe(true);
    const tsconfig = readFile("tsconfig.json");
    expect(tsconfig).toContain("strict");
  });

  it("Playwright config exists for DAST/E2E", () => {
    expect(fileExists("playwright.config.ts")).toBe(true);
  });

  it("CI runs Playwright accessibility tests", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("playwright");
    expect(ci).toContain("a11y");
  });

  it("CI runs workflow simulation (42-step E2E)", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("workflow-simulation");
    expect(ci).toContain("42-step");
  });

  it("threat model documents pentest backlog", () => {
    const doc = readFile("docs/audits/EPIC7-T7.5-SECURITY-ASSURANCE.md");
    expect(doc).toContain("Pentest Backlog");
    expect(doc).toContain("OWASP Top 10");
    expect(doc).toContain("SQL injection");
    expect(doc).toContain("XSS");
    expect(doc).toContain("SSRF");
  });
});

// ── 5. Secret Scanning ───────────────────────────────────────────────

describe("Security Assurance: Secret Scanning", () => {
  it("gitleaks config exists", () => {
    expect(fileExists(".gitleaks.toml")).toBe(true);
  });

  it("gitleaks config extends default ruleset", () => {
    const config = readFile(".gitleaks.toml");
    expect(config).toContain("useDefault = true");
  });

  it("gitleaks config has Subsumio-specific patterns", () => {
    const config = readFile(".gitleaks.toml");
    expect(config).toContain("subsumio-auth-secret");
    expect(config).toContain("subsumio-encryption-key");
    expect(config).toContain("subsumio-internal-secret");
    expect(config).toContain("subsumio-web-api-key");
    expect(config).toContain("workos-api-key");
    expect(config).toContain("scim-bearer-token");
  });

  it("gitleaks config has allowlist for false positives", () => {
    const config = readFile(".gitleaks.toml");
    expect(config).toContain("[allowlist]");
    expect(config).toContain("docs/");
    expect(config).toContain(".test\\.");
    expect(config).toContain("law-corpus/");
  });

  it("gitleaks config covers cron secret", () => {
    const config = readFile(".gitleaks.toml");
    expect(config).toContain("CRON_SECRET");
  });

  it("gitleaks config covers Upstash Redis token", () => {
    const config = readFile(".gitleaks.toml");
    expect(config).toContain("UPSTASH_REDIS_REST_TOKEN");
  });

  it("env example files exist (not real secrets)", () => {
    expect(fileExists(".env.example")).toBe(true);
  });

  it("gitignore excludes .env files", () => {
    const gitignore = readFile(".gitignore");
    expect(gitignore).toMatch(/\.env/);
  });
});

// ── 6. CI Security Workflow Validation ───────────────────────────────

describe("Security Assurance: CI Security Workflow", () => {
  it("CI has lint job", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("lint:");
  });

  it("CI has typecheck job", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("typecheck:");
  });

  it("CI has build verification", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("build:");
    expect(ci).toContain("Bundle size check");
  });

  it("CI has production gate aggregating all jobs", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("production-gate");
    expect(ci).toContain("All required jobs passed");
  });

  it("CI runs on push and PR for main and develop", () => {
    const ci = readFile(".github/workflows/ci.yml");
    expect(ci).toContain("push:");
    expect(ci).toContain("pull_request:");
    expect(ci).toContain("main");
    expect(ci).toContain("develop");
  });
});

// ── 7. Security Headers ──────────────────────────────────────────────

describe("Security Assurance: Security Headers", () => {
  it("next.config.ts exists", () => {
    expect(fileExists("next.config.ts")).toBe(true);
  });

  it("vercel.json exists for header configuration", () => {
    expect(fileExists("vercel.json")).toBe(true);
  });

  it("middleware exists for security header injection", () => {
    expect(fileExists("src/middleware.ts")).toBe(true);
  });
});

// ── 8. Security Test Coverage Summary ────────────────────────────────

describe("Security Assurance: Test Coverage Summary", () => {
  it("T7.1 tenant isolation tests exist", () => {
    expect(fileExists("src/lib/security/red-team-tenant-isolation.test.ts")).toBe(true);
    expect(fileExists("src/lib/security/prompt-injection-e2e.test.ts")).toBe(true);
    expect(fileExists("src/lib/security/dms-permission-enforcement.test.ts")).toBe(true);
    expect(fileExists("src/lib/security/acl-runtime-enforcement.test.ts")).toBe(true);
  });

  it("T7.2 identity lifecycle tests exist", () => {
    expect(fileExists("src/lib/auth/identity-lifecycle.test.ts")).toBe(true);
    expect(fileExists("src/lib/auth/revocation-e2e.test.ts")).toBe(true);
  });

  it("T7.3 data governance tests exist", () => {
    expect(fileExists("src/lib/security/data-governance.test.ts")).toBe(true);
  });

  it("T7.4 tamper-evident audit tests exist", () => {
    expect(fileExists("src/lib/security/tamper-evident-audit.test.ts")).toBe(true);
  });

  it("T7.5 security assurance tests exist (this file)", () => {
    expect(fileExists("src/lib/security/security-assurance.test.ts")).toBe(true);
  });

  it("key rotation module exists", () => {
    expect(fileExists("src/lib/key-rotation.ts")).toBe(true);
  });

  it("model provider policy module exists", () => {
    expect(fileExists("src/lib/model-provider-policy.ts")).toBe(true);
  });

  it("audit chain verification module exists", () => {
    expect(fileExists("src/lib/audit-chain-verification.ts")).toBe(true);
  });

  it("DSAR export endpoint exists", () => {
    expect(fileExists("src/app/api/admin/data-export/route.ts")).toBe(true);
  });

  it("DSAR delete endpoint exists", () => {
    expect(fileExists("src/app/api/admin/data-delete/route.ts")).toBe(true);
  });

  it("audit export endpoint exists", () => {
    expect(fileExists("src/app/api/admin/audit-export/route.ts")).toBe(true);
  });

  it("AuditEntry interface includes hash and prev_hash fields", () => {
    const labels = readFile("src/lib/audit-labels.ts");
    expect(labels).toContain("hash?: string");
    expect(labels).toContain("prev_hash?: string");
  });

  it("listAuditLogs SQL query selects hash and prev_hash", () => {
    const audit = readFile("src/lib/audit.ts");
    expect(audit).toContain("hash, prev_hash, created_at::text as timestamp");
  });

  it("audit-export route passes through hash/prev_hash from entries", () => {
    const route = readFile("src/app/api/admin/audit-export/route.ts");
    expect(route).toContain("hash: e.hash ?? null");
    expect(route).toContain("prev_hash: e.prev_hash ?? null");
  });

  it("admin.audit_export is registered in RouteAction and AuditAction", () => {
    const perms = readFile("src/lib/permissions.ts");
    expect(perms).toContain('"admin.audit_export"');
    const labels = readFile("src/lib/audit-labels.ts");
    expect(labels).toContain('"admin.audit_export"');
  });

  it("DSAR data-export uses real DB queries (no mock strings)", () => {
    const route = readFile("src/app/api/admin/data-export/route.ts");
    expect(route).toContain("getSharedPgPool");
    expect(route).toContain("FROM subsumio_users");
    expect(route).toContain("FROM subsumio_audit_log");
    expect(route).not.toContain("In production");
    expect(route).not.toContain('"note"');
  });

  it("DSAR data-delete uses real DB operations (no mock strings)", () => {
    const route = readFile("src/app/api/admin/data-delete/route.ts");
    expect(route).toContain("getSharedPgPool");
    expect(route).toContain("subsumio_session_revocations");
    expect(route).toContain("subsumio_users");
    expect(route).not.toContain("In production");
  });
});

// ── 9. Encryption Module ─────────────────────────────────────────────

describe("Security Assurance: Encryption Module", () => {
  it("encryption module exists", () => {
    expect(fileExists("src/lib/encryption.ts")).toBe(true);
  });

  it("encryption module uses AES-256-GCM", () => {
    const enc = readFile("src/lib/encryption.ts");
    expect(enc).toContain("AES-GCM");
  });

  it("encryption module requires key in production", () => {
    const enc = readFile("src/lib/encryption.ts");
    expect(enc).toContain("SUBSUMIO_ENCRYPTION_KEY");
    expect(enc).toContain("production");
  });

  it("encryption module has encrypt/decrypt functions", () => {
    const enc = readFile("src/lib/encryption.ts");
    expect(enc).toContain("export async function encrypt");
    expect(enc).toContain("export async function decrypt");
  });

  it("encryption module uses sbenc: marker format", () => {
    const enc = readFile("src/lib/encryption.ts");
    expect(enc).toContain("sbenc:");
  });
});

// ── 10. Audit System ─────────────────────────────────────────────────

describe("Security Assurance: Audit System", () => {
  it("audit module exists", () => {
    expect(fileExists("src/lib/audit.ts")).toBe(true);
  });

  it("audit module implements hash chaining", () => {
    const audit = readFile("src/lib/audit.ts");
    expect(audit).toContain("computeHash");
    expect(audit).toContain("prev_hash");
    expect(audit).toContain("sha256");
  });

  it("audit module has GoBD immutability triggers", () => {
    const audit = readFile("src/lib/audit.ts");
    expect(audit).toContain("subsumio_audit_log_immutable");
    expect(audit).toContain("BEFORE UPDATE");
    expect(audit).toContain("BEFORE DELETE");
    expect(audit).toContain("GoBD");
    expect(audit).toContain("§ 146 Abs. 4 AO");
  });

  it("audit module supports filtering by brain_id (tenant isolation)", () => {
    const audit = readFile("src/lib/audit.ts");
    expect(audit).toContain("brain_id");
  });
});
