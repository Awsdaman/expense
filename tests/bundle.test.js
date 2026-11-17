// Runs the generated Apps Script bundle the way Apps Script does: one global scope, no imports.
// The other tests import src/ directly, so a module left out of the bundle only shows up here.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect, beforeAll } from 'vitest';
import { createMemoryStore } from '../src/dev/memory-store.js';
import { DEFAULT_SETTINGS, STARTER_CATEGORIES } from '../src/core/settings.js';

let lib;

beforeAll(() => {
  execFileSync(process.execPath, ['scripts/build-appsscript.js']);
  lib = vm.createContext({});
  vm.runInContext(readFileSync('apps-script/lib/Lib.js', 'utf8'), lib);
});

function call(params) {
  const store = createMemoryStore({
    Categories: STARTER_CATEGORIES.map((c) => ({ ...c })),
    Settings: Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value: String(value) })),
    Transactions: [{
      id: 't_1', txn_at: '2026-11-17T10:00:00+03:00', received_at: '2026-11-17T10:00:00+03:00', type: 'purchase',
      direction: 'out', amount: 20, currency: 'SAR', amount_sar: 20, merchant: 'A', category: 'Coffee', status: 'categorized', cycle: '2026-10',
    }],
  });
  const env = { token: 't', nowIso: () => '2026-11-17T12:00:00+03:00', random: () => 0.5 };
  return lib.handleRequest({ token: 't', ...params }, store, env);
}

describe('Apps Script bundle', () => {
  it('serves every read action without a missing function', () => {
    for (const action of ['config', 'summary', 'transactions', 'pending_count']) {
      expect(call({ action }).ok, action).toBe(true);
    }
  });

  it('builds the tracking summary', () => {
    const s = call({ action: 'summary' });
    expect(s.mode).toBe('tracking');
    expect(s.tracking.totals.net_spent).toBe(20);
  });

  it('has the functions the Apps Script triggers call', () => {
    for (const name of ['computeTracking', 'isTracking', 'resolveTrackingStart', 'trackingDoneEmail', 'weeklyNudge', 'monthlyReport', 'computeSummary', 'readSettings', 'safeEqual']) {
      expect(vm.runInContext(`typeof ${name}`, lib), name).toBe('function');
    }
  });
});
