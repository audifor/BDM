import { rt10, topChip, topBlock, I, T, card, kpi, table, rt, chip, btn, bar, seg, posPill, portr, radar, spark, lineChart, barChart, ring, donut, court, heatColor, P, callout, duel, wl } from '../ui.js'
import { PLAYERS, TEAMS, ATTRS, RESULTS } from '../data.js'
import { grp, GRP_KEYS, skills, top } from '../data2.js'

export const tabs = [
  { id: 'overview', label: 'Resumen' }, { id: 'attributes', label: 'Atributos' }, { id: 'performance', label: 'Rendimiento' },
  { id: 'development', label: 'Desarrollo' }, { id: 'contract', label: 'Contrato' }, { id: 'medical', label: 'Médico' },
  { id: 'scouting', label: 'Informe técnico' }, { id: 'compare', label: 'Comparar' }, { id: 'history', label: 'Historial' },
]
const p = PLAYERS[8]
const g = grp(p)
const SKILLS = skills(p)

function band(B) {
  const st = (l, v, tone = '') => `<div class="kpi"><div class="kpi-l">${l}</div><div class="kpi-v" style="font-size:${B ? 30 : 20}px;${tone ? `color:var(--${tone})` : ''}">${v}</div></div>`
  return `<section class="card ${B ? 'hero' : ''}" style="${B ? 'background:var(--s1)' : ''}"><div class="card-b" style="padding:${B ? '18px 22px' : '14px 18px'};display:flex;gap:${B ? 24 : 18}px;align-items:center;flex-wrap:wrap">
    ${portr(p, B ? 124 : 92, { team: 'DO' })}
    <div class="stack tight" style="min-width:150px"><div class="row gap-s wrap">${posPill(p.pos)}${T('DO', 22)}<span class="note">Dunmere Orbits</span></div><div class="row" style="gap:14px;margin-top:4px"><div><div class="lbl">Perfil derivado</div><b style="font-size:${B ? 24 : 17}px">${p.role}</b></div>${topBlock(p)}</div></div>
    <div class="vr only-wide"></div>
    <div class="grow" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:14px 22px;min-width:260px">${st('Disponibilidad', 'Disponible', 'pos')}${st('Condición', '100')}${st('Moral', 'Estable')}${st('Fatiga', '0 / 100')}${st('Riesgo', 'Bajo · 6%', 'pos')}${st('Agudeza', 'Alta')}</div>
  </div></section>`
}
const head = (right) => ({ eyebrow: 'Dunmere Orbits · #23 · PF', title: 'Bren Istra', sub: '19 años · 208 cm · 104 kg · Virelia · pie derecho', right: right ?? `${btn('Plan de partido', { primary: true })}${btn('Hablar', { icon: 'mail' })}`, band: '' })

export function render(tab, dir) {
  const B = dir === 'b'
  const fn = { overview, attributes, performance, development, contract, medical, scouting, compare, history }[tab]
  const out = fn(B)
  return { ...head(), ...out, band: band(B), html: out.html }
}

const skillRows = (list) => list.map(([k, n, v]) => `<div class="row" style="gap:12px;padding:7px 0"><span class="grow trunc" style="font-weight:600">${n}</span><div style="width:34%;min-width:80px">${bar(v, { h: 7, color: `var(--rc-${v >= 85 ? 'e' : v >= 72 ? 'g' : v >= 58 ? 'm' : v >= 45 ? 'a' : 'p'})` })}</div>${rt(v)}</div>`).join('')

const heatBase = { rim: 0.95, paint: 0.8, midL: 0.35, midR: 0.42, midTop: 0.5, cornerL: 0.3, cornerR: 0.55, wingL: 0.4, wingR: 0.52, top3: 0.62 }
const heatText = { rim: '71%', paint: '58%', midL: '38%', midR: '43%', midTop: '47%', cornerL: '33%', cornerR: '41%', wingL: '36%', wingR: '39%', top3: '38%' }

