import { icon, crest, portrait, ratingClass, radar, spark, lineChart, barChart, donut, ring, court, fullCourt, arena, courtLines, heatColor } from './art.js'
import { TEAMS, tierOf } from './data.js'

export const dirOf = () => document.documentElement.dataset.dir
export const isB = () => dirOf() === 'b'

/* Paleta vía variables CSS → los gráficos cambian con el tema */
export const P = {
  cy: 'var(--cy)', am: 'var(--am)', pos: 'var(--pos)', neg: 'var(--neg)', info: 'var(--info)',
  grid: 'var(--line2)', text: 'var(--tx3)', tx: 'var(--tx)', violet: '#9b7bff', mag: '#dc4fc4',
  s: ['var(--cy)', 'var(--am)', 'var(--pos)', '#9b7bff', 'var(--neg)', '#dc4fc4'],
}

export const I = icon
export const T = (id, s = 36, st) => crest(id, s, st)
export const portr = portrait
export { uid } from './art.js'
export { court, fullCourt, radar, spark, lineChart, barChart, donut, ring, arena, courtLines, heatColor, ratingClass }

export const rt = (v, cls = '') => `<span class="rt ${ratingClass(v)} ${cls}">${v}</span>`
import { top } from './data2.js'
export const rt10 = (v, cls = '') => `<span class="rt ${ratingClass(v * 10)} ${cls}">${v.toFixed(1)}</span>`
export const topChip = (p) => { const t = top(p); return `<span class="topc"><small>${t.n}</small>${rt(t.v)}</span>` }
export const topBlock = (p) => { const t = top(p); return `<div class="stack tight" style="align-items:flex-end;text-align:right"><span class="lbl">Mejor atributo</span><b style="line-height:1.1">${t.n}</b>${rt(t.v, 'big')}</div>` }
export const posPill = (p) => `<span class="pill-pos">${p}</span>`
export const chip = (t, tone = '', ic = '') => `<span class="chip ${tone}">${ic ? I(ic, 13) : ''}${t}</span>`
export const btn = (t, o = {}) => `<button class="btn ${o.primary ? 'primary' : ''} ${o.cyan ? 'cyan' : ''} ${o.ghost ? 'ghost' : ''} ${o.sm ? 'small' : ''}">${o.icon ? I(o.icon, o.sm ? 14 : 16) : ''}${t}</button>`
export const seg = (items, active) => `<div class="seg">${items.map((x) => `<b class="${x === active ? 'active' : ''}">${x}</b>`).join('')}</div>`
export const bar = (v, o = {}) => `<div class="bar ${o.cls || ''}" style="${o.h ? `height:${o.h}px` : ''}"><i style="width:${Math.max(0, Math.min(100, v))}%;${o.color ? `background:${o.color}` : ''}"></i></div>`
export const callout = (text, o = {}) => `<div class="callout ${o.tone || ''}">${I(o.icon || 'bolt', 16)}<div>${text}</div></div>`
export const slider = (v, lo = 0, hi = 100) => `<div class="slider"><i style="width:${((v - lo) / (hi - lo)) * 100}%"></i><u style="left:${((v - lo) / (hi - lo)) * 100}%"></u></div>`

export function card(title, body, o = {}) {
  const { sub = '', ic = '', cls = '', span = '', right = '', style = '', bodyCls = '' } = o
  return `<section class="card ${cls} ${span}" style="${style}">${title !== null ? `<header class="card-h"><div class="card-t">${ic ? I(ic, 16) : ''}<div><h3>${title}</h3>${sub ? `<div class="card-s">${sub}</div>` : ''}</div></div>${right || '<span class="more">' + I('more', 18) + '</span>'}</header>` : ''}<div class="card-b ${bodyCls}">${body}</div></section>`
}

export function kpi(label, value, o = {}) {
  const { unit = '', delta = '', tone = '', sub = '', cls = '', sp = '' } = o
  return `<div class="kpi ${cls}"><div class="kpi-l">${label}</div><div class="kpi-v num">${value}${unit ? `<small>${unit}</small>` : ''}${sp ? `<span style="margin-left:auto;color:var(--${tone === 'neg' ? 'neg' : 'cy'})">${sp}</span>` : ''}</div>${delta ? `<div class="kpi-d ${tone}">${tone === 'neg' ? I('down', 13) : tone === 'pos' ? I('up', 13) : ''}${delta}</div>` : ''}${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div>`
}

export function table(cols, rows, o = {}) {
  const { cls = '', sel = -1, me = -1, zones = {}, scroll = true } = o
  const head = cols.map((c) => `<th class="${c.a || ''} ${c.h === 'm' ? 'c-hm' : c.h === 's' ? 'c-hs' : ''}" ${c.w || c.mw ? `style="${c.w ? `width:${c.w};` : ''}${c.mw ? `--mw:${c.mw}` : ''}"` : ''}>${c.t}</th>`).join('')
  const body = rows.map((r, i) => `<tr class="${i === sel ? 'sel' : ''} ${i === me ? 'me' : ''} ${zones[i] ? 'zone-' + zones[i] : ''}">${cols.map((c, k) => `<td class="${c.a || ''} ${c.h === 'm' ? 'c-hm' : c.h === 's' ? 'c-hs' : ''}">${typeof r[k] === 'function' ? r[k]() : r[k] ?? ''}</td>`).join('')}</tr>`).join('')
  const t = `<table class="tbl ${cls}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  return scroll ? `<div class="tscroll">${t}</div>` : t
}

export const pcell = (p, o = {}) => `<div class="pcell">${portrait(p, o.s || 34, { team: o.team || 'DO', number: false, round: true })}<div class="grow"><div class="trunc" style="font-weight:700">${p.n}</div>${o.sub !== false ? `<div class="trunc note">${o.subText ?? `${p.pos} · ${p.age} años`}</div>` : ''}</div></div>`
export const teamCell = (id, o = {}) => `<div class="pcell">${crest(id, o.s || 26)}<div class="trunc" style="font-weight:700">${TEAMS[id].name}</div></div>`

export const tabsHtml = (tabs, active) => `<nav class="tabs" aria-label="Subsecciones">${tabs.map((t) => `<a class="tab ${t.id === active ? 'active' : ''}">${t.label}</a>`).join('')}</nav>`

export const formDots = (s) => `<span class="row gap-s">${[...s].map((c) => `<i style="width:9px;height:9px;border-radius:50%;background:var(--${c === 'W' ? 'pos' : 'neg'});display:inline-block"></i>`).join('')}</span>`
export const wl = (s) => `<span class="row gap-s">${[...s].map((c) => `<b style="width:20px;height:20px;border-radius:5px;display:grid;place-items:center;font-size:10.5px;color:#fff;background:var(--${c === 'W' ? 'pos' : 'neg'})">${c === 'W' ? 'V' : 'D'}</b>`).join('')}</span>`

export const duel = (l, label, r, lv = l, rv = r) => `<div class="duel"><b class="num ${lv >= rv ? 'warn' : ''}">${l}</b><div style="display:flex;flex-direction:column;gap:4px"><div class="lbl center" style="font-size:10px">${label}</div><div style="display:flex;gap:3px"><div class="bar" style="flex:1;transform:scaleX(-1)"><i style="width:${lv}%"></i></div><div class="bar" style="flex:1"><i style="width:${rv}%;background:var(--cy)"></i></div></div></div><b class="num right ${rv > lv ? 'cy' : ''}">${r}</b></div>`

export const heatCourt = (o = {}) => court({ line: 'rgba(255,255,255,.55)', lineOp: 0.8, rim: '#ffb454', ...o })
export { tierOf }
