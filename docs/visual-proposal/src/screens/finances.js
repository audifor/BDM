import { topChip, I, T, card, kpi, table, rt, chip, btn, bar, seg, portr, spark, lineChart, barChart, ring, donut, radar, P, callout, slider } from '../ui.js'
import { PLAYERS, MONTHS } from '../data.js'

export const tabs = [
  { id: 'resumen', label: 'Resumen' }, { id: 'caja', label: 'Flujo de caja' }, { id: 'presupuesto', label: 'Presupuesto' }, { id: 'ingresos', label: 'Ingresos' },
  { id: 'costes', label: 'Costes' }, { id: 'nomina', label: 'Nómina' }, { id: 'deuda', label: 'Deuda y capital' }, { id: 'competicion', label: 'Competición' },
  { id: 'regulacion', label: 'Regulación' }, { id: 'prevision', label: 'Previsión' }, { id: 'salud', label: 'Salud' }, { id: 'valoracion', label: 'Valoración' },
  { id: 'ia', label: 'Finance AI' }, { id: 'cap', label: 'Tope salarial' },
]

export function render(tab, dir) {
  const B = dir === 'b'
  const fn = { resumen, caja, presupuesto, ingresos, costes, nomina, deuda, competicion, regulacion, prevision, salud, valoracion, ia, cap }[tab]
  return { eyebrow: 'Gestión del club · Finanzas', title: 'Finanzas', sub: 'Dunmere Orbits · a fecha 14 DIC 2032 · cifras en M€', cont: 'Partido', right: `${seg(['EUR', 'USD'], 'EUR')}${btn('Exportar', { icon: 'doc' })}`, ...fn(B) }
}