function overview(B) {
  const rd = card('Perfil de atributos', `<div class="stack" style="gap:12px"><div style="max-width:340px;margin:0 auto;width:100%">${radar(GRP_KEYS.map((k) => g[k]), GRP_KEYS.map((k) => k.slice(0, 3).toUpperCase()), { size: 280, stroke: P.cy, fill: 'color-mix(in srgb,var(--cy) 22%,transparent)', grid: P.grid, text: P.text })}</div><div class="row between"><div><div class="lbl">Perfil de posición</div><div class="h2">PF · Cuarto abierto</div></div>${chip('Derivado de ratings', '')}</div><div class="stack tight">${['Finalización en el aro', 'Rebote ofensivo', 'Tiro de tres'].map((s, i) => `<div class="row" style="gap:8px"><i style="width:7px;height:7px;background:var(--am);border-radius:2px"></i>${s}</div>`).join('')}</div></div>`, { span: 's4', ic: 'player', style: 'align-self:stretch' })
  const sk = card('Todas las habilidades', `<div class="tscroll" style="max-height:470px;overflow:auto">${skillRows([...SKILLS].sort((a, b) => b[2] - a[2]).slice(0, 14))}</div>`, { span: 's5', ic: 'bolt', sub: 'Ordenadas por valor · pulsa una para ver su detalle', style: 'align-self:stretch' })
  const sv = (n) => SKILLS.find((x) => x[1] === n)[2]
  const det = card('Detalle de rating', `<div class="stack" style="gap:12px"><div class="lbl cy">Tiro</div><div class="h2">Tiro de tres</div><div class="row" style="gap:16px;align-items:flex-end">${rt(sv('Tiro de tres'), 'xl')}<div class="stack tight"><div class="lbl">Rango de categoría</div><b>1º de 4 en Tiro</b><div class="note">Top 8% de la liga en su posición</div></div></div><div class="hr"></div><div class="lbl">Relacionadas</div>${['Tiro de media distancia', 'Tiro libre', 'Contestar tiro'].map((a) => `<div class="row between"><span class="dim">${a}</span>${rt(sv(a))}</div>`).join('')}<div class="hr"></div><div class="lbl">Tendencia 12 meses</div>${spark([76, 78, 79, 82, 84, 86, 87, 89], { w: 260, h: 44, stroke: 'currentColor', fill: 'currentColor' })}</div>`, { span: 's3', cls: 'amber', ic: 'target', style: 'align-self:stretch' })
  const sea = card('Rendimiento de temporada', `<div class="cols3" style="row-gap:14px">${kpi('Puntos', '21.6', { delta: '+3.2 vs 31-32', tone: 'pos' })}${kpi('Rebotes', '9.4')}${kpi('Asistencias', '3.3')}${kpi('TS%', '61.8', { unit: '%' })}${kpi('PER', '24.1')}${kpi('+/-', '+8.4', { tone: 'pos' })}</div><div class="hr" style="margin:14px 0"></div><div class="lbl">Puesto en la liga</div>${[['Puntos', '3º', 86], ['Rebotes', '1º', 98], ['Valoración', '2º', 92]].map(([a, r, v]) => `<div class="row" style="gap:12px;padding:5px 0"><span style="width:84px">${a}</span><div class="grow">${bar(v, { cls: 'cy', h: 6 })}</div><b class="num" style="width:30px;text-align:right">${r}</b></div>`).join('')}`, { span: 's4', ic: 'trophy', sub: 'Virelia Horizon League · 18 PJ' })
  const form = card('Forma reciente', `<div class="stack"><div class="row between"><span class="lbl">Valoración por partido</span><b class="num">8.6 media</b></div>${barChart(p.form, ['−6', '−5', '−4', '−3', '−2', '−1', 'Hoy'].map((x, i) => ['LF', 'GS', 'BS', 'IV', 'AK', 'JS', 'GS'][i]), { colors: p.form.map((v) => (v >= 8.5 ? 'var(--cy)' : v >= 7.5 ? 'var(--pos)' : 'var(--am)')), min: 5, max: 10, grid: P.grid, text: P.text, w: 420, h: 200, ticks: 5 })}</div>`, { span: 's4', ic: 'flame' })
  const shot = card('Perfil de tiro', `<div class="court-wrap" style="max-width:430px;margin:auto">${court({ heat: heatBase, zoneLabels: true, zoneText: heatText, line: 'rgba(255,255,255,.7)', lineOp: 0.8, heatPal: B ? 'warm' : 'hot' })}</div><div class="row gap-s" style="margin-top:8px"><span class="note">Frío</span><div class="grow" style="height:6px;border-radius:9px;background:linear-gradient(90deg,${heatColor(0, B ? 'warm' : 'hot')},${heatColor(0.5, B ? 'warm' : 'hot')},${heatColor(1, B ? 'warm' : 'hot')})"></div><span class="note">Caliente</span></div>`, { span: 's4', ic: 'target', sub: '% de acierto por zona · 312 tiros' })
  return { html: `<div class="grid">${rd}${sk}${det}${sea}${form}${shot}</div>` }
}

