// Merchant clean-up and keyword-based auto-categorisation (tuned for Australian banks).

const NOISE = [
  /\b(visa|eftpos|mastercard|debit card|credit card)\s+(purchase|debit|credit)\b/gi,
  /\b(card|crd)\s*(no\.?|number)?\s*x*\d{3,}\b/gi,
  /\bvalue date:?\s*\S+/gi,
  /\b(aus|au|aud|nsw|vic|qld|wa|sa|tas|act|nt)\b/gi,
  /\b(pty|ltd|limited|inc)\b/gi,
  /\b(sq|sp|zlr|pp|paypal)\s*\*/gi,
  /\*/g,
  /\b(purchase|pos|tap and pay|contactless|direct debit|dd|osko|npp|payment to|payment from|transfer to|transfer from|internet banking|ib|pay anyone)\b/gi,
  /\b\d{2}\/\d{2}(\/\d{2,4})?\b/g,
  /\b(ref|reference|receipt|rcpt)\s*[:#]?\s*\S+/gi,
  /\b[a-z]*\d{4,}[a-z\d]*\b/gi,
  /\b(?=[a-z\d]*\d[a-z\d]*\d)(?=[a-z\d]*[a-z])[a-z\d]{5,}\b/gi,
  /#\S+/g,
  /[^a-z0-9&' ]+/gi,
];

export function merchantOf(desc) {
  let s = ' ' + String(desc || '') + ' ';
  for (const re of NOISE) s = s.replace(re, ' ');
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  const words = s.split(' ').filter(Boolean).slice(0, 3);
  return words.join(' ') || String(desc || '').toLowerCase().slice(0, 24);
}

export const titleCase = s => s.replace(/\b[a-z]/g, c => c.toUpperCase());

const KEYWORDS = [
  ['transfers', /\b(transfer|tfr|xfer|to savings|from savings|internal|own account|bpay to|round up|roundup|cover from|cover to)\b/i],
  ['income', /\b(salary|payroll|wages|pay ?run|centrelink|ato refund|tax refund|dividend|interest paid|interest credit)\b/i],
  ['groceries', /\b(woolworths|woolies|coles|aldi|iga|foodworks|harris farm|costco|drakes|spudshed|supa ?iga|fruit|butcher|bakery|grocer)\b/i],
  ['eating', /\b(uber ?eats|menulog|doordash|deliveroo|mcdonald|mcdonalds|kfc|hungry jack|domino|pizza|subway|guzman|grill'?d|nando|sushi|cafe|coffee|starbucks|gloria jean|boost juice|restaurant|bistro|bar |pub|hotel|kebab|thai|noodle|burger|bakehouse|zambrero|oporto|red rooster)\b/i],
  ['fuel', /\b(bp|shell|caltex|ampol|7-eleven|7 eleven|united petrol|puma|metro petroleum|liberty|fuel|petrol|eg group|reddy express)\b/i],
  ['transport', /\b(uber(?! ?eats)|didi|ola|taxi|13cabs|opal|myki|go card|transperth|translink|metro trains|parking|wilson parking|secure parking|linkt|e-?toll|citylink|eastlink|toll|rego|service nsw|vicroads|transport for)\b/i],
  ['subscriptions', /\b(netflix|spotify|stan|disney|binge|kayo|foxtel|youtube|apple\.com|itunes|google \*|google play|amazon prime|prime video|paramount|audible|icloud|microsoft|adobe|chatgpt|openai|patreon|dropbox|xbox|playstation|nintendo|claude|anthropic)\b/i],
  ['bills', /\b(agl|origin|energy ?australia|red energy|alinta|simply energy|powershop|synergy|sydney water|yarra valley|water|telstra|optus|vodafone|tpg|aussie broadband|iinet|belong|amaysim|boost mobile|internet|nbn|council|rates|gas)\b/i],
  ['insurance', /\b(insurance|nrma|racv|racq|aami|allianz|budget direct|youi|suncorp|gio|qbe|medibank|bupa|hcf|nib|ahm|hbf)\b/i],
  ['housing', /\b(rent|real estate|ray white|lj hooker|strata|mortgage|home loan|property)\b/i],
  ['health', /\b(chemist|pharmacy|priceline|terry white|doctor|medical|dental|dentist|physio|hospital|pathology|gym|fitness|anytime|f45|jetts|goodlife|snap fitness|optometrist|specsavers)\b/i],
  ['shopping', /\b(amazon|ebay|kmart|target|big w|myer|david jones|jb hi-?fi|harvey norman|officeworks|bunnings|ikea|rebel|uniqlo|h&m|zara|cotton on|catch|temu|shein|the iconic|apple store|jb hifi|good guys|dan murphy'?s?|bws|liquor|bottle ?o)\b/i],
  ['entertainment', /\b(cinema|hoyts|event cinemas|village|ticketek|ticketmaster|moshtix|steam|bowling|timezone|museum|zoo|concert)\b/i],
  ['travel', /\b(qantas|virgin|jetstar|rex|airbnb|booking\.com|expedia|hotel|motel|hostel|webjet|flight centre|airport)\b/i],
  ['debt', /\b(afterpay|zip ?pay|zip ?money|humm|latitude|credit card payment|card repayment|loan repayment|personal loan|klarna)\b/i],
  ['fees', /\b(fee|charge|interest charged|overdrawn|dishonour|atm withdrawal fee|international transaction)\b/i],
  ['gifts', /\b(donation|charity|red cross|unicef|world vision|gofundme)\b/i],
];

const BANK_CATEGORY_MAP = [
  [/grocer|supermarket/i, 'groceries'], [/restaurant|takeaway|cafe|dining|eating|food & drink|food and drink/i, 'eating'],
  [/fuel|petrol/i, 'fuel'], [/transport|travel & transport|parking|toll|taxi|public transport/i, 'transport'],
  [/utilit|bill|phone|internet|mobile/i, 'bills'], [/subscri|tv|music|streaming/i, 'subscriptions'],
  [/shop|retail|clothing|homeware|electronics/i, 'shopping'], [/health|medical|fitness|pharmac/i, 'health'],
  [/entertain|events|leisure|hobbies/i, 'entertainment'], [/holiday|accommodation|flights|travel/i, 'travel'],
  [/insur/i, 'insurance'], [/rent|mortgage|home/i, 'housing'], [/transfer/i, 'transfers'],
  [/income|salary|wage/i, 'income'], [/fee|interest/i, 'fees'], [/gift|donat|charit/i, 'gifts'], [/loan|debt|bnpl/i, 'debt'],
];

export function categorise(t, rules) {
  const hay = (t.desc + ' ' + (t.merchant || '')).toLowerCase();
  for (const r of rules) if (r.match && hay.includes(r.match.toLowerCase())) return r.category;
  for (const [cat, re] of KEYWORDS) {
    if (cat === 'income' && t.amount < 0) continue;
    if (re.test(hay)) return cat;
  }
  if (t.bankCategory) for (const [re, cat] of BANK_CATEGORY_MAP) if (re.test(t.bankCategory)) return cat;
  return t.amount > 0 ? 'income' : 'other';
}

export const txnKey = t => `${t.date}|${t.amount.toFixed(2)}|${t.desc.toLowerCase().replace(/\s+/g, ' ')}`;

/** Find merchants that show up in 2+ distinct months with similar amounts. */
export function findRecurring(txns, existingNames = []) {
  const groups = {};
  for (const t of txns) {
    if (t.amount >= 0 || t.excluded || t.category === 'transfers') continue;
    (groups[t.merchant] ||= []).push(t);
  }
  const out = [];
  const known = existingNames.map(n => n.toLowerCase());
  for (const [m, list] of Object.entries(groups)) {
    const months = new Set(list.map(t => t.date.slice(0, 7)));
    if (months.size < 2) continue;
    const amts = list.map(t => -t.amount).sort((a, b) => a - b);
    const median = amts[Math.floor(amts.length / 2)];
    const close = list.filter(t => Math.abs(-t.amount - median) <= Math.max(1, median * 0.08));
    const closeMonths = new Set(close.map(t => t.date.slice(0, 7)));
    // Most charges must be near the typical amount, and no more than ~fortnightly (skips coffee, groceries).
    if (closeMonths.size < 2 || close.length / list.length < 0.75 || close.length / closeMonths.size > 2.4) continue;
    if (known.some(k => k.includes(m) || m.includes(k))) continue;
    const dates = close.map(t => t.date).sort(), last = dates[dates.length - 1];
    const gaps = dates.slice(1).map((d, i) => (Date.parse(d) - Date.parse(dates[i])) / 864e5).sort((a, b) => a - b);
    const gap = gaps[Math.floor(gaps.length / 2)] || 30;
    const freq = gap <= 9 ? 'weekly' : gap <= 18 ? 'fortnightly' : gap <= 45 ? 'monthly' : gap <= 120 ? 'quarterly' : 'yearly';
    out.push({ merchant: m, amount: median, count: close.length, months: closeMonths.size, last, freq, category: close[0].category });
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, 8);
}
