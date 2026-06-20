/**
 * Tenant Guard — Multi-Tenant-Isolation-Enforcement für Retrieval,
 * Search, Export, Portal, DMS und Analytics.
 *
 * Architektur: Brain-pro-Org mit Row-Level-Tenant-Key (siehe
 * docs/architecture/multi-tenant-architecture.md).
 *
 * Der Guard wird pro Request aus dem EngineContext erstellt und
 * durchsetzt Isolation auf 6 Ebenen: Org, Brain, Source, Matter,
 * User, Ethical Wall.
 *
 * Usage:
 *   const guard = createTenantGuard(ctx.brainId, ctx.user.orgId, ctx.user.id);
 *   guard.assertBrain(dataBrainId);           // throws on mismatch
 *   const filtered = guard.filterResults(results, (r) => r.brain_id);
 *   guard.assertMatter(caseSlug, permissions);
 */

import {
  isSameOrg,
  isSameBrain,
  validateTenantScope,
  type TenantScope,
} from "@/lib/data-classification";
import type { MatterPermissionSummary } from "@/lib/matter-context-types";

// ── Types ─────────────────────────────────────────────────────────────

export interface TenantGuardContext {
  brainId: string;
  orgId: string;
  userId: string;
}

export interface ScopedResult {
  brain_id?: string;
  org_id?: string;
  case_slug?: string;
  source?: string;
}

export interface TenantViolation {
  level: "org" | "brain" | "source" | "matter" | "user" | "ethical_wall";
  message: string;
  dataScope?: Partial<TenantScope>;
}

export class TenantViolationError extends Error {
  violations: TenantViolation[];
  constructor(violations: TenantViolation[]) {
    super(`Tenant isolation violation: ${violations.map((v) => v.level).join(", ")}`);
    this.name = "TenantViolationError";
    this.violations = violations;
  }
}

// ── Guard Factory ─────────────────────────────────────────────────────

