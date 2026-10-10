import { TEAMS } from './data.js'

let _uid = 0
export const uid = (p = 'u') => `${p}${++_uid}`

/* ───────── Iconos (trazo 1.6, 24px) ───────── */
const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5.5h4V20"/>',
  roster: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.4-3.6 3-5.6 6-5.6s5.6 2 6 5.6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17 14.2c2.4.3 3.9 2 4.2 4.8"/>',
  player: '<circle cx="12" cy="7.5" r="3.6"/><path d="M5 21c.5-4.4 3.4-7 7-7s6.5 2.6 7 7"/>',
  tactics: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/><circle cx="12" cy="12" r="2.8"/><path d="M3 9h3.5v6H3M21 9h-3.5v6H21"/>',
  match: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5v17"/><path d="M6 6.2c2.6 2.4 2.6 9.2 0 11.6M18 6.2c-2.6 2.4-2.6 9.2 0 11.6"/>',
  schedule: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M12 14h2M8 17h2"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 14v4M8.5 20h7"/>',
  training: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
  staff: '<rect x="3.5" y="8" width="17" height="11.5" rx="2"/><path d="M8.5 8V6a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 6v2M3.5 13h17"/>',
  finances: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.2c-.6-.8-1.6-1.2-2.7-1.2-1.5 0-2.6.8-2.6 2 0 3 5.4 1.6 5.4 4.4 0 1.2-1.2 2-2.8 2-1.2 0-2.3-.5-2.9-1.4M12 6.5V8m0 8v1.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Z"/><path d="M10 21h4"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  play: '<path d="M8 5.5v13l11-6.5-11-6.5Z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  medical: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 8v8M8 12h8"/>',
  scouting: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5M8 10.5h5M10.5 8v5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .2 1.4.8 2 1.6 2.2C10 8 10.5 5.5 12 3Z"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l9-11h-6l0-7Z"/>',
  shield: '<path d="M12 3 5 6v6c0 4.2 3 7.2 7 9 4-1.8 7-4.8 7-9V6l-7-3Z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  pin: '<path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  doc: '<path d="M6 3.5h8l4 4V20.5H6V3.5Z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>',
  star: '<path d="m12 3.8 2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L12 16.6 6.9 19.4 8 13.7 3.8 9.8l5.7-.7L12 3.8Z"/>',
  diamond: '<path d="M12 2.800 21.200 12 12 21.200 2.800 12Z"/><path d="M12 7.400 16.600 12 12 16.600 7.400 12Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  building: '<rect x="4" y="3.500" width="11" height="17" rx="1.500"/><path d="M15 9h5v11.500h-5M8 8h3M8 12h3M8 16h3"/>',
  news: '<rect x="3.500" y="4.500" width="17" height="15" rx="2"/><path d="M7 9h6M7 12.500h10M7 16h10"/>',
  target: '<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="4.500"/><circle cx="12" cy="12" r="1"/>',
  graduation: '<path d="m2.500 9.500 9.500-4.500 9.500 4.500L12 14Z"/><path d="M6.500 11.500v4.500c1.500 1.500 3.500 2.200 5.500 2.200s4-.7 5.500-2.200v-4.500"/>',
  users: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 19c.4-3.2 2.8-5 6-5s5.6 1.8 6 5M16 14.5c2.4 0 4.4 1.4 5 4.5"/>',
}
export const icon = (name, size = 20, sw = 1.6) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.more}</svg>`

/* ───────── Escudos ───────── */
export function crest(id, size = 40, style = 'shield') {
  const t = TEAMS[id]; const g = uid('cg')
  const initials = t.id
  const shape = style === 'round'
    ? `<circle cx="32" cy="32" r="29" fill="url(#${g})" stroke="${t.c2}" stroke-width="2.5"/>`
    : `<path d="M32 3 56 10v21c0 14.5-10 24.5-24 30C18 55.500 8 45.500 8 31V10L32 3Z" fill="url(#${g})" stroke="${t.c2}" stroke-width="2.5" stroke-linejoin="round"/>`
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 64 64" aria-label="${t.name}"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${shade(t.c1, -0.32)}"/></linearGradient></defs>${shape}<path d="M12 46 52 36" stroke="${t.c2}" stroke-width="3" opacity=".6" stroke-linecap="round"/><text x="32" y="35" text-anchor="middle" font-family="Barlow Condensed, GT America Standard, sans-serif" font-weight="700" font-size="${initials.length > 2 ? 17 : 22}" fill="#fff" letter-spacing="1">${initials}</text></svg>`
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)))
  r = f(r); g = f(g); b = f(b)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/* ───────── Retratos ilustrados (sin fotos) ───────── */
