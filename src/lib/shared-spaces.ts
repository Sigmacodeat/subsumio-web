/**
 * shared-spaces — Cross-organization collaboration scaffold.
 *
 * Shared Spaces allow multiple organizations (Kanzleien, companies) to
 * collaborate on shared documents, cases, and playbooks. Each Space has
 * an owner org and invited member orgs with role-based access.
 *
 * Implementation model: Spaces are brain pages (type="shared_space") that
 * reference shared resources via frontmatter. Access control is enforced
 * at the engine level via source_id scoping — each Space gets its own
 * source_id, and members are granted access through an ACL.
 *
 * This is the scaffold — full implementation requires:
 * 1. Engine-level ACL enforcement on source_id (future: P1-BRAIN-010)
 * 2. UI for Space management (dashboard/shared-spaces/page.tsx)
 * 3. Invitation flow (email-based)
 * 4. Audit trail for cross-org actions
 */

export type SpaceRole = "owner" | "admin" | "editor" | "viewer";

export type SpaceResourceType = "document" | "case" | "playbook" | "contract" | "folder";

export interface SpaceMember {
  org_id: string;
  org_name: string;
  role: SpaceRole;
  invited_by: string;
  invited_at: string;
  accepted_at?: string;
  status: "pending" | "active" | "revoked";
}

export interface SpaceResource {
  slug: string;
  title: string;
  type: SpaceResourceType;
  shared_by: string;
  shared_at: string;
  permissions: "read" | "write" | "admin";
}

export interface SharedSpace {
  id: string;
  slug: string;
  title: string;
  description: string;
  owner_org_id: string;
  owner_org_name: string;
  source_id: string;
  members: SpaceMember[];
  resources: SpaceResource[];
  created_at: string;
  updated_at: string;
  settings: {
    default_permission: "read" | "write";
    allow_member_invite: boolean;
    require_approval_for_resources: boolean;
  };
}

export interface CreateSpaceInput {
  title: string;
  description?: string;
  owner_org_id: string;
  owner_org_name: string;
}

export interface InviteMemberInput {
  org_id: string;
  org_name: string;
  role: SpaceRole;
}

export interface ShareResourceInput {
  slug: string;
  title: string;
  type: SpaceResourceType;
  permissions?: "read" | "write" | "admin";
}

// ── Helpers ────────────────────────────────────────────────────────────

export function generateSpaceSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
  return `shared-spaces/${base}-${Date.now().toString(36)}`;
}

export function generateSourceId(spaceId: string): string {
  return `space-${spaceId}`;
}

export function canManageSpace(member: SpaceMember | undefined): boolean {
  if (!member) return false;
  return member.role === "owner" || member.role === "admin";
}

export function canEditSpace(member: SpaceMember | undefined): boolean {
  if (!member) return false;
  return member.role === "owner" || member.role === "admin" || member.role === "editor";
}

export function canViewSpace(member: SpaceMember | undefined): boolean {
  if (!member) return false;
  return member.status === "active";
}

export function spaceRolePermissions(role: SpaceRole): {
  can_invite: boolean;
  can_share_resources: boolean;
  can_delete_space: boolean;
  can_manage_members: boolean;
} {
  switch (role) {
    case "owner":
      return {
        can_invite: true,
        can_share_resources: true,
        can_delete_space: true,
        can_manage_members: true,
      };
    case "admin":
      return {
        can_invite: true,
        can_share_resources: true,
        can_delete_space: false,
        can_manage_members: true,
      };
    case "editor":
      return {
        can_invite: false,
        can_share_resources: true,
        can_delete_space: false,
        can_manage_members: false,
      };
    case "viewer":
      return {
        can_invite: false,
        can_share_resources: false,
        can_delete_space: false,
        can_manage_members: false,
      };
  }
}
