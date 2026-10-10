import { I, T, card, kpi, table, rt, chip, btn, bar, seg, posPill, portr, spark, lineChart, barChart, ring, radar, P, callout, uid } from '../ui.js'
import { STAFF } from '../data.js'

export const tabs = [{ id: 'staff', label: 'Staff' }, { id: 'asignaciones', label: 'Asignaciones' }, { id: 'asesoria', label: 'Asesoría' }, { id: 'dinamicas', label: 'Dinámicas' }]

export function render(tab, dir) {
  const B = dir === 'b'
  const fn = { staff, asignaciones, asesoria, dinamicas }[tab]
  return { eyebrow: 'Equipo · Staff', title: 'Staff', sub: 'Dunmere Orbits · 4 empleados · 0 avisos · 0 atención', cont: 'Partido', right: `${btn('Mercado de staff', { icon: 'users' })}${btn('Contratar', { primary: true })}`, ...fn(B) }
}

const P_STAFF = [
  { id: 41, n: 'Marta Quesada', skin: 2, num: 0, role: 'Entrenadora jefe', dept: 'Coaching', key: 'Táctica 75' },
  { id: 42, n: 'Elio Brandt', skin: 4, num: 0, role: 'Asistente', dept: 'Coaching', key: 'Desarrollo 68' },
  { id: 43, n: 'Dr. Noor Sethi', skin: 1, num: 0, role: 'Médico del equipo', dept: 'Médico', key: 'Rehabilitación 88' },
  { id: 44, n: 'Cass Ortega', skin: 4, num: 0, role: 'Scout', dept: 'Scouting', key: 'Potencial 86' },
]
const av = (p, s = 40) => portr(p, s, { team: 'DO', round: true, number: false })

const DEPTS = [
  { n: 'Coaching', ic: 'tactics', slots: [['Entrenador jefe', 1, 1], ['Asociado', 0, 1], ['Asistente', 1, 2], ['Esp. ofensivo', 0, 1], ['Esp. defensivo', 0, 1], ['Desarrollo', 0, 2], ['Tiro', 0, 1], ['Pívots', 0, 1]], who: [0, 1], attr: [['Coaching', 62], ['Desarrollo', 68], ['Táctica', 55], ['Comunicación', 60], ['Motivación', 70], ['Análisis', 58]], top: 75, low: 25 },
  { n: 'Rendimiento', ic: 'training', slots: [['Preparador físico', 0, 1], ['Rendimiento', 0, 1], ['Gestión de carga', 0, 1], ['Desarrollo', 0, 1]], who: [], attr: [], top: 0, low: 0 },
  { n: 'Médico', ic: 'medical', slots: [['Médico del equipo', 0, 1], ['Médico', 1, 2], ['Rehabilitación', 0, 1], ['Científico deportivo', 0, 1]], who: [2], attr: [['Conoc. médico', 70], ['Rehabilitación', 88], ['Análisis', 64], ['Comunicación', 76], ['Disciplina', 80], ['Adaptabilidad', 44]], top: 84, low: 26 },
  { n: 'Scouting', ic: 'scouting', slots: [['Jefe de scouts', 0, 1], ['Scout', 1, 3], ['Scout avanzado', 0, 1], ['College', 0, 1], ['Internacional', 0, 1], ['Pro', 0, 1]], who: [3], attr: [['Eval. talento', 84], ['Eval. potencial', 86], ['Análisis', 52], ['Adaptabilidad', 70], ['Comunicación', 66], ['Táctica', 62]], top: 80, low: 27 },
  { n: 'Operaciones', ic: 'building', slots: [['Director general', 0, 1], ['DG adjunto', 0, 1], ['Dir. operaciones', 0, 1], ['Dir. deportivo', 0, 1], ['Analítica', 0, 1], ['Contratos / cap', 0, 1]], who: [], attr: [], top: 0, low: 0 },
  { n: 'Reclutamiento', ic: 'target', slots: [['Coordinador', 0, 1], ['Reclutador posicional', 0, 2]], who: [], attr: [], top: 0, low: 0 },
]

