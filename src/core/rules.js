import { isTruthy } from './settings.js';

export function merchantRules(rules, merchant) {
  return (rules || []).filter((r) => r.merchant === merchant);
}

export function suggestCategory(rules, merchant) {
  const candidates = merchantRules(rules, merchant).filter((r) => r.category && Number(r.hits) > 0);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const byHits = Number(b.hits) - Number(a.hits);
    if (byHits !== 0) return byHits;
    const ua = String(a.updated_at || '');
    const ub = String(b.updated_at || '');
    return ua < ub ? 1 : ua > ub ? -1 : 0;
  });
  return candidates[0].category;
}

export function autoCategory(rules, merchant) {
  const row = merchantRules(rules, merchant).find((r) => isTruthy(r.auto) && r.category);
  return row ? row.category : null;
}

export function displayNameFor(rules, merchant) {
  const row = merchantRules(rules, merchant).find((r) => r.display_name);
  return row ? row.display_name : null;
}

export function learnRule(rules, merchant, category, nowIso, threshold) {
  const rows = merchantRules(rules, merchant);
  const display = displayNameFor(rules, merchant);
  const chosen = rows.find((r) => r.category === category);
  const hits = (chosen ? Number(chosen.hits) || 0 : 0) + 1;
  const out = [];
  let placed = false;
  for (const row of rows) {
    if (!row.category) {
      out.push(row);
    } else if (row.category === category) {
      out.push({ ...row, display_name: display, hits, auto: hits >= threshold, updated_at: nowIso });
      placed = true;
    } else {
      out.push({ ...row, display_name: display, hits: 0, auto: false });
    }
  }
  if (!placed) {
    out.push({ merchant, display_name: display, category, hits, auto: hits >= threshold, updated_at: nowIso });
  }
  return out;
}
