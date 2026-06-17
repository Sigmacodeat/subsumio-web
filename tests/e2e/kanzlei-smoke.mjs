#!/usr/bin/env node
/**
 * Kanzlei-OS Smoke-Test
 * =====================
 * End-to-end API-Test für die kritischen Legal-Flows:
 *   1. Akte anlegen (legal_case)
 *   2. Kollisionsprüfung für Mandant
 *   3. Zeit eintragen
 *   4. Rechnung generieren
 *   5. Cleanup
 *
 * Aufruf:
 *   node tests/e2e/kanzlei-smoke.mjs
 *
 * Voraussetzung: Next.js Dev-Server läuft auf http://localhost:3000
 * (oder SIGMABRAIN_API_URL auf die Engine zeigt).
 */

const BASE = process.env.SIGMABRAIN_API_URL || 'http://localhost:3000';
const AUTH_HEADER = process.env.SIGMABRAIN_API_KEY
  ? { 'X-API-Key': process.env.SIGMABRAIN_API_KEY }
  : {};

let exitCode = 0;
let testCaseSlug = null;
let testInvoiceSlug = null;

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function fail(step, msg) {
  console.error(`❌ [${step}] ${msg}`);
  exitCode = 1;
}

async function jsonReq(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER, ...opts.headers },
    ...opts,
  });
  const text = await res.text().catch(() => '');
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// 1. AKTE ANLEGEN
// ---------------------------------------------------------------------------
async function testCreateCase() {
  const step = 'CASE';
  const slug = `test/smoke-${Date.now()}`;
  const body = {
    slug,
    title: 'Smoke-Test Akte — Musterfall GmbH vs. Schuldner AG',
    type: 'legal_case',
    content: 'Sachverhalt: Vertragsbruch durch Lieferverzug.',
    frontmatter: {
      case_number: `SMK-${Date.now()}`,
      status: 'open',
      legal_area: 'Zivilrecht',
      priority: 'high',
      client_name: 'Smoke-Mandant GmbH',
      opponent_name: 'Smoke-Gegner AG',
      court_name: 'LG München',
    },
  };

  const res = await jsonReq('/api/pages', { method: 'POST', body: JSON.stringify(body) });
  if (res.slug !== slug) {
    fail(step, `Unexpected slug: ${JSON.stringify(res)}`);
    return null;
  }
  log(step, `Created case ${slug}`);
  return slug;
}

// ---------------------------------------------------------------------------
// 2. KOLLISIONSPRÜFUNG
// ---------------------------------------------------------------------------
async function testConflictCheck() {
  const step = 'CONFLICT';
  try {
    const res = await jsonReq('/api/legal/conflict-check', {
      method: 'POST',
      body: JSON.stringify({ name: 'Smoke-Mandant GmbH' }),
    });
    if (!['none', 'low', 'critical'].includes(res.severity)) {
      fail(step, `Invalid severity: ${res.severity}`);
      return;
    }
    const match = res.matches.find((m) => m.matched_name === 'Smoke-Mandant GmbH');
    if (!match) {
      fail(step, 'Mandant not found in conflict check');
      return;
    }
    if (match.role !== 'client') {
      fail(step, `Expected role=client, got ${match.role}`);
      return;
    }
    log(step, `Severity=${res.severity}, matches=${res.matches.length}`);
  } catch (e) {
    fail(step, e.message);
  }
}

// ---------------------------------------------------------------------------
// 3. ZEITEINTRAG (via Partial Update)
// ---------------------------------------------------------------------------
async function testTimeEntry(slug) {
  const step = 'TIME';
  const body = {
    slug,
    merge: true,
    frontmatter: {
      time_entries: [
        {
          id: `te-${Date.now()}`,
          description: 'Schriftsatz vorbereitet',
          minutes: 90,
          date: new Date().toISOString().split('T')[0],
        },
      ],
    },
  };
  await jsonReq('/api/pages', { method: 'POST', body: JSON.stringify(body) });
  log(step, `Added time entry to ${slug}`);
}

// ---------------------------------------------------------------------------
// 4. RECHNUNG GENERIEREN
// ---------------------------------------------------------------------------
async function testCreateInvoice() {
  const step = 'INVOICE';
  const slug = `test/invoice-smoke-${Date.now()}`;
  const body = {
    slug,
    title: 'Rechnung Smoke-Test',
    type: 'invoice',
    content: '',
    frontmatter: {
      invoice_number: `R-${new Date().getFullYear()}-9999`,
      client: 'Smoke-Mandant GmbH',
      case_number: 'SMK-TEST',
      date: new Date().toISOString().split('T')[0],
      status: 'draft',
      items: [
        { description: 'Beratung', date: new Date().toISOString().split('T')[0], hours: 1.5, rate: 200, amount: 300 },
      ],
      subtotal: 300,
      tax: 57,
      total: 357,
    },
  };
  const res = await jsonReq('/api/pages', { method: 'POST', body: JSON.stringify(body) });
  if (!res.slug) {
    fail(step, `Invoice creation failed: ${JSON.stringify(res)}`);
    return null;
  }
  log(step, `Created invoice ${res.slug}`);
  return res.slug;
}

// ---------------------------------------------------------------------------
// 5. LISTEN-ABFRAGEN
// ---------------------------------------------------------------------------
async function testListQueries() {
  const step = 'LIST';
  try {
    const cases = await jsonReq('/api/pages?type=legal_case&limit=50');
    if (!Array.isArray(cases)) {
      fail(step, 'Expected array from /api/pages');
      return;
    }
    log(step, `Found ${cases.length} legal_case pages`);
    // Regression pin: the case created in step 1 was merge-updated in step 3
    // (time entry). A merge update must NOT reset the page type — if the case
    // is missing here, the type filter lost it (the legal_case→concept bug).
    if (testCaseSlug && !cases.some((c) => c.slug === testCaseSlug)) {
      fail(step, `Created case ${testCaseSlug} missing from type=legal_case list — merge update lost the page type`);
      return;
    }

    const invoices = await jsonReq('/api/pages?type=invoice&limit=50');
    log(step, `Found ${invoices.length} invoice pages`);
    if (testInvoiceSlug && Array.isArray(invoices) && !invoices.some((i) => i.slug === testInvoiceSlug)) {
      fail(step, `Created invoice ${testInvoiceSlug} missing from type=invoice list`);
      return;
    }
  } catch (e) {
    fail(step, e.message);
  }
}

// ---------------------------------------------------------------------------
// 6. CLEANUP
// ---------------------------------------------------------------------------
async function cleanup(slugs) {
  const step = 'CLEANUP';
  for (const slug of slugs) {
    if (!slug) continue;
    try {
      // Soft-delete via empty update or use a delete endpoint if available
      // For now we just note the slug for manual cleanup
      log(step, `Test artifact: ${slug} (manual cleanup recommended)`);
    } catch (e) {
      log(step, `Failed to cleanup ${slug}: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n🧪 Kanzlei-OS Smoke Test — ${BASE}\n`);

  try {
    testCaseSlug = await testCreateCase();
    if (testCaseSlug) {
      await testConflictCheck();
      await testTimeEntry(testCaseSlug);
    }
    testInvoiceSlug = await testCreateInvoice();
    await testListQueries();
  } finally {
    await cleanup([testCaseSlug, testInvoiceSlug]);
  }

  console.log(exitCode === 0 ? '\n✅ All checks passed.\n' : '\n⚠️  Some checks failed.\n');
  process.exit(exitCode);
}

main();