const SKIN = { 1: '#f0c7a2', 2: '#deaa80', 3: '#c68a62', 4: '#9c6040', 5: '#6b4029' }
export function portrait(p, size = 72, opts = {}) {
  const { team = 'DO', round = false, number = true, bg = true } = opts
  const t = TEAMS[team]; const skin = SKIN[p.skin] || SKIN[3]
  const dark = shade(skin, -0.22); const g = uid('pg'); const cl = uid('pc')
  const hairKind = p.id % 5
  const hairC = ['#17110e', '#241812', '#0f0c0a', '#2b1d14', '#17110e'][p.id % 5]
  const hair = [
    `<path d="M33 40c-2-16 6-24 17-24s19 8 17 24c-3-7-9-10-17-10s-14 3-17 10Z" fill="${hairC}"/>`,
    `<circle cx="50" cy="31" r="22" fill="${hairC}"/>`,
    `<path d="M34 38c0-14 7-21 16-21s16 7 16 21c-4-5-9-7-16-7s-12 2-16 7Z" fill="${hairC}"/>`,
    `<path d="M35 36c1-11 7-17 15-17s14 6 15 17c-3-3-8-4-15-4s-12 1-15 4Z" fill="${hairC}" opacity=".0"/><ellipse cx="50" cy="29.500" rx="14" ry="3" fill="${hairC}" opacity=".35"/>`,
    `<path d="M33 40c-1-15 5-23 17-23s18 8 17 23c-2-6-6-9-9-10l-8-3-8 3c-4 1-7 4-9 10Z" fill="${hairC}"/>`,
  ][hairKind]
  const bgEl = bg
    ? `<rect width="100" height="120" fill="url(#${g})"/><path d="M-10 96 110 54" stroke="${t.c2}" stroke-opacity=".22" stroke-width="10"/><circle cx="82" cy="22" r="26" fill="${t.c2}" fill-opacity=".1"/>`
    : ''
  return `<svg class="portrait" width="${size}" height="${round ? size : Math.round(size * 1.2)}" viewBox="0 0 100 120" role="img" aria-label="${p.n}"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(t.c1, -0.1)}"/><stop offset="1" stop-color="${shade(t.c1, -0.62)}"/></linearGradient><clipPath id="${cl}">${round ? '<circle cx="50" cy="60" r="60"/>' : '<rect width="100" height="120"/>'}</clipPath></defs><g clip-path="url(#${cl})">${bgEl}
  <path d="M8 124c0-24 16-34 42-34s42 10 42 34Z" fill="${t.c1}"/><path d="M8 124c0-24 16-34 42-34s42 10 42 34Z" fill="url(#${g})" opacity=".35"/>
  <path d="M34 93c4 8 10 12 16 12s12-4 16-12" fill="none" stroke="${t.c2}" stroke-width="3" stroke-linecap="round"/>
  <path d="M41 76h18v16c-3 5-6 7-9 7s-6-2-9-7V76Z" fill="${dark}"/>
  <ellipse cx="50" cy="52" rx="17" ry="21" fill="${skin}"/><ellipse cx="33" cy="54" rx="3.200" ry="5" fill="${skin}"/><ellipse cx="67" cy="54" rx="3.200" ry="5" fill="${skin}"/>
  <path d="M38 64c3 9 9 12 12 12s9-3 12-12c-3 3-8 5-12 5s-9-2-12-5Z" fill="${dark}" opacity=".35"/>
  <ellipse cx="43" cy="51" rx="1.700" ry="2" fill="#1a1210" opacity=".85"/><ellipse cx="57" cy="51" rx="1.700" ry="2" fill="#1a1210" opacity=".85"/>
  <path d="M46 62q4 2.500 8 0" stroke="${dark}" stroke-width="1.600" fill="none" stroke-linecap="round"/>
  ${hair}
  ${number ? `<text x="50" y="118" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="17" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width=".6">${p.num}</text>` : ''}
  </g></svg>`
}

