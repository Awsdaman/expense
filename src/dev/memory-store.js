import { TAB_HEADERS } from '../core/settings.js';

export function createMemoryStore(seed = {}) {
  function shapeRow(tab, obj) {
    const out = {};
    for (const h of TAB_HEADERS[tab]) out[h] = obj[h] === undefined ? '' : obj[h];
    return out;
  }

  const data = {};
  for (const tab of Object.keys(TAB_HEADERS)) {
    data[tab] = (seed[tab] || []).map((row) => shapeRow(tab, row));
  }

  return {
    rows(tab) {
      return data[tab].map((row) => ({ ...row }));
    },
    append(tab, obj) {
      data[tab].push(shapeRow(tab, obj));
    },
    update(tab, match, fields) {
      const keys = Object.keys(match);
      let count = 0;
      for (const row of data[tab]) {
        if (!keys.every((k) => String(row[k]) === String(match[k]))) continue;
        for (const h of TAB_HEADERS[tab]) {
          if (fields[h] !== undefined) row[h] = fields[h];
        }
        count++;
      }
      return count;
    },
  };
}