function staff(B) {
  const cards = DEPTS.map((d) => {
    const filled = d.slots.reduce((s, x) => s + x[1], 0); const total = d.slots.reduce((s, x) => s + x[2], 0)
    const who = d.who.map((i) => P_STAFF[i])
    return card(d.n, `<div class="stack" style="gap:12px"><div class="row between"><div class="row" style="gap:-6px">${who.length ? who.map((p, i) => `<span style="margin-left:${i ? -10 : 0}px">${av(p, 38)}</span>`).join('') : `<span class="chip" style="height:38px;width:38px;padding:0;justify-content:center;border-radius:50%;border-style:dashed">+</span>`}</div><div class="row gap-s">${chip(`${filled}/${total} puestos`, filled ? 'cy' : '')}</div></div>
      <div class="row gap-s wrap">${d.slots.map(([l, f, t]) => `<span class="chip sq ${f >= t ? 'pos' : f ? 'am' : ''}" style="${f ? '' : 'border-style:dashed;opacity:.7'}">${l} ${f}/${t}</span>`).join('')}</div>
      ${d.attr.length ? `<div class="hr"></div><div class="lbl">Atributos medios vs. liga</div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;align-items:end;height:92px">${d.attr.map(([a, v]) => `<div class="stack tight" style="align-items:center;justify-content:flex-end;height:100%"><div style="width:100%;max-width:26px;height:${v}%;border-radius:6px 6px 3px 3px;background:linear-gradient(180deg,var(--am),color-mix(in srgb,var(--am) 40%,transparent))"></div></div>`).join('')}</div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">${d.attr.map(([a]) => `<span class="note center" style="font-size:9.5px;line-height:1.1">${a}</span>`).join('')}</div><div class="row between note"><span>Más bajo de la liga: ${d.low}</span><span>Más alto: ${d.top}</span></div>` : `<div class="callout">${I('bolt', 16)}<div>Departamento sin personal. Contratar mejora el impacto del cuerpo técnico.</div></div>`}</div>`, { span: 's4', ic: d.ic })
  }).join('')
  return { html: `<div class="grid">${cards}</div>` }
}

function asignaciones(B) {
  const hc = P_STAFF[0]
  const node = (p, x, y, w = 220) => `<div class="card inset" style="position:absolute;left:${x}%;top:${y}px;width:${w}px;margin-left:-${w / 2}px;padding:10px 12px;border-radius:16px"><div class="row" style="gap:10px">${av(p, 38)}<div class="grow"><div class="trunc" style="font-weight:700">${p.n}</div><div class="note">${p.role}</div><div style="margin-top:6px">${chip(p.key, 'cy')}</div></div></div></div>`
  const tree = card('Organigrama', `<div style="position:relative;height:420px"><svg style="position:absolute;inset:0" width="100%" height="420" viewBox="0 0 1000 420" preserveAspectRatio="none"><g fill="none" stroke="var(--line2)" stroke-width="2"><path d="M500 76 V150 M500 150 H180 V190 M500 150 H500 V190 M500 150 H820 V190"/><path d="M180 262 V320 M820 262 V320" stroke-dasharray="5 6"/></g></svg>${node(P_STAFF[0], 50, 10, 230)}${node(P_STAFF[1], 18, 190)}${node(P_STAFF[2], 50, 190)}${node(P_STAFF[3], 82, 190)}
    <div class="card inset" style="position:absolute;left:18%;top:322px;width:190px;margin-left:-95px;padding:10px 12px;border-radius:16px;border-style:dashed"><div class="row gap-s dim">${I('users', 16)}<span>Desarrollo · vacante</span></div></div><div class="card inset" style="position:absolute;left:82%;top:322px;width:190px;margin-left:-95px;padding:10px 12px;border-radius:16px;border-style:dashed"><div class="row gap-s dim">${I('scouting', 16)}<span>Scout avanzado · vacante</span></div></div></div>`, { span: 's8', ic: 'users' })
  const resp = ['Planteamiento de partido', 'Desarrollo de jóvenes', 'Rehabilitación', 'Informes de rivales', 'Entrenamiento de tiro', 'Gestión de carga']
  const owner = [0, 1, 2, 3, 1, 2]
  const mat = card('Responsabilidades', `<div class="stack tight">${resp.map((r, i) => `<div class="li" style="padding:9px 0"><div class="grow"><b>${r}</b></div>${av(P_STAFF[owner[i]], 30)}<span class="note" style="width:92px">${P_STAFF[owner[i]].n.split(' ')[0]}</span></div>`).join('')}</div>`, { span: 's4', ic: 'doc' })
  return { html: `<div class="grid">${tree}${mat}</div>` }
}

