export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100 + 0;
}

export function formatAmount(n) {
  const value = round2(Math.abs(Number(n)));
  const [whole, frac] = value.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = Number(n) < 0 && value !== 0 ? '-' : '';
  return sign + grouped + (frac === '00' ? '' : '.' + frac);
}

export function formatMoney(n, currency) {
  return formatAmount(n) + ' ' + currency;
}
