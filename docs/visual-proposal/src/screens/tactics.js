import { I, T, card, kpi, table, rt, chip, btn, bar, seg, posPill, portr, spark, lineChart, barChart, ring, court, P, callout, slider } from '../ui.js'
import { PLAYERS, TEAMS } from '../data.js'
import { sk } from '../data2.js'

export const tabs = [{ id: 'pizarra', label: 'Pizarra' }, { id: 'disenador', label: 'Diseñador' }, { id: 'emparejamientos', label: 'Emparejamientos' }, { id: 'rotaciones', label: 'Rotaciones' }, { id: 'partido', label: 'Plan de partido' }]

const FIVE = [
  { p: PLAYERS[0], x: 250, y: 335, role: 'Director de juego' },
  { p: PLAYERS[3], x: 92, y: 262, role: 'Anotador' },
  { p: PLAYERS[5], x: 408, y: 262, role: '3&D' },
  { p: PLAYERS[7], x: 105, y: 120, role: 'Cuarto abierto' },
  { p: PLAYERS[8], x: 250, y: 120, role: 'Pívot móvil' },
]
const tok = (f, o = {}) => ({ x: f.x, y: f.y, r: 24, t: f.p.num, fill: o.fill || 'var(--cy)', tc: o.tc || '#04141a', fs: 17, sub: f.role, stroke: 'rgba(255,255,255,.85)' })

const colHead = (title, sub, right) => `<div class="row between" style="margin-bottom:8px"><div><b>${title}</b><div class="note">${sub}</div></div>${right ?? ''}</div>`

const benchList = (list, label, tone) => `<div class="stack tight">${colHead(label, `${list.length} jugadores`, '')}${list.map((p) => `<div class="card inset" style="padding:8px 10px;border-radius:12px"><div class="row bn-r" style="gap:10px">${portr(p, 40, { team: 'DO', round: true, number: false })}<div class="grow" style="min-width:0"><div class="trunc" style="font-weight:700">${p.n}</div><div class="note">${p.role}</div></div>${posPill(p.pos)}<span class="chip pos">${100 - ((p.id * 6) % 30)}%</span></div></div>`).join('')}</div>`

function controls() {
  const row = (ic, l, body) => `<div class="stack tight" style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row between"><div class="row gap-s">${I(ic, 15)}<b>${l}</b></div></div>${body}</div>`
  const sl = (l, v) => `<div class="stack tight" style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row between"><b>${l}</b><b class="num cy">${v}%</b></div>${slider(v)}</div>`
  return `<div class="stack"><div>${seg(['General', 'Ataque', 'Defensa'], 'Ataque')}</div>
    ${row('tactics', 'Sistema (playbook)', '<div class="chip sq" style="height:34px;justify-content:space-between;width:100%">Motion Offense ' + I('down', 14) + '</div>')}
    ${row('users', 'Espaciado', '<div class="chip sq" style="height:34px;justify-content:space-between;width:100%">4-Out 1-In (estándar) ' + I('down', 14) + '</div>')}
    ${sl('Frecuencia de pick & roll', 50)}${sl('Volumen de triples', 62)}
    ${row('bolt', 'Riesgo en el pase', seg(['Seguro', 'Normal', 'Arriesgado'], 'Normal'))}
    ${sl('Rebote ofensivo', 30)}
    <div class="row gap-s" style="padding-top:10px">${btn('Restablecer', { ghost: true, sm: true })}${btn('Guardar ajustes', { primary: true, sm: true })}</div></div>`
}

export function render(tab, dir) {
  const B = dir === 'b'
  const fn = { pizarra, disenador, emparejamientos, rotaciones, partido }[tab]
  return { eyebrow: 'Equipo · Tácticas', title: 'Tácticas', sub: 'Dunmere Orbits · próximo rival: Larkspur Forge', cont: 'Partido', right: `${btn('Cargar plantilla táctica', { icon: 'doc' })}${btn('Aplicar al partido', { primary: true })}`, ...fn(B) }
}

