const merchantStoreCodeRe = /^[A-Z]?\d{2,5}\s+/;

export function normalizeMerchant(raw) {
  const cleaned = raw.trim().replace(/\s+/g, ' ').toUpperCase();
  return cleaned.replace(merchantStoreCodeRe, '');
}
