import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { parseSms } from '../src/parser/index.js';
import { normalizeText, toLines } from '../src/parser/normalize.js';
import { parseAmount, parseMoney } from '../src/parser/amount.js';
import { parseSlashDate, parseIsoLikeDate } from '../src/parser/dates.js';
import { normalizeMerchant } from '../src/parser/merchant.js';
import { redactSms } from '../src/parser/redact.js';
import { ignoreReason } from '../src/parser/ignore.js';

const fixturesDir = new URL('./fixtures/sms/', import.meta.url);

describe('SMS fixtures', () => {
  const names = readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => f.slice(0, -4));

  it('finds fixtures', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const name of names) {
    it(name, () => {
      const text = readFileSync(new URL(`${name}.txt`, fixturesDir), 'utf8');
      const expected = JSON.parse(readFileSync(new URL(`${name}.json`, fixturesDir), 'utf8'));
      const senderFile = new URL(`${name}.sender`, fixturesDir);
      const sender = existsSync(senderFile) ? readFileSync(senderFile, 'utf8').trim() : undefined;
      expect(parseSms(text, { sender })).toEqual(expected);
    });
  }
});

describe('normalizeText', () => {
  it('strips invisible bidi and BOM characters', () => {
    const text = '؜‎‏‪‫‬‭‮⁦⁧⁨⁩﻿ab';
    expect(normalizeText(text)).toBe('ab');
  });

  it('removes tatweel', () => {
    expect(normalizeText('بـ14 SAR')).toBe('ب14 SAR');
  });

  it('converts Arabic-Indic and Persian digits', () => {
    expect(normalizeText('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeText('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('converts Arabic decimal, thousands and comma marks', () => {
    expect(normalizeText('١٤٫٥٠')).toBe('14.50');
    expect(normalizeText('1٬250')).toBe('1,250');
    expect(normalizeText('a،b')).toBe('a,b');
  });

  it('normalizes line endings, spaces and empty lines', () => {
    expect(normalizeText('  a   b \r\n\r\n c\t\td  \r\n')).toBe('a b\nc d');
    expect(normalizeText('x\ry')).toBe('x\ny');
  });
});

describe('toLines', () => {
  it('returns an empty array for empty text', () => {
    expect(toLines('')).toEqual([]);
    expect(toLines(' \n \n')).toEqual([]);
  });

  it('splits normalized text into lines', () => {
    expect(toLines('x\r\ny')).toEqual(['x', 'y']);
  });
});

describe('parseAmount', () => {
  it('parses plain and thousands-separated numbers', () => {
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(parseAmount('45')).toBe(45);
    expect(parseAmount('6.9')).toBe(6.9);
  });

  it('rejects non-numbers', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('45,')).toBeNull();
  });
});

describe('parseMoney', () => {
  it.each([
    ['SAR 81.60', 81.6, 'SAR'],
    ['14 SAR', 14, 'SAR'],
    ['SAR45', 45, 'SAR'],
    ['SR45', 45, 'SAR'],
    ['45 ريال', 45, 'SAR'],
    ['45 ر.س', 45, 'SAR'],
    ['USD 12.99', 12.99, 'USD'],
    ['12.99 USD', 12.99, 'USD'],
    ['45', 45, 'SAR'],
    ['1,250.50 SAR', 1250.5, 'SAR'],
    ['SAR 1,250.50', 1250.5, 'SAR'],
  ])('parses %s', (input, amount, currency) => {
    expect(parseMoney(input)).toEqual({ amount, currency });
  });

  it('returns null without a number', () => {
    expect(parseMoney('hello')).toBeNull();
    expect(parseMoney('ريال')).toBeNull();
  });
});

describe('parseSlashDate', () => {
  it('reads day-first dates with or without leading zeros', () => {
    expect(parseSlashDate('03/11/26 18:50')).toBe('2026-11-03T18:50:00+03:00');
    expect(parseSlashDate('3/11/26 18:31')).toBe('2026-11-03T18:31:00+03:00');
  });

  it('accepts four-digit years and finds the date inside a longer string', () => {
    expect(parseSlashDate('في 03/11/2026 18:50')).toBe('2026-11-03T18:50:00+03:00');
    expect(parseSlashDate('31/12/25 23:59')).toBe('2025-12-31T23:59:00+03:00');
  });

  it('reads a year-first yy/mm/dd date when day-first would land before 2020', () => {
    expect(parseSlashDate('26/11/15 18:54')).toBe('2026-11-15T18:54:00+03:00');
    expect(parseSlashDate('15/11/26 18:54')).toBe('2026-11-15T18:54:00+03:00');
  });

  it('returns null for invalid day, month or missing date', () => {
    expect(parseSlashDate('32/11/26 18:50')).toBeNull();
    expect(parseSlashDate('03/13/26 18:50')).toBeNull();
    expect(parseSlashDate('no date here')).toBeNull();
  });
});

describe('parseIsoLikeDate', () => {
  it('reads yyyy-mm-dd HH:MM as Riyadh time', () => {
    expect(parseIsoLikeDate('2026-10-03 20:32')).toBe('2026-10-03T20:32:00+03:00');
  });

  it('returns null for invalid or missing dates', () => {
    expect(parseIsoLikeDate('2026-13-03 20:32')).toBeNull();
    expect(parseIsoLikeDate('nothing')).toBeNull();
  });
});

describe('normalizeMerchant', () => {
  it('strips a leading store code and uppercases Latin text', () => {
    expect(normalizeMerchant('S175 Tami')).toBe('TAMI');
    expect(normalizeMerchant('khush sha')).toBe('KHUSH SHA');
    expect(normalizeMerchant('OPENAI')).toBe('OPENAI');
  });

  it('trims and collapses spaces', () => {
    expect(normalizeMerchant('  Tamimi   Markets ')).toBe('TAMIMI MARKETS');
  });

  it('keeps a value that is only a code', () => {
    expect(normalizeMerchant('S175')).toBe('S175');
  });
});

describe('redactSms', () => {
  it('drops balance and account lines, masks cards, replaces IBANs', () => {
    const input = [
      'Online Purchase',
      'VISA card **3333',
      'Amount 6.9 USD (25.91 SAR)',
      'Balance 11.97',
      'At OPENAI',
      'A/C **4444',
      'Card 4111 1111 1111 1111',
      'IBAN SA0380000000608010167519',
    ].join('\n');
    expect(redactSms(input)).toBe(
      [
        'Online Purchase',
        'VISA card **3333',
        'Amount 6.9 USD (25.91 SAR)',
        'At OPENAI',
        'Card **1111',
        'IBAN [IBAN]',
      ].join('\n'),
    );
  });

  it('drops Arabic balance and account lines', () => {
    expect(redactSms('رصيد 500 SAR\nحسابك 12345\nشراء')).toBe('شراء');
  });

  it('masks card numbers with spaces or dashes and 12 digits', () => {
    expect(redactSms('4111-1111-1111-1111')).toBe('**1111');
    expect(redactSms('411111111111')).toBe('**1111');
  });

  it('keeps already-masked numbers', () => {
    expect(redactSms('VISA card **3333 and مدى-ابل*1111')).toBe('VISA card **3333 and مدى-ابل*1111');
  });

  it('converts CRLF to LF and removes invisible characters', () => {
    expect(redactSms('a؜\r\nb')).toBe('a\nb');
  });
});

describe('ignoreReason', () => {
  it('detects OTP messages', () => {
    expect(ignoreReason('Your OTP is 123456')).toBe('otp');
    expect(ignoreReason('رمز التحقق هو 123456')).toBe('otp');
  });

  it('detects declined transactions', () => {
    expect(ignoreReason('Transaction declined')).toBe('declined');
    expect(ignoreReason('تم رفض عملية الشراء')).toBe('declined');
  });

  it('detects login notices', () => {
    expect(ignoreReason('Login from a new device')).toBe('login');
  });

  it('detects marketing messages', () => {
    expect(ignoreReason('Reply STOP to unsubscribe')).toBe('marketing');
  });

  it('does not ignore debit messages that use خصم', () => {
    expect(ignoreReason('تم خصم 45 SAR من حسابك')).toBeNull();
  });

  it('returns null for normal purchases', () => {
    expect(ignoreReason('شراء-POS\nبـ14 SAR\nمن khush sha')).toBeNull();
  });
});