function attributes(B) {
  const cat = Object.entries(ATTRS).map(([k, arr]) => {
    const rows = skills(p).filter((s) => s[0] === k)
    const avg = Math.round(rows.reduce((s, r) => s + r[2], 0) / rows.length)
    return card(k, skillRows(rows), { span: 's4', right: rt(avg, 'big'), sub: `Media de categoría` })
  }).join('')
  const meas = card('Medidas físicas', `<div class="cols4">${kpi('Altura', '208', { unit: 'cm' })}${kpi('Envergadura', '221', { unit: 'cm' })}${kpi('Peso', '104', { unit: 'kg' })}${kpi('Salto vertical', '86', { unit: 'cm' })}</div>`, { span: 's7', ic: 'bolt' })
  const roles = card('Roles recomendados', `<div class="stack" style="gap:12px">${[['Cuarto abierto', 92], ['Ala-pívot rematador', 84], ['Pívot móvil', 71]].map(([a, v]) => `<div><div class="row between"><b>${a}</b><span class="num dim">${v}% encaje</span></div>${bar(v, { cls: 'cy' })}</div>`).join('')}</div>`, { span: 's5', ic: 'tactics' })
  return { html: `<div class="grid">${cat}${meas}${roles}</div>` }
}

function performance(B) {
  const k = ['Puntos', 'Rebotes', 'Asistencias', 'TS%', 'PER', '+/-'].map((l, i) => card(null, kpi(l, ['21.6', '9.4', '3.3', '61.8%', '24.1', '+8.4'][i], { delta: ['+3.2', '+1.1', '+0.6', '+2.4', '+3.0', '+2.2'][i] + ' vs 31-32', tone: 'pos', sp: spark([5, 6, 6, 7, 8, 7, 9].map((x) => x + i), { w: 80, h: 28, stroke: 'currentColor', fill: 'currentColor', dot: false }) }), { span: 's2', style: 'grid-column:span 2' })).join('')
  const trend = card('Evolución de la valoración', lineChart([{ v: [6.8, 7.2, 7.0, 7.9, 8.1, 7.6, 8.4, 8.2, 8.8, 8.5, 9.0, 8.4, 8.9, 8.6, 9.1, 8.2, 8.6, 9.0] }, { v: Array(18).fill(7.1), color: 'var(--tx3)', dash: true, dots: false }], Array.from({ length: 18 }, (_, i) => i + 1), { grid: P.grid, text: P.text, h: 240, w: 720, min: 6, max: 10, ticks: 4 }), { span: 's8', ic: 'flame', sub: 'Por jornada · línea discontinua = media de la liga en su puesto' })
  const shot = card('Mapa de tiro', `<div class="court-wrap">${court({ heat: heatBase, zoneLabels: true, zoneText: heatText, line: 'rgba(255,255,255,.7)', heatPal: B ? 'warm' : 'hot' })}</div>`, { span: 's4', ic: 'target' })
  const log = RESULTS.map((r, i) => [`<span class="num dim">${r.d}</span>`, `<div class="pcell">${T(r.opp, 22)}<b>${r.home ? 'vs' : '@'} ${TEAMS[r.opp].short}</b></div>`, `<b class="${r.w ? 'pos' : 'neg'}">${r.w ? 'V' : 'D'} ${r.s[0]}-${r.s[1]}</b>`, `<span class="num">${[34, 31, 36, 33, 35][i]}</span>`, `<b class="num">${[26, 19, 24, 22, 31][i]}</b>`, `<span class="num">${[11, 9, 12, 8, 13][i]}</span>`, `<span class="num">${[4, 2, 5, 3, 3][i]}</span>`, `<span class="num">${['10/18', '7/15', '9/16', '8/17', '12/19'][i]}</span>`, rt10([8.8, 7.6, 8.4, 7.9, 9.1][i])])
  const logt = card('Registro de partidos', table([{ t: 'Fecha' }, { t: 'Rival' }, { t: 'Resultado' }, { t: 'Min', a: 'r', h: 's' }, { t: 'Pts', a: 'r' }, { t: 'Reb', a: 'r' }, { t: 'Ast', a: 'r', h: 's' }, { t: 'TC', a: 'r', h: 'm' }, { t: 'Val', a: 'c' }], log, { cls: 'tight' }), { span: 's12', cls: 'flush', ic: 'doc' })
  return { html: `<div class="grid">${k}${trend}${shot}${logt}</div>` }
}

