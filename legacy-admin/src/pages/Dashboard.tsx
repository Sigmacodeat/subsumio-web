import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';

interface FeedEvent {
  agent: string;
  operation: string;
  scopes: string;
  latency_ms: number;
  status: string;
  timestamp: string;
}

interface BrainStatus {
  pages: number;
  sources: number;
  chunks: number;
  embedded: number;
  embedding_coverage_pct: number;
  links_current: number;
  links_historical: number;
  source_breakdown: Array<{ source_id: string; local_path: string | null; page_count: number }>;
}

interface NLMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface ConnectorItem {
  service: string;
  enabled: boolean;
  running: boolean;
  hasCredentials: boolean;
}

export function DashboardPage() {
  const [stats, setStats] = useState({ connected_agents: 0, requests_today: 0, active_tokens: 0 });
  const [health, setHealth] = useState({ expiring_soon: 0, error_rate: '0%' });
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [brainStatus, setBrainStatus] = useState<BrainStatus | null>(null);
  const [nlMessages, setNlMessages] = useState<NLMessage[]>([
    { role: 'assistant', text: 'Ask me anything about your brain — e.g. "How many pages?", "Links from people/alice", or "Search for startup".' }
  ]);
  const [nlInput, setNlInput] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const nlScrollRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
    api.health().then(setHealth).catch(() => {});
    api.brainStatus().then(setBrainStatus).catch(() => {});
    api.connectors().then((r: { connectors: ConnectorItem[] }) => setConnectors(r.connectors)).catch(() => {});

    const es = new EventSource('/admin/events');
    eventSourceRef.current = es;
    es.onopen = () => setSseStatus('connected');
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as FeedEvent;
        setEvents(prev => [event, ...prev].slice(0, 50));
      } catch {}
    };
    es.onerror = () => {
      setSseStatus('disconnected');
      setTimeout(() => {
        setSseStatus('connecting');
        es.close();
        // Reconnect handled by browser EventSource auto-retry
      }, 3000);
    };

    const interval = setInterval(() => {
      api.stats().then(setStats).catch(() => {});
      api.health().then(setHealth).catch(() => {});
      api.brainStatus().then(setBrainStatus).catch(() => {});
      api.connectors().then((r: { connectors: ConnectorItem[] }) => setConnectors(r.connectors)).catch(() => {});
    }, 30000);

    return () => { es.close(); clearInterval(interval); };
  }, []);

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  const coverageBar = (pct: number) => (
    <div style={{ width: '100%', height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--error)', borderRadius: 3 }} />
    </div>
  );

  return (
    <>
      <h1 className="page-title">Dashboard</h1>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 600px' }}>
          <div className="metrics">
            <div className="metric">
              <div className="metric-value">{stats.connected_agents}</div>
              <div className="metric-label">Connected Agents</div>
            </div>
            <div className="metric">
              <div className="metric-value">{stats.requests_today}</div>
              <div className="metric-label">Requests Today</div>
            </div>
            <div className="metric">
              <div className="metric-value">{stats.active_tokens}</div>
              <div className="metric-label">Active Tokens</div>
            </div>
          </div>

          {/* v0.43.0: Brain Status Overview */}
          {brainStatus && (
            <>
              <h2 className="section-title">Brain Overview</h2>
              <div className="metrics">
                <div className="metric">
                  <div className="metric-value">{brainStatus.pages.toLocaleString()}</div>
                  <div className="metric-label">Pages</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{brainStatus.sources.toLocaleString()}</div>
                  <div className="metric-label">Sources</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{brainStatus.chunks.toLocaleString()}</div>
                  <div className="metric-label">Chunks</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{brainStatus.links_current.toLocaleString()}</div>
                  <div className="metric-label">Current Links</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{brainStatus.links_historical.toLocaleString()}</div>
                  <div className="metric-label">Historical Links</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                <div className="panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span className="panel-label">Embedding Coverage</span>
                    <span className="mono" style={{ fontSize: 14 }}>{brainStatus.embedding_coverage_pct}%</span>
                  </div>
                  {coverageBar(brainStatus.embedding_coverage_pct)}
                  <div className="mono" style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {brainStatus.embedded.toLocaleString()} / {brainStatus.chunks.toLocaleString()} chunks
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-label">Bi-Temporal Links</div>
                  <div className="mono" style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {brainStatus.links_current} current + {brainStatus.links_historical} historical
                  </div>
                </div>
              </div>

              {brainStatus.source_breakdown.length > 0 && (
                <>
                  <h2 className="section-title" style={{ marginTop: 24 }}>Sources</h2>
                  <table style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>Source ID</th>
                        <th>Local Path</th>
                        <th style={{ textAlign: 'right' }}>Pages</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brainStatus.source_breakdown.map((s) => (
                        <tr key={s.source_id}>
                          <td className="mono">{s.source_id}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{s.local_path || '—'}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{s.page_count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}

          {/* v0.42: Connector Ingestion Status */}
          {connectors.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 24 }}>Connectors</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {connectors.map((c) => (
                  <div
                    key={c.service}
                    className="panel"
                    style={{
                      borderLeft: `3px solid ${c.running ? 'var(--success)' : c.enabled ? 'var(--warning)' : 'var(--text-secondary)'}`,
                      opacity: c.enabled ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{c.service}</span>
                      <span
                        className="badge"
                        style={{
                          background: c.running ? 'var(--success)' : c.enabled ? 'var(--warning)' : 'var(--bg-tertiary)',
                          color: c.running || c.enabled ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        {c.running ? 'running' : c.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </div>
                    <div className="mono" style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                      {c.hasCredentials ? '● credentials set' : '○ no credentials'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="section-title" style={{ marginTop: 24 }}>
            Live Activity
            <span style={{ marginLeft: 8, fontSize: 10, color: sseStatus === 'connected' ? 'var(--success)' : sseStatus === 'connecting' ? 'var(--warning)' : 'var(--error)' }}>
              {sseStatus === 'connected' ? '● connected' : sseStatus === 'connecting' ? '● connecting...' : '● disconnected'}
            </span>
          </h2>

          <div className="feed">
            {events.length === 0 ? (
              <div className="feed-empty">
                {sseStatus === 'connected' ? 'No requests yet. Agents will appear when they connect.' : 'Connecting...'}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Operation</th>
                    <th>Scopes</th>
                    <th>Latency</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i}>
                      <td className="mono">{e.agent}</td>
                      <td className="mono">{e.operation}</td>
                      <td>{e.scopes.split(',').map(s => (
                        <span key={s} className={`badge badge-${s.trim()}`} style={{ marginRight: 4 }}>{s.trim()}</span>
                      ))}</td>
                      <td className="mono">{e.latency_ms} ms</td>
                      <td><span className={`badge badge-${e.status}`}>{e.status}</span></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{timeAgo(e.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div style={{ width: 280 }}>
          <h2 className="section-title">Token Health</h2>
          <div className="health-panel">
            <div className="health-row">
              <span style={{ color: 'var(--warning)' }}>Expiring Soon</span>
              <span className="mono">{health.expiring_soon}</span>
            </div>
            <div className="health-row">
              <span style={{ color: 'var(--error)' }}>Error Rate</span>
              <span className="mono">{health.error_rate}</span>
            </div>
          </div>

          {/* v0.43.0: Natural Language Console */}
          <h2 className="section-title" style={{ marginTop: 24 }}>Ask Brain</h2>
          <div
            ref={nlScrollRef}
            style={{
              height: 240,
              overflowY: 'auto',
              background: 'var(--bg-secondary)',
              borderRadius: 6,
              padding: 10,
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {nlMessages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                  borderRadius: 10,
                  padding: '6px 10px',
                  maxWidth: '90%',
                  lineHeight: 1.4,
                }}
              >
                {m.text}
              </div>
            ))}
            {nlLoading && (
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: 12 }}>Thinking…</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              type="text"
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && nlInput.trim() && !nlLoading) {
                  const text = nlInput.trim();
                  setNlInput('');
                  setNlMessages((prev) => [...prev, { role: 'user', text }]);
                  setNlLoading(true);
                  try {
                    const res = await api.nlQuery(text) as { response: string };
                    setNlMessages((prev) => [...prev, { role: 'assistant', text: res.response }]);
                  } catch {
                    setNlMessages((prev) => [...prev, { role: 'assistant', text: 'Sorry, something went wrong.' }]);
                  } finally {
                    setNlLoading(false);
                    setTimeout(() => nlScrollRef.current?.scrollTo(0, nlScrollRef.current.scrollHeight), 50);
                  }
                }
              }}
              placeholder="Ask about your brain…"
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
