/**
 * Gap 14: Permissions & Governance — rollenbasierte Pipeline-Zugriffskontrolle.
 *
 * Harvey-Feature: "Manage Workflow agent access and granular editing permissions
 * based on roles and teams."
 *
 * Subsumio-Status vor Gap 14: Multi-Tenant via _source_id existiert, aber keine
 * rollenbasierte Pipeline-Zugriffskontrolle (wer darf legal-pipeline triggern?).
 *
 * Dieses Modul bietet:
 * - Role: admin, attorney, paralegal, reviewer, viewer
 * - PipelinePermission: trigger, resume, view, export, delete, config
 * - checkPermission(): Prüft ob User die nötige Permission hat
 * - RolePolicy: Mapping von Role → Permissions
 * - Middleware für API-Routes
 */

export type Role = "admin" | "attorney" | "paralegal" | "reviewer" | "viewer";

export type PipelinePermission =
  | "pipeline:trigger" // Pipeline starten
  | "pipeline:resume" // Pipeline nach Checkpoint fortsetzen
  | "pipeline:view" // Pipeline-Status & Outputs ansehen
  | "pipeline:export" // Outputs als .docx/.pdf/.md exportieren
  | "pipeline:delete" // Pipeline-Outputs löschen
  | "pipeline:config" // Pipeline-Konfiguration ändern (models, costs, styles)
  | "pipeline:review" // Human-in-the-Loop Checkpoint bestätigen
  | "pipeline:override"; // Manual Overrides setzen (client, opponent, focus)

export interface User {
  id: string;
  email: string;
  role: Role;
  firm_id?: string;
  source_id?: string;
}

export interface RolePolicy {
  role: Role;
  permissions: Set<PipelinePermission>;
  description: string;
}

/**
 * Default Role → Permission Mapping.
 * Admin: alle Rechte
 * Attorney: trigger, resume, view, export, review, override
 * Paralegal: trigger, view, export
 * Reviewer: view, export, review
 * Viewer: view
 */
export const ROLE_POLICIES: Record<Role, RolePolicy> = {
  admin: {
    role: "admin",
    permissions: new Set<PipelinePermission>([
      "pipeline:trigger",
      "pipeline:resume",
      "pipeline:view",
      "pipeline:export",
      "pipeline:delete",
      "pipeline:config",
      "pipeline:review",
      "pipeline:override",
    ]),
    description: "Vollzugriff auf alle Pipeline-Funktionen und Konfiguration",
  },
  attorney: {
    role: "attorney",
    permissions: new Set<PipelinePermission>([
      "pipeline:trigger",
      "pipeline:resume",
      "pipeline:view",
      "pipeline:export",
      "pipeline:review",
      "pipeline:override",
    ]),
    description: "Anwalt — Pipeline starten, fortsetzen, reviewen und exportieren",
  },
  paralegal: {
    role: "paralegal",
    permissions: new Set<PipelinePermission>([
      "pipeline:trigger",
      "pipeline:view",
      "pipeline:export",
    ]),
    description: "Paralegal — Pipeline starten und Outputs ansehen/exportieren",
  },
  reviewer: {
    role: "reviewer",
    permissions: new Set<PipelinePermission>([
      "pipeline:view",
      "pipeline:export",
      "pipeline:review",
    ]),
    description: "Reviewer — Outputs ansehen, exportieren und Checkpoint bestätigen",
  },
  viewer: {
    role: "viewer",
    permissions: new Set<PipelinePermission>(["pipeline:view"]),
    description: "Viewer — Outputs nur ansehen (read-only)",
  },
};

/**
 * Check if a user has a specific permission.
 */
export function checkPermission(user: User, permission: PipelinePermission): boolean {
  const policy = ROLE_POLICIES[user.role];
  if (!policy) return false;
  return policy.permissions.has(permission);
}

/**
 * Check multiple permissions — user must have ALL of them.
 */
export function checkAllPermissions(user: User, permissions: PipelinePermission[]): boolean {
  return permissions.every((p) => checkPermission(user, p));
}

/**
 * Check if user has ANY of the given permissions.
 */
export function checkAnyPermission(user: User, permissions: PipelinePermission[]): boolean {
  return permissions.some((p) => checkPermission(user, p));
}

/**
 * Get all permissions for a user.
 */
export function getUserPermissions(user: User): PipelinePermission[] {
  const policy = ROLE_POLICIES[user.role];
  if (!policy) return [];
  return Array.from(policy.permissions);
}

/**
 * Get all available roles with descriptions.
 */
export function getRoles(): Array<{
  role: Role;
  description: string;
  permissions: PipelinePermission[];
}> {
  return Object.values(ROLE_POLICIES).map((p) => ({
    role: p.role,
    description: p.description,
    permissions: Array.from(p.permissions),
  }));
}

/**
 * Permission denied error.
 */
export class PermissionDeniedError extends Error {
  readonly permission: PipelinePermission;
  readonly userRole: Role;

  constructor(permission: PipelinePermission, userRole: Role) {
    super(`Permission denied: "${permission}" required (user role: ${userRole})`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
    this.userRole = userRole;
  }
}

/**
 * Require a permission or throw PermissionDeniedError.
 */
export function requirePermission(user: User, permission: PipelinePermission): void {
  if (!checkPermission(user, permission)) {
    throw new PermissionDeniedError(permission, user.role);
  }
}

/**
 * Extract user from request headers (mock — in production: JWT/session).
 * Looks for x-user-id, x-user-email, x-user-role headers.
 */
export function getUserFromHeaders(headers: Headers): User | null {
  const id = headers.get("x-user-id");
  const email = headers.get("x-user-email");
  const role = headers.get("x-user-role") as Role | null;
  const firmId = headers.get("x-firm-id") ?? undefined;
  const sourceId = headers.get("x-source-id") ?? undefined;

  if (!id || !email || !role) return null;
  if (!isValidRole(role)) return null;

  return { id, email, role, firm_id: firmId, source_id: sourceId };
}

function isValidRole(role: string): role is Role {
  return (
    role === "admin" ||
    role === "attorney" ||
    role === "paralegal" ||
    role === "reviewer" ||
    role === "viewer"
  );
}

/**
 * Default user (for development/testing — has admin role).
 */
export const DEFAULT_USER: User = {
  id: "dev-user",
  email: "dev@subsumio.at",
  role: "admin",
};