/* ───────── Pista (media pista, 10 px = 1 ft) ───────── */
const ARC3 = 'M30 0V140A237.500 237.500 0 0 0 470 140V0'
export function court(o = {}) {
  const { line = '#7fd3e0', lineOp = 0.9, floor = 'none', paint = 'none', heat = null, dots = [], arrows = [], labels = true, w = '100%', zoneLabels = false, rim = '#ffb454', sw = 2 } = o
  const id = uid('ct')
  const inside = `M30 0V140A237.500 237.500 0 0 0 470 140V0Z`
  const outside = `M0 0H500V470H0Z M30 0V140A237.500 237.500 0 0 0 470 140V0Z`
  let heatSvg = ''
  if (heat) {
    const h = (k) => heat[k] ?? 0
    const col = (v) => heatColor(v, o.heatPal)
    heatSvg = `<defs><clipPath id="${id}in"><path d="${inside}"/></clipPath><clipPath id="${id}out"><path d="${outside}" clip-rule="evenodd"/></clipPath></defs>
      <g clip-path="url(#${id}out)"><rect x="0" y="0" width="30" height="140" fill="${col(h('cornerL'))}"/><rect x="470" y="0" width="30" height="140" fill="${col(h('cornerR'))}"/>
      <rect x="0" y="140" width="170" height="330" fill="${col(h('wingL'))}"/><rect x="330" y="140" width="170" height="330" fill="${col(h('wingR'))}"/><rect x="170" y="140" width="160" height="330" fill="${col(h('top3'))}"/></g>
      <g clip-path="url(#${id}in)"><rect x="30" y="0" width="140" height="300" fill="${col(h('midL'))}"/><rect x="330" y="0" width="140" height="300" fill="${col(h('midR'))}"/><rect x="170" y="190" width="160" height="120" fill="${col(h('midTop'))}"/>
      <rect x="170" y="0" width="160" height="190" fill="${col(h('paint'))}"/></g>
      <circle cx="250" cy="52.500" r="40" fill="${col(h('rim'))}"/>`
    if (zoneLabels) {
      const L = (x, y, k, v) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="GT America Standard, Inter Tight, sans-serif" font-weight="700" font-size="17" fill="#fff" stroke="rgba(0,0,0,.4)" stroke-width=".5">${v}</text>`
      heatSvg += L(250, 60, 'rim', o.zoneText?.rim ?? '') + L(250, 140, 'paint', o.zoneText?.paint ?? '') + L(100, 110, 'midL', o.zoneText?.midL ?? '') + L(400, 110, 'midR', o.zoneText?.midR ?? '') + L(250, 250, 'midTop', o.zoneText?.midTop ?? '') + L(250, 380, 'top3', o.zoneText?.top3 ?? '') + L(80, 330, 'wingL', o.zoneText?.wingL ?? '') + L(420, 330, 'wingR', o.zoneText?.wingR ?? '') + L(15, 85, 'cornerL', o.zoneText?.cornerL ?? '') + L(485, 85, 'cornerR', o.zoneText?.cornerR ?? '')
    }
  }
  const lines = `<g fill="none" stroke="${line}" stroke-opacity="${lineOp}" stroke-width="${sw}" stroke-linejoin="round">
    <rect x="1" y="1" width="498" height="468" rx="2"/>
    <rect x="170" y="1" width="160" height="189" fill="${paint}"/>
    <path d="M190 1v189M310 1v189" stroke-opacity="${lineOp * 0.45}"/>
    <path d="M170 190a80 80 0 0 0 160 0" /><path d="M170 190a80 80 0 0 1 160 0" stroke-dasharray="6 7" stroke-opacity="${lineOp * 0.6}"/>
    <path d="${ARC3}"/><path d="M210 52.500a40 40 0 0 0 80 0" transform="rotate(0 250 52.500)" stroke-opacity="0"/><path d="M210 52.500a40 40 0 0 0 80 0"/>
    <path d="M220 40h60"/><circle cx="250" cy="52.500" r="7.500" stroke="${rim}" stroke-width="${sw + 0.8}"/><path d="M250 40v5" />
    <path d="M200 470a50 50 0 0 1 100 0" stroke-opacity="${lineOp * 0.7}"/>
  </g>`
  const arrowSvg = arrows.map((a) => {
    const mid = a.curve ? `Q${a.curve[0]} ${a.curve[1]} ${a.to[0]} ${a.to[1]}` : `L${a.to[0]} ${a.to[1]}`
    const mk = uid('mk')
    return `<defs><marker id="${mk}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="${a.big ? 7 : 5}" markerHeight="${a.big ? 7 : 5}" orient="auto"><path d="M0 0 10 5 0 10Z" fill="${a.color || line}"/></marker></defs><path d="M${a.from[0]} ${a.from[1]} ${mid}" fill="none" stroke="${a.color || line}" stroke-width="${a.w || 3}" stroke-linecap="round" ${a.dash ? 'stroke-dasharray="9 8"' : ''} marker-end="url(#${mk})" opacity="${a.op ?? 0.95}"/>`
  }).join('')
  const dotSvg = dots.map((d) => {
    const r = d.r || 17; const fill = d.fill || '#16d9f3'
    if (d.kind === 'shot') return `<circle cx="${d.x}" cy="${d.y}" r="${d.r || 6}" fill="${d.made ? '#48d98b' : 'none'}" stroke="${d.made ? '#48d98b' : '#e85d67'}" stroke-width="2.200" opacity=".92"/>`
    if (d.kind === 'ball') return `<circle cx="${d.x}" cy="${d.y}" r="9" fill="#ff9d3a" stroke="#7a3a00" stroke-width="2"/>`
    return `<g><circle cx="${d.x}" cy="${d.y}" r="${r}" fill="${fill}" fill-opacity="${d.fo ?? 0.95}" stroke="${d.stroke || 'rgba(255,255,255,.85)'}" stroke-width="2"/>${labels ? `<text x="${d.x}" y="${d.y + 6}" text-anchor="middle" font-family="GT America Standard, Inter Tight, sans-serif" font-weight="700" font-size="${d.fs || 14}" fill="${d.tc || '#06222a'}">${d.t ?? ''}</text>` : ''}${d.sub ? `<g><rect x="${d.x - 46}" y="${d.y + r + 4}" width="92" height="19" rx="9.500" fill="rgba(5,10,14,.78)"/><text x="${d.x}" y="${d.y + r + 18}" text-anchor="middle" font-family="GT America Standard, Inter Tight, sans-serif" font-weight="600" font-size="11" fill="#fff">${d.sub}</text></g>` : ''}</g>`
  }).join('')
  return `<svg class="court" viewBox="0 0 500 470" width="${w}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Media pista">${floor !== 'none' ? `<rect width="500" height="470" fill="${floor}"/>` : ''}${heatSvg}${lines}${arrowSvg}${dotSvg}</svg>`
}

export function heatColor(v, pal = 'cool') {
  const t = Math.max(0, Math.min(1, v))
  const stops = pal === 'warm'
    ? [[0, [30, 36, 58]], [0.35, [120, 52, 98]], [0.65, [226, 104, 62]], [1, [255, 214, 107]]]
    : pal === 'hot'
      ? [[0, [24, 40, 58]], [0.4, [22, 120, 150]], [0.7, [72, 217, 138]], [1, [255, 212, 107]]]
      : [[0, [16, 34, 46]], [0.45, [16, 120, 146]], [0.75, [22, 217, 243]], [1, [190, 255, 245]]]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1]; const [t1, c1] = stops[i]; const k = (t - t0) / (t1 - t0)
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(',')})`
    }
  }
  return 'rgb(255,255,255)'
}

/* ───────── Gráficos ───────── */
export function radar(vals, labels, o = {}) {
  const { size = 260, stroke = '#16d9f3', fill = 'rgba(22,217,243,.22)', grid = 'rgba(128,160,176,.28)', text = '#9fb0b9', cmp = null, cmpStroke = '#e6b74d', fs = 11 } = o
  const n = vals.length; const c = size / 2; const R = size / 2 - 38
  const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + Math.cos(a) * r, c + Math.sin(a) * r] }
  const ring = (k) => vals.map((_, i) => pt(i, R * k).join(',')).join(' ')
  const poly = (arr) => arr.map((v, i) => pt(i, (R * v) / 100).join(',')).join(' ')
  return `<svg class="radar" viewBox="0 0 ${size} ${size}" width="100%" role="img" aria-label="Radar de atributos">
    ${[0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${ring(k)}" fill="none" stroke="${grid}" stroke-width="1"/>`).join('')}
    ${vals.map((_, i) => `<line x1="${c}" y1="${c}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" stroke="${grid}" stroke-width="1"/>`).join('')}
    ${cmp ? `<polygon points="${poly(cmp)}" fill="rgba(230,183,77,.12)" stroke="${cmpStroke}" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
    <polygon points="${poly(vals)}" fill="${fill}" stroke="${stroke}" stroke-width="2.200" stroke-linejoin="round"/>
    ${vals.map((v, i) => `<circle cx="${pt(i, (R * v) / 100)[0]}" cy="${pt(i, (R * v) / 100)[1]}" r="3.500" fill="${stroke}"/>`).join('')}
    ${labels.map((l, i) => { const [x, y] = pt(i, R + 20); return `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="${fs}" font-weight="600" fill="${text}" font-family="GT America Standard, Inter Tight, sans-serif" letter-spacing=".04em">${l}</text>` }).join('')}
  </svg>`
}

export function spark(vals, o = {}) {
  const { w = 120, h = 32, stroke = 'currentColor', fill = 'currentColor', fo = 0.14, sw = 2, dot = true, min = null, max = null } = o
  const lo = min ?? Math.min(...vals); const hi = max ?? Math.max(...vals); const rg = hi - lo || 1
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (w - 4) + 2, h - 3 - ((v - lo) / rg) * (h - 7)])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;max-height:${h * 2}px" aria-hidden="true"><path d="${d} L${w - 2} ${h} L2 ${h}Z" fill="${fill}" opacity="${fo}"/><path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>${dot ? `<circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${stroke}"/>` : ''}</svg>`
}

