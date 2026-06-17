import React, { useState, useEffect } from 'react';
import { api } from '../api';

interface LegalEntity {
  id: string;
  type: string;
  displayName: string;
  legalAreas: string[];
  specializations: string[];
  jurisdiction: string;
  caseCount: number;
  tags: string[];
  createdAt: string;
}

interface LegalCase {
  id: string;
  caseNumber: string;
  displayTitle: string;
  legalArea: string;
  subArea: string;
  status: string;
  priority: string;
  opponentId: string;
  claims: string[];
  facts: string;
  createdAt: string;
}

interface LegalStats {
  entities: number;
  cases: number;
  openCases: number;
  wonCases: number;
}

const btnPrimary: React.CSSProperties = { background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' };
const btnDanger: React.CSSProperties = { background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer' };
const btnSmall: React.CSSProperties = { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer' };

export function LegalPage() {
  const [tab, setTab] = useState<'overview' | 'cases' | 'entities'>('overview');
  const [stats, setStats] = useState<LegalStats | null>(null);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<LegalCase | null>(null);
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [showCreateEntity, setShowCreateEntity] = useState(false);
  const [showEditCase, setShowEditCase] = useState<LegalCase | null>(null);
  const [showEditEntity, setShowEditEntity] = useState<LegalEntity | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      api.legalStats().then(setStats).catch(() => {}),
      api.legalEntities().then((r: any) => setEntities(r.entities || [])).catch(() => {}),
      api.legalCases().then((r: any) => setCases(r.cases || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleDeleteCase = async (id: string) => {
    if (!confirm('Delete this case?')) return;
    await api.deleteLegalCase(id);
    if (selectedCase?.id === id) setSelectedCase(null);
    refresh();
  };

  const handleDeleteEntity = async (id: string) => {
    if (!confirm('Delete this entity?')) return;
    await api.deleteLegalEntity(id);
    refresh();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'open': return '#3b82f6';
      case 'pending': return '#f59e0b';
      case 'won': return '#22c55e';
      case 'lost': return '#ef4444';
      case 'settled': return '#8b5cf6';
      case 'appealed': return '#ec4899';
      default: return '#6b7280';
    }
  };

  const priorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: '#22c55e',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#7f1d1d',
    };
    return (
      <span style={{
        background: colors[priority] || '#6b7280',
        color: '#fff',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
      }}>
        {priority}
      </span>
    );
  };

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading Legal Brain...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700 }}>Legal Brain</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
        Case management, opponent analysis, and strategy generation for legal professionals.
      </p>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Entities" value={stats?.entities ?? 0} icon="🏛️" />
        <StatCard label="Total Cases" value={stats?.cases ?? 0} icon="⚖️" />
        <StatCard label="Open Cases" value={stats?.openCases ?? 0} icon="📂" />
        <StatCard label="Won Cases" value={stats?.wonCases ?? 0} icon="🏆" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {(['overview', 'cases', 'entities'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelectedCase(null); }}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
              background: 'transparent',
              color: tab === t ? '#3b82f6' : 'var(--text-secondary)',
              fontWeight: tab === t ? 600 : 400,
              cursor: 'pointer',
              fontSize: 14,
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div>
          <h3 style={{ marginBottom: 12 }}>Recent Cases</h3>
          {cases.length === 0 ? (
            <EmptyState message="No cases yet. Use gbrain legal case create to add one." />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {cases.slice(0, 5).map((c) => (
                <CaseCard key={c.id} case_={c} statusColor={statusColor(c.status)} priorityBadge={priorityBadge(c.priority)} onClick={() => { setTab('cases'); setSelectedCase(c); }} />
              ))}
            </div>
          )}

          <h3 style={{ margin: '24px 0 12px' }}>Top Entities</h3>
          {entities.length === 0 ? (
            <EmptyState message="No entities yet. Use gbrain legal entity create to add profiles." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {entities.slice(0, 5).map((e) => (
                <EntityRow key={e.id} entity={e} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cases Tab */}
      {tab === 'cases' && (
        <div>
          {selectedCase ? (
            <CaseDetail
              case_={selectedCase}
              onBack={() => setSelectedCase(null)}
              statusColor={statusColor(selectedCase.status)}
              priorityBadge={priorityBadge(selectedCase.priority)}
              onEdit={() => setShowEditCase(selectedCase)}
              onDelete={() => handleDeleteCase(selectedCase.id)}
            />
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3>All Cases ({cases.length})</h3>
                <button onClick={() => setShowCreateCase(true)} style={btnPrimary}>+ New Case</button>
              </div>
              {showCreateCase && (
                <CreateCaseForm onCancel={() => setShowCreateCase(false)} onSave={async (data) => {
                  setSaving(true); await api.createLegalCase(data); setSaving(false); setShowCreateCase(false); refresh();
                }} saving={saving} />
              )}
              {cases.length === 0 ? (
                <EmptyState message="No cases yet." />
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {cases.map((c) => (
                    <CaseCard key={c.id} case_={c} statusColor={statusColor(c.status)} priorityBadge={priorityBadge(c.priority)} onClick={() => setSelectedCase(c)}
                      onEdit={() => setShowEditCase(c)}
                      onDelete={() => handleDeleteCase(c.id)} />
                  ))}
                </div>
              )}
              {showEditCase && (
                <EditCaseForm case_={showEditCase} onCancel={() => setShowEditCase(null)} onSave={async (data) => {
                  setSaving(true); await api.updateLegalCase(showEditCase.id, data); setSaving(false); setShowEditCase(null); refresh();
                }} saving={saving} />
              )}
            </>
          )}
        </div>
      )}

      {/* Entities Tab */}
      {tab === 'entities' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3>All Entities ({entities.length})</h3>
            <button onClick={() => setShowCreateEntity(true)} style={btnPrimary}>+ New Entity</button>
          </div>
          {showCreateEntity && (
            <CreateEntityForm onCancel={() => setShowCreateEntity(false)} onSave={async (data) => {
              setSaving(true); await api.createLegalEntity(data); setSaving(false); setShowCreateEntity(false); refresh();
            }} saving={saving} />
          )}
          {entities.length === 0 ? (
            <EmptyState message="No entities yet." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {entities.map((e) => (
                <EntityRow key={e.id} entity={e}
                  onEdit={() => setShowEditEntity(e)}
                  onDelete={() => handleDeleteEntity(e.id)} />
              ))}
            </div>
          )}
          {showEditEntity && (
            <EditEntityForm entity={showEditEntity} onCancel={() => setShowEditEntity(null)} onSave={async (data) => {
              setSaving(true); await api.updateLegalEntity(showEditEntity.id, data); setSaving(false); setShowEditEntity(null); refresh();
            }} saving={saving} />
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <span style={{ fontSize: 28 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      padding: 40,
      textAlign: 'center',
      color: 'var(--text-secondary)',
      border: '1px dashed var(--border)',
      borderRadius: 12,
    }}>
      {message}
    </div>
  );
}

function CaseCard({ case_, statusColor, priorityBadge, onClick, onEdit, onDelete }: { case_: LegalCase; statusColor: string; priorityBadge: React.ReactNode; onClick: () => void; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{case_.displayTitle}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{case_.caseNumber} · {case_.legalArea}{case_.subArea ? ` — ${case_.subArea}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {priorityBadge}
          <span style={{ background: statusColor, color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{case_.status}</span>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
        {case_.claims.slice(0, 2).join('; ') || 'No claims filed'}
        {case_.claims.length > 2 ? ` (+${case_.claims.length - 2} more)` : ''}
      </div>
      {(onEdit || onDelete) && (
        <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          {onEdit && <button onClick={onEdit} style={btnSmall}>Edit</button>}
          {onDelete && <button onClick={onDelete} style={btnDanger}>Delete</button>}
        </div>
      )}
    </div>
  );
}

function CaseDetail({ case_, onBack, statusColor, priorityBadge, onEdit, onDelete }: { case_: LegalCase; onBack: () => void; statusColor: string; priorityBadge: React.ReactNode; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>← Back to cases</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {onEdit && <button onClick={onEdit} style={btnSecondary}>Edit</button>}
          {onDelete && <button onClick={onDelete} style={btnDanger}>Delete</button>}
        </div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: '0 0 4px' }}>{case_.displayTitle}</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{case_.caseNumber}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {priorityBadge}
            <span style={{ background: statusColor, color: '#fff', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>{case_.status}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
          <DetailRow label="Legal Area" value={`${case_.legalArea}${case_.subArea ? ` — ${case_.subArea}` : ''}`} />
          <DetailRow label="Opponent" value={case_.opponentId || '-'} />
          <DetailRow label="Priority" value={case_.priority} />
          <DetailRow label="Created" value={new Date(case_.createdAt).toLocaleDateString()} />
        </div>
        {case_.claims.length > 0 && (
          <Section title="Claims">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {case_.claims.map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c}</li>)}
            </ul>
          </Section>
        )}
        {case_.facts && (
          <Section title="Facts (anonymized)">
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, background: 'var(--bg)', padding: 12, borderRadius: 8 }}>{case_.facts}</div>
          </Section>
        )}
      </div>
    </div>
  );
}

function EntityRow({ entity, onEdit, onDelete }: { entity: LegalEntity; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{entity.displayName}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {entity.type} · {entity.legalAreas.slice(0, 2).join(', ') || '-'}
          {entity.jurisdiction ? ` · ${entity.jurisdiction}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{entity.caseCount} cases</span>
        {onEdit && <button onClick={onEdit} style={btnSmall}>Edit</button>}
        {onDelete && <button onClick={onDelete} style={btnDanger}>Delete</button>}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>{title}</h4>
      {children}
    </div>
  );
}

/* ── Forms ─────────────────────────────────────────────── */

function FormField({ label, value, onChange, required, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; placeholder?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14 }}
      />
    </label>
  );
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      <select
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14 }}
      >
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function FormTextArea({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      <textarea
        value={value}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        rows={rows}
        style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }}
      />
    </label>
  );
}

function FormActions({ onCancel, saving, submitLabel }: { onCancel: () => void; saving: boolean; submitLabel: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
      <button type="button" onClick={onCancel} style={btnSecondary}>Cancel</button>
      <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : submitLabel}</button>
    </div>
  );
}

/* ── Case Forms ───────────────────────────────────────── */

function CreateCaseForm({ onCancel, onSave, saving }: { onCancel: () => void; onSave: (data: unknown) => void; saving: boolean }) {
  const [title, setTitle] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [legalArea, setLegalArea] = useState('');
  const [subArea, setSubArea] = useState('');
  const [status, setStatus] = useState('open');
  const [priority, setPriority] = useState('medium');
  const [opponentId, setOpponentId] = useState('');
  const [claims, setClaims] = useState('');
  const [facts, setFacts] = useState('');

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    onSave({ title, caseNumber, legalArea, subArea, status, priority, opponentId, claims: claims.split(',').map((s: string) => s.trim()).filter(Boolean), facts });
  };

  return (
    <form onSubmit={submit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 16, display: 'grid', gap: 12 }}>
      <FormField label="Title" value={title} onChange={setTitle} required />
      <FormField label="Case Number" value={caseNumber} onChange={setCaseNumber} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Legal Area" value={legalArea} onChange={setLegalArea} required />
        <FormField label="Sub Area" value={subArea} onChange={setSubArea} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormSelect label="Status" value={status} onChange={setStatus} options={['open', 'pending', 'won', 'lost', 'settled', 'appealed']} />
        <FormSelect label="Priority" value={priority} onChange={setPriority} options={['low', 'medium', 'high', 'critical']} />
      </div>
      <FormField label="Opponent ID" value={opponentId} onChange={setOpponentId} />
      <FormField label="Claims (comma separated)" value={claims} onChange={setClaims} />
      <FormTextArea label="Facts" value={facts} onChange={setFacts} />
      <FormActions onCancel={onCancel} saving={saving} submitLabel="Create Case" />
    </form>
  );
}

