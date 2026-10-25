// The demo clock. Bahn's snapshot was taken on Wed 21 Oct 2026 at 12:00 (Helsinki).
// So the demo runs on the day we present it, every date in the snapshot is moved forward
// SHIFT_DAYS calendar days when it is loaded. Local wall-clock times stay the same
// (Finland and Germany leave summer time on 25 Oct, so a plain +96 h would move every
// time back an hour). Dates written in text ("Thu 22 Oct", "ke 21.10.") move too.
// The files on disk are untouched; set SHIFT_DAYS to 0 to see the original snapshot.
export const SHIFT_DAYS = 4;
const TZ = 'Europe/Helsinki';
const DAY = 864e5;

const offMs = (ms) => Date.parse(new Date(ms).toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T') + 'Z') - ms;
export function shiftMs(ms) {
  if (!SHIFT_DAYS || !Number.isFinite(ms)) return ms;
  const local = ms + offMs(ms) + SHIFT_DAYS * DAY;
  return local - offMs(local - offMs(ms));
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fmtIso = (ms, like) => { const s = new Date(ms).toISOString(); return /\.\d+(Z|[+-])/.test(like) ? s : s.replace('.000Z', 'Z'); };
const addDays = (y, m, d) => { const x = new Date(Date.UTC(y, m, d + SHIFT_DAYS)); return [x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()]; };
const pad = (n) => String(n).padStart(2, '0');

export function shiftIso(s) {
  if (!SHIFT_DAYS || typeof s !== 'string') return s;
  if (ISO.test(s)) return fmtIso(shiftMs(Date.parse(s)), s);
  if (DATE.test(s)) { const [y, m, d] = addDays(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); return `${y}-${pad(m + 1)}-${pad(d)}`; }
  return s;
}

// Dates in prose, English and Finnish. Only the snapshot's months (Sep–Nov) are touched.
const EN_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EN_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FI_SHORT = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'];
const FI_LONG = ['maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai', 'sunnuntai'];
const MON_SHORT = { Sep: 8, Oct: 9, Nov: 10 };
const MON_LONG = { September: 8, October: 9, November: 10 };
const MON_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const nextDay = (list, i) => list[(i + SHIFT_DAYS) % 7];
const FINNISH = /[äöÄÖ]|(ja|klo|mennessä|asti)/;
const keepCase = (from, to) => (from[0] === from[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);
// Our own system prompt carries the date Bahn answered our questions; that date is real.
const KEEP = ['(25 Oct 2026)'];

export function shiftText(s) {
  if (!SHIFT_DAYS || typeof s !== 'string' || s.length < 3) return s;
  const kept = [];
  let out = s;
  KEEP.forEach((k, i) => { if (out.includes(k)) { out = out.split(k).join(`\u0000${i}\u0000`); kept.push(i); } });
  out = out
    .replace(/\b2026-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z)?\b/g, (m) => shiftIso(m))
    .replace(/\b(\d{1,2}) (Sep|Oct|Nov|September|October|November)\b/g, (m, d, mon) => {
      const long = mon in MON_LONG;
      const [, m2, d2] = addDays(2026, long ? MON_LONG[mon] : MON_SHORT[mon], +d);
      return `${d2} ${long ? MON_FULL[m2] : MON_NAMES[m2]}`;
    })
    .replace(/(?<!klo\s)\b(\d{1,2})\.(\d{1,2})\.(\d{4})?(?!\d)/g, (m, d, mo, y) => {
      if (+mo < 9 || +mo > 11 || +d < 1 || +d > 31) return m;
      const [y2, m2, d2] = addDays(+(y || 2026), +mo - 1, +d);
      return `${d2}.${m2 + 1}.${y ? y2 : ''}`;
    })
    .replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, (m) =>
      (EN_LONG.includes(m) ? nextDay(EN_LONG, EN_LONG.indexOf(m)) : nextDay(EN_SHORT, EN_SHORT.indexOf(m))))
    .replace(/\b(ma|ti|ke|to|pe|la|su)(?=\s(?:\d{1,2}\.\d{1,2}\.|klo\b))/g, (m) => nextDay(FI_SHORT, FI_SHORT.indexOf(m)))
    // "ke 15:00" in Finnish text only: in English, "to 14:00" is not a weekday.
    .replace(/\b(ma|ti|ke|to|pe|la|su)(?=\s\d{1,2}[:.]\d{2}\b)/g, (m, d, i, all) => (FINNISH.test(all) ? nextDay(FI_SHORT, FI_SHORT.indexOf(m)) : m))
    .replace(/\b(maanantai|tiistai|keskiviikko|torstai|perjantai|lauantai|sunnuntai)/gi, (m) =>
      keepCase(m, nextDay(FI_LONG, FI_LONG.indexOf(m.toLowerCase()))));
  for (const i of kept) out = out.split(`\u0000${i}\u0000`).join(KEEP[i]);
  return out;
}

// Timestamps and dates in text, anywhere inside a record.
export function shiftDeep(v) {
  if (!SHIFT_DAYS) return v;
  if (typeof v === 'string') return ISO.test(v) || DATE.test(v) ? shiftIso(v) : shiftText(v);
  if (Array.isArray(v)) return v.map(shiftDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shiftDeep(x)]));
  return v;
}
