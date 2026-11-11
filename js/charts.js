// Tiny SVG charts with hover/touch tooltips. Colours come from CSS tokens.
import { money, shortDate, longDate, esc } from './util.js';

const niceStep = range => { const r = Math.max(range, 1); const p = 10 ** Math.floor(Math.log10(r / 4)); return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => r / s <= 5) || p * 10; };

function tooltip(host) {
  let tip = host.querySelector('.tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip); }
  return tip;
}
function placeTip(host, tip, x, html) {
  tip.innerHTML = html; tip.style.opacity = 1;
  const w = host.clientWidth, tw = tip.offsetWidth;
  tip.style.left = Math.max(0, Math.min(w - tw, x - tw / 2)) + 'px';
}

/** Step-line of projected balance. pts: [{t,b,ev}] */
export function balanceChart(host, pts, { height = 200 } = {}) {
  const W = Math.max(280, host.clientWidth || 320), Hh = height, padL = 8, padR = 8, padT = 26, padB = 22;
  const bs = pts.map(p => p.b);
  let lo = Math.min(0, ...bs), hi = Math.max(...bs, 1);
  const step = niceStep(hi - lo); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = i => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = v => padT + (1 - (v - lo) / (hi - lo || 1)) * (Hh - padT - padB);
  let d = `M${x(0)},${y(pts[0].b)}`;
  for (let i = 1; i < pts.length; i++) d += `H${x(i)}V${y(pts[i].b)}`;
  const area = d + `H${x(pts.length - 1)}V${y(Math.max(lo, 0))}H${x(0)}Z`;
  const grid = [];
  for (let v = lo; v <= hi + 1e-6; v += step) grid.push(`<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="${Math.abs(v) < 1e-6 ? 'zero' : 'grid'}"/><text x="${W - padR}" y="${y(v) - 4}" text-anchor="end" class="axis">${money(v)}</text>`);
  const ticks = [];
  for (let i = 0; i < pts.length; i += Math.ceil(pts.length / 4)) ticks.push(`<text x="${x(i)}" y="${Hh - 6}" class="axis" text-anchor="${i === 0 ? 'start' : 'middle'}">${shortDate(pts[i].t)}</text>`);
  const pays = pts.map((p, i) => p.ev.some(e => e.kind === 'pay') ? `<circle cx="${x(i)}" cy="${y(p.b)}" r="4" class="pay-dot"/>` : '').join('');
  const minI = bs.indexOf(Math.min(...bs));
  host.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" height="${Hh}" role="img" aria-label="Projected balance">
    ${grid.join('')}<path d="${area}" class="area"/><path d="${d}" class="line"/>${pays}
    <circle cx="${x(minI)}" cy="${y(bs[minI])}" r="4.5" class="low-dot"/>
    ${ticks.join('')}<line class="cross" y1="${padT}" y2="${Hh - padB}" x1="0" x2="0" opacity="0"/><circle class="hover-dot" r="5" cx="0" cy="0" opacity="0"/></svg>`;
  const svg = host.querySelector('svg'), cross = svg.querySelector('.cross'), dot = svg.querySelector('.hover-dot'), tip = tooltip(host);
  const move = ev => {
    const r = svg.getBoundingClientRect(); const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((cx - padL) / (W - padL - padR) * (pts.length - 1))));
    const p = pts[i];
    cross.setAttribute('opacity', 1); dot.setAttribute('opacity', 1); cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.b));
    const evs = p.ev.slice(0, 3).map(e => `<div class="tip-row"><span>${esc(e.name)}</span><b>${e.amount > 0 ? '+' : ''}${money(e.amount)}</b></div>`).join('');
    placeTip(host, tip, x(i) * (r.width / W), `<div class="tip-h">${longDate(p.t)}</div><div class="tip-v">${money(p.b)}</div>${evs}`);
  };
  const leave = () => { tip.style.opacity = 0; cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', leave);
}

/** Vertical bars. items: [{label, value, sub, active}] */
export function barChart(host, items, { height = 170, onPick } = {}) {
  const W = Math.max(280, host.clientWidth || 320), Hh = height, padT = 22, padB = 22;
  const max = Math.max(...items.map(i => i.value), 1);
  const n = items.length, gap = 6, bw = Math.min(42, (W - gap * (n - 1)) / n);
  const total = n * bw + (n - 1) * gap, off = (W - total) / 2;
  const bars = items.map((it, i) => {
    const h = Math.max(2, (it.value / max) * (Hh - padT - padB)), bx = off + i * (bw + gap), by = Hh - padB - h;
    const r = Math.min(4, bw / 2, h);
    return `<g class="bar-g ${it.active ? 'on' : ''}" data-i="${i}">
      <rect x="${bx - gap / 2}" y="0" width="${bw + gap}" height="${Hh}" fill="transparent"/>
      <path d="M${bx},${Hh - padB}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${Hh - padB}Z" class="bar"/>
      ${it.active ? `<text x="${bx + bw / 2}" y="${by - 6}" text-anchor="middle" class="val">${money(it.value)}</text>` : ''}
      <text x="${bx + bw / 2}" y="${Hh - 6}" text-anchor="middle" class="axis">${esc(it.label)}</text></g>`;
  }).join('');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" height="${Hh}" role="img" aria-label="Spending by month"><line x1="0" x2="${W}" y1="${Hh - padB}" y2="${Hh - padB}" class="zero"/>${bars}</svg>`;
  const tip = tooltip(host), svg = host.querySelector('svg');
  host.querySelectorAll('.bar-g').forEach(g => {
    const it = items[+g.dataset.i];
    g.addEventListener('pointerenter', () => { const r = svg.getBoundingClientRect(); const bx = off + (+g.dataset.i) * (bw + gap) + bw / 2; placeTip(host, tip, bx * r.width / W, `<div class="tip-h">${esc(it.sub || it.label)}</div><div class="tip-v">${money(it.value)}</div>`); });
    g.addEventListener('pointerleave', () => { tip.style.opacity = 0; });
    if (onPick) g.addEventListener('click', () => onPick(it, +g.dataset.i));
  });
}
