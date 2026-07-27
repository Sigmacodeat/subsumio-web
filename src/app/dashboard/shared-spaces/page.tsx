"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import {
  Share2,
  Plus,
  Loader2,
  AlertCircle,
  Users,
  FileText,
  Settings,
  Shield,
  Clock,
  CheckCircle2,
  X,
  Crown,
  Pencil,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { csrfFetch } from "@/lib/csrf";
import type { SharedSpace, SpaceMember, SpaceResource } from "@/lib/shared-spaces";

const roleBadge: Record<string, string> = {
  owner: "bg-purple-100 text-purple-700 border-purple-200",
  admin: "bg-[color:var(--ds-info-solid)] text-[color:var(--ds-info-text)] border-blue-200",
  editor: "bg-[color:var(--ds-success-solid)] text-[color:var(--ds-success-text)] border-green-200",
  viewer: "bg-gray-100 text-gray-600 border-gray-200",
};

const statusBadge: Record<string, string> = {
  active: "bg-[color:var(--ds-success-solid)] text-[color:var(--ds-success-text)] border-green-200",
  pending:
    "bg-[color:var(--ds-warning-solid)] text-[color:var(--ds-warning-text)] border-yellow-200",
  revoked: "bg-[color:var(--ds-danger-solid)] text-[color:var(--ds-danger-text)] border-red-200",
};

const resourceIcon: Record<string, typeof FileText> = {
  document: FileText,
  case: Users,
  playbook: Settings,
  contract: Shield,
  folder: FileText,
};