function asesoria(B) {
  const recs = [
    ['Marta Quesada', 0, 'Táctica', 'Reducir el uso del pick & roll alto contra Forge', 'Forge defiende 63% mejor ese bloqueo. Alternativa: Horns.', 82, 'am'],
    ['Dr. Noor Sethi', 2, 'Médico', 'Descanso total para Hira Corven esta semana', 'Riesgo de recaída del 22% si juega antes del domingo.', 91, 'neg'],
    ['Cass Ortega', 3, 'Scouting', 'Seguir de cerca a Kael Vasquez (BS)', 'Contrato libre en junio. Encaje alto en el esquema.', 74, 'cy'],
    ['Elio Brandt', 1, 'Desarrollo', 'Aumentar foco de tiro en Jora Joren', 'Sube +0.5 de ritmo semanal con 2 sesiones extra.', 68, ''],
  ]
  const list = recs.map(([n, i, tag, t, d, conf, tone]) => `<div class="card inset" style="padding:16px;border-radius:18px;gap:10px"><div class="row" style="gap:12px">${av(P_STAFF[i], 44)}<div class="grow"><b>${n}</b><div class="note">${P_STAFF[i].role}</div></div>${chip(tag, tone)}</div><div class="h3">${t}</div><div class="dim">${d}</div><div class="row between wrap"><div class="row gap-s" style="width:220px"><span class="note">Confianza</span><div class="grow">${bar(conf, { h: 6, cls: tone === 'neg' ? 'neg' : 'cy' })}</div><b class="num">${conf}%</b></div><div class="row gap-s">${btn('Descartar', { sm: true, ghost: true })}${btn('Aplicar', { sm: true, primary: tone === 'neg' })}</div></div></div>`).join('')
  const board = card('Recomendaciones pendientes', `<div class="cols2">${list}</div>`, { span: 's9', ic: 'bolt', sub: '4 propuestas del cuerpo técnico' })
  const side = `<div class="s3 stack">${card('Alineación del staff', `<div class="stack" style="align-items:center;gap:8px"><div style="width:110px">${ring(78, { size: 110, thick: 11, color: P.cy })}</div><div class="h3">Mayormente alineados</div><div class="note center">Un desacuerdo táctico entre Quesada y Brandt</div></div>`, { ic: 'users' })}${card('Historial de aciertos', `<div class="stack tight">${[['Quesada', 82], ['Sethi', 91], ['Ortega', 76], ['Brandt', 64]].map(([a, v]) => `<div class="row" style="gap:10px"><b style="width:64px">${a}</b><div class="grow">${bar(v, { cls: 'cy', h: 7 })}</div><b class="num">${v}%</b></div>`).join('')}</div>`, { ic: 'star' })}</div>`
  return { html: `<div class="grid">${board}${side}</div>` }
}

function dinamicas(B) {
  const nodes = [[500, 90, 0], [220, 260, 1], [500, 330, 2], [780, 260, 3], [500, 180, -1]]
  const edges = [[0, 1, 'var(--am)', 3, true], [0, 2, 'var(--pos)', 5], [0, 3, 'var(--pos)', 4], [1, 2, 'var(--pos)', 2], [1, 3, 'var(--neg)', 3, true], [2, 3, 'var(--pos)', 3]]
  const P2 = [...P_STAFF]
  const svg = `<svg viewBox="0 0 1000 440" width="100%" role="img" aria-label="Red de relaciones del staff"><g>${edges.map(([a, b, c, w, d]) => { const A = nodes[a], Bn = nodes[b]; return `<path d="M${A[0]} ${A[1]} L${Bn[0]} ${Bn[1]}" stroke="${c}" stroke-width="${w}" ${d ? 'stroke-dasharray="9 8"' : ''} opacity=".85" fill="none"/>` }).join('')}</g>${nodes.slice(0, 4).map(([x, y, i], k) => `<g transform="translate(${x - 38} ${y - 38})"><circle cx="38" cy="38" r="40" fill="var(--s2)" stroke="${[ 'var(--am)', 'var(--pos)', 'var(--cy)', 'var(--cy)'][k]}" stroke-width="3"/><foreignObject x="4" y="4" width="68" height="68"><div xmlns="http://www.w3.org/1999/xhtml" style="width:68px;height:68px">${av(P2[i], 68)}</div></foreignObject><text x="38" y="${k === 0 ? -10 : 96}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--tx)" font-family="GT America Standard, Inter Tight, sans-serif">${P2[i].n}</text></g>`).join('')}<g font-size="11" fill="var(--tx3)" font-family="GT America Standard, Inter Tight, sans-serif"><text x="340" y="165" text-anchor="middle">tensión táctica</text><text x="560" y="256" text-anchor="middle" fill="var(--neg)">conflicto sobre ritmo</text></g></svg>`
  const net = card('Red de relaciones', `${svg}<div class="row gap-s wrap">${chip('— Confianza alta', 'pos')}${chip('┅ Tensión', 'am')}${chip('┅ Conflicto', 'neg')}</div>`, { span: 's8', ic: 'users' })
  const kp = `<div class="s4 stack">${card('Cohesión del staff', `<div class="row" style="gap:16px">${ring(72, { size: 96, thick: 10, color: P.cy })}<div><div class="h3">Cohesión sólida</div><div class="note">+3 en 30 días</div></div></div>`, { ic: 'shield' })}${card('Cultura', `<div class="stack tight">${[['Disciplina', 78], ['Innovación', 54], ['Trabajo en equipo', 82], ['Exigencia', 70]].map(([a, v]) => `<div><div class="row between"><span>${a}</span><b class="num">${v}</b></div>${bar(v, { cls: 'cy', h: 6 })}</div>`).join('')}</div>`, { ic: 'star' })}</div>`
  const tens = card('Tensiones activas', [['Quesada ↔ Brandt', 'Desacuerdo sobre minutos de promesas', 'am'], ['Brandt ↔ Ortega', 'Competencia por presupuesto de scouting', 'neg']].map(([a, b, t]) => `<div class="li"><span class="chip ${t}" style="width:32px;height:32px;padding:0;justify-content:center;border-radius:50%">${I('bolt', 14)}</span><div class="grow"><b>${a}</b><div class="note">${b}</div></div>${btn('Mediar', { sm: true })}</div>`).join(''), { span: 's12', ic: 'bell' })
  return { html: `<div class="grid">${net}${kp}${tens}</div>` }
}
