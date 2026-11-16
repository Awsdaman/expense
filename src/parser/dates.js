const datesSlashRe = /(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\s+(\d{1,2}):(\d{2})/;
const datesIsoRe = /(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/;

function datesValid(day, month, hour, minute) {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12 && hour <= 23 && minute <= 59;
}

function datesFormat(year, month, day, hour, minute) {
  const p = (n) => String(n).padStart(2, '0');
  return `${year}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:00+03:00`;
}

export function parseSlashDate(str) {
  const m = datesSlashRe.exec(str);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (!datesValid(day, month, hour, minute)) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  // Al Rajhi transfers can show yy/mm/dd. Day-first would land before 2020, so read it year-first.
  if (m[3].length === 2 && year < 2020 && Number(m[1]) >= 20) {
    return datesFormat(2000 + Number(m[1]), month, Number(m[3]), hour, minute);
  }
  return datesFormat(year, month, day, hour, minute);
}

export function parseIsoLikeDate(str) {
  const m = datesIsoRe.exec(str);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (!datesValid(day, month, hour, minute)) return null;
  return datesFormat(year, month, day, hour, minute);
}