function EditCaseForm({ case_, onCancel, onSave, saving }: { case_: LegalCase; onCancel: () => void; onSave: (data: unknown) => void; saving: boolean }) {
  const [title, setTitle] = useState(case_.displayTitle);
  const [caseNumber, setCaseNumber] = useState(case_.caseNumber);
  const [legalArea, setLegalArea] = useState(case_.legalArea);
  const [subArea, setSubArea] = useState(case_.subArea);
  const [status, setStatus] = useState(case_.status);
  const [priority, setPriority] = useState(case_.priority);
  const [opponentId, setOpponentId] = useState(case_.opponentId);
  const [claims, setClaims] = useState(case_.claims.join(', '));
  const [facts, setFacts] = useState(case_.facts);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    onSave({ title, caseNumber, legalArea, subArea, status, priority, opponentId, claims: claims.split(',').map((s: string) => s.trim()).filter(Boolean), facts });
  };

  return (
    <form onSubmit={submit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 16, display: 'grid', gap: 12 }}>
      <FormField label="Title" value={title} onChange={setTitle} required />
      <FormField label="Case Number" value={caseNumber} onChange={setCaseNumber} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Legal Area" value={legalArea} onChange={setLegalArea} required />
        <FormField label="Sub Area" value={subArea} onChange={setSubArea} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormSelect label="Status" value={status} onChange={setStatus} options={['open', 'pending', 'won', 'lost', 'settled', 'appealed']} />
        <FormSelect label="Priority" value={priority} onChange={setPriority} options={['low', 'medium', 'high', 'critical']} />
      </div>
      <FormField label="Opponent ID" value={opponentId} onChange={setOpponentId} />
      <FormField label="Claims (comma separated)" value={claims} onChange={setClaims} />
      <FormTextArea label="Facts" value={facts} onChange={setFacts} />
      <FormActions onCancel={onCancel} saving={saving} submitLabel="Update Case" />
    </form>
  );
}

