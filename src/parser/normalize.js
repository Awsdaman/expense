export function normalizeText(text) {
  const cleaned = text
    .replace(/[؜‎‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/ـ/g, '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
    .replace(/٫/g, '.')
    .replace(/[٬،]/g, ',');
  return cleaned
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

export function toLines(text) {
  const normalized = normalizeText(text);
  return normalized === '' ? [] : normalized.split('\n');
}
