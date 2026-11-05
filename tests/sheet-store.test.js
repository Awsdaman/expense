// SheetStore is a classic Apps Script file, so it runs here against a fake Sheet.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

const pad = (n) => String(n).padStart(2, '0');

function fakeSpreadsheet(rows, timeZone) {
  const sheet = {
    getLastColumn: () => rows[0].length,
    getLastRow: () => rows.length,
    getRange: (row, col, height) => ({
      getValues: () => rows.slice(row - 1, row - 1 + height).map((r) => [...r]),
      setValues: () => {},
    }),
  };
  return { getSheetByName: () => sheet, getSpreadsheetTimeZone: () => timeZone };
}

// Only the two patterns the store uses. The zone offset is fixed by the test.
function fakeUtilities(offsets) {
  return {
    formatDate(date, zone, pattern) {
      const d = new Date(date.getTime() + offsets[zone] * 3600000);
      const month = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
      if (pattern === 'yyyy-MM') return month;
      return `${month}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+03:00`;
    },
  };
}

beforeAll(() => {
  vm.runInThisContext(readFileSync('apps-script/sheet/SheetStore.js', 'utf8'));
});

describe('createSheetStore rows', () => {
  it('reads a cycle that Sheets turned into a date back as its label', () => {
    globalThis.Utilities = fakeUtilities({ 'Asia/Riyadh': 3 });
    // 1 Oct 2026 at midnight in the Sheet's zone.
    const cell = new Date(Date.UTC(2026, 8, 30, 21));
    const ss = fakeSpreadsheet([['id', 'cycle'], ['t_1', cell]], 'Asia/Riyadh');
    expect(createSheetStore(ss).rows('Transactions')).toEqual([{ id: 't_1', cycle: '2026-10' }]);
  });

  it('uses the Sheet time zone, so a zone east of Riyadh stays in the same month', () => {
    globalThis.Utilities = fakeUtilities({ 'Asia/Riyadh': 3, 'Asia/Tokyo': 9 });
    // 1 Oct 2026 at midnight in Tokyo is still 30 Sep in Riyadh.
    const cell = new Date(Date.UTC(2026, 8, 30, 15));
    const ss = fakeSpreadsheet([['id', 'cycle'], ['t_1', cell]], 'Asia/Tokyo');
    expect(createSheetStore(ss).rows('Transactions')[0].cycle).toBe('2026-10');
  });

  it('leaves a cycle stored as text alone and keeps other dates as ISO', () => {
    globalThis.Utilities = fakeUtilities({ 'Asia/Riyadh': 3 });
    const when = new Date(Date.UTC(2026, 10, 5, 14, 30));
    const ss = fakeSpreadsheet([['cycle', 'txn_at'], ['2026-10', when]], 'Asia/Riyadh');
    expect(createSheetStore(ss).rows('Transactions')[0]).toEqual({ cycle: '2026-10', txn_at: '2026-11-05T17:30:00+03:00' });
  });
});
