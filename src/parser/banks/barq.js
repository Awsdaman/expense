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

const barqTransferAmountRe = /^Amount:\s*(.+)$/;

// Outgoing transfer: "Debit Transfer Internal", "Amount: 1500 SAR", "To: NAME**", "To A/C:**3392", date.
export const barqTransferParser = {
  id: 'barq-transfer',
  senders: ['BARQ'],
  match(lines) {
    return /^Debit Transfer\b/i.test(lines[0]) && lines.some((l) => barqTransferAmountRe.test(l)) && lines.some((l) => l.startsWith('To:'));
  },
  parse(lines) {
    const amountMatch = lines.map((l) => barqTransferAmountRe.exec(l)).find(Boolean);
    const money = amountMatch ? parseMoney(amountMatch[1]) : null;
    const toLine = lines.find((l) => l.startsWith('To:'));
    const merchantRaw = toLine ? toLine.slice(3).trim() : '';
    if (!money || !merchantRaw) return null;
    const dateLine = lines.map(parseIsoLikeDate).find(Boolean);
    return {
      type: 'transfer_out',
      direction: 'out',
      amount: money.amount,
      currency: money.currency,
      amount_sar: money.currency === 'SAR' ? money.amount : null,
      merchant_raw: merchantRaw,
      merchant: normalizeMerchant(merchantRaw.replace(/\*+$/, '')),
      card_last4: null,
      payment_method: 'Transfer',
      txn_at: dateLine || null,
      bank: 'barq',
    };
  },
};
