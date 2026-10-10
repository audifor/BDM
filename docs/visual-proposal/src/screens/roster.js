import { I, card, table, rt, chip, btn, bar, seg, pcell, posPill, portr, radar, spark, P, callout, donut, barChart, topChip, topBlock } from '../ui.js'
import { PLAYERS } from '../data.js'
import { grp, GRP_KEYS, core, CORE_KEYS } from '../data2.js'

export const tabs = [{ id: 'plantilla', label: 'Plantilla' }, { id: 'profundidad', label: 'Profundidad' }, { id: 'briefing', label: 'Briefing' }]

const stDot = (p) => `<span class="dot-st" style="background:var(--${p.st === 'OK' ? 'pos' : 'neg'})" title="${p.st}"></span>`
const selected = PLAYERS[8]

function inspector(p) {
  const g = grp(p)
  return card('Jugador seleccionado', `<div class="stack" style="gap:14px"><div class="row insp-h" style="gap:14px">${portr(p, 84, { team: 'DO' })}<div class="grow"><div class="h2" style="font-size:22px">${p.n}</div><div class="row gap-s wrap" style="margin-top:6px">${posPill(p.pos)}${chip(p.age + ' años')}${chip(p.h + ' cm')}</div></div>${topBlock(p)}</div>
    <div style="max-width:300px;margin:0 auto;width:100%">${radar(GRP_KEYS.map((k) => g[k]), GRP_KEYS.map((k) => k.slice(0, 3).toUpperCase()), { size: 260, stroke: P.cy, fill: 'color-mix(in srgb,var(--cy) 22%,transparent)', grid: P.grid, text: P.text })}</div>
    <div class="cols3"><div class="kpi"><div class="kpi-l">Pts</div><div class="kpi-v">${p.pts}</div></div><div class="kpi"><div class="kpi-l">Reb</div><div class="kpi-v">${p.reb}</div></div><div class="kpi"><div class="kpi-l">Ast</div><div class="kpi-v">${p.ast}</div></div></div>
    <div class="hr"></div><div class="row between"><span class="dim">Perfil derivado</span><b>${p.role}</b></div><div class="note">Deducido de los ratings; no es un rol táctico asignado.</div>
    <div class="row gap-s wrap">${btn('Ver ficha', { primary: true, sm: true })}${btn('Ofertar', { sm: true })}${btn('Hablar', { sm: true })}</div></div>`, { span: 's3', ic: 'player' })
}

export function render(tab, dir) {
  const B = dir === 'b'
  if (tab === 'profundidad') return depth()
  if (tab === 'briefing') return briefing()
  const cols = [{ t: 'Jugador', mw: '160px' }, { t: 'Pos', a: 'c' }, { t: 'Edad', a: 'r', h: 's' }, { t: 'Rol', h: 'm' }, { t: 'Est', a: 'c', h: 's' }, ...CORE_KEYS.map((k) => ({ t: k, a: 'c', h: 'm' })), { t: 'Forma', h: 'm' }, { t: 'Contrato', a: 'r', h: 'm' }]
  const rows = PLAYERS.map((p) => {
    const c = core(p)
    return [pcell(p, { s: 38 }), posPill(p.pos), `<span class="num">${p.age}</span>`, `<span class="dim">${p.role}</span>`, stDot(p), ...CORE_KEYS.map((k) => rt(c[k])), `<div style="width:84px">${spark(p.form.map((v) => v || 5), { w: 84, h: 24, stroke: 'var(--cy)', fill: 'var(--cy)', min: 4, max: 10 })}</div>`, `<span class="num dim">${p.wage.toFixed(1)} M€ · ${p.yrs}a</span>`]
  })
  const tbl = table(cols, rows, { sel: 8, cls: 'fit' })
  const top = B
    ? `<div class="grid">${[8, 0, 3].map((i) => PLAYERS[i]).map((p, k) => `<section class="card ${k === 0 ? 'amber' : ''} s4"><div class="card-b" style="padding:18px 20px;display:flex;gap:16px;align-items:center">${portr(p, 96, { team: 'DO' })}<div class="grow"><div class="lbl">${['Estrella', 'Mejor joven', 'Anotador'][k]}</div><div class="h2">${p.n}</div><div class="note" style="color:inherit;opacity:.75">${p.pos} · ${p.age} años · ${p.pts} pts</div></div>${topBlock(p)}</div></section>`).join('')}</div>`
    : ''
  const filters = `<div class="row between wrap"><div class="row gap-s wrap">${seg(['Vista general', 'Atributos', 'Psicología', 'Contratos'], 'Vista general')}${seg(['Todos', 'PG', 'SG', 'SF', 'PF', 'C'], 'Todos')}</div><div class="row gap-s">${chip('Plantilla 12/15', 'cy')}${chip('Lesionados 1', 'neg')}${btn('Filtros', { icon: 'filter', ghost: true, sm: true })}</div></div>`
  return { eyebrow: 'Equipo · Plantilla', title: 'Plantilla', sub: 'Dunmere Orbits · 12 jugadores · edad media 24.8', right: `${btn('Añadir jugador', { icon: 'roster' })}${btn('Alineación automática', { primary: true })}`, html: `${top}${filters}<div class="grid"><div class="s9" style="min-width:0">${card(null, tbl, { cls: 'flush' })}</div>${inspector(selected)}</div>` }
}

