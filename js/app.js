import * as S from './store.js';
import { $, $$, esc, money, money2, signedMoney, num, sum, groupBy, parseISO, iso, todayMs, todayISO, shortDate, longDate, monthLabel, MON, DAY, setCurrency, uid } from './util.js';
import { parseCSV, detect, toTransactions, parseDate, parseAmount } from './csv.js';
import { merchantOf, titleCase, categorise, txnKey, findRecurring } from './categorise.js';
import { FREQS, occurrences, freqLabel, PER_YEAR, cycleSummary, project, monthlyPicture, events, currentBalance } from './cashflow.js';
import { balanceChart, barChart } from './charts.js';

S.load();
const ui = { tab: localGet('tab') || 'home', month: null, cat: null, q: '', showAllTx: 60 };

function localGet(k) { try { return sessionStorage.getItem('pb:' + k); } catch { return null; } }
function localSet(k, v) { try { sessionStorage.setItem('pb:' + k, v); } catch {} }

// ---------------------------------------------------------------- shell
const main = $('#main');
function setTab(t) {
  ui.tab = t; localSet('tab', t);
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  render(); main.scrollTo?.(0, 0); window.scrollTo(0, 0);
}
$$('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

function applyTheme() {
  const t = S.get().settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function render() {
  const st = S.get(); setCurrency(st.settings.currency); applyTheme();
  $('#fab').hidden = !(ui.tab === 'home' || ui.tab === 'flow');
  const v = { home: viewHome, spend: viewSpend, flow: viewFlow, more: viewMore }[ui.tab] || viewHome;
  main.innerHTML = v(st);
  after.forEach(f => f()); after.length = 0;
}
const after = [];
S.onChange(() => render());
window.addEventListener('resize', debounce(() => render(), 200));
function debounce(f, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; }

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------- sheet (bottom drawer)
const sheet = $('#sheet'), backdrop = $('#backdrop');
function openSheet(title, body, onMount) {
  sheet.innerHTML = `<div class="grab" aria-hidden="true"></div><header class="sheet-h"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></header><div class="sheet-b">${body}</div>`;
  sheet.hidden = false; backdrop.hidden = false;
  requestAnimationFrame(() => { sheet.classList.add('open'); backdrop.classList.add('open'); });
  sheet.querySelector('[data-close]').onclick = closeSheet;
  onMount?.(sheet);
  const f = sheet.querySelector('[autofocus]'); if (f && matchMedia('(pointer:fine)').matches) f.focus();
}
function closeSheet() {
  sheet.classList.remove('open'); backdrop.classList.remove('open');
  setTimeout(() => { sheet.hidden = true; backdrop.hidden = true; sheet.innerHTML = ''; }, 220);
}
backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

const catOptions = (sel, filter = () => true) => S.get().categories.filter(filter).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');
const freqOptions = (sel, noOnce) => FREQS.filter(f => !(noOnce && f[0] === 'once')).map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
const catChip = id => { const c = S.catById(id); return `<span class="cat-ico" aria-hidden="true">${c.icon}</span>`; };

// ---------------------------------------------------------------- HOME
function viewHome(st) {
  const hasPay = st.cash.pay.amount > 0;
  const c = cycleSummary(st);
  const up = c.upcoming.filter(e => e.amount < 0).slice(0, 5);
  const latest = latestMonth(st);
  const monthTx = latest ? spendTx(st).filter(t => t.date.startsWith(latest)) : [];
  const cats = categoryTotals(monthTx).slice(0, 4);
  const maxCat = Math.max(1, ...cats.map(x => x.total));
  const tone = c.safe < 0 ? 'bad' : c.perDay < 20 ? 'warn' : 'good';
  return `
  <header class="page-h"><div><p class="eyebrow">${longDate(todayMs())}</p><h1>Hi there 👋</h1></div></header>
  ${!hasPay ? `<div class="card setup"><div><h3>Set up your pay</h3><p class="muted">Add your pay amount and next pay date so we can work out what's safe to spend.</p></div><button class="btn primary" data-act="edit-pay">Set pay</button></div>` : ''}
  <section class="card hero ${tone}">
    <p class="eyebrow">Safe to spend until payday</p>
    <p class="hero-n">${money(c.safe)}</p>
    <p class="hero-sub">${c.next ? `<b>${money(Math.max(0, c.perDay))}</b> a day · ${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} until ${longDate(c.next)}` : 'Add your pay date to see this'}</p>
    <div class="cycle"><i style="width:${(c.progress * 100).toFixed(1)}%"></i></div>
    <div class="hero-stats">
      <button data-act="edit-balance"><span class="eyebrow">Balance today</span><b>${money(c.bal)}</b><span class="edit-hint">Update</span></button>
      <div><span class="eyebrow">Bills before payday</span><b>${money(c.billsDue)}</b></div>
      <div><span class="eyebrow">Spent this pay</span><b>${money(c.spentCycle)}</b></div>
    </div>
  </section>

  <div class="grid-2">
  <section class="card">
    <div class="card-h"><h3>Coming up before payday</h3><button class="link" data-tab-go="flow">Cash flow →</button></div>
    ${up.length ? `<ul class="list">${up.map(evRow).join('')}</ul>` : `<p class="empty">Nothing due before your next pay. ${st.recurring.length ? '' : '<button class="link" data-act="add-recurring">Add a recurring bill</button>'}</p>`}
  </section>

  <section class="card">
    <div class="card-h"><h3>${latest ? monthLabel(latest) + ' spending' : 'Spending'}</h3><button class="link" data-tab-go="spend">Details →</button></div>
    ${cats.length ? `<p class="big-n">${money(sum(monthTx, t => -t.amount))}</p><ul class="cat-bars">${cats.map(x => catBar(x, maxCat)).join('')}</ul>`
      : `<p class="empty">Import a CSV from your banking app to see where your money goes.</p><button class="btn" data-act="import">Import CSV</button>`}
  </section>
  </div>`;
}

function evRow(e) {
  const c = S.catById(e.category);
  const kindTag = e.kind === 'saving' ? '<span class="tag">Saving</span>' : e.kind?.startsWith('entry') ? '<span class="tag">Planned</span>' : '';
  return `<li class="row"><span class="cat-ico">${e.kind === 'pay' ? '💰' : c.icon}</span><div class="row-main"><b>${esc(e.name)}</b>${kindTag}<span class="muted">${longDate(e.t)}</span></div><span class="amt ${e.amount > 0 ? 'pos' : ''}">${e.amount > 0 ? '+' : ''}${money2(e.amount)}</span></li>`;
}
function catBar(x, max) {
  const c = S.catById(x.id);
  return `<li><button class="cat-bar" data-act="pick-cat" data-cat="${x.id}"><span class="cat-ico">${c.icon}</span><span class="cb-main"><span class="cb-top"><span>${esc(c.name)}</span><b>${money(x.total)}</b></span><span class="meter"><i style="width:${Math.max(2, x.total / max * 100).toFixed(1)}%"></i></span></span></button></li>`;
}

// ---------------------------------------------------------------- SPENDING
const spendTx = st => st.txns.filter(t => t.amount < 0 && !t.excluded && t.category !== 'transfers');
const latestMonth = st => st.txns.reduce((m, t) => (t.date.slice(0, 7) > m ? t.date.slice(0, 7) : m), '') || null;
function categoryTotals(tx) {
  const g = groupBy(tx, t => t.category);
  return Object.entries(g).map(([id, l]) => ({ id, total: -sum(l, t => t.amount), count: l.length })).sort((a, b) => b.total - a.total);
}

function viewSpend(st) {
  if (!st.txns.length) return `
    <header class="page-h"><div><p class="eyebrow">Spending</p><h1>Where your money goes</h1></div></header>
    <section class="card drop" data-act="import" id="drop">
      <div class="drop-ico">⇪</div>
      <h3>Import a CSV from your bank</h3>
      <p class="muted">Export transactions from your banking app or internet banking as CSV, then pick the file here. Works with CommBank, ANZ, Westpac, NAB, ING, Macquarie, Up, Bendigo and most others.</p>
      <button class="btn primary">Choose CSV file</button>
      <p class="tiny muted">Your file never leaves this device.</p>
    </section>
    <section class="card"><h3>How to get a CSV</h3><ul class="howto">
      <li><b>CommBank</b> NetBank → Accounts → View transactions → Export → CSV</li>
      <li><b>ANZ</b> Internet Banking → Account → Download transactions → CSV</li>
      <li><b>Westpac</b> Online Banking → Account → Export transactions → CSV</li>
      <li><b>NAB</b> Internet Banking → Transaction history → Export → CSV</li>
      <li><b>Up</b> App → Data export → CSV</li></ul></section>`;

  const months = [...new Set(st.txns.map(t => t.date.slice(0, 7)))].sort().reverse();
  if (ui.month && ui.month !== 'all' && !months.includes(ui.month)) ui.month = null;
  const month = ui.month || months[0];
  const inPeriod = t => month === 'all' || t.date.startsWith(month);
  const periodAll = st.txns.filter(inPeriod);
  const periodSpend = spendTx(st).filter(inPeriod);
  const spent = -sum(periodSpend, t => t.amount);
  const income = sum(periodAll.filter(t => t.amount > 0 && !t.excluded && t.category !== 'transfers'), t => t.amount);
  const cats = categoryTotals(periodSpend), maxCat = Math.max(1, ...cats.map(c => c.total));
  const merchants = Object.entries(groupBy(periodSpend, t => t.merchant)).map(([m, l]) => ({ m, total: -sum(l, t => t.amount), n: l.length })).sort((a, b) => b.total - a.total).slice(0, 6);
  const days = month === 'all' ? Math.max(1, (parseISO(st.txns.map(t => t.date).sort().pop()) - parseISO(st.txns.map(t => t.date).sort()[0])) / DAY + 1) : daysInPeriod(month, st);
  const rec = findRecurring(st.txns, st.recurring.map(r => r.name));
  const prev = month !== 'all' ? months[months.indexOf(month) + 1] : null;
  const prevSpent = prev ? -sum(spendTx(st).filter(t => t.date.startsWith(prev)), t => t.amount) : null;
  const delta = prevSpent ? (spent - prevSpent) / prevSpent : null;

  let list = st.txns.filter(inPeriod);
  if (ui.cat) list = list.filter(t => t.category === ui.cat);
  if (ui.q) { const q = ui.q.toLowerCase(); list = list.filter(t => t.desc.toLowerCase().includes(q) || t.merchant.includes(q) || String(Math.abs(t.amount)).includes(q)); }
  list.sort((a, b) => b.date.localeCompare(a.date) || a.amount - b.amount);
  const shown = list.slice(0, ui.showAllTx);
  const byDay = groupBy(shown, t => t.date);

  after.push(() => {
    const host = $('#monthBars'); if (!host) return;
    const last = [...months].slice(0, 12).reverse();
    barChart(host, last.map(m => ({ label: MON[+m.slice(5) - 1], sub: monthLabel(m), value: -sum(spendTx(st).filter(t => t.date.startsWith(m)), t => t.amount), active: m === month, key: m })), { onPick: it => { ui.month = it.key; ui.cat = null; render(); } });
    const s = $('#txSearch'); if (s) s.addEventListener('input', debounce(e => { ui.q = e.target.value; const pos = s.selectionStart; render(); const n = $('#txSearch'); n.focus(); n.setSelectionRange(pos, pos); }, 250));
    $('.chips .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  });

  return `
  <header class="page-h"><div><p class="eyebrow">Spending</p><h1>Where your money goes</h1></div><button class="btn" data-act="import">⇪ Import CSV</button></header>
  <div class="chips" role="tablist">${['all', ...months].map(m => `<button class="chip ${m === month ? 'on' : ''}" data-act="month" data-m="${m}">${m === 'all' ? 'All time' : monthLabel(m)}</button>`).join('')}</div>

  <div class="tiles">
    <div class="tile"><span class="eyebrow">Spent</span><b>${money(spent)}</b>${delta !== null && isFinite(delta) ? `<span class="delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta * 100).toFixed(0)}% vs ${monthLabel(prev).slice(0, 3)}</span>` : ''}</div>
    <div class="tile"><span class="eyebrow">Money in</span><b>${money(income)}</b></div>
    <div class="tile"><span class="eyebrow">Net</span><b class="${income - spent >= 0 ? 'pos' : 'neg'}">${signedMoney(income - spent, 0)}</b></div>
    <div class="tile"><span class="eyebrow">Per day</span><b>${money(spent / days)}</b></div>
  </div>

  <div class="grid-2">
    <section class="card"><div class="card-h"><h3>Monthly spending</h3><span class="muted tiny">Tap a month</span></div><div class="chart" id="monthBars"></div></section>
    <section class="card"><div class="card-h"><h3>By category</h3>${ui.cat ? `<button class="link" data-act="pick-cat" data-cat="">Clear filter</button>` : ''}</div>
      <ul class="cat-bars">${cats.map(x => catBar(x, maxCat).replace('class="cat-bar"', `class="cat-bar ${ui.cat === x.id ? 'on' : ''}"`)).join('') || '<p class="empty">No spending in this period.</p>'}</ul></section>
  </div>

  ${rec.length ? `<section class="card"><div class="card-h"><h3>Looks recurring</h3><span class="muted tiny">Add to your cash flow</span></div>
    <ul class="list">${rec.map((r, i) => `<li class="row"><span class="cat-ico">${S.catById(r.category).icon}</span><div class="row-main"><b>${esc(titleCase(r.merchant))}</b><span class="muted">${freqLabel(r.freq)} · last ${shortDate(parseISO(r.last))}</span></div><span class="amt">${money2(r.amount)}</span><button class="btn sm" data-act="rec-add" data-i="${i}">Add</button></li>`).join('')}</ul></section>` : ''}

  <div class="grid-2">
    <section class="card"><h3>Top merchants</h3><ul class="list">${merchants.map(m => `<li class="row"><div class="row-main"><b>${esc(titleCase(m.m))}</b><span class="muted">${m.n} transaction${m.n > 1 ? 's' : ''}</span></div><span class="amt">${money2(-m.total)}</span></li>`).join('')}</ul></section>
    <section class="card"><h3>Imports</h3><ul class="list">${st.imports.slice(-5).reverse().map(im => `<li class="row"><div class="row-main"><b>${esc(im.file)}</b><span class="muted">${new Date(im.date).toLocaleDateString('en-AU')} · ${im.count} new</span></div></li>`).join('')}</ul>
      <p class="tiny muted">${st.txns.length} transactions stored · re-importing the same file skips duplicates.</p></section>
  </div>

  <section class="card tx-card">
    <div class="card-h"><h3>Transactions ${ui.cat ? `· ${esc(S.catById(ui.cat).name)}` : ''}</h3><span class="muted tiny">${list.length}</span></div>
    <input class="search" id="txSearch" type="search" placeholder="Search description or amount" value="${esc(ui.q)}">
    ${Object.entries(byDay).map(([d, l]) => `<h4 class="day-h">${longDate(parseISO(d))}</h4><ul class="list">${l.map(txRow).join('')}</ul>`).join('') || '<p class="empty">No matching transactions.</p>'}
    ${list.length > shown.length ? `<button class="btn wide" data-act="more-tx">Show more (${list.length - shown.length})</button>` : ''}
  </section>`;
}
function daysInPeriod(month, st) {
  const [y, m] = month.split('-').map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const now = new Date(todayMs());
  if (now.getUTCFullYear() === y && now.getUTCMonth() + 1 === m) return now.getUTCDate();
  // partial month at the edge of the export
  const ds = st.txns.filter(t => t.date.startsWith(month)).map(t => +t.date.slice(8));
  return Math.max(1, Math.min(dim, Math.max(...ds) - Math.min(...ds) + 1, dim));
}
function txRow(t) {
  return `<li><button class="row tx ${t.excluded ? 'excluded' : ''}" data-act="edit-tx" data-id="${t.id}">${catChip(t.category)}<div class="row-main"><b>${esc(titleCase(t.merchant))}</b><span class="muted ellipsis">${esc(S.catById(t.category).name)} · ${esc(t.desc)}</span></div><span class="amt ${t.amount > 0 ? 'pos' : ''}">${signedMoney(t.amount)}</span></button></li>`;
}

// ---------------------------------------------------------------- CASH FLOW
function viewFlow(st) {
  const p = st.cash.pay, c = cycleSummary(st), proj = project(st, 90), mp = monthlyPicture(st);
  const low = proj.pts.reduce((a, b) => (b.b < a.b ? b : a), proj.pts[0]);
  const timeline = []; let run = proj.start;
  for (const e of proj.ev.filter(e => e.t <= todayMs() + 35 * DAY)) { run += e.amount; timeline.push({ ...e, run }); }
  const rec = { expense: [], saving: [], income: [] };
  st.recurring.forEach(r => (rec[r.kind] || rec.expense).push(r));
  const nextOf = r => events({ ...st, cash: { ...st.cash, pay: { amount: 0 } }, entries: [], recurring: [r] }, todayMs() - DAY, todayMs() + 800 * DAY)[0];
  const entries = [...st.entries].sort((a, b) => b.date.localeCompare(a.date));
  after.push(() => { const h = $('#projChart'); if (h) balanceChart(h, proj.pts); });

  const recList = (title, arr, kind) => `
    <div class="card-h sub"><h4>${title}</h4><span class="muted tiny">${money(sum(arr.filter(r => !r.paused), r => r.amount * PER_YEAR[r.freq] / 12))}/mo</span></div>
    ${arr.length ? `<ul class="list">${arr.map(r => { const n = nextOf(r); return `<li><button class="row" data-act="edit-recurring" data-id="${r.id}">${catChip(r.category)}<div class="row-main"><b>${esc(r.name)}</b><span class="muted">${freqLabel(r.freq)}${n ? ' · next ' + shortDate(n.t) : r.freq === 'once' ? ' · done' : ''}${r.paused ? ' · paused' : ''}</span></div><span class="amt ${kind === 'income' ? 'pos' : ''}">${money2(r.amount)}</span></button></li>`; }).join('')}</ul>` : `<p class="empty sm">None yet.</p>`}`;

  return `
  <header class="page-h"><div><p class="eyebrow">Cash flow</p><h1>Payday to payday</h1></div></header>

  <div class="tiles">
    <button class="tile" data-act="edit-pay"><span class="eyebrow">Pay</span><b>${p.amount ? money(p.amount) : 'Set up'}</b><span class="muted tiny">${p.amount ? freqLabel(p.freq) + (c.next ? ' · next ' + shortDate(c.next) : '') : 'Tap to add'}</span></button>
    <button class="tile" data-act="edit-balance"><span class="eyebrow">Balance today</span><b>${money(c.bal)}</b><span class="muted tiny">Set ${shortDate(parseISO(st.cash.balanceAsOf))} · tap to update</span></button>
    <div class="tile"><span class="eyebrow">Safe to spend</span><b class="${c.safe < 0 ? 'neg' : ''}">${money(c.safe)}</b><span class="muted tiny">${money(Math.max(0, c.perDay))}/day</span></div>
    <div class="tile"><span class="eyebrow">Lowest (90 days)</span><b class="${low.b < 0 ? 'neg' : ''}">${money(low.b)}</b><span class="muted tiny">${shortDate(low.t)}</span></div>
  </div>

  <section class="card">
    <div class="card-h"><h3>Projected balance</h3><span class="muted tiny">Next 90 days · <span class="dot pay"></span> payday</span></div>
    <div class="chart" id="projChart"></div>
    ${low.b < 0 ? `<p class="alert bad">Heads up: you're projected to go ${money(low.b)} on ${longDate(low.t)}.</p>` : ''}
  </section>

  <div class="grid-2">
    <section class="card">
      <div class="card-h"><h3>Recurring</h3><button class="btn sm primary" data-act="add-recurring">+ Add</button></div>
      ${recList('Bills & expenses', rec.expense, 'expense')}
      ${recList('Savings transfers', rec.saving, 'saving')}
      ${recList('Other income', rec.income, 'income')}
    </section>

    <div class="stack">
      <section class="card">
        <h3>Your month at a glance</h3>
        <ul class="glance">
          <li><span>Income</span><b class="pos">${money(mp.income)}</b></li>
          <li><span>Bills & expenses</span><b>−${money(mp.expenses)}</b></li>
          <li><span>Savings</span><b>−${money(mp.savings)}</b></li>
          <li class="total"><span>Left for everyday spending</span><b class="${mp.free < 0 ? 'neg' : ''}">${money(mp.free)}</b></li>
        </ul>
        ${mp.income ? `<div class="split"><i class="s-exp" style="flex:${Math.max(0, mp.expenses)}"></i><i class="s-sav" style="flex:${Math.max(0, mp.savings)}"></i><i class="s-free" style="flex:${Math.max(0, mp.free)}"></i></div><div class="legend"><span><i class="s-exp"></i>Bills</span><span><i class="s-sav"></i>Savings</span><span><i class="s-free"></i>Free</span></div>` : ''}
      </section>

      <section class="card">
        <div class="card-h"><h3>Spending log</h3><button class="btn sm" data-act="quick-add">+ Add</button></div>
        <p class="tiny muted">Log spending as you go (or plan a future one-off). Past entries come off your balance; future ones show in the projection.</p>
        ${entries.length ? `<ul class="list">${entries.slice(0, 12).map(e => `<li><button class="row" data-act="edit-entry" data-id="${e.id}">${catChip(e.category)}<div class="row-main"><b>${esc(e.note || S.catById(e.category).name)}</b><span class="muted">${longDate(parseISO(e.date))}${parseISO(e.date) > todayMs() ? ' · planned' : ''}</span></div><span class="amt ${e.kind === 'income' ? 'pos' : ''}">${e.kind === 'income' ? '+' : '−'}${money2(e.amount)}</span></button></li>`).join('')}</ul>` : '<p class="empty sm">Tap + to log your first spend.</p>'}
      </section>
    </div>
  </div>

  <section class="card">
    <div class="card-h"><h3>Next 5 weeks</h3><span class="muted tiny">Running balance</span></div>
    ${timeline.length ? `<ul class="list timeline">${timeline.map(e => `<li class="row"><span class="cat-ico">${e.kind === 'pay' ? '💰' : S.catById(e.category).icon}</span><div class="row-main"><b>${esc(e.name)}</b><span class="muted">${longDate(e.t)}</span></div><div class="amt-stack"><span class="amt ${e.amount > 0 ? 'pos' : ''}">${e.amount > 0 ? '+' : ''}${money2(e.amount)}</span><span class="run ${e.run < 0 ? 'neg' : ''}">${money(e.run)}</span></div></li>`).join('')}</ul>` : '<p class="empty">Add your pay and recurring bills to see what\'s coming.</p>'}
  </section>`;
}

// ---------------------------------------------------------------- SETTINGS
function viewMore(st) {
  return `
  <header class="page-h"><div><p class="eyebrow">Settings</p><h1>Settings & data</h1></div></header>
  <div class="grid-2">
  <section class="card form">
    <h3>Preferences</h3>
    <label>Currency<select data-set="currency">${['AUD', 'NZD', 'USD', 'GBP', 'EUR', 'CAD'].map(c => `<option ${c === st.settings.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Theme<select data-set="theme">${[['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${v === st.settings.theme ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  </section>
  <section class="card">
    <h3>Your data</h3>
    <p class="muted small">Everything is stored on this device only. Back it up to move it to another device or browser.</p>
    <div class="btn-row"><button class="btn primary" data-act="export">Download backup</button><button class="btn" data-act="restore">Restore backup</button></div>
    <div class="btn-row"><button class="btn danger-ghost" data-act="clear-tx">Delete imported transactions</button><button class="btn danger-ghost" data-act="reset">Erase everything</button></div>
  </section>
  </div>
  <section class="card">
    <div class="card-h"><h3>Category rules</h3><span class="muted tiny">${st.rules.length}</span></div>
    <p class="muted small">Rules are created when you re-categorise a transaction and tick “apply to all”. They run on every import.</p>
    ${st.rules.length ? `<ul class="list">${st.rules.map(r => `<li class="row">${catChip(r.category)}<div class="row-main"><b>“${esc(r.match)}”</b><span class="muted">→ ${esc(S.catById(r.category).name)}</span></div><button class="icon-btn" data-act="del-rule" data-id="${r.id}" aria-label="Delete rule">✕</button></li>`).join('')}</ul>` : ''}
  </section>
  <section class="card">
    <h3>Install on your phone</h3>
    <p class="muted small"><b>iPhone:</b> open in Safari → Share → <i>Add to Home Screen</i>. <b>Android:</b> Chrome menu → <i>Install app</i>. It then opens full-screen and works offline.</p>
  </section>`;
}

// ---------------------------------------------------------------- forms
function payForm() {
  const p = S.get().cash.pay;
  openSheet('Your pay', `
    <form class="form" id="f">
      <label>Take-home pay (after tax)<div class="money-in"><span>$</span><input name="amount" inputmode="decimal" value="${p.amount || ''}" placeholder="0.00" autofocus required></div></label>
      <label>How often<select name="freq">${freqOptions(p.freq, true).replace(/<option value="(quarterly|yearly)"[^<]*<\/option>/g, '')}</select></label>
      <label>Next pay date<input type="date" name="next" value="${p.next || todayISO()}" required></label>
      <label class="check"><input type="checkbox" name="weekendShift" ${p.weekendShift ? 'checked' : ''}> If payday is a weekend, I'm paid the Friday before</label>
      <button class="btn primary wide">Save pay</button>
    </form>`, sh => sh.querySelector('#f').onsubmit = e => {
    e.preventDefault(); const f = new FormData(e.target);
    S.update(s => { s.cash.pay = { amount: num(f.get('amount')) || 0, freq: f.get('freq'), next: f.get('next'), weekendShift: !!f.get('weekendShift') }; });
    closeSheet(); toast('Pay saved');
  });
}
function balanceForm() {
  const st = S.get();
  openSheet('Balance today', `
    <form class="form" id="f">
      <p class="muted small">Enter what's in your everyday account right now. Bills and pay from today on are projected from here.</p>
      <label>Current balance<div class="money-in"><span>$</span><input name="balance" inputmode="decimal" value="${Math.round(currentBalance(st) * 100) / 100}" autofocus required></div></label>
      <button class="btn primary wide">Update balance</button>
    </form>`, sh => sh.querySelector('#f').onsubmit = e => {
    e.preventDefault(); const v = num(new FormData(e.target).get('balance'));
    if (v === null) return;
    S.update(s => { s.cash.balance = v; s.cash.balanceAsOf = todayISO(); s.cash.balanceSetAt = Date.now(); });
    closeSheet(); toast('Balance updated');
  });
}
function recurringForm(id, preset) {
  const st = S.get(); const r = st.recurring.find(x => x.id === id) || { kind: 'expense', freq: 'monthly', next: todayISO(), category: 'bills', ...preset };
  openSheet(id ? 'Edit recurring' : 'Add recurring', `
    <form class="form" id="f">
      <div class="seg">${[['expense', 'Bill / expense'], ['saving', 'Savings'], ['income', 'Income']].map(([v, l]) => `<label><input type="radio" name="kind" value="${v}" ${r.kind === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <label>Name<input name="name" value="${esc(r.name || '')}" placeholder="e.g. Rent, Netflix, Phone" required autofocus></label>
      <label>Amount<div class="money-in"><span>$</span><input name="amount" inputmode="decimal" value="${r.amount ?? ''}" placeholder="0.00" required></div></label>
      <div class="two"><label>How often<select name="freq">${freqOptions(r.freq)}</select></label>
      <label>Next due<input type="date" name="next" value="${r.next}" required></label></div>
      <label>Category<select name="category">${catOptions(r.category)}</select></label>
      ${id ? `<label class="check"><input type="checkbox" name="paused" ${r.paused ? 'checked' : ''}> Paused</label>` : ''}
      <button class="btn primary wide">${id ? 'Save' : 'Add'}</button>
      ${id ? `<button type="button" class="btn danger-ghost wide" id="del">Delete</button>` : ''}
    </form>`, sh => {
    sh.querySelector('#f').onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target);
      const item = { id: id || uid(), kind: f.get('kind'), name: f.get('name').trim(), amount: Math.abs(num(f.get('amount')) || 0), freq: f.get('freq'), next: f.get('next'), category: f.get('category'), paused: !!f.get('paused') };
      if (item.kind === 'saving' && item.category === 'bills') item.category = 'savings';
      S.update(s => { const i = s.recurring.findIndex(x => x.id === id); if (i >= 0) s.recurring[i] = item; else s.recurring.push(item); });
      closeSheet(); toast(id ? 'Saved' : 'Added');
    };
    const catSel = sh.querySelector('select[name=category]'); let catTouched = !!id || !!preset?.category;
    catSel.addEventListener('change', () => { catTouched = true; });
    sh.querySelector('input[name=name]').addEventListener('input', e => {
      if (catTouched) return;
      const kind = new FormData(sh.querySelector('#f')).get('kind');
      const g = kind === 'saving' ? 'savings' : kind === 'income' ? 'income' : categorise({ desc: e.target.value, merchant: '', amount: -1 }, S.get().rules);
      catSel.value = g === 'other' ? 'bills' : g;
    });
    sh.querySelector('#del')?.addEventListener('click', () => { if (confirm('Delete this recurring item?')) { S.update(s => { s.recurring = s.recurring.filter(x => x.id !== id); }); closeSheet(); } });
  });
}
function entryForm(id) {
  const st = S.get(); const e0 = st.entries.find(x => x.id === id) || { kind: 'expense', date: todayISO(), category: 'groceries' };
  const quick = st.categories.filter(c => !['transfers', 'income'].includes(c.id)).slice(0, 12);
  openSheet(id ? 'Edit entry' : 'Add spending', `
    <form class="form" id="f">
      <div class="seg">${[['expense', 'Spent'], ['income', 'Received']].map(([v, l]) => `<label><input type="radio" name="kind" value="${v}" ${e0.kind === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <div class="money-in big"><span>$</span><input name="amount" inputmode="decimal" value="${e0.amount ?? ''}" placeholder="0" required autofocus aria-label="Amount"></div>
      <div class="cat-grid" role="radiogroup" aria-label="Category">${quick.map(c => `<label><input type="radio" name="category" value="${c.id}" ${c.id === e0.category ? 'checked' : ''}><span><i>${c.icon}</i>${esc(c.name.split(' ')[0])}</span></label>`).join('')}</div>
      <div class="two"><label>Note<input name="note" value="${esc(e0.note || '')}" placeholder="Optional"></label>
      <label>Date<input type="date" name="date" value="${e0.date}" required></label></div>
      <button class="btn primary wide">${id ? 'Save' : 'Add'}</button>
      ${id ? `<button type="button" class="btn danger-ghost wide" id="del">Delete</button>` : ''}
    </form>`, sh => {
    sh.querySelector('#f').onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target); const amt = Math.abs(num(f.get('amount')) || 0);
      if (!amt) return;
      const kind = f.get('kind');
      const item = { id: id || uid(), created: e0.created || Date.now(), kind, amount: amt, note: f.get('note').trim(), date: f.get('date'), category: kind === 'income' ? 'income' : (f.get('category') || 'other') };
      S.update(s => { const i = s.entries.findIndex(x => x.id === id); if (i >= 0) s.entries[i] = item; else s.entries.push(item); });
      closeSheet(); toast(`${kind === 'income' ? 'Added' : 'Logged'} ${money2(amt)}`);
    };
    sh.querySelector('#del')?.addEventListener('click', () => { S.update(s => { s.entries = s.entries.filter(x => x.id !== id); }); closeSheet(); });
  });
}
function txForm(id) {
  const t = S.get().txns.find(x => x.id === id); if (!t) return;
  openSheet('Transaction', `
    <form class="form" id="f">
      <div class="tx-head"><p class="hero-n sm ${t.amount > 0 ? 'pos' : ''}">${signedMoney(t.amount)}</p><p class="muted">${longDate(parseISO(t.date))}</p><p class="small">${esc(t.desc)}</p></div>
      <label>Category<select name="category">${catOptions(t.category)}</select></label>
      <label class="check"><input type="checkbox" name="all" checked> Apply to all “${esc(titleCase(t.merchant))}” transactions (and future imports)</label>
      <label class="check"><input type="checkbox" name="excluded" ${t.excluded ? 'checked' : ''}> Leave out of spending totals</label>
      <button class="btn primary wide">Save</button>
      <button type="button" class="btn danger-ghost wide" id="del">Delete transaction</button>
    </form>`, sh => {
    sh.querySelector('#f').onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target); const cat = f.get('category');
      let n = 1;
      S.update(s => {
        const x = s.txns.find(y => y.id === id); x.category = cat; x.excluded = !!f.get('excluded');
        if (f.get('all') && t.merchant) {
          s.rules = s.rules.filter(r => r.match !== t.merchant); s.rules.push({ id: uid(), match: t.merchant, category: cat });
          s.txns.forEach(y => { if (y.merchant === t.merchant && y.id !== id) { y.category = cat; n++; } });
        }
      });
      closeSheet(); toast(n > 1 ? `Updated ${n} transactions` : 'Saved');
    };
    sh.querySelector('#del').onclick = () => { S.update(s => { s.txns = s.txns.filter(x => x.id !== id); }); closeSheet(); };
  });
}

// ---------------------------------------------------------------- CSV import
$('#csvInput').addEventListener('change', async e => { const files = [...e.target.files]; e.target.value = ''; for (const f of files) await importFile(f); });
document.addEventListener('dragover', e => { if (ui.tab === 'spend') { e.preventDefault(); $('#drop')?.classList.add('over'); } });
document.addEventListener('dragleave', () => $('#drop')?.classList.remove('over'));
document.addEventListener('drop', async e => { if (ui.tab !== 'spend') return; e.preventDefault(); for (const f of e.dataTransfer.files) await importFile(f); });

function importFile(file) {
  return new Promise(resolve => {
    const rd = new FileReader();
    rd.onload = () => {
      const rows = parseCSV(String(rd.result));
      if (rows.length < 1) { toast('That file looks empty'); return resolve(); }
      const det = detect(rows);
      mappingSheet(file.name, det, resolve);
    };
    rd.onerror = () => { toast('Could not read that file'); resolve(); };
    rd.readAsText(file);
  });
}

function mappingSheet(name, det, done) {
  const m = { ...det.map };
  const colOpts = (sel, allowNone) => (allowNone ? `<option value="-1">— none —</option>` : '') + det.header.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h)}${!det.hasHeader ? ` (e.g. ${esc((det.body[0] || [])[i] || '').slice(0, 18)})` : ''}</option>`).join('');
  const body = `
    <form class="form" id="f">
      <p class="muted small"><b>${esc(name)}</b> · ${det.body.length} rows. Check the preview looks right — spending should show as negative (−).</p>
      <div id="pv" class="preview"></div>
      <details class="adv" ${det.map.amount < 0 && det.map.mode === 'single' ? 'open' : ''}><summary>Adjust columns</summary><div class="form">
      <div class="two"><label>Date column<select name="date">${colOpts(m.date)}</select></label>
      <label>Date format<select name="order"><option value="dmy" ${m.order === 'dmy' ? 'selected' : ''}>DD/MM/YYYY</option><option value="mdy" ${m.order === 'mdy' ? 'selected' : ''}>MM/DD/YYYY</option></select></label></div>
      <label>Description column<select name="desc">${colOpts(m.desc)}</select></label>
      <div class="seg"><label><input type="radio" name="mode" value="single" ${m.mode === 'single' ? 'checked' : ''}><span>One amount column</span></label><label><input type="radio" name="mode" value="split" ${m.mode === 'split' ? 'checked' : ''}><span>Debit + credit columns</span></label></div>
      <div class="mode-single"><label>Amount column<select name="amount">${colOpts(m.amount)}</select></label>
        <label class="check"><input type="checkbox" name="flip" ${m.flip ? 'checked' : ''}> Spending is shown as positive numbers</label></div>
      <div class="mode-split two"><label>Debit (money out)<select name="debit">${colOpts(m.debit, true)}</select></label><label>Credit (money in)<select name="credit">${colOpts(m.credit, true)}</select></label></div>
      <label>Bank's category column (optional)<select name="category">${colOpts(m.category, true)}</select></label>
      </div></details>
      <button class="btn primary wide" id="go">Import</button>
    </form>`;
  openSheet('Import transactions', body, sh => {
    const f = sh.querySelector('#f');
    const read = () => { const d = new FormData(f); return { date: +d.get('date'), desc: +d.get('desc'), amount: +d.get('amount'), debit: +d.get('debit'), credit: +d.get('credit'), category: +d.get('category'), mode: d.get('mode'), flip: !!d.get('flip'), order: d.get('order') }; };
    const refresh = () => {
      const mm = read();
      sh.querySelector('.mode-single').hidden = mm.mode !== 'single';
      sh.querySelector('.mode-split').hidden = mm.mode !== 'split';
      const { txns, skipped } = toTransactions(det.body, mm);
      const pv = txns.slice(0, 6);
      sh.querySelector('#pv').innerHTML = pv.length ? `<ul class="list">${pv.map(t => `<li class="row"><div class="row-main"><b class="ellipsis">${esc(t.desc || '(no description)')}</b><span class="muted">${longDate(parseISO(t.date))}</span></div><span class="amt ${t.amount > 0 ? 'pos' : ''}">${signedMoney(t.amount)}</span></li>`).join('')}</ul><p class="tiny muted">${txns.length} transactions found${skipped ? ` · ${skipped} rows skipped` : ''}</p>` : `<p class="alert bad">No transactions could be read with these settings. Try different columns.</p>`;
      sh.querySelector('#go').disabled = !pv.length;
    };
    f.addEventListener('change', refresh); refresh();
    f.onsubmit = e => {
      e.preventDefault();
      const { txns } = toTransactions(det.body, read());
      const st = S.get(); const keys = new Set(st.txns.map(t => t.key));
      let added = 0, dup = 0;
      const seenInFile = {};
      const fresh = [];
      for (const t of txns) {
        // keep genuine same-day duplicates within one file (two identical coffees) by counting occurrences
        const base = txnKey(t); const n = (seenInFile[base] = (seenInFile[base] || 0) + 1); const key = n > 1 ? base + '#' + n : base;
        if (keys.has(key)) { dup++; continue; }
        const merchant = merchantOf(t.desc);
        const x = { id: uid(), date: t.date, desc: t.desc, amount: t.amount, merchant, key, bankCategory: t.bankCategory };
        x.category = categorise(x, st.rules);
        fresh.push(x); added++;
      }
      S.update(s => { s.txns.push(...fresh); s.imports.push({ id: uid(), date: new Date().toISOString(), file: name, count: added }); });
      ui.month = null; ui.cat = null;
      closeSheet(); setTab('spend');
      toast(`Imported ${added} transaction${added === 1 ? '' : 's'}${dup ? ` · ${dup} duplicates skipped` : ''}`);
      done();
    };
  });
}

// ---------------------------------------------------------------- actions
document.addEventListener('click', e => {
  const go = e.target.closest('[data-tab-go]'); if (go) return setTab(go.dataset.tabGo);
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, st = S.get();
  switch (act) {
    case 'import': $('#csvInput').click(); break;
    case 'edit-pay': payForm(); break;
    case 'edit-balance': balanceForm(); break;
    case 'add-recurring': recurringForm(); break;
    case 'edit-recurring': recurringForm(a.dataset.id); break;
    case 'quick-add': entryForm(); break;
    case 'edit-entry': entryForm(a.dataset.id); break;
    case 'edit-tx': txForm(a.dataset.id); break;
    case 'month': ui.month = a.dataset.m; ui.cat = null; ui.showAllTx = 60; render(); break;
    case 'pick-cat': ui.cat = a.dataset.cat && ui.cat !== a.dataset.cat ? a.dataset.cat : null; if (ui.tab !== 'spend') setTab('spend'); else { render(); $('.tx-card')?.scrollIntoView({ behavior: 'smooth' }); } break;
    case 'more-tx': ui.showAllTx += 200; render(); break;
    case 'rec-add': {
      const r = findRecurring(st.txns, st.recurring.map(r => r.name))[+a.dataset.i];
      // next due: one month after the last charge, rolled forward past today
      const next = occurrences(r.last, r.freq, todayMs() - DAY, todayMs() + 800 * DAY)[0] ?? todayMs();
      recurringForm(null, { name: titleCase(r.merchant), amount: Math.round(r.amount * 100) / 100, freq: r.freq, category: r.category === 'other' ? 'bills' : r.category, next: iso(next) });
      break;
    }
    case 'export': {
      const blob = new Blob([S.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const l = document.createElement('a');
      l.href = url; l.download = `pocket-budget-backup-${todayISO()}.json`; document.body.appendChild(l); l.click(); l.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Backup downloaded'); break;
    }
    case 'restore': $('#jsonInput').click(); break;
    case 'clear-tx': if (confirm('Delete all imported bank transactions? Your cash flow setup is kept.')) { S.update(s => { s.txns = []; s.imports = []; }); toast('Transactions deleted'); } break;
    case 'reset': if (confirm('Erase ALL data on this device? Download a backup first if you might want it.')) { S.reset(); toast('Everything erased'); } break;
    case 'del-rule': S.update(s => { s.rules = s.rules.filter(r => r.id !== a.dataset.id); }); break;
  }
});
$('#fab').addEventListener('click', () => entryForm());
$('#jsonInput').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  f.text().then(t => { try { if (confirm('Replace the data on this device with this backup?')) { S.importJSON(t); toast('Backup restored'); } } catch (err) { alert(err.message); } });
});
document.addEventListener('change', e => {
  const k = e.target.dataset?.set; if (!k) return;
  S.update(s => { s.settings[k] = e.target.value; });
});

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
