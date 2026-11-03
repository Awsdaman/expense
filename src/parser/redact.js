const redactInvisibleRe = /[؜‎‏‪-‮⁦-⁩﻿]/g;
const redactDropPatterns = [
  /\bbalance\b/i,
  /رصيد/,
  /^\s*(A\/C|Acc(?:oun)?t)\b/i,
  /^\s*(ال)?حساب/,
];
const redactIbanRe = /\bSA\d{2}[A-Z0-9 ]{18,30}/gi;
const redactCardRe = /\b\d(?:[ -]?\d){11,18}\b/g;

export function redactSms(text) {
  return text
    .replace(redactInvisibleRe, '')
    .replace(/\r\n|\r/g, '\n')
    .split('\n')
    .filter((line) => !redactDropPatterns.some((re) => re.test(line)))
    .map((line) =>
      line
        .replace(redactIbanRe, '[IBAN]')
        .replace(redactCardRe, (digits) => '**' + digits.replace(/\D/g, '').slice(-4)),
    )
    .join('\n');
}