export const FLUIDS = []
function fluid(fn, h) { FLUIDS.push(fn); return `<div class="fluid" data-fid="${FLUIDS.length - 1}" style="height:${h}px;width:100%"></div>` }
export function lineChart(series, labels, o = {}) {
  if (!o._r) return fluid((w) => lineChart(series, labels, { ...o, w, _r: true }), o.h || 220)
  return _lineChart(series, labels, o)
}
function _lineChart(series, labels, o = {}) {
  const { w = 640, h = 220, colors = ['#16d9f3', '#e6b74d', '#48d98b'], grid = 'rgba(128,160,176,.22)', text = '#8fa0aa', fmt = (v) => v, area = true, min = null, max = null, ticks = 4, fs = 11 } = o
  const all = series.flatMap((s) => s.v); const lo = min ?? Math.floor(Math.min(...all)); const hi = max ?? Math.ceil(Math.max(...all)); const rg = hi - lo || 1
  const L = 42, R = 12, T = 12, B = 26; const iw = w - L - R, ih = h - T - B
  const X = (i) => L + (i / (labels.length - 1)) * iw; const Y = (v) => T + ih - ((v - lo) / rg) * ih
  const gid = uid('lg')
  const gl = Array.from({ length: ticks + 1 }, (_, i) => { const v = lo + (rg * i) / ticks; return `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${grid}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="${fs}" fill="${text}" font-family="GT America Standard, Inter Tight, sans-serif">${fmt(Math.round(v * 10) / 10)}</text>` }).join('')
  const xl = labels.map((l, i) => (labels.length > 12 && i % 2 ? '' : `<text x="${X(i)}" y="${h - 6}" text-anchor="middle" font-size="${fs}" fill="${text}" font-family="GT America Standard, Inter Tight, sans-serif">${l}</text>`)).join('')
  const paths = series.map((s, k) => {
    const c = s.color || colors[k % colors.length]; const d = s.v.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')
    const dashed = s.dash ? 'stroke-dasharray="6 5"' : ''
    return `<defs><linearGradient id="${gid}${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".32"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>${area && k === 0 ? `<path d="${d} L${X(s.v.length - 1)} ${T + ih} L${X(0)} ${T + ih}Z" fill="url(#${gid}${k})"/>` : ''}<path d="${d}" fill="none" stroke="${c}" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round" ${dashed}/>${s.dots === false ? '' : s.v.map((v, i) => (i === s.v.length - 1 ? `<circle cx="${X(i)}" cy="${Y(v)}" r="4" fill="${c}"/>` : '')).join('')}`
  }).join('')
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${gl}${xl}${paths}</svg>`
}

export function barChart(vals, labels, o = {}) {
  if (!o._r) return fluid((w) => barChart(vals, labels, { ...o, w, _r: true }), o.h || 220)
  return _barChart(vals, labels, o)
}
function _barChart(vals, labels, o = {}) {
  const { w = 640, h = 220, colors = null, color = '#16d9f3', neg = '#e85d67', grid = 'rgba(128,160,176,.22)', text = '#8fa0aa', fmt = (v) => v, ticks = 4, radius = 3, fs = 11, stack = null, stackColors = [] } = o
  const L = 42, R = 8, T = 12, B = 26; const iw = w - L - R, ih = h - T - B
  const hi = o.max ?? Math.max(...(stack ? vals.map((_, i) => stack.reduce((s, row) => s + row[i], 0)) : vals.map(Math.abs))); const lo = o.min ?? Math.min(0, ...(stack ? [0] : vals))
  const rg = hi - lo || 1; const Y = (v) => T + ih - ((v - lo) / rg) * ih; const bw = (iw / vals.length) * 0.62; const X = (i) => L + (i + 0.5) * (iw / vals.length)
  const gl = Array.from({ length: ticks + 1 }, (_, i) => { const v = lo + (rg * i) / ticks; return `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${grid}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="${fs}" fill="${text}" font-family="GT America Standard, Inter Tight, sans-serif">${fmt(Math.round(v * 10) / 10)}</text>` }).join('')
  let bars = ''
  if (stack) {
    bars = vals.map((_, i) => { let acc = 0; return stack.map((row, k) => { const y0 = Y(acc), y1 = Y(acc + row[i]); acc += row[i]; return `<rect x="${X(i) - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1)}" fill="${stackColors[k]}" rx="${k === stack.length - 1 ? radius : 0}"/>` }).join('') }).join('')
  } else {
    bars = vals.map((v, i) => { const y = Y(Math.max(v, 0)); const hh = Math.abs(Y(v) - Y(0)); return `<rect x="${X(i) - bw / 2}" y="${y}" width="${bw}" height="${hh}" rx="${radius}" fill="${v < 0 ? neg : colors ? colors[i % colors.length] : color}"/>` }).join('')
  }
  const xl = labels.map((l, i) => `<text x="${X(i)}" y="${h - 6}" text-anchor="middle" font-size="${fs}" fill="${text}" font-family="GT America Standard, Inter Tight, sans-serif">${l}</text>`).join('')
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${gl}${bars}${xl}</svg>`
}

