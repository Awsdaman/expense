import { parseAmount, parseMoney } from '../amount.js';
import { parseIsoLikeDate } from '../dates.js';
import { normalizeMerchant } from '../merchant.js';

const barqAmountRe = /^Amount (.+?)(?: \((.+) SAR\))?$/;

export const barqParser = {
  id: 'barq',
  senders: ['BARQ'],
  match(lines) {
    return (
      lines[0] === 'Online Purchase' &&
      lines.some((l) => l.startsWith('Amount ')) &&
      lines.some((l) => l.startsWith('At '))
    );
  },
  parse(lines) {
    const amountMatch = lines.map((l) => barqAmountRe.exec(l)).find(Boolean);
    const money = amountMatch ? parseMoney(amountMatch[1]) : null;
    const atLine = lines.find((l) => l.startsWith('At '));
    if (!money || !atLine) return null;

    const cardLine = lines.find((l) => l.startsWith('VISA card'));
    const card = cardLine ? /\*+(\d{4})/.exec(cardLine) : null;
    const dateLine = lines.map(parseIsoLikeDate).find(Boolean);
    const merchantRaw = atLine.slice(3).trim();

    let amountSar = null;
    if (amountMatch[2]) amountSar = parseAmount(amountMatch[2]);
    else if (money.currency === 'SAR') amountSar = money.amount;

    return {
      type: 'online',
      direction: 'out',
      amount: money.amount,
      currency: money.currency,
      amount_sar: amountSar,
      merchant_raw: merchantRaw,
      merchant: normalizeMerchant(merchantRaw),
      card_last4: card ? card[1] : null,
      payment_method: cardLine ? 'Visa online' : null,
      txn_at: dateLine || null,
      bank: 'barq',
    };
  },
};
