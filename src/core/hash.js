const HASH_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function hashCyrb53(str, seed) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function hashLow32Hex(n) {
  return (n % 4294967296).toString(16).padStart(8, '0');
}

export function hashText(text) {
  const s = String(text);
  return hashLow32Hex(hashCyrb53(s, 0)) + hashLow32Hex(hashCyrb53(s, 1));
}

export function makeId(prefix, random) {
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += HASH_ID_ALPHABET[Math.floor(random() * HASH_ID_ALPHABET.length)];
  }
  return prefix + '_' + id;
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}