/* ── Entity Forms ─────────────────────────────────────── */

function CreateEntityForm({ onCancel, onSave, saving }: { onCancel: () => void; onSave: (data: unknown) => void; saving: boolean }) {
  const [title, setTitle] = useState('');
  const [legalType, setLegalType] = useState('lawyer');
  const [legalAreas, setLegalAreas] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [specializations, setSpecializations] = useState('');
  const [tags, setTags] = useState('');

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    onSave({ title, legalType, legalAreas: legalAreas.split(',').map((s: string) => s.trim()).filter(Boolean), jurisdiction, specializations: specializations.split(',').map((s: string) => s.trim()).filter(Boolean), tags: tags.split(',').map((s: string) => s.trim()).filter(Boolean) });
  };

  return (
    <form onSubmit={submit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 16, display: 'grid', gap: 12 }}>
      <FormField label="Name / Title" value={title} onChange={setTitle} required />
      <FormSelect label="Type" value={legalType} onChange={setLegalType} options={['lawyer', 'firm', 'court', 'opponent', 'expert', 'other']} />
      <FormField label="Legal Areas (comma separated)" value={legalAreas} onChange={setLegalAreas} />
      <FormField label="Jurisdiction" value={jurisdiction} onChange={setJurisdiction} />
      <FormField label="Specializations (comma separated)" value={specializations} onChange={setSpecializations} />
      <FormField label="Tags (comma separated)" value={tags} onChange={setTags} />
      <FormActions onCancel={onCancel} saving={saving} submitLabel="Create Entity" />
    </form>
  );
}