const M12 = ['OCT', 'NOV', 'DIC', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN']
const chartOpts = { grid: P.grid, text: P.text }
const kp = (l, v, o) => card(null, kpi(l, v, o), { span: 's3 k' })

function resumen(B) {
  const k = `${kp('Caja', '18.4', { unit: 'M€', delta: '+0.8 M€ mes', tone: 'pos' })}${kp('Resultado operativo', '+2.1', { unit: 'M€', delta: 'vs +1.4 previsto', tone: 'pos' })}${kp('Presupuesto ejecutado', '63', { unit: '%', sub: '8 de 12 meses' })}${kp('Valoración indicativa', '210', { unit: 'M€', delta: '+6.2%', tone: 'pos' })}`
  const cash = card('Evolución de la caja', lineChart([{ v: [12, 13.1, 13.6, 14.9, 15.4, 16.8, 17.6, 18.4] }, { v: [12, 12.8, 13.4, 14.2, 15, 15.9, 16.8, 17.7], color: 'var(--tx3)', dash: true, dots: false }], ['MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'DIC'], { ...chartOpts, w: 720, h: 250, min: 10, max: 20, ticks: 5, fmt: (v) => v }), { span: 's8', ic: 'finances', sub: 'Real vs presupuesto (discontinua)' })
  const sig = card('Señales objetivas', `<div class="stack" style="gap:10px">${callout('Sin incumplimientos regulatorios registrados.', { tone: 'cy', icon: 'shield' })}${callout('La masa salarial usa el <b>84%</b> del tope.', { icon: 'bolt' })}${callout('Sin señales de estrés financiero.', { tone: 'cy', icon: 'heart' })}<div class="note">Caja, resultado, presupuesto y valoración son medidas distintas.</div></div>`, { span: 's4', ic: 'bell' })
  const rc = card('Ingresos vs costes', barChart([3.1, 2.8, 3.4, 3.0, 2.9, 3.2, 3.5, 3.1].map((v) => v), M12.slice(0, 8), { stack: [[1.9, 1.8, 2.1, 1.9, 1.8, 2.0, 2.1, 1.9], [1.2, 1.0, 1.3, 1.1, 1.1, 1.2, 1.4, 1.2]], stackColors: ['var(--cy)', 'var(--am)'], ...chartOpts, h: 220, w: 600, max: 4, ticks: 4 }), { span: 's6', ic: 'swap' })
  const dist = card('Distribución de costes', `<div class="row" style="gap:20px"><div style="width:150px;flex:none">${donut([{ v: 9.2, color: P.cy }, { v: 3.1, color: P.am }, { v: 2.4, color: P.pos }, { v: 1.6, color: '#9b7bff' }, { v: 6.2, color: 'var(--tx3)' }], { size: 150, thick: 20, center: '22.5', sub: 'M€', text: 'var(--tx)' })}</div><div class="stack tight grow">${[['Salarios', '9.2', P.cy], ['Instalaciones', '3.1', P.am], ['Administración', '2.4', P.pos], ['Staff', '1.6', '#9b7bff'], ['Otros', '6.2', 'var(--tx3)']].map(([a, b, c]) => `<div class="row"><i style="width:10px;height:10px;border-radius:3px;background:${c}"></i><span class="grow dim">${a}</span><b class="num">${b}</b></div>`).join('')}</div></div>`, { span: 's6', ic: 'doc' })
  return { html: `<div class="grid">${k}${cash}${sig}${rc}${dist}</div>` }
}

function caja(B) {
  const mv = [1.4, -0.6, 0.9, -1.8, 2.2, 0.4, -0.9, 1.6]
  const w = card('Flujo mensual', barChart(mv, M12.slice(0, 8), { color: 'var(--pos)', neg: 'var(--neg)', ...chartOpts, w: 760, h: 260, min: -2.5, max: 3, ticks: 4, fmt: (v) => v }), { span: 's8', ic: 'cal', sub: 'Entradas − salidas por mes (M€)' })
  const nx = card('Pagos próximos', [['Nómina diciembre', '0.77', '31 DIC'], ['Seguros y viajes', '0.31', '05 ENE'], ['Cuota de arena', '0.45', '15 ENE'], ['Cobro TV (trimestral)', '+2.10', '20 ENE', true]].map(([a, b, c, p]) => `<div class="li"><span class="chip ${p ? 'pos' : ''}" style="width:34px;height:34px;padding:0;justify-content:center;border-radius:50%">${I(p ? 'up' : 'down', 14)}</span><div class="grow"><b>${a}</b><div class="note">${c}</div></div><b class="num ${p ? 'pos' : ''}">${b} M€</b></div>`).join(''), { span: 's4', ic: 'schedule' })
  const bal = card('Saldo acumulado', lineChart([{ v: [12, 13.4, 12.8, 13.7, 11.9, 14.1, 14.5, 13.6, 15.2] }], ['SEP', ...M12.slice(0, 8)], { ...chartOpts, h: 200, w: 700, min: 10, max: 17, ticks: 3 }), { span: 's12', ic: 'finances' })
  return { html: `<div class="grid">${w}${nx}${bal}</div>` }
}

function presupuesto(B) {
  const rows = [['Plantilla (salarios)', 9.6, 9.2], ['Staff técnico', 1.8, 1.6], ['Instalaciones', 3.4, 3.1], ['Scouting y academia', 1.5, 1.2], ['Viajes y logística', 1.7, 1.4], ['Marketing', 0.9, 0.5]]
  const list = card('Presupuesto anual por partida', `<div class="stack" style="gap:16px">${rows.map(([a, p, g]) => `<div><div class="row between"><b>${a}</b><span class="num dim">${g.toFixed(1)} / ${p.toFixed(1)} M€ · <b class="${g / p > 0.95 ? 'warn' : 'pos'}">${Math.round((g / p) * 100)}%</b></span></div>${bar((g / p) * 100, { cls: g / p > 0.95 ? '' : 'cy', h: 9 })}</div>`).join('')}</div>`, { span: 's8', ic: 'doc' })
  const adj = card('Reasignar presupuesto', `<div class="stack" style="gap:14px"><div class="note">Mueve fondos entre partidas sin superar el total aprobado por la directiva (19.4 M€).</div>${[['Scouting y academia', 60], ['Marketing', 30], ['Instalaciones', 78]].map(([a, v]) => `<div><div class="row between"><span>${a}</span><b class="num cy">${v}%</b></div>${slider(v)}</div>`).join('')}${btn('Proponer a la directiva', { primary: true })}</div>`, { span: 's4', ic: 'cog' })
  return { html: `<div class="grid">${list}${adj}</div>` }
}

function ingresos(B) {
  const don = card('Fuentes de ingreso', `<div class="row" style="gap:22px;flex-wrap:wrap"><div style="width:190px;flex:none">${donut([{ v: 7.2, color: P.cy }, { v: 8.4, color: P.am }, { v: 6.1, color: P.pos }, { v: 2.0, color: '#9b7bff' }, { v: 0.9, color: '#dc4fc4' }], { size: 190, thick: 26, center: '24.6', sub: 'M€ TOTAL', text: 'var(--tx)' })}</div><div class="stack tight grow" style="min-width:200px">${[['Entradas', 7.2, P.cy], ['Derechos de TV', 8.4, P.am], ['Patrocinio', 6.1, P.pos], ['Merchandising', 2.0, '#9b7bff'], ['Premios', 0.9, '#dc4fc4']].map(([a, v, c]) => `<div class="row" style="gap:10px"><i style="width:10px;height:10px;border-radius:3px;background:${c}"></i><span class="grow">${a}</span><div style="width:90px">${bar((v / 8.4) * 100, { h: 5, color: c })}</div><b class="num" style="width:50px;text-align:right">${v}</b></div>`).join('')}</div></div>`, { span: 's5', ic: 'finances' })
  const mo = card('Ingresos mensuales', barChart([2.1, 2.0, 2.4, 2.2, 2.3, 2.1, 2.6, 2.4], M12.slice(0, 8), { stack: [[0.7, 0.6, 0.9, 0.8, 0.8, 0.7, 0.9, 0.8], [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8], [0.6, 0.6, 0.7, 0.6, 0.7, 0.6, 0.9, 0.8]], stackColors: ['var(--cy)', 'var(--am)', 'var(--pos)'], ...chartOpts, h: 230, w: 640, max: 3, ticks: 3 }), { span: 's7', ic: 'cal' })
  const sp = card('Patrocinadores', `<div class="cols3">${[['Nova Energy', 'Camiseta', '2.4 M€', 'Hasta 2034'], ['Halcyon Bank', 'Arena', '1.9 M€', 'Hasta 2033'], ['Pulse Sports', 'Equipación', '1.8 M€', 'Hasta 2035']].map(([a, b, c, d]) => `<div class="card inset" style="padding:16px;border-radius:16px;gap:6px"><div class="lbl">${b}</div><div class="h3">${a}</div><div class="kpi-v" style="font-size:26px">${c}</div><div class="note">${d}</div></div>`).join('')}</div>`, { span: 's12', ic: 'star' })
  return { html: `<div class="grid">${don}${mo}${sp}</div>` }
}

function costes(B) {
  const st = card('Costes mensuales por categoría', barChart([2.7, 2.6, 2.8, 2.7, 2.8, 2.7, 3.0, 2.8], M12.slice(0, 8), { stack: [[1.15, 1.15, 1.15, 1.15, 1.15, 1.15, 1.15, 1.15], [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4], [0.5, 0.4, 0.6, 0.5, 0.6, 0.5, 0.7, 0.6], [0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.75, 0.65]], stackColors: ['var(--cy)', 'var(--am)', 'var(--pos)', '#9b7bff'], ...chartOpts, h: 260, w: 740, max: 3.5, ticks: 7 }), { span: 's8', ic: 'doc', sub: 'Salarios · staff · viajes · resto' })
  const rows = [['Salarios jugadores', '9.2', '41%', 'pos'], ['Staff técnico', '1.6', '7%', ''], ['Instalaciones', '3.1', '14%', 'am'], ['Viajes', '1.4', '6%', ''], ['Academia', '1.2', '5%', ''], ['Administración', '2.4', '11%', ''], ['Otros', '3.6', '16%', '']].map(([a, b, c, t]) => [`<b>${a}</b>`, `<span class="num">${b}</span>`, `<span class="num dim">${c}</span>`, chip(t === 'am' ? 'Al alza' : t === 'pos' ? 'Estable' : 'Estable', t)])
  const t = card('Detalle', table([{ t: 'Partida' }, { t: 'M€', a: 'r' }, { t: '%', a: 'r' }, { t: 'Tendencia' }], rows, { cls: 'tight' }), { span: 's4', cls: 'flush', ic: 'finances' })
  return { html: `<div class="grid">${st}${t}</div>` }
}

function nomina(B) {
  const rows = [...PLAYERS].sort((a, b) => b.wage - a.wage).map((p) => [`<div class="pcell">${portr(p, 32, { team: 'DO', round: true, number: false })}<b>${p.n}</b></div>`, `<b class="num">${p.wage.toFixed(2)}</b>`, `<div style="width:130px">${bar((p.wage / 2.4) * 100, { h: 6, cls: 'cy' })}</div>`, `<span class="num dim">${2032 + p.yrs}</span>`, topChip(p), `<span class="num">${((p.wage / 9.2) * 100).toFixed(0)}%</span>`])
  const t = card('Nómina de jugadores', table([{ t: 'Jugador' }, { t: 'M€/año', a: 'r' }, { t: 'Peso', h: 'm' }, { t: 'Hasta', a: 'r', h: 's' }, { t: 'Mejor atributo', h: 'm' }, { t: '% masa', a: 'r', h: 's' }], rows, { cls: 'tight' }), { span: 's8', cls: 'flush', ic: 'roster' })
  const g = `<div class="s4 stack">${card('Masa salarial', `<div class="stack" style="gap:10px"><div class="kpi big"><div class="kpi-l">Total</div><div class="kpi-v">9.2<small>M€ de 11.0</small></div></div>${bar(84, { h: 10 })}<div class="note">1.8 M€ de margen bajo el tope</div></div>`, { ic: 'finances' })}${card('Eficiencia salarial', `<div class="stack tight">${[['Bren Istra', '+34%', 'pos'], ['Bren Farrow', '+28%', 'pos'], ['Arel Dain', '−6%', 'neg']].map(([a, v, t]) => `<div class="row between"><span>${a}</span><b class="${t}">${v}</b></div>`).join('')}<div class="note">Valor aportado frente al salario</div></div>`, { ic: 'bolt' })}</div>`
  return { html: `<div class="grid">${t}${g}</div>` }
}

function deuda(B) {
  const loans = [['Préstamo de arena', '4.0 M€', '3.1 %', '2036', 62], ['Línea de circulante', '1.5 M€', '4.5 %', '2033', 30], ['Préstamo de la propiedad', '0.5 M€', '0 %', '2034', 80]]
  const l = card('Obligaciones vigentes', `<div class="stack" style="gap:14px">${loans.map(([a, b, c, d, v]) => `<div class="card inset" style="padding:14px 16px;border-radius:16px"><div class="row between"><b>${a}</b><b class="num">${b}</b></div><div class="row between note"><span>Interés ${c} · vence ${d}</span><span>Amortizado ${v}%</span></div>${bar(v, { cls: 'cy', h: 7 })}</div>`).join('')}</div>`, { span: 's6', ic: 'doc' })
  const am = card('Calendario de amortización', barChart([0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.7], ['33', '34', '35', '36', '37', '38', '39'], { color: 'var(--am)', ...chartOpts, h: 200, w: 480, max: 1.2, ticks: 3 }), { span: 's6', ic: 'cal', sub: 'Deuda 6.0 M€ · servicio 0.9 M€/año' })
  const k = `${kp('Deuda total', '6.0', { unit: 'M€' })}${kp('Deuda / ingresos', '24', { unit: '%', delta: 'Saludable', tone: 'pos' })}${kp('Cobertura de intereses', '9.8', { unit: '×' })}${kp('Capital aportado', '12.0', { unit: 'M€', sub: 'Propiedad · 2030' })}`
  return { html: `<div class="grid">${k}${l}${am}</div>` }
}

function competicion(B) {
  const rows = [['Virelia Horizon League', 'Liga regular', '3.2 M€', '8.4 M€', 'Reparto TV igualitario'], ['VHL Playoffs', 'Eliminatoria', '1.4 M€', '2.0 M€', 'Por ronda superada'], ['Copa Orbit', 'Copa', '0.4 M€', '0.9 M€', 'Premio al campeón']].map(([a, b, c, d, e]) => [`<b>${a}</b>`, b, `<span class="num">${c}</span>`, `<span class="num">${d}</span>`, `<span class="dim">${e}</span>`])
  const t = card('Ingresos por competición', table([{ t: 'Competición' }, { t: 'Fase', h: 's' }, { t: 'Premios', a: 'r' }, { t: 'Derechos', a: 'r' }, { t: 'Regla', h: 'm' }], rows), { span: 's8', cls: 'flush', ic: 'trophy' })
  const pr = card('Premios por posición', `<div class="stack tight">${[['Campeón', '1.8 M€'], ['Finalista', '1.1 M€'], ['Semifinales', '0.6 M€'], ['Eliminado en 1ª ronda', '0.2 M€']].map(([a, b], i) => `<div class="li"><span class="chip ${i === 0 ? 'am' : ''}" style="width:30px;height:30px;padding:0;justify-content:center;border-radius:50%">${i + 1}</span><b class="grow">${a}</b><b class="num">${b}</b></div>`).join('')}</div>`, { span: 's4', ic: 'star' })
  const proj = card('Impacto de clasificar a playoffs', `${callout('Terminar entre los 4 primeros añade <b>+2.2 M€</b> estimados (premios, taquilla y patrocinio variable).', { tone: 'cy', icon: 'up' })}`, { span: 's12' })
  return { html: `<div class="grid">${t}${pr}${proj}</div>` }
}

function regulacion(B) {
  const rules = [['Tope salarial (soft cap)', 'Usado 84% · margen 1.8 M€', 'pos', 84], ['Impuesto de lujo', 'No aplicable · umbral 13.0 M€', 'pos', 71], ['Equilibrio presupuestario', 'Resultado +2.1 M€ ≥ 0', 'pos', 100], ['Límite de deuda / ingresos', '24% · máximo 60%', 'pos', 40], ['Contratos máx. a 5 años', '1 contrato en el límite', 'am', 100]]
  const list = card('Reglas de la competición', `<div class="stack tight">${rules.map(([a, b, t, v]) => `<div class="li" style="align-items:flex-start"><span class="chip ${t}" style="width:34px;height:34px;padding:0;justify-content:center;border-radius:50%">${I(t === 'pos' ? 'shield' : 'bolt', 16)}</span><div class="grow"><b>${a}</b><div class="note">${b}</div><div style="margin-top:6px">${bar(v, { cls: t === 'am' ? '' : 'pos', h: 6 })}</div></div>${chip(t === 'pos' ? 'Cumple' : 'Vigilar', t)}</div>`).join('')}</div>`, { span: 's8', ic: 'shield' })
  const br = card('Incumplimientos', `<div class="stack" style="align-items:center;gap:10px;text-align:center;padding:10px 0"><span class="chip pos" style="width:64px;height:64px;padding:0;justify-content:center;border-radius:50%">${I('shield', 30)}</span><div class="h3">Sin incumplimientos</div><div class="note">Última auditoría: 01 DIC 2032</div></div>`, { span: 's4', ic: 'bell' })
  return { html: `<div class="grid">${list}${br}</div>` }
}

function prevision(B) {
  const ch = card('Caja a 12 meses', lineChart([{ v: [18.4, 19.0, 19.8, 20.9, 21.6, 22.8, 23.9, 24.8], color: 'var(--cy)' }, { v: [18.4, 19.4, 20.6, 22.1, 23.4, 25.0, 26.8, 28.4], color: 'var(--pos)', dash: true, dots: false }, { v: [18.4, 18.7, 19.0, 19.6, 19.8, 20.4, 20.8, 21.2], color: 'var(--neg)', dash: true, dots: false }], ['DIC', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL'], { ...chartOpts, w: 760, h: 270, min: 16, max: 30, ticks: 4, area: false }), { span: 's8', ic: 'flame', sub: 'Base · optimista (clasifica a playoffs) · pesimista' })
  const as = card('Supuestos', `<div class="stack" style="gap:14px">${[['Asistencia media', 82], ['Rendimiento deportivo', 64], ['Crecimiento de patrocinio', 35]].map(([a, v]) => `<div><div class="row between"><span>${a}</span><b class="num cy">${v}%</b></div>${slider(v)}</div>`).join('')}<div class="row gap-s wrap">${chip('● Base', 'cy')}${chip('● Optimista', 'pos')}${chip('● Pesimista', 'neg')}</div></div>`, { span: 's4', ic: 'cog' })
  const k = `${kp('Caja final (base)', '24.8', { unit: 'M€' })}${kp('Optimista', '28.4', { unit: 'M€', tone: 'pos' })}${kp('Pesimista', '21.2', { unit: 'M€', tone: 'neg' })}${kp('Prob. de déficit', '8', { unit: '%' })}`
  return { html: `<div class="grid">${ch}${as}${k}</div>` }
}

function salud(B) {
  const ind = [['Liquidez', 88], ['Solvencia', 82], ['Rentabilidad', 70], ['Dependencia de ingresos', 58], ['Control de costes', 76], ['Cumplimiento', 96]]
  const sc = card('Puntuación de salud', `<div class="stack" style="align-items:center;gap:10px;text-align:center"><div style="width:170px">${ring(78, { size: 170, thick: 16, color: P.cy, label: '78' })}</div><div class="h2">Saludable</div><div class="note">Clasificación según política versionada 2.1</div></div>`, { span: 's4', ic: 'heart' })
  const rd = card('Indicadores', `<div style="max-width:380px;margin:auto">${radar(ind.map((x) => x[1]), ind.map((x) => x[0].split(' ')[0].slice(0, 6).toUpperCase()), { size: 320, stroke: P.cy, fill: 'color-mix(in srgb,var(--cy) 22%,transparent)', grid: P.grid, text: P.text, fs: 10 })}</div>`, { span: 's4', ic: 'target' })
  const list = card('Detalle', `<div class="stack tight">${ind.map(([a, v]) => `<div><div class="row between"><span>${a}</span>${rt(v)}</div>${bar(v, { cls: v < 65 ? '' : 'cy', h: 5 })}</div>`).join('')}</div>`, { span: 's4', ic: 'doc' })
  return { html: `<div class="grid">${sc}${rd}${list}</div>` }
}

function valoracion(B) {
  const parts = [['Marca y fans', 62], ['Plantilla', 58], ['Instalaciones', 36], ['Contratos y derechos', 44], ['Caja neta', 12.4]]
  const wf = card('Composición de la valoración', barChart(parts.map((x) => x[1]), parts.map((x) => x[0].split(' ')[0]), { colors: ['var(--cy)', 'var(--am)', 'var(--pos)', '#9b7bff', 'var(--tx3)'], ...chartOpts, h: 250, w: 640, max: 70, ticks: 5, fmt: (v) => v }), { span: 's7', ic: 'finances', sub: 'Total ≈ 210 M€ · rango 186 – 238 M€' })
  const as = card('Supuestos (indicativos)', table([{ t: 'Supuesto' }, { t: 'Valor', a: 'r' }], [['Múltiplo de ingresos', '8.5×'], ['Crecimiento previsto', '+4.0 %'], ['Tasa de descuento', '9.5 %'], ['Prima de marca', '+12 %']].map(([a, b]) => [a, `<b class="num">${b}</b>`]), { cls: 'tight' }), { span: 's5', cls: 'flush', ic: 'cog' })
  const tr = card('Histórico', lineChart([{ v: [150, 158, 167, 176, 188, 198, 210] }], ['30', '31', '32', '33', '34', '35', '36'].map((x) => '20' + x), { ...chartOpts, h: 190, w: 720, min: 140, max: 220, ticks: 4 }), { span: 's12', ic: 'up' })
  return { html: `<div class="grid">${wf}${as}${tr}</div>` }
}

function ia(B) {
  const recs = [['Renegociar el patrocinio de arena', '+0.6 M€/año', 'Alta', 'cy'], ['Aplazar la ampliación del gimnasio 6 meses', 'Libera 1.1 M€', 'Media', 'am'], ['Extender a Bren Istra antes de enero', 'Evita +1.2 M€ de coste', 'Alta', 'cy'], ['Reducir viajes con transporte compartido', '+0.2 M€/año', 'Baja', '']]
  const list = card('Recomendaciones del asesor financiero', `<div class="stack tight">${recs.map(([a, b, c, t]) => `<div class="li" style="align-items:flex-start"><span class="chip ${t}" style="width:34px;height:34px;padding:0;justify-content:center;border-radius:10px">${I('bolt', 16)}</span><div class="grow"><b>${a}</b><div class="note">Impacto estimado: ${b} · confianza ${c}</div></div>${btn('Simular', { sm: true })}</div>`).join('')}</div>`, { span: 's7', ic: 'bolt' })
  const sand = card('Simulador «qué pasa si»', `<div class="stack" style="gap:14px"><div class="note">Ajusta una decisión y ve el efecto sobre la caja a fin de temporada.</div>${[['Subir precio de entradas', 20], ['Fichar un alero (1.2 M€)', 100], ['Ampliar academia', 50]].map(([a, v]) => `<div><div class="row between"><span>${a}</span><b class="num cy">${v}%</b></div>${slider(v)}</div>`).join('')}<div class="cols2">${kpi('Caja a junio', '23.1', { unit: 'M€', delta: '−1.7 vs base', tone: 'neg' })}${kpi('Playoffs', '+6', { unit: 'pp', tone: 'pos' })}</div></div>`, { span: 's5', ic: 'cog' })
  return { html: `<div class="grid">${list}${sand}</div>` }
}

function cap(B) {
  const gauge = card('Espacio bajo el tope', `<div class="stack" style="gap:14px"><div class="kpi big"><div class="kpi-l">Espacio disponible</div><div class="kpi-v">1.8<small>M€</small></div></div><div style="position:relative;height:30px;border-radius:99px;background:var(--track);overflow:hidden"><i style="position:absolute;left:0;width:84%;top:0;bottom:0;background:linear-gradient(90deg,var(--cy),var(--am))"></i><i style="position:absolute;left:84%;width:2px;top:0;bottom:0;background:var(--tx)"></i></div><div class="row between note"><span>0</span><span>Masa 9.2</span><span>Tope 11.0</span><span>Impuesto 13.0</span></div></div>`, { span: 's7', ic: 'finances' })
  const ex = card('Excepciones disponibles', `<div class="stack tight">${[['Excepción de nivel medio', '2.0 M€', true], ['Excepción de veterano', '0.4 M€', true], ['Excepción de rookie', '0.9 M€', false]].map(([a, b, on]) => `<div class="li"><span class="chip ${on ? 'cy' : ''}" style="width:30px;height:30px;padding:0;justify-content:center;border-radius:50%">${I(on ? 'star' : 'lock', 14)}</span><b class="grow">${a}</b><b class="num">${b}</b>${chip(on ? 'Disponible' : 'Usada', on ? 'pos' : '')}</div>`).join('')}</div>`, { span: 's5', ic: 'star' })
  const fut = card('Compromisos por temporada', barChart([9.2, 8.1, 6.4, 4.2, 2.4], ['32-33', '33-34', '34-35', '35-36', '36-37'], { color: 'var(--cy)', ...chartOpts, h: 220, w: 700, max: 12, ticks: 4 }), { span: 's12', ic: 'cal', sub: 'Masa comprometida vs tope 11.0 M€' })
  return { html: `<div class="grid">${gauge}${ex}${fut}</div>` }
}
