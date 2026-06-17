import React, { useState, useEffect } from 'react';
import { api } from '../api';

interface ConnectorDetail {
  service: string;
  enabled: boolean;
  running: boolean;
  hasCredentials: boolean;
  last_sync_at: number | null;
}

export function ConnectorsPage() {
  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionService, setActionService] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      const r = await api.connectors() as { connectors: ConnectorDetail[] };
      setConnectors(r.connectors);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (service: string) => {
    setActionService(service);
    try {
      await api.connectorToggle(service);
      await load();
    } catch {
      alert(`Failed to toggle ${service}`);
    } finally {
      setActionService(null);
    }
  };

  const handleSync = async (service: string) => {
    setSyncing((prev: Set<string>) => new Set(prev).add(service));
    try {
      await api.connectorSync(service);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Sync failed for ${service}: ${msg}`);
    } finally {
      setSyncing((prev: Set<string>) => {
        const next = new Set(prev);
        next.delete(service);
        return next;
      });
    }
  };

  const handleSyncAll = async () => {
    const enabled = connectors.filter((c) => c.enabled);
    for (const c of enabled) {
      await handleSync(c.service);
    }
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return 'never';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const statusColor = (c: ConnectorDetail) => {
    if (c.running) return 'var(--success)';
    if (c.enabled) return 'var(--warning)';
    return 'var(--text-secondary)';
  };

  const statusLabel = (c: ConnectorDetail) => {
    if (c.running) return 'running';
    if (c.enabled) return 'enabled';
    return 'disabled';
  };

  return (
    <div>
      <h1 className="page-title">Connectors</h1>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {connectors.filter((c) => c.enabled).length} enabled · {connectors.filter((c) => c.running).length} running
        </span>
        <button className="btn btn-primary" onClick={handleSyncAll} disabled={actionService !== null}>
          Sync All Enabled
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading connectors…</div>
      ) : connectors.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)' }}>
          No connectors configured yet. Use the CLI to add one:
          <code className="mono" style={{ display: 'block', marginTop: 8, padding: 8, background: 'var(--bg-secondary)', borderRadius: 4 }}>
            gbrain connector add google-drive --client-id XXX --client-secret YYY
          </code>
        </div>
      ) : (
        <table style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Credentials</th>
              <th>Last Sync</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {connectors.map((c) => (
              <tr key={c.service}>
                <td className="mono" style={{ fontWeight: 600 }}>{c.service}</td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background: statusColor(c),
                      color: c.enabled ? '#fff' : 'var(--text-primary)',
                    }}
                  >
                    {statusLabel(c)}
                  </span>
                </td>
                <td>
                  {c.hasCredentials ? (
                    <span style={{ color: 'var(--success)' }}>● set</span>
                  ) : (
                    <span style={{ color: 'var(--error)' }}>○ missing</span>
                  )}
                </td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {formatTime(c.last_sync_at)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn"
                    style={{ marginRight: 6, fontSize: 11 }}
                    onClick={() => handleToggle(c.service)}
                    disabled={actionService === c.service}
                  >
                    {c.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 11 }}
                    onClick={() => handleSync(c.service)}
                    disabled={!c.enabled || syncing.has(c.service)}
                  >
                    {syncing.has(c.service) ? 'Syncing…' : 'Sync'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
