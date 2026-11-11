// CSV parsing + column auto-detection for bank exports.
// Tested shapes: CommBank & ANZ (no header: Date, Amount, Description, Balance),
// Westpac (Debit Amount / Credit Amount), NAB, ING, Macquarie, Up (Subtotal), Bendigo, generic.
import { iso } from './util.js';

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const delim = sniffDelimiter(text);
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim() !== '')) rows.push(row.map(x => x.trim()));
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim() !== '')) rows.push(row.map(x => x.trim()));
  return rows;
}

function sniffDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let q = false;
  for (const c of sample) { if (c === '"') q = !q; else if (!q && c in counts) counts[c]++; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
}

// ---- value parsing -------------------------------------------------------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Returns {d,m,y} candidates; order 'dmy' | 'mdy' | 'ymd' resolves ambiguity. */
export function parseDate(s, order = 'dmy') {
  if (!s) return null;
  s = String(s).trim().replace(/T.*$/, '').replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?$/i, '');
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return mk(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    let y = +m[3]; if (y < 100) y += 2000;
    return order === 'mdy' ? mk(y, +m[1], +m[2]) : mk(y, +m[2], +m[1]);
  }
  if ((m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]*(\d{2,4})$/))) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, 4)] || MONTHS[m[2].toLowerCase().slice(0, 3)];
    let y = +m[3]; if (y < 100) y += 2000;
    return mo ? mk(y, mo, +m[1]) : null;
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, 3)];
    return mo ? mk(+m[3], mo, +m[2]) : null;
  }
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return mk(+m[1], +m[2], +m[3]);
  return null;
}
function mk(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const ms = Date.UTC(y, mo - 1, d);
  if (new Date(ms).getUTCDate() !== d) return null;
  return iso(ms);
}

export function parseAmount(s) {
  if (s == null) return null;
  let t = String(s).trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/\bDR\b/i.test(t)) { neg = true; t = t.replace(/\bDR\b/i, ''); }
  t = t.replace(/\bCR\b/i, '');
  t = t.replace(/[A-Z]{3}\s*$/i, '').replace(/[$£€\s,]/g, '');
  if (/^[+-]?\d*\.?\d+-$/.test(t)) { neg = true; t = t.slice(0, -1); }
  if (!/^[+-]?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return neg ? -Math.abs(n) : n;
}

// ---- detection -----------------------------------------------------------
const H = {
  date: /^(transaction |posted |value |effective )?date|^time$|^date/i,
  desc: /desc|narrative|details|payee|merchant|particulars|memo|reference|transaction$/i,
  amount: /^(amount|value|subtotal|total|transaction amount|amount \(.*\)|subtotal \(.*\))$/i,
  debit: /debit|withdraw|money out|paid out|spent/i,
  credit: /credit|deposit|money in|paid in|received/i,
  balance: /balance/i,
  category: /^categor|^category$/i,
};