function development(B) {
  const cur = grp(p)
  const ceil = { Tiro: [88, 94], Ataque: [90, 96], Creación: [80, 88], Defensa: [82, 90], Físico: [92, 97], Mental: [74, 86] }
  const curve = card('Evolución de atributos por edad', `<div class="stack"><div class="row gap-s wrap">${chip('● Tiro', 'cy')}${chip('● Físico', 'am')}${chip('● Mental', 'pos')}${chip('┅ Proyección del staff', '')}</div>${lineChart([{ v: [58, 66, 74, 81, 84, 86, 87], color: 'var(--cy)', dash: true, dots: false }, { v: [56, 64, 72, 80, 85, 88, 90], color: 'var(--am)', dash: true, dots: false }, { v: [40, 48, 58, 66, 72, 76, 79], color: 'var(--pos)', dash: true, dots: false }, { v: [58, 66, 74, 81], color: 'var(--cy)' }, { v: [56, 64, 72, 80], color: 'var(--am)' }, { v: [40, 48, 58, 66], color: 'var(--pos)' }], ['16', '17', '18', '19', '20', '21', '22'], { grid: P.grid, text: P.text, h: 250, w: 720, min: 30, max: 100, ticks: 7, area: false })}</div>`, { span: 's8', ic: 'up', sub: 'Media de atributos por grupo y edad' })
  const pot = card('Techo estimado', `<div class="stack" style="gap:12px"><div class="row between"><b>Trayectoria alta</b>${chip('Confianza 86%', 'cy')}</div>${GRP_KEYS.map((k) => `<div><div class="row between"><span>${k}</span><span class="num dim">${cur[k]} → ${ceil[k][0]}–${ceil[k][1]}</span></div><div class="bar" style="height:8px;position:relative"><i style="width:${cur[k]}%"></i><i style="position:absolute;left:${ceil[k][0]}%;width:${ceil[k][1] - ceil[k][0]}%;top:0;bottom:0;background:var(--cy);opacity:.55"></i></div></div>`).join('')}<div class="note">Estimación del scout con rango; no es un valor fijo.</div></div>`, { span: 's4', ic: 'star' })
  const changes = card('Cambios de atributos esta temporada', `<div class="stack">${[['Tiro de tres', 71, 79], ['Primer paso', 72, 78], ['Resistencia', 70, 76], ['Defensa interior', 49, 52], ['Tiro libre', 66, 63]].map(([a, x, y]) => `<div class="li"><b class="grow">${a}</b><span class="num dim">${x}</span><span class="muted">→</span>${rt(y)}<b class="num ${y >= x ? 'pos' : 'neg'}" style="width:44px;text-align:right">${y >= x ? '+' : ''}${y - x}</b></div>`).join('')}</div>`, { span: 's6', ic: 'bolt' })
  const plan = card('Plan de desarrollo', `<div class="stack" style="gap:14px"><div class="row between"><b>Foco individual: Tiro exterior</b>${chip('Intensidad alta', 'am')}</div>${bar(72, { cls: 'cy', h: 8 })}<div class="note">Elio Brandt · 3 sesiones por semana · progreso 72%</div><div class="hr"></div><div class="row" style="gap:12px">${I('users', 18)}<div class="grow"><b>Mentoría con Jora Corven</b><div class="note">Veterano · liderazgo y profesionalidad</div></div>${chip('Activa', 'pos')}</div>${callout('Estímulo de desarrollo: partidos de alta exigencia aceleran la progresión +12%.', { tone: 'cy', icon: 'flame' })}</div>`, { span: 's6', ic: 'training' })
  return { html: `<div class="grid">${curve}${pot}${changes}${plan}</div>` }
}

