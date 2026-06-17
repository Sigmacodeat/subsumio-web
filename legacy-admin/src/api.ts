const BASE = import.meta.env.VITE_API_BASE || '';

// v0.26.3 trust model (D11 + D12): the admin UI does NOT cache the
// bootstrap token in browser JS state. On 401, redirect to login —
// no auto-reauth via saved token, no localStorage/sessionStorage read.
// The HttpOnly cookie set by /admin/login is the only session credential.
async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (res.status === 401) {
    // No token cache to retry from. Redirect to login.
    window.location.hash = '#login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// v0.36.1.0 (T15 / E6) — SVG fetch (text/plain payload, NOT JSON).
async function apiFetchText(path: string) {
  const res = await fetch(`${BASE}${path}`, { credentials: 'same-origin' });
  if (res.status === 401) {
    window.location.hash = '#login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export const api = {
  login: (token: string) => apiFetch('/admin/login', { method: 'POST', body: JSON.stringify({ token }) }),
  signOutEverywhere: () => apiFetch('/admin/api/sign-out-everywhere', { method: 'POST' }),
  stats: () => apiFetch('/admin/api/stats'),
  health: () => apiFetch('/admin/api/health-indicators'),
  agents: () => apiFetch('/admin/api/agents'),
  requests: (page = 1, qs = '') => apiFetch(`/admin/api/requests?page=${page}${qs}`),
  apiKeys: () => apiFetch('/admin/api/api-keys'),
  createApiKey: (name: string) => apiFetch('/admin/api/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),
  revokeApiKey: (name: string) => apiFetch('/admin/api/api-keys/revoke', { method: 'POST', body: JSON.stringify({ name }) }),
  updateClientTtl: (clientId: string, tokenTtl: number | null) => apiFetch('/admin/api/update-client-ttl', { method: 'POST', body: JSON.stringify({ clientId, tokenTtl }) }),
  revokeClient: (clientId: string) => apiFetch('/admin/api/revoke-client', { method: 'POST', body: JSON.stringify({ clientId }) }),
  // v0.36.1.0 (T15 / E6) — calibration endpoints.
  calibrationProfile: (holder?: string) =>
    apiFetch(`/admin/api/calibration/profile${holder ? `?holder=${encodeURIComponent(holder)}` : ''}`),
  calibrationChart: (type: string, holder?: string) =>
    apiFetchText(`/admin/api/calibration/charts/${encodeURIComponent(type)}${holder ? `?holder=${encodeURIComponent(holder)}` : ''}`),
  // v0.41 D2 — live minion-jobs dashboard snapshot.
  jobsWatch: () => apiFetch('/admin/api/jobs/watch'),
  // v0.43.0: brain status dashboard (PMBrain parity).
  brainStatus: () => apiFetch('/admin/api/brain-status'),
  // v0.43.0: natural language console.
  nlQuery: (query: string) => apiFetch('/admin/api/nl-query', { method: 'POST', body: JSON.stringify({ query }) }),
  // v0.44.0: Legal Brain endpoints.
  legalEntities: () => apiFetch('/admin/api/legal/entities'),
  legalCases: () => apiFetch('/admin/api/legal/cases'),
  legalStats: () => apiFetch('/admin/api/legal/stats'),
  createLegalEntity: (body: unknown) => apiFetch('/admin/api/legal/entity', { method: 'POST', body: JSON.stringify(body) }),
  createLegalCase: (body: unknown) => apiFetch('/admin/api/legal/case', { method: 'POST', body: JSON.stringify(body) }),
  updateLegalEntity: (slug: string, body: unknown) => apiFetch(`/admin/api/legal/entity/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(body) }),
  updateLegalCase: (slug: string, body: unknown) => apiFetch(`/admin/api/legal/case/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteLegalEntity: (slug: string) => apiFetch(`/admin/api/legal/entity/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  deleteLegalCase: (slug: string) => apiFetch(`/admin/api/legal/case/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  // v0.42: connector ingestion status.
  connectors: () => apiFetch('/admin/api/connectors'),
  connectorSync: (service: string) => apiFetch(`/admin/api/connectors/${encodeURIComponent(service)}/sync`, { method: 'POST' }),
  connectorToggle: (service: string) => apiFetch(`/admin/api/connectors/${encodeURIComponent(service)}/toggle`, { method: 'POST' }),
  connectorHealth: (service: string) => apiFetch(`/admin/api/connectors/${encodeURIComponent(service)}/health`),
};