export function detect(rows) {
  const first = rows[0] || [];
  const looksHeader = first.length > 1 && !first.some(c => parseDate(c)) && first.filter(c => parseAmount(c) !== null).length === 0;
  const header = looksHeader ? first : first.map((_, i) => 'Column ' + (i + 1));
  const body = looksHeader ? rows.slice(1) : rows;
  const sample = body.slice(0, 60);
  const ncol = Math.max(...rows.slice(0, 20).map(r => r.length));
  const stats = [];
  for (let i = 0; i < ncol; i++) {
    const vals = sample.map(r => r[i] ?? '').filter(v => v !== '');
    const dateHits = vals.filter(v => parseDate(v)).length;
    const nums = vals.map(parseAmount).filter(v => v !== null);
    stats.push({
      i, name: header[i] || 'Column ' + (i + 1), filled: vals.length,
      dateRatio: vals.length ? dateHits / vals.length : 0,
      numRatio: vals.length ? nums.length / vals.length : 0,
      hasNeg: nums.some(n => n < 0), hasPos: nums.some(n => n > 0),
      avgLen: vals.length ? vals.reduce((a, v) => a + v.length, 0) / vals.length : 0,
      distinct: new Set(vals).size,
    });
  }
  const byName = (re, pred = () => true) => looksHeader ? stats.find(s => re.test(s.name.trim()) && pred(s)) : null;
  const map = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1, category: -1, mode: 'single', flip: false, order: 'dmy' };

  const d = byName(H.date, s => s.dateRatio > 0.6) || [...stats].filter(s => s.dateRatio > 0.8).sort((a, b) => b.dateRatio - a.dateRatio)[0];
  if (d) map.date = d.i;

  const deb = byName(H.debit, s => s.numRatio > 0.5 || s.filled < sample.length);
  const cre = byName(H.credit, s => s.numRatio > 0.5 || s.filled < sample.length);
  const amt = byName(H.amount, s => s.numRatio > 0.6);
  if (amt) map.amount = amt.i;
  else if (deb && cre && deb.i !== cre.i) { map.mode = 'split'; map.debit = deb.i; map.credit = cre.i; }
  else {
    // Headerless: first numeric column that isn't the date and isn't a running balance.
    const numeric = stats.filter(s => s.i !== map.date && s.numRatio > 0.9 && !(looksHeader && H.balance.test(s.name)));
    const withSigns = numeric.filter(s => s.hasNeg && s.hasPos);
    map.amount = (withSigns[0] || numeric[0] || {}).i ?? -1;
  }

  const descNamed = byName(H.desc, s => s.numRatio < 0.5 && s.i !== map.date);
  const descGuess = [...stats].filter(s => s.i !== map.date && s.i !== map.amount && s.numRatio < 0.5).sort((a, b) => b.avgLen * Math.min(1, b.distinct / 3) - a.avgLen * Math.min(1, a.distinct / 3))[0];
  map.desc = (descNamed || descGuess || {}).i ?? -1;

  const cat = byName(H.category, s => s.numRatio < 0.5);
  if (cat) map.category = cat.i;

  // Date order: if any first-part > 12 it's d/m; if any second-part > 12 it's m/d.
  if (map.date >= 0) {
    let dm = 0, md = 0;
    for (const r of sample) {
      const m = String(r[map.date] || '').match(/^(\d{1,2})[-/.](\d{1,2})[-/.]/);
      if (m) { if (+m[1] > 12) dm++; if (+m[2] > 12) md++; }
    }
    map.order = md > dm ? 'mdy' : 'dmy';
  }

  // Single amount column with only positives: likely spending shown as positive.
  if (map.mode === 'single' && map.amount >= 0) {
    const s = stats[map.amount];
    if (s && !s.hasNeg && s.hasPos) map.flip = true;
  }
  return { header, body, hasHeader: looksHeader, map, ncol };
}

/** Turn rows into {date, desc, amount, bankCategory} using a column map. amount<0 = money out. */
export function toTransactions(body, map) {
  const out = []; let skipped = 0;
  for (const r of body) {
    const date = parseDate(r[map.date], map.order);
    let amount;
    if (map.mode === 'split') {
      const de = parseAmount(r[map.debit]), cr = parseAmount(r[map.credit]);
      if (de === null && cr === null) { skipped++; continue; }
      amount = (cr ? Math.abs(cr) : 0) - (de ? Math.abs(de) : 0);
    } else {
      amount = parseAmount(r[map.amount]);
      if (amount !== null && map.flip) amount = -amount;
    }
    const desc = (map.desc >= 0 ? r[map.desc] : '') || '';
    if (!date || amount === null || amount === 0) { skipped++; continue; }
    out.push({ date, desc: desc.replace(/\s+/g, ' ').trim(), amount: Math.round(amount * 100) / 100, bankCategory: map.category >= 0 ? (r[map.category] || '') : '' });
  }
  return { txns: out, skipped };
}