function EditEntityForm({ entity, onCancel, onSave, saving }: { entity: LegalEntity; onCancel: () => void; onSave: (data: unknown) => void; saving: boolean }) {
  const [title, setTitle] = useState(entity.displayName);
  const [legalType, setLegalType] = useState(entity.type);
  const [legalAreas, setLegalAreas] = useState(entity.legalAreas.join(', '));
  const [jurisdiction, setJurisdiction] = useState(entity.jurisdiction);
  const [specializations, setSpecializations] = useState(entity.specializations.join(', '));
  const [tags, setTags] = useState(entity.tags.join(', '));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    onSave({ title, legalType, legalAreas: legalAreas.split(',').map((s: string) => s.trim()).filter(Boolean), jurisdiction, specializations: specializations.split(',').map((s: string) => s.trim()).filter(Boolean), tags: tags.split(',').map((s: string) => s.trim()).filter(Boolean) });
  };

  return (
    <form onSubmit={submit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 16, display: 'grid', gap: 12 }}>
      <FormField label="Name / Title" value={title} onChange={setTitle} required />
      <FormSelect label="Type" value={legalType} onChange={setLegalType} options={['lawyer', 'firm', 'court', 'opponent', 'expert', 'other']} />
      <FormField label="Legal Areas (comma separated)" value={legalAreas} onChange={setLegalAreas} />
      <FormField label="Jurisdiction" value={jurisdiction} onChange={setJurisdiction} />
      <FormField label="Specializations (comma separated)" value={specializations} onChange={setSpecializations} />
      <FormField label="Tags (comma separated)" value={tags} onChange={setTags} />
      <FormActions onCancel={onCancel} saving={saving} submitLabel="Update Entity" />
    </form>
  );
}
