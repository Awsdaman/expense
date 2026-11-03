const amountNumberRe = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const amountMoneyRe = /(?:([A-Z]{3}|SR|ريال|ر\.س)\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:\s*([A-Z]{3}|SR|ريال|ر\.س))?/;

function amountCurrency(code) {
  return code === 'SR' || code === 'ريال' || code === 'ر.س' ? 'SAR' : code;
}

export function parseAmount(str) {
  const s = str.trim();
  if (!amountNumberRe.test(s)) return null;
  return Number(s.replace(/,/g, ''));
}

export function parseMoney(str) {
  const m = amountMoneyRe.exec(str);
  if (!m) return null;
  const amount = parseAmount(m[2]);
  if (amount === null) return null;
  const code = m[1] || m[3];
  return { amount, currency: code ? amountCurrency(code) : 'SAR' };
}
