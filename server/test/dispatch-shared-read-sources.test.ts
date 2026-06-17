/**
 * Shared statute corpus federation (web-api `GBRAIN_SHARED_READ_SOURCES`).
 *
 * The web-api threads a trusted (remote:false) tenant request with NO OAuth
 * `auth` object but a federated READ scope = [tenant, law-at]. `dispatchToolCall`
 * must surface that on `ctx.auth.allowedSources` so a firm's read can retrieve a
 * page from the shared `law-at` source — while a read WITHOUT the federation
 * stays isolated, and writes never widen to the shared source.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { resetPgliteState } from './helpers/reset-pglite.ts';
import { dispatchToolCall } from '../src/mcp/dispatch.ts';

let engine: PGLiteEngine;

function call(name: string, params: Record<string, unknown>, opts: Record<string, unknown>) {
  return dispatchToolCall(engine, name, params, { remote: false, ...opts } as any);
}
function parse(r: { content: { text?: string }[] }) {
  return JSON.parse(r.content[0]?.text ?? 'null');
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
}, 60_000);

afterAll(async () => {
  if (engine) await engine.disconnect();
}, 60_000);

beforeEach(async () => {
  await resetPgliteState(engine);
  await engine.executeRaw(`INSERT INTO sources (id, name) VALUES ('firm-a','firm-a') ON CONFLICT (id) DO NOTHING`);
  await engine.executeRaw(`INSERT INTO sources (id, name) VALUES ('law-at','law-at') ON CONFLICT (id) DO NOTHING`);
  await engine.putPage('legal/statutes/at/abgb/p-1295', {
    type: 'law', title: '§ 1295 ABGB', compiled_truth: 'Schadenersatz aus Verschulden.', frontmatter: {},
  }, { sourceId: 'law-at' });
  await engine.putPage('akten/mandant-x', {
    type: 'note', title: 'Mandant X', compiled_truth: 'firm-only content', frontmatter: {},
  }, { sourceId: 'firm-a' });
});

describe('dispatchToolCall allowedSources federates reads to the shared statute source', () => {
  test('tenant WITH the law-at federation can read a statute page', async () => {
    const page = parse(await call('get_page', { slug: 'legal/statutes/at/abgb/p-1295' }, {
      sourceId: 'firm-a',
      allowedSources: ['firm-a', 'law-at'],
    }));
    expect(page.title).toBe('§ 1295 ABGB');
  });

  test('tenant WITHOUT the federation cannot read the statute page (isolation holds)', async () => {
    const r = await call('get_page', { slug: 'legal/statutes/at/abgb/p-1295' }, { sourceId: 'firm-a' });
    // get_page throws → dispatch returns an error envelope, not the page.
    expect(r.isError).toBe(true);
  });

  test('the federation still serves the tenant its own page', async () => {
    const page = parse(await call('get_page', { slug: 'akten/mandant-x' }, {
      sourceId: 'firm-a',
      allowedSources: ['firm-a', 'law-at'],
    }));
    expect(page.title).toBe('Mandant X');
  });

  test('a WRITE stays scalar-scoped to the tenant — never lands in law-at', async () => {
    await call('put_page', { slug: 'akten/neu', content: '---\ntitle: Neu\ntype: note\n---\n\nInhalt' }, {
      sourceId: 'firm-a',
      allowedSources: ['firm-a', 'law-at'],
    });
    const rows = await engine.executeRaw<{ source_id: string }>(
      `SELECT source_id FROM pages WHERE slug = 'akten/neu'`, [],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].source_id).toBe('firm-a');
  });
});
