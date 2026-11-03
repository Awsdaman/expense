import { parseMoney } from '../amount.js';
import { parseSlashDate } from '../dates.js';
import { normalizeMerchant } from '../merchant.js';

const snbAmountRe = /^ب((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*[A-Z]{3})$/;

function snbMethod(line) {
  return /ابل|apple/i.test(line) ? 'Mada Apple Pay' : 'Mada card';
}

export const snbParser = {
  id: 'snb',
  senders: ['SNB', 'ALAHLI', 'SNB-ALAHLI'],
  match(lines) {
    return lines[0].startsWith('شراء') && /POS/i.test(lines[0]) && lines.some((l) => l.startsWith('من '));
  },
  parse(lines) {
    const amountMatch = lines.map((l) => snbAmountRe.exec(l)).find(Boolean);
    const money = amountMatch ? parseMoney(amountMatch[1]) : null;
    const merchantLine = lines.find((l) => l.startsWith('من '));
    if (!money || !merchantLine) return null;

    const cardLine = lines.find((l) => l.startsWith('مدى'));
    const card = cardLine ? /\*+(\d{4})/.exec(cardLine) : null;
    const dateLine = lines.map(parseSlashDate).find(Boolean);
    const merchantRaw = merchantLine.slice(3).trim();

    return {
      type: 'purchase',
      direction: 'out',
      amount: money.amount,
      currency: money.currency,
      amount_sar: money.currency === 'SAR' ? money.amount : null,
      merchant_raw: merchantRaw,
      merchant: normalizeMerchant(merchantRaw),
      card_last4: card ? card[1] : null,
      payment_method: cardLine ? snbMethod(cardLine) : null,
      txn_at: dateLine || null,
      bank: 'snb',
    };
  },
};
