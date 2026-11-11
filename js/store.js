// All data lives in this browser (localStorage). Export/import a JSON backup from Settings.
import { todayISO, uid } from './util.js';

const KEY = 'pocket-budget:v1';

export const DEFAULT_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', icon: '🛒' },
  { id: 'eating', name: 'Eating out', icon: '🍜' },
  { id: 'transport', name: 'Transport', icon: '🚗' },
  { id: 'fuel', name: 'Fuel', icon: '⛽' },
  { id: 'housing', name: 'Rent & housing', icon: '🏠' },
  { id: 'bills', name: 'Bills & utilities', icon: '💡' },
  { id: 'subscriptions', name: 'Subscriptions', icon: '📺' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️' },
  { id: 'health', name: 'Health & fitness', icon: '💊' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎟️' },
  { id: 'travel', name: 'Travel', icon: '✈️' },
  { id: 'insurance', name: 'Insurance', icon: '🛡️' },
  { id: 'debt', name: 'Debt repayments', icon: '💳' },
  { id: 'savings', name: 'Savings', icon: '🏦' },
  { id: 'gifts', name: 'Gifts & donations', icon: '🎁' },
  { id: 'fees', name: 'Fees & charges', icon: '🧾' },
  { id: 'income', name: 'Income', icon: '💰' },
  { id: 'transfers', name: 'Transfers', icon: '🔁' },
  { id: 'other', name: 'Other', icon: '•' },
];

export function defaultState() {
  return {
    v: 1,
    settings: { currency: 'AUD', theme: 'auto' },
    cash: {
      balance: 0,
      balanceAsOf: todayISO(),
      pay: { amount: 0, freq: 'monthly', next: todayISO(), weekendShift: true },
    },
    recurring: [],   // {id,name,amount,kind:'expense'|'income'|'saving',freq,next,category}
    entries: [],     // manual cash flow entries {id,date,amount,kind:'expense'|'income',note,category}
    txns: [],        // imported bank transactions {id,date,desc,amount,category,merchant,key,excluded}
    rules: [],       // {id,match,category}
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    imports: [],     // {id,date,file,count}
  };
}

let state = null;
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = migrate(JSON.parse(raw));
  } catch (e) { console.warn('Could not read saved data', e); }
  if (!state) state = defaultState();
  return state;
}

function migrate(s) {
  const d = defaultState();
  const out = { ...d, ...s, settings: { ...d.settings, ...s.settings }, cash: { ...d.cash, ...s.cash, pay: { ...d.cash.pay, ...(s.cash?.pay || {}) } } };
  for (const k of ['recurring', 'entries', 'txns', 'rules', 'imports']) if (!Array.isArray(out[k])) out[k] = [];
  if (!Array.isArray(out.categories) || !out.categories.length) out.categories = d.categories;
  return out;
}

export const get = () => state;

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { alert('Could not save — your browser storage may be full or disabled.'); }
  }, 150);
  listeners.forEach(f => f(state));
}

export function update(fn) { fn(state); save(); }
export function onChange(f) { listeners.add(f); return () => listeners.delete(f); }

export function replaceAll(next) { state = migrate(next); save(); }
export function reset() { state = defaultState(); save(); }

export function exportJSON() {
  return JSON.stringify({ app: 'pocket-budget', exported: new Date().toISOString(), data: state }, null, 2);
}
export function importJSON(text) {
  const obj = JSON.parse(text);
  const data = obj && obj.app === 'pocket-budget' ? obj.data : obj;
  if (!data || typeof data !== 'object' || !data.cash) throw new Error('That file is not a Pocket Budget backup.');
  replaceAll(data);
}

export const catById = id => state.categories.find(c => c.id === id) || { id: 'other', name: 'Other', icon: '•' };
export const newId = uid;
