// Cash flow engine: expands pay + recurring items into dated events and projects a balance.
import { DAY, parseISO, iso, todayMs, addDays, addMonths, sum } from './util.js';

export const FREQS = [
  ['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'], ['yearly', 'Yearly'], ['once', 'One-off'],
];
export const PER_YEAR = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1, once: 0 };
export const freqLabel = f => (FREQS.find(x => x[0] === f) || [, f])[1];

/** All occurrence dates (ms) of a schedule within (from, to]. anchor = any known occurrence. */
export function occurrences(anchorISO, freq, from, to) {
  const A = parseISO(anchorISO);
  if (isNaN(A)) return [];
  if (freq === 'once') return A > from && A <= to ? [A] : [];
  const out = [];
  if (freq === 'weekly' || freq === 'fortnightly') {
    const P = (freq === 'weekly' ? 7 : 14) * DAY;
    let t = A + Math.floor((from - A) / P + 1) * P;
    if (t - P > from) t -= P;
    for (; t <= to; t += P) if (t > from) out.push(t);
    return out;
  }
  const step = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : 12;
  const dom = new Date(A).getUTCDate();
  // jump near `from` first
  const a = new Date(A), f = new Date(from);
  let k = Math.floor(((f.getUTCFullYear() - a.getUTCFullYear()) * 12 + f.getUTCMonth() - a.getUTCMonth()) / step) - 1;
  for (let i = 0; i < 2000; i++, k++) {
    const t = addMonths(A, k * step, dom);
    if (t > to) break;
    if (t > from) out.push(t);
  }
  return out;
}

/** If pay lands on a weekend, banks usually pay the Friday before. */
const shiftWeekend = t => { const d = new Date(t).getUTCDay(); return d === 6 ? t - DAY : d === 0 ? t - 2 * DAY : t; };

export function paydays(pay, from, to) {
  if (!pay || !pay.next) return [];
  // widen the window so a Saturday payday shifted to Friday still lands in range
  return occurrences(pay.next, pay.freq, from - 3 * DAY, to + 3 * DAY)
    .map(t => (pay.weekendShift ? shiftWeekend(t) : t))
    .filter(t => t > from && t <= to);
}

/** Current pay cycle: [start, end) where end = next payday. */
export function payCycle(pay, now = todayMs()) {
  const next = paydays(pay, now, now + 400 * DAY)[0];
  const prev = paydays(pay, now - 400 * DAY, now).pop();
  return { start: prev ?? (next ? next - 30 * DAY : now), next, isPayday: prev === now };
}

/** Build every dated event in (from, to]. */
export function events(state, from, to) {
  const ev = [];
  const p = state.cash.pay;
  if (p.amount > 0) for (const t of paydays(p, from, to)) ev.push({ t, amount: p.amount, name: 'Pay', kind: 'pay', category: 'income' });
  for (const r of state.recurring) {
    if (r.paused) continue;
    const sign = r.kind === 'income' ? 1 : -1;
    for (const t of occurrences(r.next, r.freq, from, to)) ev.push({ t, amount: sign * Math.abs(r.amount || 0), name: r.name, kind: r.kind, category: r.category, ref: r.id });
  }
  for (const e of state.entries) {
    const t = parseISO(e.date);
    if (t > from && t <= to) ev.push({ t, amount: (e.kind === 'income' ? 1 : -1) * Math.abs(e.amount), name: e.note || 'Spending', kind: 'entry-' + e.kind, category: e.category, ref: e.id });
  }
  // Same day: money in before money out, so a payday bill doesn't flag a false dip.
  return ev.sort((a, b) => a.t - b.t || b.amount - a.amount);
}

/** Today's balance: the last balance you entered plus everything that has happened since. */
export function currentBalance(state, now = todayMs()) {
  const asOf = parseISO(state.cash.balanceAsOf);
  const base = state.cash.balance || 0;
  // Entries logged on the same day as (but after) the balance was set still count.
  const setAt = state.cash.balanceSetAt || 0;
  const sameDay = sum(state.entries.filter(e => parseISO(e.date) === asOf && (e.created || 0) > setAt), e => (e.kind === 'income' ? 1 : -1) * Math.abs(e.amount));
  if (isNaN(asOf) || asOf >= now) return base + (asOf === now ? sameDay : 0);
  return base + sameDay + sum(events(state, asOf, now), e => e.amount);
}

/** Daily projected balance from today for `days` days. */
export function project(state, days = 90, now = todayMs()) {
  const start = currentBalance(state, now);
  const ev = events(state, now, addDays(now, days));
  const pts = []; let b = start, i = 0;
  pts.push({ t: now, b, ev: [] });
  for (let d = 1; d <= days; d++) {
    const t = addDays(now, d); const todays = [];
    while (i < ev.length && ev[i].t <= t) { b += ev[i].amount; todays.push(ev[i]); i++; }
    pts.push({ t, b, ev: todays });
  }
  return { start, pts, ev };
}

/** Headline numbers for the current pay cycle. */
export function cycleSummary(state, now = todayMs()) {
  const cyc = payCycle(state.cash.pay, now);
  const bal = currentBalance(state, now);
  const until = cyc.next ? cyc.next - DAY : addDays(now, 30);
  const upcoming = events(state, now, until);          // after today, before next pay
  const billsDue = -sum(upcoming.filter(e => e.amount < 0 && !e.kind.startsWith('entry')), e => e.amount);
  const plannedSpend = -sum(upcoming.filter(e => e.amount < 0 && e.kind.startsWith('entry')), e => e.amount);
  const incomeBefore = sum(upcoming.filter(e => e.amount > 0), e => e.amount);
  const safe = bal - billsDue - plannedSpend + incomeBefore;
  const daysLeft = cyc.next ? Math.max(1, Math.round((cyc.next - now) / DAY)) : 30;
  const inCycle = events(state, cyc.start - DAY, now);
  const spentCycle = -sum(inCycle.filter(e => e.kind === 'entry-expense'), e => e.amount);
  const billsPaidCycle = -sum(inCycle.filter(e => e.amount < 0 && !e.kind.startsWith('entry')), e => e.amount);
  const cycleLen = cyc.next ? Math.max(1, Math.round((cyc.next - cyc.start) / DAY)) : 30;
  return { ...cyc, bal, billsDue, plannedSpend, incomeBefore, safe, daysLeft, perDay: safe / daysLeft, spentCycle, billsPaidCycle, upcoming, cycleLen, progress: Math.min(1, (now - cyc.start) / DAY / cycleLen) };
}

/** Normalised per-month amounts, for the "monthly picture". */
export function monthlyPicture(state) {
  const p = state.cash.pay;
  const income = (p.amount || 0) * PER_YEAR[p.freq] / 12 + sum(state.recurring.filter(r => r.kind === 'income' && !r.paused), r => r.amount * PER_YEAR[r.freq] / 12);
  const expenses = sum(state.recurring.filter(r => r.kind === 'expense' && !r.paused), r => r.amount * PER_YEAR[r.freq] / 12);
  const savings = sum(state.recurring.filter(r => r.kind === 'saving' && !r.paused), r => r.amount * PER_YEAR[r.freq] / 12);
  return { income, expenses, savings, free: income - expenses - savings };
}

export { iso };
