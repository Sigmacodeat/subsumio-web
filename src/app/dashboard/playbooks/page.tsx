"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  BookOpen,
  Plus,
  Loader2,
  X,
  Trash2,
  Pencil,
  Save,
  AlertTriangle,
  Scale,
  GripVertical,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { SearchBar } from "@/components/dashboard/search-bar";
import type {
  BrainPage,
  PlaybookRule,
  PlaybookRequiredPosition,
  PlaybookSeverity,
} from "@/lib/types";

const JURISDICTION_LABELS: Record<string, string> = {
  at: "Österreich",
  de: "Deutschland",
  ch: "Schweiz",
  all: "Alle",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  medium: "bg-amber-500/10 border-amber-500/20 text-amber-600",
  high: "bg-red-500/10 border-red-500/20 text-red-600",
  critical: "bg-red-600/20 border-red-500/30 text-red-700",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

const POSITION_LABELS: Record<string, string> = {
  favorable: "Mandantenfreundlich",
  neutral: "Neutral",
  exclude: "Ausschließen",
  must_include: "Muss enthalten",
};

const POSITION_COLORS: Record<string, string> = {
  favorable: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  neutral: "bg-slate-500/10 border-slate-500/20 text-slate-600",
  exclude: "bg-red-500/10 border-red-500/20 text-red-600",
  must_include: "bg-blue-500/10 border-blue-500/20 text-blue-600",
};

const CONTRACT_TYPES = [
  "Kaufvertrag",
  "Dienstvertrag",
  "Werkvertrag",
  "Mietvertrag",
  "NDA / Geheimhaltung",
  "Arbeitsvertrag",
  "Lizenzvertrag",
  "GmbH-Vertrag",
  "Liefervertrag",
  "Beratungsvertrag",
  "Sonstige",
];

interface PlaybookItem {
  slug: string;
  title: string;
  jurisdiction: string;
  contract_types: string[];
  rules: PlaybookRule[];
  description: string;
  createdAt: string;
}

function parsePlaybook(page: BrainPage): PlaybookItem {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  return {
    slug: page.slug,
    title: page.title,
    jurisdiction: (fm.jurisdiction as string) || "all",
    contract_types: Array.isArray(fm.contract_types) ? (fm.contract_types as string[]) : [],
    rules: Array.isArray(fm.rules) ? (fm.rules as PlaybookRule[]) : [],
    description: page.content || "",
    createdAt:
      ((page as unknown as Record<string, unknown>).created_at as string) ||
      new Date().toISOString(),
  };
}

function makeRuleId(): string {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function emptyRule(): PlaybookRule {
  return {
    id: makeRuleId(),
    clause_type: "",
    required_position: "favorable",
    deviation_flag: "",
    severity: "medium",
  };
}

export default function PlaybooksPage() {
  const confirm = useConfirm();
  const [playbooks, setPlaybooks] = useState<PlaybookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formJurisdiction, setFormJurisdiction] = useState("all");
  const [formContractTypes, setFormContractTypes] = useState<string[]>([]);
  const [formDescription, setFormDescription] = useState("");
  const [formRules, setFormRules] = useState<PlaybookRule[]>([]);

  useEffect(() => {
    loadPlaybooks(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPlaybooks = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await api.legal.playbooks.list({ limit: 200 });
      const items = (Array.isArray(pages) ? pages : []).map(parsePlaybook);
      setPlaybooks(items);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Playbooks konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return playbooks;
    const q = query.toLowerCase();
    return playbooks.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.jurisdiction.toLowerCase().includes(q) ||
        p.contract_types.some((t) => t.toLowerCase().includes(q))
    );
  }, [playbooks, query]);

  function resetForm() {
    setFormTitle("");
    setFormJurisdiction("all");
    setFormContractTypes([]);
    setFormDescription("");
    setFormRules([]);
    setSaveError(null);
  }

  function startCreate() {
    resetForm();
    setEditingSlug(null);
    setCreating(true);
  }

  function startEdit(pb: PlaybookItem) {
    setFormTitle(pb.title);
    setFormJurisdiction(pb.jurisdiction);
    setFormContractTypes([...pb.contract_types]);
    setFormDescription(pb.description);
    setFormRules(pb.rules.map((r) => ({ ...r })));
    setEditingSlug(pb.slug);
    setCreating(false);
    setSaveError(null);
  }

  function cancelForm() {
    setCreating(false);
    setEditingSlug(null);
    resetForm();
  }

  function addRule() {
    setFormRules((r) => [...r, emptyRule()]);
  }

  function updateRule(idx: number, patch: Partial<PlaybookRule>) {
    setFormRules((r) => r.map((rule, i) => (i === idx ? { ...rule, ...patch } : rule)));
  }

  function removeRule(idx: number) {
    setFormRules((r) => r.filter((_, i) => i !== idx));
  }

  function duplicateRule(idx: number) {
    setFormRules((r) => {
      const copy = { ...r[idx], id: makeRuleId() };
      return [...r.slice(0, idx + 1), copy, ...r.slice(idx + 1)];
    });
  }

  function toggleContractType(type: string) {
    setFormContractTypes((t) => (t.includes(type) ? t.filter((x) => x !== type) : [...t, type]));
  }

  async function savePlaybook() {
    if (!formTitle.trim()) {
      setSaveError("Name ist erforderlich.");
      return;
    }
    if (formRules.length === 0) {
      setSaveError("Mindestens eine Rule ist erforderlich.");
      return;
    }
    const invalidRules = formRules.filter((r) => !r.clause_type.trim() || !r.deviation_flag.trim());
    if (invalidRules.length > 0) {
      setSaveError("Alle Rules müssen einen Klauseltyp und Deviation-Flag haben.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        title: formTitle,
        jurisdiction: formJurisdiction,
        contract_types: formContractTypes,
        rules: formRules,
        description: formDescription,
      };

      if (editingSlug) {
        await api.legal.playbooks.update(editingSlug, payload);
        setPlaybooks((p) => p.map((pb) => (pb.slug === editingSlug ? { ...pb, ...payload } : pb)));
      } else {
        const result = await api.legal.playbooks.create(payload);
        const newItem: PlaybookItem = {
          slug: result.slug,
          ...payload,
          createdAt: new Date().toISOString(),
        };
        setPlaybooks((p) => [newItem, ...p]);
      }
      cancelForm();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePlaybook(slug: string) {
    const ok = await confirm({
      title: "Playbook löschen",
      message: "Möchten Sie dieses Playbook wirklich löschen?",
      confirmLabel: "Löschen",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.legal.playbooks.delete(slug);
      setPlaybooks((p) => p.filter((pb) => pb.slug !== slug));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
    }
  }

  const isFormOpen = creating || editingSlug !== null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Contract Playbooks"
        description="Rule-Based Contract Review — definiere Klausel-Standards und flagge Deviationen beim Redlining"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Playbooks" }]}
        actions={
          <Button onClick={startCreate} className="brand-bg gap-2 text-white">
            <Plus size={14} /> Playbook anlegen
          </Button>
        }
      />

      {/* Form: Create / Edit */}
      {isFormOpen && (
        <PlaybookEditor
          title={formTitle}
          jurisdiction={formJurisdiction}
          contractTypes={formContractTypes}
          description={formDescription}
          rules={formRules}
          saving={saving}
          error={saveError}
          isEdit={editingSlug !== null}
          onTitleChange={setFormTitle}
          onJurisdictionChange={setFormJurisdiction}
          onDescriptionChange={setFormDescription}
          onContractTypeToggle={toggleContractType}
          onAddRule={addRule}
          onUpdateRule={updateRule}
          onRemoveRule={removeRule}
          onDuplicateRule={duplicateRule}
          onSave={savePlaybook}
          onCancel={cancelForm}
        />
      )}

      {/* Search */}
      {!isFormOpen && (
        <SearchBar
          placeholder="Playbooks suchen…"
          onSearch={setQuery}
          onClear={() => setQuery("")}
          className="max-w-md"
        />
      )}

      {/* Error */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadPlaybooks()}
            className="shrink-0 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Stats */}
      {!loading && playbooks.length > 0 && !isFormOpen && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={<BookOpen size={14} />} label="Playbooks" value={playbooks.length} />
          <StatCard
            icon={<Scale size={14} />}
            label="Rules gesamt"
            value={playbooks.reduce((s, p) => s + p.rules.length, 0)}
          />
          <StatCard
            icon={<AlertTriangle size={14} />}
            label="Kritische Rules"
            value={playbooks.reduce(
              (s, p) => s + p.rules.filter((r) => r.severity === "critical").length,
              0
            )}
            color="red"
          />
          <StatCard
            icon={<BookOpen size={14} />}
            label="Jurisdiktionen"
            value={new Set(playbooks.map((p) => p.jurisdiction)).size}
          />
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20" role="status" aria-label="Lädt">
          <Loader2 size={24} className="brand-text animate-spin" aria-hidden="true" />
        </div>
      ) : !isFormOpen && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] px-6 py-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
            <BookOpen size={26} className="text-[color:var(--ds-text-subtle)]" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
            {playbooks.length === 0 ? "Keine Playbooks vorhanden" : "Keine Playbooks gefunden"}
          </h3>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            {playbooks.length === 0
              ? "Lege dein erstes Playbook an über den „Playbook anlegen“-Button oben."
              : "Passe deine Suche an."}
          </p>
        </div>
      ) : !isFormOpen ? (
        <div className="space-y-3">
          {filtered.map((pb) => (
            <PlaybookCard
              key={pb.slug}
              playbook={pb}
              onEdit={() => startEdit(pb)}
              onDelete={() => void deletePlaybook(pb.slug)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: "red";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          color === "red"
            ? "border border-red-500/20 bg-red-500/10 text-red-600"
            : "brand-soft brand-border brand-text border"
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold text-[color:var(--ds-text)]">{value}</p>
        <p className="text-xs text-[color:var(--ds-text-muted)]">{label}</p>
      </div>
    </div>
  );
}

function PlaybookCard({
  playbook,
  onEdit,
  onDelete,
}: {
  playbook: PlaybookItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[color:var(--ds-text)]">{playbook.title}</span>
            <Badge variant="default" className="brand-border brand-soft brand-text border text-xs">
              {JURISDICTION_LABELS[playbook.jurisdiction] || playbook.jurisdiction}
            </Badge>
            <Badge
              variant="default"
              className="border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
            >
              {playbook.rules.length} Rules
            </Badge>
          </div>
          {playbook.contract_types.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {playbook.contract_types.map((t) => (
                <span
                  key={t}
                  className="rounded bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {playbook.description && (
            <p className="mt-1 line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
              {playbook.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="hover:brand-text brand-bg/10 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-all"
            title="Aufklappen"
          >
            <BookOpen size={14} />
          </button>
          <button
            onClick={onEdit}
            className="hover:brand-text brand-bg/10 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-all"
            title="Bearbeiten"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-all hover:bg-red-500/10 hover:text-red-600"
            title="Löschen"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && playbook.rules.length > 0 && (
        <div className="space-y-2 border-t border-[color:var(--ds-border)] pt-3">
          {playbook.rules.map((rule) => (
            <div key={rule.id} className="flex items-start gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-[color:var(--ds-text)]">
                    {rule.clause_type}
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-xs ${POSITION_COLORS[rule.required_position]}`}
                  >
                    {POSITION_LABELS[rule.required_position]}
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-xs ${SEVERITY_COLORS[rule.severity]}`}
                  >
                    {SEVERITY_LABELS[rule.severity]}
                  </span>
                </div>
                <p className="mt-0.5 text-[color:var(--ds-text-muted)]">{rule.deviation_flag}</p>
                {rule.notes && (
                  <p className="mt-0.5 text-[color:var(--ds-text-subtle)] italic">{rule.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaybookEditor(props: {
  title: string;
  jurisdiction: string;
  contractTypes: string[];
  description: string;
  rules: PlaybookRule[];
  saving: boolean;
  error: string | null;
  isEdit: boolean;
  onTitleChange: (v: string) => void;
  onJurisdictionChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onContractTypeToggle: (t: string) => void;
  onAddRule: () => void;
  onUpdateRule: (idx: number, patch: Partial<PlaybookRule>) => void;
  onRemoveRule: (idx: number) => void;
  onDuplicateRule: (idx: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="brand-border space-y-5 rounded-xl border bg-[color:var(--ds-surface)] p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {props.isEdit ? "Playbook bearbeiten" : "Neues Playbook"}
        </h3>
        <button
          onClick={props.onCancel}
          className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
        >
          <X size={16} />
        </button>
      </div>

      {/* Basic fields */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
            Name
          </label>
          <input
            value={props.title}
            onChange={(e) => props.onTitleChange(e.target.value)}
            placeholder="z.B. DACH-NDA Standard"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
            Jurisdiktion
          </label>
          <select
            value={props.jurisdiction}
            onChange={(e) => props.onJurisdictionChange(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          >
            {Object.entries(JURISDICTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[color:var(--ds-text-muted)]">
          Beschreibung (optional)
        </label>
        <textarea
          value={props.description}
          onChange={(e) => props.onDescriptionChange(e.target.value)}
          rows={2}
          placeholder="Kurze Beschreibung des Playbook-Zwecks…"
          className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
      </div>

      {/* Contract type assignment */}
      <div>
        <label className="mb-2 block text-xs font-medium text-[color:var(--ds-text-muted)]">
          Vertragstypen-Zuweisung
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CONTRACT_TYPES.map((t) => {
            const selected = props.contractTypes.includes(t);
            return (
              <button
                key={t}
                onClick={() => props.onContractTypeToggle(t)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-all ${
                  selected
                    ? "brand-bg border-transparent text-white"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--brand-primary)]"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rules editor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
            Rules ({props.rules.length})
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onAddRule}
            className="brand-text gap-1.5 text-xs"
          >
            <Plus size={12} /> Rule hinzufügen
          </Button>
        </div>

        {props.rules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[color:var(--ds-border)] p-6 text-center">
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              Noch keine Rules. Klicke auf „Rule hinzufügen“, um Klausel-Standards zu definieren.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {props.rules.map((rule, idx) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onChange={(patch) => props.onUpdateRule(idx, patch)}
                onRemove={() => props.onRemoveRule(idx)}
                onDuplicate={() => props.onDuplicateRule(idx)}
              />
            ))}
          </div>
        )}
      </div>

      {props.error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-700">
          {props.error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={props.onCancel}
          className="text-[color:var(--ds-text-muted)]"
        >
          Abbrechen
        </Button>
        <Button
          onClick={props.onSave}
          disabled={props.saving}
          className="brand-bg gap-2 text-white"
        >
          {props.saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {props.isEdit ? "Speichern" : "Erstellen"}
        </Button>
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  onChange,
  onRemove,
  onDuplicate,
}: {
  rule: PlaybookRule;
  onChange: (patch: Partial<PlaybookRule>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
      <div className="flex items-center gap-2">
        <GripVertical size={12} className="shrink-0 text-[color:var(--ds-text-subtle)]" />
        <input
          value={rule.clause_type}
          onChange={(e) => onChange({ clause_type: e.target.value })}
          placeholder="Klauseltyp (z.B. Haftungsbegrenzung)"
          className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
        <button
          onClick={onDuplicate}
          className="hover:brand-text rounded p-1 text-[color:var(--ds-text-muted)] transition-all"
          title="Duplizieren"
        >
          <Copy size={12} />
        </button>
        <button
          onClick={onRemove}
          className="rounded p-1 text-[color:var(--ds-text-muted)] transition-all hover:text-red-600"
          title="Entfernen"
        >
          <X size={12} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 pl-5 md:grid-cols-3">
        <select
          value={rule.required_position}
          onChange={(e) =>
            onChange({ required_position: e.target.value as PlaybookRequiredPosition })
          }
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          {Object.entries(POSITION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={rule.severity}
          onChange={(e) => onChange({ severity: e.target.value as PlaybookSeverity })}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          {Object.entries(SEVERITY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <input
        value={rule.deviation_flag}
        onChange={(e) => onChange({ deviation_flag: e.target.value })}
        placeholder="Deviation-Flag (wann liegt eine Abweichung vor?)"
        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 pl-5 text-xs text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
      />
      <input
        value={rule.notes ?? ""}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="Notizen (optional)"
        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 pl-5 text-xs text-[color:var(--ds-text-muted)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
      />
    </div>
  );
}
