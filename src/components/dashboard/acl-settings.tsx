"use client";

import { useState } from "react";
import { Shield, Plus, Trash2, UserPlus, UserMinus, Lock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useAclGroups,
  useCreateAclGroup,
  useDeleteAclGroup,
  useAclGroupMembers,
  useAddAclGroupMember,
  useRemoveAclGroupMember,
  type AclGroup,
} from "@/lib/queries/settings";
import { useTeam } from "@/lib/queries/settings";

export function AclSettings() {
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  const groupsQuery = useAclGroups();
  const createGroupMutation = useCreateAclGroup();
  const deleteGroupMutation = useDeleteAclGroup();
  const membersQuery = useAclGroupMembers(selectedGroupId ?? undefined);
  const addMemberMutation = useAddAclGroupMember();
  const removeMemberMutation = useRemoveAclGroupMember();
  const teamQuery = useTeam();

  const groups = groupsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const teamMembers = teamQuery.data?.members ?? [];

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroupMutation.mutateAsync(newGroupName.trim());
      setNewGroupName("");
    } catch (err) {
      console.error("[acl] create group failed:", err);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("Gruppe wirklich löschen? Alle Berechtigungen werden entfernt.")) return;
    try {
      await deleteGroupMutation.mutateAsync(groupId);
      if (selectedGroupId === groupId) setSelectedGroupId(null);
    } catch (err) {
      console.error("[acl] delete group failed:", err);
    }
  };

  const handleAddMember = async () => {
    if (!selectedGroupId || !selectedUserId) return;
    try {
      await addMemberMutation.mutateAsync({ groupId: selectedGroupId, userId: selectedUserId });
      setSelectedUserId("");
    } catch (err) {
      console.error("[acl] add member failed:", err);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroupId) return;
    try {
      await removeMemberMutation.mutateAsync({ groupId: selectedGroupId, userId });
    } catch (err) {
      console.error("[acl] remove member failed:", err);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Shield className="h-5 w-5 text-[color:var(--brand-primary)]" />
          <h3 className="text-lg font-semibold text-[color:var(--ds-text)]">
            Dokument-Berechtigungen
          </h3>
        </div>
        <p className="mb-4 text-sm text-[color:var(--ds-text-muted)]">
          Erstellen Sie Gruppen und weisen Sie Teammitglieder zu. Seiten ohne Berechtigung sind für
          alle sichtbar (open-by-default).
        </p>
      </div>

      {/* Create Group */}
      <Card className="border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex gap-2">
          <Input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Gruppenname (z.B. Familienrecht)"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateGroup();
            }}
          />
          <Button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim() || createGroupMutation.isPending}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Gruppe erstellen
          </Button>
        </div>
      </Card>

      {/* Groups List */}
      {groupsQuery.isLoading ? (
        <p className="text-sm text-[color:var(--ds-text-muted)]">Gruppen werden geladen…</p>
      ) : groups.length === 0 ? (
        <Card className="border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-8 text-center">
          <Lock className="mx-auto mb-2 h-8 w-8 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Noch keine Gruppen erstellt. Erstellen Sie eine Gruppe, um Berechtigungen zu verwalten.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group: AclGroup) => (
            <Card
              key={group.id}
              className={cn(
                "cursor-pointer border p-4 transition-colors",
                selectedGroupId === group.id
                  ? "border-[color:var(--brand-primary)] bg-[color:var(--ds-surface-2)]"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--ds-border-hover)]"
              )}
              onClick={() => setSelectedGroupId(selectedGroupId === group.id ? null : group.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10">
                    <Shield className="h-4 w-4 text-[color:var(--brand-primary)]" />
                  </div>
                  <div>
                    <p className="font-medium text-[color:var(--ds-text)]">{group.name}</p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {group.member_count ?? 0} Mitglied(er)
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteGroup(group.id);
                  }}
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Members Section (expanded) */}
              {selectedGroupId === group.id && (
                <div className="mt-4 space-y-3 border-t border-[color:var(--ds-border)] pt-4">
                  {/* Add Member */}
                  <div className="flex gap-2">
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-sm text-[color:var(--ds-text)]"
                    >
                      <option value="">Mitglied auswählen…</option>
                      {teamMembers.map((m: { id: string; name: string; email: string }) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.email})
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={handleAddMember}
                      disabled={!selectedUserId || addMemberMutation.isPending}
                      className="gap-2"
                    >
                      <UserPlus className="h-4 w-4" />
                      Hinzufügen
                    </Button>
                  </div>

                  {/* Members List */}
                  {membersQuery.isLoading ? (
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      Mitglieder werden geladen…
                    </p>
                  ) : members.length === 0 ? (
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      Keine Mitglieder in dieser Gruppe.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {members.map((m) => {
                        const teamMember = teamMembers.find(
                          (tm: { id: string; name: string; email: string }) => tm.id === m.user_id
                        );
                        return (
                          <div
                            key={m.user_id}
                            className="flex items-center justify-between rounded-lg bg-[color:var(--ds-surface-2)] px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/10 text-xs font-medium text-[color:var(--brand-primary)]">
                                {(teamMember?.name ?? "?").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[color:var(--ds-text)]">
                                  {teamMember?.name ?? m.user_id}
                                </p>
                                {teamMember?.email && (
                                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                                    {teamMember.email}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="text-red-500 hover:text-red-600"
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Info Note */}
      <Card className="border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
        <div className="flex gap-3">
          <FileText className="h-5 w-5 flex-shrink-0 text-[color:var(--ds-text-muted)]" />
          <div className="space-y-1 text-sm text-[color:var(--ds-text-muted)]">
            <p>
              <strong className="text-[color:var(--ds-text)]">Open-by-default:</strong> Seiten ohne
              Berechtigungseinträge sind für alle Teammitglieder sichtbar.
            </p>
            <p>
              <strong className="text-[color:var(--ds-text)]">Einschränkung:</strong> Sobald eine
              Seite Berechtigungen hat, ist sie nur noch für Mitglieder der zugewiesenen Gruppen
              sichtbar.
            </p>
            <p>
              <strong className="text-[color:var(--ds-text)]">Admin-Bypass:</strong> Administratoren
              sehen alle Seiten unabhängig von ACL-Gruppen.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