export function donut(segs, o = {}) {
  const { size = 160, thick = 22, text = '#eef4f7', sub = '', center = '' } = o
  const tot = segs.reduce((s, x) => s + x.v, 0); const r = (size - thick) / 2; const c = size / 2; const C = 2 * Math.PI * r; let off = 0
  const arcs = segs.map((s) => { const len = (s.v / tot) * C; const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thick}" stroke-dasharray="${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})"/>`; off += len; return el }).join('')
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" width="100%" role="img"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(128,160,176,.14)" stroke-width="${thick}"/>${arcs}<text x="${c}" y="${c + 2}" text-anchor="middle" font-size="${size * 0.19}" font-weight="700" fill="${text}" font-family="GT America Standard, Inter Tight, sans-serif">${center}</text><text x="${c}" y="${c + size * 0.14}" text-anchor="middle" font-size="${size * 0.075}" fill="${o.subColor || '#8fa0aa'}" font-family="GT America Standard, Inter Tight, sans-serif" letter-spacing=".08em">${sub}</text></svg>`
}

export function ring(v, o = {}) {
  const { size = 56, thick = 6, color = '#16d9f3', track = 'rgba(128,160,176,.2)', text = 'currentColor', label = null } = o
  const r = (size - thick) / 2; const C = 2 * Math.PI * r; const c = size / 2
  return `<svg class="ringv" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${track}" stroke-width="${thick}"/><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${thick}" stroke-linecap="round" stroke-dasharray="${(v / 100) * C} ${C}" transform="rotate(-90 ${c} ${c})"/><text x="${c}" y="${c + size * 0.1}" text-anchor="middle" font-size="${size * 0.3}" font-weight="700" fill="${text}" font-family="GT America Standard, Inter Tight, sans-serif">${label ?? v}</text></svg>`
}

/* ───────── Fondos / ambientes ───────── */
export function arena(c1, c2, o = {}) {
  const { w = 1200, h = 400, seed = 3 } = o; const g = uid('ar'); const f = uid('fl')
  let rnd = seed * 9301 + 49297; const R = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280 }
  const crowd = Array.from({ length: 150 }, () => { const x = R() * w; const y = h * 0.1 + R() * h * 0.45; return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1 + R() * 2.2).toFixed(1)}" fill="${R() > 0.82 ? c2 : '#fff'}" opacity="${(0.08 + R() * 0.28).toFixed(2)}"/>` }).join('')
  const lights = [0.12, 0.3, 0.5, 0.7, 0.88].map((p) => `<polygon points="${w * p - 6},${h * 0.02} ${w * p + 6},${h * 0.02} ${w * p + 120},${h} ${w * p - 120},${h}" fill="url(#${f})" opacity=".55"/><circle cx="${w * p}" cy="${h * 0.03}" r="7" fill="${c2}"/>`).join('')
  return `<svg class="arena" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c1, -0.78)}"/><stop offset=".6" stop-color="${shade(c1, -0.55)}"/><stop offset="1" stop-color="${shade(c1, -0.3)}"/></linearGradient><linearGradient id="${f}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c2}" stop-opacity=".5"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#${g})"/>${lights}${crowd}
  <path d="M0 ${h * 0.62} Q${w / 2} ${h * 0.5} ${w} ${h * 0.62} V${h} H0Z" fill="${shade(c1, -0.7)}" opacity=".85"/>
  <path d="M0 ${h * 0.7} Q${w / 2} ${h * 0.58} ${w} ${h * 0.7}" fill="none" stroke="${c2}" stroke-opacity=".5" stroke-width="2"/>
  <g stroke="${c2}" stroke-opacity=".16" fill="none">${Array.from({ length: 9 }, (_, i) => `<path d="M${w / 2 + (i - 4) * 18} ${h * 0.66} L${w / 2 + (i - 4) * 150} ${h}"/>`).join('')}</g></svg>`
}