function contract(B) {
  const yrs = ['32-33', '33-34', '34-35', '35-36', '36-37']
  const main = card('Contrato vigente', `<div class="stack" style="gap:14px"><div class="kpi big"><div class="kpi-l">Salario anual</div><div class="kpi-v">2.4<small>M€ / año</small></div></div><div class="cols2">${kpi('Vence', '2037', { sub: '5 años restantes' })}${kpi('Valor total', '12.0', { unit: 'M€' })}</div><div class="hr"></div><div class="stack tight">${[['Cláusula de rescisión', '9.0 M€'], ['Opción de equipo', 'Año 5'], ['Bonus por objetivos', '0.3 M€'], ['Bonus de renovación', '0.5 M€']].map(([a, b]) => `<div class="row between"><span class="dim">${a}</span><b class="num">${b}</b></div>`).join('')}</div></div>`, { span: 's4', ic: 'doc', cls: B ? 'lime' : '' })
  const tl = card('Calendario salarial', barChart([2.4, 2.6, 2.9, 3.2, 3.6], yrs, { stack: [[2.0, 2.2, 2.4, 2.6, 2.9], [0.4, 0.4, 0.5, 0.6, 0.7]], stackColors: ['var(--cy)', 'var(--am)'], grid: P.grid, text: P.text, w: 720, h: 250, min: 0, max: 5, ticks: 5, fmt: (v) => v + 'M' }), { span: 's8', ic: 'cal', sub: 'Base + bonus esperados por temporada' })
  const mv = card('Valor de mercado', `<div class="stack" style="gap:12px"><div class="row" style="gap:16px"><div class="kpi big"><div class="kpi-l">Estimación</div><div class="kpi-v">19.5<small>M€</small></div></div><div class="grow"></div>${spark([6, 8, 9, 12, 14, 17, 19.5], { w: 140, h: 50, stroke: 'var(--pos)', fill: 'var(--pos)' })}</div><div class="callout cy">${I('star', 16)}<div>Valor ×1.6 desde septiembre. Considera ofrecer extensión antes de enero.</div></div></div>`, { span: 's4', ic: 'finances' })
  const rows = [['Renovación 5 años', '3.1 M€', '+0.7 M€', 'Probable', 'pos'], ['Renovación 3 años', '2.8 M€', '+0.4 M€', 'Posible', 'am'], ['Subida salarial inmediata', '2.9 M€', '—', 'Rechazaría', 'neg']].map(([a, b, c, d, t]) => [`<b>${a}</b>`, `<span class="num">${b}</span>`, `<span class="num dim">${c}</span>`, chip(d, t)])
  const neg = card('Negociación', table([{ t: 'Propuesta' }, { t: 'Salario', a: 'r' }, { t: 'Diferencia', a: 'r', h: 's' }, { t: 'Respuesta del agente' }], rows, { cls: 'tight' }) + `<div class="row gap-s" style="padding:12px 16px">${btn('Abrir negociación', { primary: true, sm: true })}${btn('Pedir valoración', { sm: true })}</div>`, { span: 's8', cls: 'flush', ic: 'swap' })
  return { html: `<div class="grid">${main}${tl}${mv}${neg}</div>` }
}

function bodyMap() {
  const z = (x, y, c, l, side) => `<g><circle cx="${x}" cy="${y}" r="13" fill="${c}" fill-opacity=".3" stroke="${c}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="4.500" fill="${c}"/>${l ? `<text x="${side === 'l' ? x - 20 : x + 20}" y="${y + 4}" text-anchor="${side === 'l' ? 'end' : 'start'}" font-size="11.500" font-weight="700" fill="var(--tx2)" font-family="GT America Standard, Inter Tight, sans-serif">${l}</text>` : ''}</g>`
  const arm = 'M62 84C44 90 38 112 36 138L30 182C29 192 41 194 43 184L53 142C56 128 60 112 66 100Z'
  const leg = 'M70 216H99L97 304 94 392C94 404 72 404 74 392L75 304Z'
  return `<svg viewBox="0 0 280 420" width="100%" style="max-width:320px;margin:auto" role="img" aria-label="Mapa corporal"><defs><linearGradient id="bm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--s3)"/><stop offset="1" stop-color="var(--s2)"/></linearGradient></defs>
  <g transform="translate(40 0)" fill="url(#bm)" stroke="var(--line2)" stroke-width="2" stroke-linejoin="round"><ellipse cx="100" cy="36" rx="19" ry="23"/><rect x="91" y="56" width="18" height="18" rx="5"/>
  <path d="M62 80Q100 66 138 80L146 124Q142 160 134 190L130 218H70L66 190Q58 160 54 124Z"/>
  <path d="${arm}"/><path d="${arm}" transform="translate(200 0) scale(-1 1)"/>
  <path d="${leg}"/><path d="${leg}" transform="translate(200 0) scale(-1 1)"/></g>
  <g transform="translate(40 0)"><path d="M100 76v140" stroke="var(--line2)" stroke-dasharray="3 5" fill="none"/>
  ${z(100, 66, 'var(--pos)', 'Cuello', 'r')}${z(64, 92, 'var(--pos)', 'Hombro I', 'l')}${z(136, 92, 'var(--am)', 'Hombro D', 'r')}${z(100, 150, 'var(--pos)', 'Core', 'r')}${z(84, 250, 'var(--pos)', 'Muslo I', 'l')}${z(116, 250, 'var(--am)', 'Muslo D', 'r')}${z(84, 316, 'var(--pos)', 'Rodilla I', 'l')}${z(116, 316, 'var(--pos)', 'Rodilla D', 'r')}${z(86, 392, 'var(--pos)', 'Tobillo I', 'l')}${z(114, 392, 'var(--neg)', 'Tobillo D', 'r')}</g></svg>`
}