function pizarra(B) {
  const dots = FIVE.map((f) => tok(f, { fill: f.p.id === 9 ? 'var(--am)' : 'var(--cy)' }))
  const arrows = [{ from: [250, 316], to: [112, 276], curve: [170, 320], color: 'rgba(255,255,255,.65)', dash: true }, { from: [250, 316], to: [398, 276], curve: [330, 320], color: 'rgba(255,255,255,.65)', dash: true }, { from: [250, 316], to: [250, 152], color: 'var(--am)', w: 4 }]
  const bench = card('Banquillo', benchList(PLAYERS.filter((p) => !FIVE.find((f) => f.p.id === p.id)).slice(0, 4), 'En rotación', ''), { ic: 'roster', sub: 'Arrastra para asignar al quinteto' })
  const unas = card('Sin asignar', benchList(PLAYERS.filter((p) => !FIVE.find((f) => f.p.id === p.id)).slice(4), 'Disponibles', ''), { ic: 'users' })
  const board = card(null, `<div class="row between wrap" style="margin-bottom:10px"><div class="row gap-s wrap">${chip('Sinergia 91%', 'pos', 'bolt')}${chip('Media Q1 74.2', 'cy')}${chip('4-Out 1-In', '')}</div><div class="row gap-s">${btn('Limpiar', { ghost: true, sm: true })}${btn('Autoasignar', { sm: true })}</div></div>
    <div class="pitch-bg" style="position:relative"><div style="max-width:620px;margin:auto">${court({ dots, arrows, line: 'rgba(255,255,255,.7)', lineOp: 0.9, floor: 'none' })}</div>${B ? `<div class="giant outline" style="position:absolute;left:18px;top:14px;font-size:68px;pointer-events:none">Motion<br>Offense</div>` : ''}</div>
    <div class="cols3" style="margin-top:12px">${kpi('Ritmo previsto', '98.4', { delta: '+2.1', tone: 'pos' })}${kpi('Eficiencia ataque', '116.2', { delta: '+1.4', tone: 'pos' })}${kpi('Eficiencia defensa', '108.9', { delta: '−0.6', tone: 'pos' })}</div>`, { span: 's6' })
  const ctl = card('Ajustes tácticos', controls(), { span: 's3', ic: 'cog' })
  return { html: `<div class="grid"><div class="s3 stack">${bench}${unas}</div>${board}${ctl}</div>` }
}

