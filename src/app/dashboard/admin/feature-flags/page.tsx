"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Flag,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Users,
  Crown,
  Percent,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

type FeatureFlag = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  allowedPlans: string[];
  allowedRoles: string[];
  updatedAt: string;
  updatedBy: string;
};

const PLAN_OPTIONS = ["free", "pro", "team", "enterprise"];
const ROLE_OPTIONS = ["admin", "lawyer", "assistant", "client_viewer"];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeatureFlagsPage() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ flags: FeatureFlag[] }>({
    queryKey: ["feature-flags"],
    queryFn: () => api.featureFlags.list(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, ...input }: { key: string } & Record<string, unknown>) =>
      api.featureFlags.update(key, input as Parameters<typeof api.featureFlags.update>[1]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
      addToast({ title: "Flag aktualisiert", type: "success" });
      setEditingFlag(null);
    },
    onError: () => {
      addToast({ title: "Fehler beim Aktualisieren", type: "error" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof api.featureFlags.create>[0]) =>
      api.featureFlags.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
      addToast({ title: "Flag erstellt", type: "success" });
      setShowCreate(false);
    },
    onError: () => {
      addToast({ title: "Fehler beim Erstellen", type: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.featureFlags.delete(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
      addToast({ title: "Flag gelöscht", type: "success" });
      setDeleteKey(null);
    },
    onError: () => {
      addToast({ title: "Fehler beim Löschen", type: "error" });
    },
  });

  function toggleFlag(flag: FeatureFlag) {
    updateMutation.mutate({ key: flag.key, enabled: !flag.enabled });
  }

  const flags = data?.flags ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature Flags"
        description="Verwalte Feature-Freigaben, Rollout-Prozentsätze und Plan/Rollen-Beschränkungen"
        actions={
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus size={14} /> Neuer Flag
          </Button>
        }
      />

      {error && (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle size={16} className="text-rose-500" />
            <p className="text-sm text-rose-600">Fehler beim Laden der Feature Flags.</p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]"
            />
          ))}
        </div>
      )}

      {!isLoading && flags.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-12 pb-12">
            <Flag size={32} className="text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Keine Feature Flags vorhanden.</p>
            <Button onClick={() => setShowCreate(true)} size="sm" variant="outline">
              <Plus size={14} /> Ersten Flag erstellen
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && flags.length > 0 && (
        <div className="grid gap-3">
          {flags.map((flag) => (
            <Card key={flag.key} className="overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleFlag(flag)}
                        className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
                        title={flag.enabled ? "Deaktivieren" : "Aktivieren"}
                      >
                        {flag.enabled ? (
                          <ToggleRight size={22} className="text-emerald-500" />
                        ) : (
                          <ToggleLeft size={22} className="text-muted-foreground" />
                        )}
                      </button>
                      <h3 className="text-sm font-semibold [color:var(--mk-text)]">{flag.name}</h3>
                      <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                        {flag.key}
                      </code>
                    </div>
                    {flag.description && (
                      <p className="text-xs [color:var(--mk-text-muted)]">{flag.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1.5">
                      <Badge variant={flag.enabled ? "success" : "default"} className="text-xs">
                        {flag.enabled ? "Aktiv" : "Inaktiv"}
                      </Badge>
                      {flag.rolloutPercentage < 100 && (
                        <Badge variant="accent" className="gap-1 text-xs">
                          <Percent size={10} /> {flag.rolloutPercentage}%
                        </Badge>
                      )}
                      {flag.allowedPlans.length > 0 && (
                        <Badge variant="info" className="gap-1 text-xs">
                          <Crown size={10} /> {flag.allowedPlans.join(", ")}
                        </Badge>
                      )}
                      {flag.allowedRoles.length > 0 && (
                        <Badge variant="info" className="gap-1 text-xs">
                          <Users size={10} /> {flag.allowedRoles.join(", ")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground pt-1 text-xs">
                      Aktualisiert von {flag.updatedBy} am {formatDate(flag.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditingFlag(flag)}>
                      Bearbeiten
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-500 hover:text-rose-600"
                      onClick={() => setDeleteKey(flag.key)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      {showCreate && (
        <CreateFlagDialog
          onClose={() => setShowCreate(false)}
          onCreate={(input) => {
            createMutation.mutate(input);
          }}
          isCreating={createMutation.isPending}
        />
      )}

      {/* Edit Dialog */}
      {editingFlag && (
        <EditFlagDialog
          flag={editingFlag}
          onClose={() => setEditingFlag(null)}
          onSave={(input) => {
            updateMutation.mutate({ key: editingFlag.key, ...input });
          }}
          isSaving={updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteKey} onOpenChange={(v) => !v && setDeleteKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Feature Flag löschen?</DialogTitle>
            <DialogDescription>
              Der Flag <code className="font-mono">{deleteKey}</code> wird entfernt. Features, die
              diesen Flag prüfen, sind danach standardmäßig deaktiviert.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteKey(null)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteKey && deleteMutation.mutate(deleteKey)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 size={14} /> Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateFlagDialog({
  onClose,
  onCreate,
  isCreating,
}: {
  onClose: () => void;
  onCreate: (input: Parameters<typeof api.featureFlags.create>[0]) => void;
  isCreating: boolean;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [rolloutPercentage, setRolloutPercentage] = useState(100);
  const [allowedPlans, setAllowedPlans] = useState<string[]>([]);
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);

  function togglePlan(plan: string) {
    setAllowedPlans((prev) =>
      prev.includes(plan) ? prev.filter((p) => p !== plan) : [...prev, plan]
    );
  }

  function toggleRole(role: string) {
    setAllowedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  function handleSubmit() {
    if (!key || !name) return;
    onCreate({
      key: key.trim().toLowerCase().replace(/\s+/g, "_"),
      name: name.trim(),
      description: description.trim(),
      enabled,
      rolloutPercentage,
      allowedPlans,
      allowedRoles,
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Neuer Feature Flag</DialogTitle>
          <DialogDescription>Erstelle einen neuen Feature Flag.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">Key</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="z.B. deep_analysis"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Deep Analysis Tool"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kurze Beschreibung des Features..."
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEnabled(!enabled)} className="flex items-center gap-1.5">
              {enabled ? (
                <ToggleRight size={20} className="text-emerald-500" />
              ) : (
                <ToggleLeft size={20} className="text-muted-foreground" />
              )}
              <span className="text-sm">Aktiviert</span>
            </button>
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Rollout: {rolloutPercentage}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={rolloutPercentage}
              onChange={(e) => setRolloutPercentage(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Erlaubte Pläne (leer = alle)
            </label>
            <div className="flex flex-wrap gap-2">
              {PLAN_OPTIONS.map((plan) => (
                <button
                  key={plan}
                  onClick={() => togglePlan(plan)}
                  className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                    allowedPlans.includes(plan)
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {plan}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Erlaubte Rollen (leer = alle)
            </label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                    allowedRoles.includes(role)
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating || !key || !name}>
            <Save size={14} /> Erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditFlagDialog({
  flag,
  onClose,
  onSave,
  isSaving,
}: {
  flag: FeatureFlag;
  onClose: () => void;
  onSave: (input: Partial<Parameters<typeof api.featureFlags.update>[1]>) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(flag.name);
  const [description, setDescription] = useState(flag.description);
  const [enabled, setEnabled] = useState(flag.enabled);
  const [rolloutPercentage, setRolloutPercentage] = useState(flag.rolloutPercentage);
  const [allowedPlans, setAllowedPlans] = useState<string[]>(flag.allowedPlans);
  const [allowedRoles, setAllowedRoles] = useState<string[]>(flag.allowedRoles);

  function togglePlan(plan: string) {
    setAllowedPlans((prev) =>
      prev.includes(plan) ? prev.filter((p) => p !== plan) : [...prev, plan]
    );
  }

  function toggleRole(role: string) {
    setAllowedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  function handleSubmit() {
    onSave({
      name: name.trim(),
      description: description.trim(),
      enabled,
      rolloutPercentage,
      allowedPlans,
      allowedRoles,
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Flag bearbeiten: {flag.key}</DialogTitle>
          <DialogDescription>Passe die Einstellungen für diesen Feature Flag an.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEnabled(!enabled)} className="flex items-center gap-1.5">
              {enabled ? (
                <ToggleRight size={20} className="text-emerald-500" />
              ) : (
                <ToggleLeft size={20} className="text-muted-foreground" />
              )}
              <span className="text-sm">{enabled ? "Aktiviert" : "Deaktiviert"}</span>
            </button>
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Rollout: {rolloutPercentage}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={rolloutPercentage}
              onChange={(e) => setRolloutPercentage(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Erlaubte Pläne (leer = alle)
            </label>
            <div className="flex flex-wrap gap-2">
              {PLAN_OPTIONS.map((plan) => (
                <button
                  key={plan}
                  onClick={() => togglePlan(plan)}
                  className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                    allowedPlans.includes(plan)
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {plan}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Erlaubte Rollen (leer = alle)
            </label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                    allowedRoles.includes(role)
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            <Save size={14} /> Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
