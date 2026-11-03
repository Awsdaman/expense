const CYCLE_DAY_MS = 86400000;
const CYCLE_OFFSET_MS = 3 * 3600000;

function cyclePad(n) {
  return String(n).padStart(2, '0');
}

function cycleParts(label) {
  return { year: Number(label.slice(0, 4)), month: Number(label.slice(5, 7)) };
}

function cycleLastDay(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function cycleUtc(date) {
  return Date.parse(date + 'T00:00:00Z');
}

export function riyadhDate(iso) {
  return new Date(Date.parse(iso) + CYCLE_OFFSET_MS).toISOString().slice(0, 10);
}

export function cycleStartDate(year, month, startDay) {
  const day = Math.min(Number(startDay), cycleLastDay(year, month));
  return `${year}-${cyclePad(month)}-${cyclePad(day)}`;
}

export function cycleLabel(iso, startDay) {
  const date = riyadhDate(iso);
  const { year, month } = cycleParts(date.slice(0, 7));
  const label = `${year}-${cyclePad(month)}`;
  return date >= cycleStartDate(year, month, startDay) ? label : shiftCycle(label, -1);
}

export function cycleBounds(label, startDay) {
  const { year, month } = cycleParts(label);
  const next = cycleParts(shiftCycle(label, 1));
  return {
    start: cycleStartDate(year, month, startDay),
    end: cycleStartDate(next.year, next.month, startDay),
  };
}

export function shiftCycle(label, delta) {
  const { year, month } = cycleParts(label);
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return `${y}-${cyclePad(m)}`;
}

export function daysBetween(a, b) {
  return Math.round((cycleUtc(b) - cycleUtc(a)) / CYCLE_DAY_MS);
}

export function daysLeft(nowIso, label, startDay) {
  const today = riyadhDate(nowIso);
  const { start, end } = cycleBounds(label, startDay);
  if (today < start) return daysBetween(start, end);
  if (today >= end) return 0;
  return daysBetween(today, end);
}