function disenador(B) {
  const steps = [{ from: [250, 335], to: [250, 220], color: 'var(--cy)', w: 4 }, { from: [92, 262], to: [200, 190], curve: [110, 200], color: 'var(--am)', w: 4 }, { from: [105, 120], to: [215, 200], color: 'var(--pos)', w: 4, dash: true }, { from: [408, 262], to: [392, 150], color: 'rgba(255,255,255,.6)', w: 3, dash: true }, { from: [250, 120], to: [250, 90], color: 'var(--cy)', w: 4 }]
  const dots = FIVE.map((f) => tok(f)).concat([{ x: 250, y: 210, kind: 'ball' }])
  const lib = card('Biblioteca de jugadas', `<div class="stack tight">${[['Motion Offense', 'Base', true], ['Pick & roll alto', 'Ataque 1-5', false], ['Horns', 'Ataque 4-1', false], ['Spain pick & roll', 'Ataque avanzado', false], ['Elbow DHO', 'Ataque 2-3', false], ['Zone Buster', 'Anti-zona', false]].map(([a, b, c]) => `<div class="li" style="padding:9px 10px;border-radius:12px;${c ? 'background:color-mix(in srgb,var(--cy) 10%,transparent)' : ''}"><span class="chip ${c ? 'cy' : ''}" style="width:30px;height:30px;padding:0;justify-content:center;border-radius:8px">${I('tactics', 14)}</span><div class="grow"><b>${a}</b><div class="note">${b}</div></div>${c ? chip('Activa', 'cy') : ''}</div>`).join('')}${btn('Nueva jugada', { icon: 'tactics', sm: true })}</div>`, { span: 's3', ic: 'doc' })
  const canvas = card('Motion Offense · paso 3 de 5', `<div class="stack"><div class="row between wrap"><div class="row gap-s">${['Mover', 'Bloqueo', 'Pase', 'Penetrar', 'Borrar'].map((t, i) => `<span class="chip ${i === 1 ? 'am' : ''}" style="height:32px">${t}</span>`).join('')}</div>${seg(['Frontal', 'Lateral', 'Zona'], 'Frontal')}</div><div class="pitch-bg"><div style="max-width:640px;margin:auto">${court({ dots, arrows: steps, line: 'rgba(255,255,255,.7)' })}</div></div>
    <div class="row" style="gap:10px;align-items:center"><span class="btn icon small" style="width:34px">${I('play', 14)}</span><div class="grow" style="display:flex;gap:6px">${[1, 2, 3, 4, 5].map((n) => `<div class="grow stack tight"><div style="height:8px;border-radius:9px;background:${n <= 3 ? 'var(--cy)' : 'var(--track)'}"></div><span class="note center">Paso ${n}</span></div>`).join('')}</div></div></div>`, { span: 's6', ic: 'tactics' })
  const props = card('Propiedades del paso', `<div class="stack" style="gap:12px"><div class="row gap-s">${portr(PLAYERS[3], 44, { team: 'DO', round: true, number: false })}<div><b>Arel Dain</b><div class="note">SG · Anotador</div></div></div><div class="hr"></div><div class="row between"><span class="dim">Acción</span><b>Bloqueo indirecto</b></div><div class="row between"><span class="dim">Duración</span><b>2.4 s</b></div><div class="row between"><span class="dim">Receptor</span><b>Bren Istra</b></div><div class="stack tight"><span class="dim">Disparador</span>${seg(['Auto', 'Pase', 'Señal'], 'Pase')}</div>${callout('Esta jugada genera un tiro abierto de tres en 64% de las simulaciones.', { tone: 'cy', icon: 'target' })}</div>`, { span: 's3', ic: 'cog' })
  return { html: `<div class="grid">${lib}${canvas}${props}</div>` }
}

