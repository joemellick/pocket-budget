// Small shared helpers. Dates are handled as 'YYYY-MM-DD' strings / UTC-midnight ms
// so that time zones never shift a transaction onto the wrong day.

export const DAY = 864e5;
export const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export const parseISO = s => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const iso = ms => new Date(ms).toISOString().slice(0, 10);
export const todayMs = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
export const todayISO = () => iso(todayMs());
export const addDays = (ms, n) => ms + n * DAY;
export const addMonths = (ms, n, dom) => {
  const d = new Date(ms);
  const day = dom ?? d.getUTCDate();
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(day, last));
};
export const monthKey = s => s.slice(0, 7);
export const monthLabel = key => { const [y, m] = key.split('-').map(Number); return MON[m - 1] + ' ' + y; };
export const shortDate = ms => { const d = new Date(ms); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
export const longDate = ms => { const d = new Date(ms); return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
export const daysBetween = (a, b) => Math.round((b - a) / DAY);

let currency = 'AUD';
export const setCurrency = c => { currency = c || 'AUD'; };
const fmtCache = {};
const nf = (dp) => fmtCache[currency + dp] ||= new Intl.NumberFormat('en-AU', { style: 'currency', currency, minimumFractionDigits: dp, maximumFractionDigits: dp });
export const money = (n, dp = 0) => {
  const v = Math.abs(n) < 0.005 ? 0 : n;
  const s = nf(dp).format(Math.abs(v));
  return (v < 0 ? '−' : '') + s;
};
export const money2 = n => money(n, 2);
export const signedMoney = (n, dp = 2) => (n > 0.004 ? '+' : '') + money(n, dp);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[$,\s]/g, '')); return isNaN(n) ? null : n; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = (arr, f = x => x) => arr.reduce((a, x) => a + f(x), 0);
export const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