function depth() {
  const slots = { PG: [1, 2], SG: [4, 3, 5], SF: [6, 7], PF: [9, 8, 10], C: [11, 12] }
  const cols = Object.entries(slots).map(([pos, ids]) => `<div class="stack tight" style="min-width:0"><div class="row between"><b class="lbl" style="font-size:12px">${pos}</b><span class="note">${ids.length} jug.</span></div>${ids.map((id, i) => {
    const p = PLAYERS.find((x) => x.id === id)
    return `<div class="card inset" style="padding:${i === 0 ? '14px' : '10px 12px'};border-radius:14px;${i === 0 ? 'outline:1.5px solid var(--am)' : ''}"><div class="row dc-row" style="gap:10px">${portr(p, i === 0 ? 56 : 38, { team: 'DO', round: i !== 0, number: i === 0 })}<div class="grow"><div class="trunc" style="font-weight:700">${p.n}</div><div class="note">${i === 0 ? 'Titular' : i === 1 ? 'Primer relevo' : 'Rotación'} · ${p.min} min</div></div>${topChip(p)}</div><div style="margin-top:8px">${bar(Math.min(100, p.min * 2.8), { h: 5 })}</div></div>`
  }).join('')}</div>`).join('')
  const dist = card('Reparto de minutos', barChart(PLAYERS.map((p) => p.min), PLAYERS.map((p) => p.n.split(' ')[0].slice(0, 5)), { colors: PLAYERS.map((p) => (p.min > 25 ? 'var(--am)' : 'var(--cy)')), grid: P.grid, text: P.text, h: 220, w: 640 }), { span: 's8', ic: 'training', sub: 'Minutos por partido · objetivo 240 totales' })
  const bal = card('Equilibrio posicional', `<div class="stack" style="gap:12px">${Object.entries({ PG: 82, SG: 74, SF: 55, PF: 88, C: 61 }).map(([k, v]) => `<div class="row" style="gap:12px"><b style="width:30px">${k}</b><div class="grow">${bar(v, { cls: v < 60 ? 'neg' : 'cy', h: 8 })}</div><b class="num" style="width:28px;text-align:right">${v}</b></div>`).join('')}${callout('Falta un <b>alero (SF)</b> titular: cobertura por debajo de 60.', { icon: 'bolt' })}</div>`, { span: 's4', ic: 'users' })
  return { eyebrow: 'Equipo · Plantilla', title: 'Profundidad', sub: 'Quinteto titular y rotaciones por posición', right: `${btn('Restablecer', { ghost: true })}${btn('Guardar cambios', { primary: true })}`, html: `<div class="grid"><div class="s12">${card('Mapa de profundidad', `<div class="cols5">${cols}</div>`, { ic: 'roster' })}</div>${dist}${bal}</div>` }
}