function emparejamientos(B) {
  const opp = [['Jace Rooney', 'PG', 71], ['Marlo Kess', 'SG', 64], ['Tobias Vane', 'SF', 58], ['Dev Okafor', 'PF', 66], ['Ruben Hale', 'C', 60]]
  const mine = [PLAYERS[0], PLAYERS[3], PLAYERS[5], PLAYERS[7], PLAYERS[8]]
  const duels = [['Manejo de balón', 'Defensa perimetral', 68, 'Jace Rooney', 'PG'], ['Tiro de tres', 'Contestar tiro', 66, 'Marlo Kess', 'SG'], ['Primer paso', 'Defensa perimetral', 64, 'Tobias Vane', 'SF'], ['Finalización en el aro', 'Defensa interior', 63, 'Dev Okafor', 'PF'], ['Finalización en el aro', 'Defensa interior', 58, 'Ruben Hale', 'C']]
  const rows = mine.map((m, i) => { const [a, d, dv, on, op] = duels[i]; const av = sk(m, a); const diff = av - dv; return `<div class="card inset" style="padding:14px 16px;border-radius:16px"><div class="grid" style="grid-template-columns:minmax(0,1fr) 190px minmax(0,1fr);align-items:center;gap:14px"><div class="row" style="gap:12px">${portr(m, 52, { team: 'DO', round: true, number: false })}<div class="grow"><b>${m.n}</b><div class="note">${m.pos} · ${m.role}</div></div><div class="stack tight" style="align-items:flex-end"><span class="note">${a}</span>${rt(av)}</div></div><div class="stack tight" style="align-items:center"><div class="lbl">Duelo clave</div><b class="num ${diff >= 0 ? 'pos' : 'neg'}" style="font-size:22px">${diff >= 0 ? '+' : ''}${diff}</b><div class="bar" style="width:110px;height:6px"><i style="width:${Math.max(6, Math.min(100, 50 + diff * 2.5))}%;background:var(--${diff >= 0 ? 'pos' : 'neg'})"></i></div></div><div class="row" style="gap:12px;justify-content:flex-end;text-align:right"><div class="stack tight" style="align-items:flex-start"><span class="note">${d}</span>${rt(dv)}</div><div class="grow"><b>${on}</b><div class="note">${op} · Larkspur Forge</div></div>${T('LF', 38, 'round')}</div></div></div>` }).join('')
  const list = card('Cara a cara por posición', `<div class="stack">${rows}</div>`, { span: 's8', ic: 'swap' })
  const asg = card('Asignaciones defensivas', `<div class="stack tight">${[['Bexley', 'Rooney', 'Individual'], ['Dain', 'Kess', 'Individual'], ['Corven', 'Vane', 'Ayuda'], ['Farrow', 'Okafor', 'Individual'], ['Istra', 'Hale', 'Protección del aro']].map(([a, b, t]) => `<div class="li"><b>${a}</b><span class="muted">→</span><b class="grow">${b}</b>${chip(t, t === 'Ayuda' ? 'am' : '')}</div>`).join('')}${callout('Rooney anota 63% tras bloqueo. Se recomienda cambiar en el pick & roll.', { icon: 'bolt' })}</div>`, { span: 's4', ic: 'shield' })
  const key = card('Claves del rival', `<div class="cols3">${[['Ritmo', '97.1', 'Medio'], ['Triples', '29%', 'Bajo'], ['Pérdidas', '15.2', 'Alto']].map(([a, b, c]) => kpi(a, b, { sub: c })).join('')}</div>`, { span: 's12', ic: 'scouting' })
  return { html: `<div class="grid">${list}${asg}${key}</div>` }
}

function rotaciones(B) {
  const bars = { 9: [[0, 9], [14, 22], [27, 38], [43, 48]], 1: [[0, 8], [14, 24], [28, 40], [42, 48]], 4: [[0, 7], [12, 20], [26, 36]], 6: [[0, 6], [18, 27], [34, 42]], 8: [[0, 10], [17, 26], [30, 40]], 2: [[8, 14], [24, 30], [40, 44]], 11: [[10, 18], [32, 41]], 10: [[6, 13], [26, 32], [44, 48]], 3: [[22, 28], [38, 46]], 5: [[20, 26]] }
  const order = [9, 1, 4, 6, 8, 2, 11, 10, 3, 5]
  const grid = order.map((id) => { const p = PLAYERS.find((x) => x.id === id); return `<div class="row" style="gap:10px;height:34px"><div class="row" style="width:150px;flex:none;gap:8px">${portr(p, 26, { team: 'DO', round: true, number: false })}<span class="trunc" style="font-weight:600;font-size:13px">${p.n}</span></div><div style="position:relative;flex:1;height:22px;background:var(--track);border-radius:8px">${bars[id].map(([a, b]) => `<i style="position:absolute;left:${(a / 48) * 100}%;width:${((b - a) / 48) * 100}%;top:0;bottom:0;background:var(--${id === 9 ? 'am' : 'cy'});border-radius:6px;opacity:.9"></i>`).join('')}</div><b class="num" style="width:44px;text-align:right">${bars[id].reduce((s, [a, b]) => s + b - a, 0)}'</b></div>` }).join('')
  const axis = `<div class="row" style="gap:10px"><div style="width:150px;flex:none"></div><div class="row between grow note"><span>0'</span><span>12'</span><span>24'</span><span>36'</span><span>48'</span></div><div style="width:44px"></div></div>`
  const g = card('Plan de minutos', `<div class="stack tight">${axis}${grid}</div>`, { span: 's8', ic: 'cal', sub: 'Arrastra los bloques para ajustar entradas y salidas', right: seg(['Auto', 'Manual'], 'Manual') })
  const fat = card('Fatiga prevista del quinteto', lineChart([{ v: [0, 14, 30, 22, 40, 52, 44, 58, 70, 52], color: 'var(--am)' }, { v: [0, 10, 22, 16, 28, 38, 30, 44, 54, 38], color: 'var(--cy)' }], ['0', '5', '10', '15', '20', '25', '30', '35', '40', '48'], { grid: P.grid, text: P.text, h: 220, w: 420, min: 0, max: 100, ticks: 4, fmt: (v) => v + '%' }), { span: 's4', ic: 'flame', sub: 'Con y sin rotaciones agresivas' })
  const rules = card('Reglas automáticas de sustitución', `<div class="cols2">${[['Fatiga > 65%', 'Sustituir por reserva del puesto'], ['Faltas ≥ 4 antes del Q4', 'Sentar al jugador 6 minutos'], ['Diferencia ≥ 20', 'Retirar titulares (modo garbage time)'], ['Diferencia ≤ 5 en últimos 3\'', 'Quinteto de cierre']].map(([a, b]) => `<div class="callout">${I('swap', 16)}<div><b>${a}</b><br><span class="dim">${b}</span></div></div>`).join('')}</div>`, { span: 's12', ic: 'bolt' })
  return { html: `<div class="grid">${g}${fat}${rules}</div>` }
}