export function createTenantGuard(ctx: TenantGuardContext) {
  const userScope: TenantScope = { brain_id: ctx.brainId, org_id: ctx.orgId };

  // ── Org-Level ──────────────────────────────────────────────────────

  function assertOrg(dataOrgId: string): void {
    if (dataOrgId !== ctx.orgId) {
      throw new TenantViolationError([{
        level: "org",
        message: `Org mismatch: user org=${ctx.orgId}, data org=${dataOrgId}`,
        dataScope: { org_id: dataOrgId },
      }]);
    }
  }

  function isOrgAllowed(dataOrgId: string): boolean {
    return dataOrgId === ctx.orgId;
  }

  // ── Brain-Level ────────────────────────────────────────────────────

  function assertBrain(dataBrainId: string, allowCrossBrain = false): void {
    if (dataBrainId === ctx.brainId) return;
    if (allowCrossBrain) {
      // Cross-brain only allowed within same org
      // The caller must verify org separately
      return;
    }
    throw new TenantViolationError([{
      level: "brain",
      message: `Brain mismatch: user brain=${ctx.brainId}, data brain=${dataBrainId}`,
      dataScope: { brain_id: dataBrainId },
    }]);
  }

  function isBrainAllowed(dataBrainId: string, allowCrossBrain = false): boolean {
    if (dataBrainId === ctx.brainId) return true;
    if (allowCrossBrain) return true;
    return false;
  }

  // ── Source-Level ───────────────────────────────────────────────────

  function assertSource(dataSource?: string, allowedSources?: string[]): void {
    if (!dataSource) return;
    if (allowedSources && !allowedSources.includes(dataSource)) {
      throw new TenantViolationError([{
        level: "source",
        message: `Source not allowed: ${dataSource}`,
        dataScope: { source: dataSource },
      }]);
    }
  }

  // ── Matter-Level ───────────────────────────────────────────────────

  function assertMatter(
    caseSlug: string,
    permissions?: MatterPermissionSummary,
  ): void {
    const violations: TenantViolation[] = [];

    // User permission check
    if (permissions) {
      if (permissions.visibility !== "full" && permissions.allowed_users.length > 0) {
        if (!permissions.allowed_users.includes(ctx.userId)) {
          violations.push({
            level: "user",
            message: `User ${ctx.userId} not in allowed_users for matter ${caseSlug}`,
          });
        }
      }

      // Ethical wall check
      if (permissions.ethical_wall_active && permissions.blocked_users.length > 0) {
        if (permissions.blocked_users.includes(ctx.userId)) {
          violations.push({
            level: "ethical_wall",
            message: `User ${ctx.userId} blocked by ethical wall for matter ${caseSlug}`,
          });
        }
      }
    }

    if (violations.length > 0) {
      throw new TenantViolationError(violations);
    }
  }

  function isMatterAccessible(
    caseSlug: string,
    permissions?: MatterPermissionSummary,
  ): boolean {
    try {
      assertMatter(caseSlug, permissions);
      return true;
    } catch {
      return false;
    }
  }

  // ── Combined Scope Check ───────────────────────────────────────────

  function assertScope(
    dataScope: TenantScope,
    options?: { allowCrossBrain?: boolean; allowedSources?: string[] },
  ): void {
    const violations: TenantViolation[] = [];

    // Validate data scope is well-formed
    const validation = validateTenantScope(dataScope);
    if (!validation.valid) {
      violations.push({
        level: "org",
        message: `Invalid data scope: ${validation.errors.join(", ")}`,
        dataScope,
      });
    }

    // Org check
    if (!isSameOrg(userScope, dataScope)) {
      violations.push({
        level: "org",
        message: `Org mismatch: user org=${ctx.orgId}, data org=${dataScope.org_id}`,
        dataScope,
      });
    }

    // Brain check
    const allowCrossBrain = options?.allowCrossBrain ?? false;
    if (!isSameBrain(userScope, dataScope) && !allowCrossBrain) {
      violations.push({
        level: "brain",
        message: `Brain mismatch: user brain=${ctx.brainId}, data brain=${dataScope.brain_id}`,
        dataScope,
      });
    }

    // Cross-brain within same org is allowed with flag
    if (allowCrossBrain && !isSameBrain(userScope, dataScope)) {
      if (!isSameOrg(userScope, dataScope)) {
        violations.push({
          level: "org",
          message: `Cross-brain across different orgs is not allowed`,
          dataScope,
        });
      }
    }

    // Source check
    if (options?.allowedSources && dataScope.source) {
      if (!options.allowedSources.includes(dataScope.source)) {
        violations.push({
          level: "source",
          message: `Source not allowed: ${dataScope.source}`,
          dataScope,
        });
      }
    }

    if (violations.length > 0) {
      throw new TenantViolationError(violations);
    }
  }

  // ── Result Filtering ───────────────────────────────────────────────

  function filterResultsByBrain<T extends ScopedResult>(
    results: T[],
    allowCrossBrain = false,
  ): T[] {
    return results.filter((r) => {
      if (!r.brain_id) return true; // No brain_id = assume same brain
      if (r.brain_id === ctx.brainId) return true;
      if (allowCrossBrain) {
        // Cross-brain only allowed within same org
        return r.org_id === ctx.orgId;
      }
      return false;
    });
  }

  function filterResultsByOrg<T extends ScopedResult>(results: T[]): T[] {
    return results.filter((r) => {
      if (!r.org_id) return true; // No org_id = assume same org
      return isOrgAllowed(r.org_id);
    });
  }

  function filterResultsByMatter<T extends ScopedResult>(
    results: T[],
    accessibleCases: Set<string>,
  ): T[] {
    return results.filter((r) => {
      if (!r.case_slug) return true;
      // Check if the case or any parent prefix is accessible
      for (const c of accessibleCases) {
        if (r.case_slug === c || r.case_slug.startsWith(c + "/")) return true;
      }
      return false;
    });
  }

  function filterResults<T extends ScopedResult>(
    results: T[],
    options?: {
      allowCrossBrain?: boolean;
      accessibleCases?: Set<string>;
      allowedSources?: string[];
    },
  ): T[] {
    let filtered = filterResultsByOrg(results);
    filtered = filterResultsByBrain(filtered, options?.allowCrossBrain);
    if (options?.accessibleCases) {
      filtered = filterResultsByMatter(filtered, options.accessibleCases);
    }
    if (options?.allowedSources) {
      filtered = filtered.filter((r) => {
        if (!r.source) return true;
        return options.allowedSources!.includes(r.source);
      });
    }
    return filtered;
  }

  // ── Export Guard ───────────────────────────────────────────────────

  function assertExportScope(dataScope: TenantScope): void {
    // Export is always single-brain, no cross-brain allowed
    assertScope(dataScope, { allowCrossBrain: false });
  }

  // ── Analytics Guard ────────────────────────────────────────────────

  function assertAnalyticsScope(dataOrgId: string): void {
    assertOrg(dataOrgId);
  }

  // ── Portal Guard ───────────────────────────────────────────────────

  function assertPortalScope(
    caseSlug: string,
    portalBrainId: string,
  ): void {
    const violations: TenantViolation[] = [];

    if (portalBrainId !== ctx.brainId) {
      violations.push({
        level: "brain",
        message: `Portal brain mismatch: expected ${ctx.brainId}, got ${portalBrainId}`,
      });
    }

    if (violations.length > 0) {
      throw new TenantViolationError(violations);
    }
  }

  return {
    ctx,
    userScope,
    assertOrg,
    isOrgAllowed,
    assertBrain,
    isBrainAllowed,
    assertSource,
    assertMatter,
    isMatterAccessible,
    assertScope,
    filterResultsByBrain,
    filterResultsByOrg,
    filterResultsByMatter,
    filterResults,
    assertExportScope,
    assertAnalyticsScope,
    assertPortalScope,
  };
}

export type TenantGuard = ReturnType<typeof createTenantGuard>;