function medical(B) {
  const body = card('Mapa corporal', `${bodyMap()}<div class="row gap-s wrap" style="justify-content:center;margin-top:6px">${chip('● Sano', 'pos')}${chip('● Vigilar', 'am')}${chip('● Riesgo', 'neg')}</div>`, { span: 's4', ic: 'medical' })
  const kp = card('Estado físico', `<div class="stack" style="gap:14px"><div class="cols3" style="text-align:center">${[['Condición', 100, P.pos], ['Fatiga', 12, P.cy], ['Riesgo', 6, P.am]].map(([l, v, c]) => `<div class="stack tight" style="align-items:center"><div style="width:84px">${ring(v, { size: 84, thick: 9, color: c })}</div><div class="lbl">${l}</div></div>`).join('')}</div><div class="hr"></div><div class="row between"><span class="dim">Carga acumulada 28 días</span><b>Óptima</b></div>${bar(64, { cls: 'pos', h: 7 })}<div class="row between"><span class="dim">Minutos últimos 7 días</span><b>112 / 130</b></div>${bar(86, { h: 7 })}<div class="hr"></div><div class="lbl">Disponibilidad próximos 7 días</div><div class="row" style="gap:6px">${['MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM', 'LUN', 'MAR'].map((d, i) => `<div class="stack tight" style="align-items:center;flex:1"><div style="height:34px;width:100%;border-radius:8px;background:var(--${i === 3 ? 'am' : 'pos'});opacity:.85"></div><span class="note">${d}</span></div>`).join('')}</div></div>`, { span: 's12', ic: 'heart' })
  const plan = card('Recomendaciones del Dr. Sethi', `<div class="stack" style="gap:10px">${callout('Vigilar el <b>tobillo derecho</b>: antecedente de esguince. Aplicar protocolo preventivo.', { tone: 'neg', icon: 'medical' })}${callout('Limitar a <b>34 min</b> en partidos con descanso corto.', { icon: 'bolt' })}${callout('Sesión de movilidad antes de cada entrenamiento.', { tone: 'cy', icon: 'training' })}</div>`, { span: 's12', ic: 'doc' })
  const load = card('Carga de trabajo', lineChart([{ v: [62, 70, 74, 68, 78, 82, 72, 76], color: 'var(--cy)' }, { v: [60, 62, 64, 64, 66, 66, 68, 68], color: 'var(--tx3)', dash: true, dots: false }], ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'], { grid: P.grid, text: P.text, h: 230, w: 700, min: 50, max: 90, ticks: 4 }), { span: 's8', ic: 'flame', sub: 'Carga semanal vs. umbral de seguridad (discontinua)' })
  const hist = card('Historial de lesiones', [['Esguince de tobillo D', 'Feb 2031', '12 días'], ['Contusión muscular', 'Nov 2030', '5 días']].map(([a, b, c]) => `<div class="li"><span class="chip neg" style="width:30px;height:30px;padding:0;justify-content:center;border-radius:50%">${I('medical', 14)}</span><div class="grow"><b>${a}</b><div class="note">${b}</div></div><b class="num">${c}</b></div>`).join(''), { span: 's4', ic: 'cal' })
  return { html: `<div class="grid">${body}<div class="s8 stack">${kp}${plan}</div>${load}${hist}</div>` }
}

function scouting(B) {
  const ranges = [['Tiro', 78, 86], ['Ataque', 82, 90], ['Creación', 74, 82], ['Defensa', 80, 88], ['Físico', 88, 94], ['Mental', 66, 76]]
  const rg = card('Valoración por categoría', `<div class="stack" style="gap:16px">${ranges.map(([k, a, b]) => `<div><div class="row between"><b>${k}</b><span class="num dim">${a} – ${b}</span></div><div class="bar" style="height:10px;position:relative"><i style="position:absolute;left:${a}%;width:${b - a}%;background:var(--cy)"></i></div></div>`).join('')}<div class="note">La barra muestra el rango estimado; cuanto más estrecho, más fiable.</div></div>`, { span: 's7', ic: 'scouting', sub: 'Fiabilidad del informe 82% · 24 visionados' })
  const sum = card('Veredicto del scout', `<div class="stack" style="gap:12px"><div class="row" style="gap:12px">${portr({ ...PLAYERS[0], n: 'Cass Ortega', skin: 4, id: 3 }, 52, { team: 'DO', number: false, round: true })}<div><b>Cass Ortega</b><div class="note">Scout · 12 dic · nota 80</div></div></div><div class="h2">Ala-pívot moderno con techo de superestrella</div><p class="dim" style="line-height:1.5">Combina físico de élite con una evolución del tiro exterior sin precedentes en su edad. La toma de decisiones bajo presión y la profesionalidad son los puntos a vigilar.</p><div class="row gap-s wrap">${chip('Prioridad A', 'cy')}${chip('Intocable', 'am')}${chip('Proyecto de franquicia', '')}</div></div>`, { span: 's5', ic: 'doc' })
  const sw = card('Fortalezas y dudas', `<div class="cols2"><div class="stack tight"><div class="lbl pos">Fortalezas</div>${['Explosividad y envergadura', 'Tiro de tres en progresión', 'Rebote ofensivo élite'].map((s) => `<div class="row" style="gap:8px">${I('up', 14)}${s}</div>`).join('')}</div><div class="stack tight"><div class="lbl neg">Dudas</div>${['Profesionalidad baja (35)', 'Defensa interior inconsistente', 'Tiro libre por debajo de su nivel'].map((s) => `<div class="row" style="gap:8px">${I('down', 14)}${s}</div>`).join('')}</div></div>`, { span: 's6', ic: 'shield' })
  const comp = card('Se parece a…', `<div class="stack">${[['Kael Vasquez', 'PF · Brimford Stars', 88], ['Dorian Ness', 'PF · retirado', 81], ['Ilya Marek', 'SF · Ashvale Kites', 74]].map(([a, b, v]) => `<div class="li"><div class="grow"><b>${a}</b><div class="note">${b}</div></div><div style="width:90px">${bar(v, { cls: 'cy' })}</div><b class="num">${v}%</b></div>`).join('')}</div>`, { span: 's6', ic: 'users' })
  return { html: `<div class="grid">${rg}${sum}${sw}${comp}</div>` }
}

const rival = { id: 20, n: 'Kael Vasquez', pos: 'PF', age: 23, num: 11, skin: 2, seed: 79, role: 'Pívot móvil' }
function compare(B) {
  const A = GRP_KEYS.map((k) => g[k]); const gr2 = grp(rival); const R = GRP_KEYS.map((k) => gr2[k])
  const pick = (pl, c, t) => `<div class="card inset" style="padding:14px;flex:1"><div class="row" style="gap:12px">${portr(pl, 64, { team: t })}<div class="grow"><div class="h3">${pl.n}</div><div class="note">${pl.pos} · ${pl.age} años · ${TEAMS[t].name}</div></div>${topBlock(pl)}</div></div>`
  const top = card('Comparativa', `<div class="row wrap" style="gap:12px;align-items:stretch">${pick(p, 0, 'DO')}<div style="align-self:center" class="h2">VS</div>${pick(rival, 0, 'BS')}</div>`, { span: 's12', ic: 'swap', right: seg(['Temporada', 'Carrera', 'Por 36 min'], 'Temporada') })
  const rd = card('Radar superpuesto', `<div style="max-width:380px;margin:auto">${radar(A, GRP_KEYS.map((k) => k.slice(0, 3).toUpperCase()), { size: 300, cmp: R, stroke: P.cy, fill: 'color-mix(in srgb,var(--cy) 22%,transparent)', cmpStroke: 'var(--am)', grid: P.grid, text: P.text })}</div><div class="row gap-s" style="justify-content:center">${chip('● Bren Istra', 'cy')}${chip('┅ Kael Vasquez', 'am')}</div>`, { span: 's5', ic: 'player' })
  const rows = GRP_KEYS.map((k, i) => `<div style="padding:7px 0">${duel(A[i], k, R[i], A[i], R[i])}</div>`).join('') + [['Puntos', 21.6, 23.4], ['Rebotes', 9.4, 7.1], ['Asistencias', 3.3, 4.2]].map(([k, a, b]) => `<div style="padding:7px 0">${duel(a, k, b, (a / 30) * 100, (b / 30) * 100)}</div>`).join('')
  const det = card('Cara a cara', rows, { span: 's7', ic: 'target' })
  const verdict = card('Lectura del cuerpo técnico', `${callout('<b>Istra</b> es superior en físico y rebote; <b>Vasquez</b> aventaja en ataque estructurado y creación. En un duelo directo, apostar por la velocidad de Istra en transición.', { tone: 'cy', icon: 'bolt' })}`, { span: 's12' })
  return { html: `<div class="grid">${top}${rd}${det}${verdict}</div>` }
}

function history(B) {
  const rows = [['2030-31', 'Academia Dunmere', 'U19', 12, 14.2, 6.8, 1.9, 6.9], ['2031-32', 'Dunmere Orbits', 'VHL', 54, 18.4, 8.3, 2.8, 7.6], ['2032-33', 'Dunmere Orbits', 'VHL', 18, 21.6, 9.4, 3.3, 8.5]].map(([a, b, c, d, e, f, g2, o]) => [`<b>${a}</b>`, `<div class="pcell">${T(b.includes('Academia') ? 'DO' : 'DO', 22)}${b}</div>`, c, `<span class="num">${d}</span>`, `<b class="num">${e}</b>`, `<span class="num">${f}</span>`, `<span class="num">${g2}</span>`, rt10(o)])
  const tb = card('Trayectoria', table([{ t: 'Temporada' }, { t: 'Club' }, { t: 'Liga', h: 's' }, { t: 'PJ', a: 'r' }, { t: 'Pts', a: 'r' }, { t: 'Reb', a: 'r' }, { t: 'Ast', a: 'r', h: 's' }, { t: 'Val', a: 'c' }], rows), { span: 's8', cls: 'flush', ic: 'doc' })
  const aw = card('Premios', [['Novato del mes', 'Nov 2032', 'star'], ['Quinteto joven', '2031-32', 'trophy'], ['MVP Copa Orbit', '2031', 'trophy']].map(([a, b, ic]) => `<div class="li"><span class="chip am" style="width:34px;height:34px;padding:0;justify-content:center;border-radius:50%">${I(ic, 16)}</span><div class="grow"><b>${a}</b><div class="note">${b}</div></div></div>`).join(''), { span: 's4', ic: 'trophy' })
  const tl = card('Línea de tiempo', `<div class="stack" style="gap:0">${[['Sep 2032', 'Récord personal: 34 puntos vs Glimmerport'], ['Jun 2032', 'Renovación hasta 2037'], ['Oct 2031', 'Debut profesional con Orbits'], ['Sep 2030', 'Ingresa en la academia de Dunmere']].map(([a, b], i) => `<div class="row" style="gap:14px;align-items:flex-start"><div class="stack" style="align-items:center;align-self:stretch"><span class="tl-dot"></span>${i < 3 ? '<i style="width:2px;flex:1;background:var(--line2);margin:4px 0"></i>' : ''}</div><div style="padding-bottom:16px"><div class="lbl">${a}</div><div>${b}</div></div></div>`).join('')}</div>`, { span: 's6', ic: 'cal' })
  const hi = card('Máximos de carrera', `<div class="cols3" style="row-gap:16px">${kpi('Puntos', '34')}${kpi('Rebotes', '17')}${kpi('Asistencias', '9')}${kpi('Triples', '7')}${kpi('Robos', '5')}${kpi('Tapones', '4')}</div>`, { span: 's6', ic: 'star' })
  return { html: `<div class="grid">${tb}${aw}${tl}${hi}</div>` }
}
