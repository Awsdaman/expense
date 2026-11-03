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