function partido(B) {
  const q = card('Plan por cuartos', `<div class="cols4">${[['Q1', 'Ritmo alto', 'Motion Offense', 'Presión media'], ['Q2', 'Ritmo medio', 'Pick & roll alto', 'Zona 2-3'], ['Q3', 'Ritmo alto', 'Horns', 'Individual'], ['Q4', 'Ritmo bajo', 'Elbow DHO', 'Individual']].map(([a, b, c, d], i) => `<div class="card inset" style="padding:14px;border-radius:14px"><div class="row between"><b class="h2">${a}</b>${chip(b, i % 2 ? '' : 'cy')}</div><div class="stack tight" style="margin-top:10px"><div class="row gap-s">${I('tactics', 14)}<span>${c}</span></div><div class="row gap-s">${I('shield', 14)}<span>${d}</span></div></div></div>`).join('')}</div>`, { span: 's12', ic: 'cal' })
  const cond = card('Reglas condicionales', `<div class="stack tight">${[['Si perdemos por 10+', 'Aumentar ritmo y volumen de triples +15%'], ['Si ganamos por 12+ en Q4', 'Reducir ritmo, jugar a 24 s completos'], ['Si Istra acumula 3 faltas', 'Cambiar a defensa en zona'], ['Si el rival sube al 45% en triples', 'Defensa más agresiva en el perímetro']].map(([a, b]) => `<div class="li"><span class="chip am" style="width:34px;height:34px;padding:0;justify-content:center;border-radius:10px">${I('bolt', 16)}</span><div class="grow"><b>${a}</b><div class="note">→ ${b}</div></div>${btn('Editar', { ghost: true, sm: true })}</div>`).join('')}${btn('Añadir regla', { icon: 'bolt', sm: true })}</div>`, { span: 's8', ic: 'bolt' })
  const to = card('Tiempos muertos y faltas', `<div class="stack" style="gap:14px"><div><div class="row between"><b>Tiempos muertos</b><b class="num">5 / 7</b></div><div class="row gap-s" style="margin-top:6px">${Array.from({ length: 7 }, (_, i) => `<i style="flex:1;height:10px;border-radius:5px;background:var(--${i < 5 ? 'cy' : 'track'})"></i>`).join('')}</div></div><div class="hr"></div><div class="stack tight"><div class="row between"><span class="dim">Faltar para cortar ritmo</span>${chip('Q4 · últimos 40 s', 'cy')}</div><div class="row between"><span class="dim">Tiro libre intencional</span>${chip('Solo vs <65% TL', '')}</div></div></div>`, { span: 's4', ic: 'cal' })
  return { html: `<div class="grid">${q}${cond}${to}</div>` }
}
