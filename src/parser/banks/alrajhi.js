import { parseMoney } from '../amount.js';
import { parseSlashDate } from '../dates.js';
import { normalizeMerchant } from '../merchant.js';

const alrajhiAmountRe = /^ب([A-Z]{3}\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)$/;
const alrajhiMerchantRe = /^ل([A-Za-z0-9].*)$/;
const alrajhiCardRe = /^عبر:\D*?(\d{4})/;

function alrajhiMethod(line) {
  return /ابل|apple/i.test(line) ? 'Mada Apple Pay' : 'Mada card';
}

export const alrajhiParser = {
  id: 'alrajhi',
  senders: ['ALRAJHI', 'RAJHI', 'ALRAJHIBANK'],
  match(lines) {
    return lines[0].startsWith('شراء') && /PoS/i.test(lines[0]) && lines.some((l) => l.startsWith('عبر:'));
  },
  parse(lines) {
    const amountMatch = lines.map((l) => alrajhiAmountRe.exec(l)).find(Boolean);
    const money = amountMatch ? parseMoney(amountMatch[1]) : null;
    const merchantMatch = lines.map((l) => alrajhiMerchantRe.exec(l)).find(Boolean);
    if (!money || !merchantMatch) return null;

    const cardLine = lines.find((l) => l.startsWith('عبر:'));
    const card = cardLine ? alrajhiCardRe.exec(cardLine) : null;
    const dateLine = lines.map(parseSlashDate).find(Boolean);
    const merchantRaw = merchantMatch[1].trim();

    return {
      type: 'purchase',
      direction: 'out',
      amount: money.amount,
      currency: money.currency,
      amount_sar: money.currency === 'SAR' ? money.amount : null,
      merchant_raw: merchantRaw,
      merchant: normalizeMerchant(merchantRaw),
      card_last4: card ? card[1] : null,
      payment_method: cardLine ? alrajhiMethod(cardLine) : null,
      txn_at: dateLine || null,
      bank: 'alrajhi',
    };
  },
};

const alrajhiTransferAmountRe = /ب\s*((?:[A-Z]{2,3}|ريال)?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:[A-Z]{2,3}|ريال))?)\s*$/;
const alrajhiTransferFromRe = /^من\s*\D*?(\d{4})\b/;
const alrajhiTransferToRe = /^ل\s*(\d*)\s*;?\s*(.*)$/;

// Outgoing local transfer: "حوالة محلية صادرة بSR 250", "من4682", "ل5000;name", "رسوم:SR 0.58", date.
// The fee is not counted.
export const alrajhiTransferParser = {
  id: 'alrajhi-transfer',
  senders: ['ALRAJHI', 'RAJHI', 'ALRAJHIBANK'],
  match(lines) {
    return lines[0].startsWith('حوالة') && lines[0].includes('صادرة') && lines.some((l) => alrajhiTransferToRe.test(l));
  },
  parse(lines) {
    const amountMatch = alrajhiTransferAmountRe.exec(lines[0]);
    const money = amountMatch ? parseMoney(amountMatch[1]) : null;
    const toMatch = lines.slice(1).map((l) => alrajhiTransferToRe.exec(l)).find(Boolean);
    if (!money || !toMatch) return null;
    const merchantRaw = toMatch[2].trim() || toMatch[1];
    if (!merchantRaw) return null;

    const fromMatch = lines.map((l) => alrajhiTransferFromRe.exec(l)).find(Boolean);
    const dateLine = lines.map(parseSlashDate).find(Boolean);
    return {
      type: 'transfer_out',
      direction: 'out',
      amount: money.amount,
      currency: money.currency,
      amount_sar: money.currency === 'SAR' ? money.amount : null,
      merchant_raw: merchantRaw,
      merchant: normalizeMerchant(merchantRaw),
      card_last4: fromMatch ? fromMatch[1] : null,
      payment_method: 'Local transfer',
      txn_at: dateLine || null,
      bank: 'alrajhi',
    };
  },
};