export function courtLines(color = 'currentColor', op = 0.1) {
  return `<svg class="court-deco" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="2"><rect x="10" y="10" width="580" height="380" rx="6"/><path d="M300 10v380"/><circle cx="300" cy="200" r="64"/><path d="M10 120h110v160H10M590 120H480v160h110"/><path d="M120 150a60 60 0 0 1 0 100M480 150a60 60 0 0 0 0 100"/><path d="M10 40a200 200 0 0 1 0 320M590 40a200 200 0 0 0 0 320"/></g></svg>`
}

export const ratingClass = (v) => `rt-${v >= 85 ? 'e' : v >= 72 ? 'g' : v >= 58 ? 'm' : v >= 45 ? 'a' : 'p'}`

/* Pista completa horizontal (940x500): dos medias pistas rotadas. Las fichas se dan en coordenadas de pista completa. */
export function fullCourt(o = {}) {
  const { dots = [], arrows = [], line = '#7fd3e0', lineOp = 0.9, floor = 'none', w = '100%', rim = '#ffb454', sw = 2, trails = [] } = o
  const half = court({ line, lineOp, rim, sw, labels: false }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
  const arrowSvg = arrows.map((a) => {
    const mid = a.curve ? `Q${a.curve[0]} ${a.curve[1]} ${a.to[0]} ${a.to[1]}` : `L${a.to[0]} ${a.to[1]}`
    const mk = uid('fm')
    return `<defs><marker id="${mk}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="${a.color || line}"/></marker></defs><path d="M${a.from[0]} ${a.from[1]} ${mid}" fill="none" stroke="${a.color || line}" stroke-width="${a.w || 3}" stroke-linecap="round" ${a.dash ? 'stroke-dasharray="9 8"' : ''} marker-end="url(#${mk})" opacity="${a.op ?? 0.95}"/>`
  }).join('')
  const trailSvg = trails.map((t) => `<path d="${t.d}" fill="none" stroke="${t.color}" stroke-width="3" stroke-linecap="round" opacity=".45" stroke-dasharray="2 7"/>`).join('')
  const dotSvg = dots.map((d) => {
    if (d.kind === 'ball') return `<circle cx="${d.x}" cy="${d.y}" r="9" fill="#ff9d3a" stroke="#7a3a00" stroke-width="2"/>`
    const r = d.r || 17
    return `<g><circle cx="${d.x}" cy="${d.y}" r="${r}" fill="${d.fill}" stroke="${d.stroke || 'rgba(255,255,255,.9)'}" stroke-width="2"/><text x="${d.x}" y="${d.y + 5.500}" text-anchor="middle" font-family="GT America Standard, Inter Tight, sans-serif" font-weight="700" font-size="${d.fs || 15}" fill="${d.tc || '#fff'}">${d.t ?? ''}</text>${d.bar != null ? `<rect x="${d.x - 15}" y="${d.y + r + 4}" width="30" height="4" rx="2" fill="rgba(0,0,0,.45)"/><rect x="${d.x - 15}" y="${d.y + r + 4}" width="${30 * d.bar}" height="4" rx="2" fill="${d.bar > 0.5 ? '#48d98b' : '#ffb454'}"/>` : ''}</g>`
  }).join('')
  return `<svg class="court full" viewBox="0 0 940 500" width="${w}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Pista completa">${floor !== 'none' ? `<rect width="940" height="500" fill="${floor}"/>` : ''}<g transform="translate(0 500) rotate(-90)">${half}</g><g transform="translate(940 0) scale(-1 1)"><g transform="translate(0 500) rotate(-90)">${half}</g></g><circle cx="470" cy="250" r="60" fill="none" stroke="${line}" stroke-opacity="${lineOp}" stroke-width="${sw}"/>${trailSvg}${arrowSvg}${dotSvg}</svg>`
}