function briefing() {
  const alerts = [['neg', 'medical', 'Hira Corven (C) · lesión muscular', 'Baja 9 días · riesgo de recaída 22%'], ['am', 'doc', 'Contratos: 2 expiran en junio', 'Hira Joren (34) y Jora Corven (30)'], ['cy', 'star', 'Bren Farrow sube de rol', 'Rendimiento 7.2 · listo para quinteto'], ['am', 'flame', 'Fatiga acumulada en Arel Dain', '28.4 min · 4 partidos en 8 días']]
  const al = card('Alertas del cuerpo técnico', alerts.map(([t, ic, a, b]) => `<div class="li"><span class="chip ${t}" style="height:34px;width:34px;padding:0;justify-content:center;border-radius:50%">${I(ic, 16)}</span><div class="grow"><b>${a}</b><div class="note">${b}</div></div>${I('chevron', 16)}</div>`).join(''), { span: 's5', ic: 'bell' })
  const age = card('Estructura de edad', barChart([2, 4, 3, 1, 1, 1], ['18-19', '20-22', '23-25', '26-28', '29-31', '32+'], { color: 'var(--cy)', grid: P.grid, text: P.text, h: 200, w: 420 }), { span: 's4', sub: 'Edad media 24.8 años' })
  const wage = card('Masa salarial', `<div class="row wrap-n" style="gap:16px"><div style="width:130px;flex:none">${donut([{ v: 2.4, color: P.am }, { v: 1.1, color: P.cy }, { v: 0.9, color: P.pos }, { v: 4.8, color: '#9b7bff' }], { size: 130, thick: 18, center: '9.2', sub: 'M€', text: 'var(--tx)' })}</div><div class="stack tight grow">${[['Estrella', '2.4', P.am], ['Base', '1.1', P.cy], ['Alero', '0.9', P.pos], ['Resto', '4.8', '#9b7bff']].map(([a, b, c]) => `<div class="row"><i style="width:10px;height:10px;border-radius:3px;background:${c}"></i><span class="grow dim">${a}</span><b class="num">${b} M€</b></div>`).join('')}</div></div>`, { span: 's3' })
  const sw = card('Fortalezas y debilidades', `<div class="cols2"><div class="stack tight"><div class="lbl pos">Fortalezas</div>${[['Creación de juego', 86], ['Tiro exterior', 79], ['Rebote ofensivo', 74]].map(([a, v]) => `<div class="row between"><span>${a}</span>${rt(v)}</div>`).join('')}</div><div class="stack tight"><div class="lbl neg">Debilidades</div>${[['Defensa interior', 52], ['Banquillo en el aro', 47], ['Tiros libres', 55]].map(([a, v]) => `<div class="row between"><span>${a}</span>${rt(v)}</div>`).join('')}</div></div>`, { span: 's6', ic: 'shield' })
  const rec = card('Recomendaciones', `<div class="stack" style="gap:10px">${callout('Ofrecer extensión a <b>Bren Istra</b>: valor de mercado ×1.6 desde septiembre.', { tone: 'cy', icon: 'star' })}${callout('Buscar un <b>alero defensivo</b> en el mercado: presupuesto disponible 1.8 M€.', { icon: 'scouting' })}${callout('Reducir minutos de <b>Arel Dain</b> en el próximo partido.', { icon: 'heart' })}</div>`, { span: 's6', ic: 'bolt' })
  return { eyebrow: 'Equipo · Plantilla', title: 'Briefing de plantilla', sub: 'Resumen ejecutivo del cuerpo técnico · actualizado hoy', right: btn('Exportar PDF', { icon: 'doc' }), html: `<div class="grid">${al}${age}${wage}${sw}${rec}</div>` }
}