export default function SharedSpacesPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [spaces, setSpaces] = useState<SharedSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<SharedSpace | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/shared-spaces");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSpaces(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handler = () => setShowCreate(true);
    window.addEventListener("subsumio:create-space", handler);
    return () => window.removeEventListener("subsumio:create-space", handler);
  }, []);

  const handleCreate = async (title: string, description: string) => {
    setCreating(true);
    try {
      const res = await csrfFetch("/api/shared-spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await load();
      setShowCreate(false);
      addToast({ type: "success", description: "Shared Space erstellt" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erstellung fehlgeschlagen");
      addToast({ type: "error", description: "Erstellung fehlgeschlagen" });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  if (error && spaces.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-[color:var(--ds-danger-text)]" />
        <p className="text-[color:var(--ds-text-muted)]">
          {t("shared.err_load")}: {error}
        </p>
        <Button onClick={load} variant="outline">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("shared.title")}
        description={t("shared.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("shared.title") },
        ]}
        actions={
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Neuer Space
          </Button>
        }
      />

      {error && (
        <Card className="border-red-200 bg-[color:var(--ds-danger-solid)] p-4">
          <div className="flex items-center gap-2 text-sm text-[color:var(--ds-danger-text)]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        </Card>
      )}

      {spaces.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-4 p-12">
          <Share2 className="h-12 w-12 text-[color:var(--ds-text-muted)]" />
          <h2 className="text-xl font-semibold">Keine Shared Spaces vorhanden</h2>
          <p className="max-w-md text-center text-[color:var(--ds-text-muted)]">
            Erstelle einen Shared Space, um Dokumente, Akten und Playbooks mit anderen
            Organisationen zu teilen.
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Ersten Space erstellen
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => (
            <SpaceCard key={space.slug} space={space} onClick={() => setSelectedSpace(space)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateSpaceModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          creating={creating}
        />
      )}

      {selectedSpace && (
        <SpaceDetailModal space={selectedSpace} onClose={() => setSelectedSpace(null)} />
      )}
    </div>
  );
}

function SpaceCard({ space, onClick }: { space: SharedSpace; onClick: () => void }) {
  const activeMembers = space.members.filter((m) => m.status === "active").length;
  const pendingMembers = space.members.filter((m) => m.status === "pending").length;

  return (
    <Card className="group cursor-pointer p-5 transition-shadow hover:shadow-md" onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-brand/10 flex h-10 w-10 items-center justify-center rounded-lg">
            <Share2 className="text-brand h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-[color:var(--ds-text)]">{space.title}</h3>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {new Date(space.created_at).toLocaleDateString("de-DE")}
            </p>
          </div>
        </div>
        <Badge variant="default" className={roleBadge[space.members[0]?.role ?? "viewer"]}>
          {space.members[0]?.role ?? "viewer"}
        </Badge>
      </div>

      {space.description && (
        <p className="mt-3 line-clamp-2 text-sm text-[color:var(--ds-text-muted)]">
          {space.description}
        </p>
      )}

      <div className="mt-4 flex items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {activeMembers} aktiv{pendingMembers > 0 && ` · ${pendingMembers} ausstehend`}
        </span>
        <span className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          {space.resources.length} Ressourcen
        </span>
      </div>
    </Card>
  );
}

function CreateSpaceModal({
  onClose,
  onCreate,
  creating,
}: {
  onClose: () => void;
  onCreate: (title: string, description: string) => void;
  creating: boolean;
}) {
  const { t } = useLang();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) onCreate(title.trim(), description.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("shared.new_title")}</h2>
          <button
            onClick={onClose}
            className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t("shared.label_title")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("shared.title_placeholder")}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm focus:border-[color:var(--ds-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              required
              maxLength={100}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t("shared.label_desc")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("shared.desc_placeholder")}
              className="w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm focus:border-[color:var(--ds-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              rows={3}
              maxLength={500}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={creating}>
              {t("shared.cancel")}
            </Button>
            <Button type="submit" disabled={creating || !title.trim()}>
              {creating ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  {t("shared.creating")}
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t("shared.create")}
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SpaceDetailModal({ space, onClose }: { space: SharedSpace; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand/10 flex h-12 w-12 items-center justify-center rounded-lg">
              <Share2 className="text-brand h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{space.title}</h2>
              {space.description && (
                <p className="mt-0.5 text-sm text-[color:var(--ds-text-muted)]">
                  {space.description}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 flex flex-wrap gap-4 text-xs text-[color:var(--ds-text-muted)]">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Erstellt: {new Date(space.created_at).toLocaleString("de-DE")}
          </span>
          <span className="flex items-center gap-1">
            <Pencil className="h-3.5 w-3.5" />
            Aktualisiert: {new Date(space.updated_at).toLocaleString("de-DE")}
          </span>
        </div>

        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" />
            Mitglieder ({space.members.length})
          </h3>
          <div className="space-y-2">
            {space.members.map((member: SpaceMember, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {member.role === "owner" && (
                    <Crown className="h-4 w-4 text-[color:var(--ds-warning-text)]" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{member.org_name}</p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      Eingeladen von {member.invited_by}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className={statusBadge[member.status]}>
                    {member.status}
                  </Badge>
                  <Badge variant="default" className={roleBadge[member.role]}>
                    {member.role}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4" />
            Ressourcen ({space.resources.length})
          </h3>
          {space.resources.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[color:var(--ds-border)] px-3 py-6 text-center text-sm text-[color:var(--ds-text-muted)]">
              Noch keine Ressourcen geteilt. Füge Dokumente, Akten oder Playbooks hinzu.
            </p>
          ) : (
            <div className="space-y-2">
              {space.resources.map((resource: SpaceResource, i) => {
                const Icon = resourceIcon[resource.type] ?? FileText;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
                      <div>
                        <p className="text-sm font-medium">{resource.title}</p>
                        <p className="text-xs text-[color:var(--ds-text-muted)]">
                          Geteilt von {resource.shared_by} ·{" "}
                          {new Date(resource.shared_at).toLocaleDateString("de-DE")}
                        </p>
                      </div>
                    </div>
                    <Badge variant="default">{resource.permissions}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Settings className="h-4 w-4" />
            Einstellungen
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-[color:var(--ds-border)] px-3 py-2">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Standard-Berechtigung</p>
              <p className="mt-0.5 text-sm font-medium capitalize">
                {space.settings.default_permission}
              </p>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] px-3 py-2">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Mitglieder-Einladung</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm font-medium">
                {space.settings.allow_member_invite ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--ds-success-text)]" />{" "}
                    Erlaubt
                  </>
                ) : (
                  <>
                    <X className="h-3.5 w-3.5 text-[color:var(--ds-danger-text)]" /> Gesperrt
                  </>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] px-3 py-2">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Ressourcen-Freigabe</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm font-medium">
                {space.settings.require_approval_for_resources ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--ds-success-text)]" />{" "}
                    Genehmigung nötig
                  </>
                ) : (
                  <>
                    <X className="h-3.5 w-3.5 text-[color:var(--ds-danger-text)]" /> Frei
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Schließen
          </Button>
        </div>
      </Card>
    </div>
  );
}
