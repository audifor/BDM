import { I, T, card, kpi, table, rt, chip, btn, bar, seg, portr, spark, lineChart, barChart, P, callout, wl, teamCell } from '../ui.js'
import { TEAMS, STANDINGS_MID } from '../data.js'

export const tabs = [{ id: 'clasificacion', label: 'Clasificación' }, { id: 'calendario', label: 'Calendario' }, { id: 'proximos', label: 'Próximos' }, { id: 'resultados', label: 'Resultados' }, { id: 'estadisticas', label: 'Estadísticas' }]

export function render(tab, dir) {
  const B = dir === 'b'
  const fn = { clasificacion, calendario, proximos, resultados, estadisticas }[tab]
  return { eyebrow: 'Partidos · Competición', title: 'Virelia Horizon League', sub: 'Temporada 2032-33 · Jornada 19 de 36 · 8 equipos', cont: 'Partido', right: seg(['Liga regular', 'Playoffs'], 'Liga regular'), ...fn(B) }
}

const L = (id) => ({ id: 0, n: id, skin: 3, num: 7, pos: 'G' })
const LEAGUE_PLAYERS = [
  ['Kael Vasquez', 'BS', 'PF', 23.4, 7.1, 4.2, 2], ['Bren Istra', 'DO', 'PF', 21.6, 9.4, 3.3, 5], ['Jace Rooney', 'LF', 'PG', 20.9, 3.0, 8.4, 3], ['Soren Lund', 'HL', 'SG', 19.8, 4.1, 3.9, 1],
  ['Nico Bravo', 'GS', 'C', 14.2, 11.8, 1.4, 4], ['Ezra Quill', 'IV', 'SF', 17.5, 6.3, 2.8, 6], ['Teo Marsh', 'JS', 'SG', 16.9, 3.3, 5.1, 2], ['Ilya Marek', 'AK', 'SF', 18.4, 5.9, 2.2, 3],
].map(([n, t, pos, pts, reb, ast, s], i) => ({ p: { id: i + 30, n, pos, skin: [2, 4, 1, 3, 5, 2, 3, 4][i], num: [11, 23, 5, 9, 33, 17, 8, 21][i] }, t, pts, reb, ast }))

function clasificacion(B) {
  const rows = STANDINGS_MID.map((r, i) => {
    const [id, pj, w, l, pf, pc, , form] = r
    return [`<span class="num muted">${i + 1}</span>`, teamCell(id, { s: 30 }), `<span class="num">${pj}</span>`, `<b class="num">${w}</b>`, `<span class="num">${l}</span>`, `<b class="num">${(w / pj * 100).toFixed(0)}%</b>`, `<span class="num ${pf - pc > 0 ? 'pos' : 'neg'}">${pf - pc > 0 ? '+' : ''}${pf - pc}</span>`, wl(form), spark([2, 3, 3, 4, 3, 2, i < 4 ? 1 : 5, 6, 5].map((x) => 8 - x + (i % 3)), { w: 70, h: 22, stroke: i < 4 ? 'var(--pos)' : 'var(--neg)', fill: i < 4 ? 'var(--pos)' : 'var(--neg)', dot: false }), `<b class="num" style="font-size:15px">${w * 2}</b>`]
  })
  const tbl = card('Clasificación', table([{ t: '#', w: '36px' }, { t: 'Equipo', mw: '200px' }, { t: 'PJ', a: 'r' }, { t: 'V', a: 'r' }, { t: 'D', a: 'r' }, { t: '%', a: 'r', h: 's' }, { t: 'Dif', a: 'r', h: 'm' }, { t: 'Racha', h: 's' }, { t: 'Tendencia', h: 'm' }, { t: 'Pts', a: 'r' }], rows, { me: 1, cls: 'fit', zones: { 0: 'p', 1: 'p', 2: 'p', 3: 'p', 7: 'r' } }), { span: 's8', cls: 'flush', ic: 'trophy', sub: 'Actualizado tras la jornada 18' })
  const leg = card('Zonas', `<div class="stack" style="gap:12px">${[['pos', 'Playoffs', 'Top 4 · semifinales a 3 partidos'], ['', 'Zona neutra', 'Puestos 5 al 7'], ['neg', 'Fuera de playoffs', 'Último puesto · draft lottery']].map(([t, a, b]) => `<div class="row" style="gap:12px"><i style="width:6px;align-self:stretch;border-radius:4px;background:var(--${t || 'tx4'})"></i><div><b>${a}</b><div class="note">${b}</div></div></div>`).join('')}</div>`, { ic: 'shield' })
  const brk = card('Cuadro de playoffs previsto', `<div class="stack tight">${[[0, 3], [1, 2]].map(([a, b]) => `<div class="card inset" style="padding:10px 12px;border-radius:14px"><div class="row" style="gap:10px">${T(STANDINGS_MID[a][0], 28)}<b class="grow">${TEAMS[STANDINGS_MID[a][0]].short}</b><span class="note">vs</span><b class="grow right">${TEAMS[STANDINGS_MID[b][0]].short}</b>${T(STANDINGS_MID[b][0], 28)}</div></div>`).join('')}<div class="note center">Proyección de la simulación</div></div>`, { ic: 'flame' })
  const prob = card('Probabilidad de título', `<div class="stack tight">${[['HL', 31], ['DO', 27], ['GS', 18], ['BS', 14]].map(([id, v]) => `<div class="row" style="gap:10px">${T(id, 24)}<b style="width:70px">${TEAMS[id].short}</b><div class="grow">${bar(v * 2.8, { cls: id === 'DO' ? 'cy' : '', h: 8 })}</div><b class="num" style="width:34px;text-align:right">${v}%</b></div>`).join('')}</div>`, { ic: 'target' })
  return { html: `<div class="grid">${tbl}<div class="s4 stack">${leg}${brk}${prob}</div></div>` }
}

const ROUND = [['HL', 'IV', '14 DIC', '19:30'], ['GS', 'AK', '14 DIC', '20:00'], ['DO', 'LF', '14 DIC', '20:00'], ['BS', 'JS', '15 DIC', '20:30']]

function calendario(B) {
  const rounds = [['Jornada 18', '10–11 DIC', true], ['Jornada 19', '14–15 DIC', false], ['Jornada 20', '17–18 DIC', false]]
  return { html: `<div class="grid">${rounds.map(([t, d, done], k) => card(t, `<div class="stack tight">${ROUND.map(([a, b, dt, h], i) => `<div class="li" style="padding:10px 0${a === 'DO' || b === 'DO' ? ';background:color-mix(in srgb,var(--cy) 8%,transparent)' : ''}"><div class="grow row" style="gap:8px;justify-content:flex-end">${'<b>' + TEAMS[k % 2 ? b : a].short + '</b>'}${T(k % 2 ? b : a, 28)}</div><span class="chip ${done ? '' : 'am'}" style="min-width:64px;justify-content:center">${done ? ['102-96', '88-91', '96-90', '99-97'][i] : h}</span><div class="grow row" style="gap:8px">${T(k % 2 ? a : b, 28)}<b>${TEAMS[k % 2 ? a : b].short}</b></div></div>`).join('')}</div>`, { span: 's4', ic: 'cal', sub: d, right: chip(done ? 'Jugada' : k === 1 ? 'Hoy' : 'Pendiente', done ? '' : 'am') })).join('')}${card('Descansos y rachas', `<div class="cols4">${kpi('Partidos esta semana', '2')}${kpi('Máx. consecutivos fuera', '3')}${kpi('Días de descanso medios', '2.4')}${kpi('Jornadas restantes', '17')}</div>`, { span: 's12', ic: 'flame' })}</div>` }
}

function proximos(B) {
  const days = [['Mié 14 DIC', ROUND.slice(0, 3)], ['Jue 15 DIC', ROUND.slice(3)], ['Sáb 17 DIC', [['AK', 'HL', '', '19:00'], ['DO', 'JS', '', '19:30'], ['LF', 'BS', '', '20:00']]]]
  return { html: `<div class="grid">${days.map(([d, m]) => card(d, `<div class="stack tight">${m.map(([a, b, , h]) => `<div class="card inset" style="padding:12px 14px;border-radius:14px;${a === 'DO' || b === 'DO' ? 'outline:1.5px solid var(--am)' : ''}"><div class="row" style="gap:12px">${T(a, 42, 'round')}<div class="grow center"><div class="num" style="font-size:18px;font-weight:800">${h}</div><div class="note">${TEAMS[a].short} – ${TEAMS[b].short}</div></div>${T(b, 42, 'round')}</div><div class="row between" style="margin-top:8px">${wl('WWLWW')}${wl('LWLLW')}</div></div>`).join('')}</div>`, { span: 's4', ic: 'schedule' })).join('')}</div>` }
}

function resultados(B) {
  const rs = [['Jornada 18', [['HL', 102, 'GS', 96], ['DO', 102, 'GS', 91], ['BS', 97, 'AK', 90], ['IV', 88, 'JS', 91]]], ['Jornada 17', [['DO', 97, 'BS', 90], ['GS', 105, 'IV', 99], ['HL', 111, 'LF', 84], ['AK', 94, 'JS', 96]]]]
  return { html: `<div class="grid">${rs.map(([t, m]) => card(t, `<div class="stack tight">${m.map(([a, as, b, bs]) => `<div class="li"><div class="grow row" style="gap:10px;justify-content:flex-end"><b class="${as > bs ? '' : 'muted'}">${TEAMS[a].name}</b>${T(a, 30)}</div><div class="row" style="gap:8px;min-width:130px;justify-content:center"><b class="num" style="font-size:22px;${as > bs ? '' : 'opacity:.55'}">${as}</b><span class="muted">–</span><b class="num" style="font-size:22px;${bs > as ? '' : 'opacity:.55'}">${bs}</b></div><div class="grow row" style="gap:10px">${T(b, 30)}<b class="${bs > as ? '' : 'muted'}">${TEAMS[b].name}</b></div></div>`).join('')}</div>`, { span: 's6', ic: 'doc' })).join('')}</div>` }
}

function estadisticas(B) {
  const cats = [['Puntos', 'pts', [...LEAGUE_PLAYERS].sort((a, b) => b.pts - a.pts)], ['Rebotes', 'reb', [...LEAGUE_PLAYERS].sort((a, b) => b.reb - a.reb)], ['Asistencias', 'ast', [...LEAGUE_PLAYERS].sort((a, b) => b.ast - a.ast)]]
  const lead = cats.map(([t, k, list]) => card(`Líderes · ${t}`, `<div class="stack tight"><div class="row" style="gap:14px;padding-bottom:10px;border-bottom:1px solid var(--line)">${portr(list[0].p, 74, { team: list[0].t, number: false })}<div class="grow"><div class="lbl">${TEAMS[list[0].t].name}</div><div class="h3">${list[0].p.n}</div></div><div class="big-n" style="color:var(--${B ? 'or' : 'am-t'})">${list[0][k].toFixed(1)}</div></div>${list.slice(1, 5).map((x, i) => `<div class="row" style="gap:10px;padding:6px 0"><span class="num muted" style="width:18px">${i + 2}</span>${T(x.t, 22)}<span class="grow trunc">${x.p.n}</span><b class="num">${x[k].toFixed(1)}</b></div>`).join('')}</div>`, { span: 's4', ic: 'star' })).join('')
  const team = card('Ranking de equipos', table([{ t: 'Equipo' }, { t: 'Ataque', a: 'r' }, { t: 'Defensa', a: 'r' }, { t: 'Ritmo', a: 'r', h: 's' }, { t: '3P%', a: 'r', h: 's' }, { t: 'Reb', a: 'r', h: 'm' }], STANDINGS_MID.map(([id], i) => [teamCell(id, { s: 26 }), `<span class="num">${[116.2, 114.8, 110.1, 111.9, 108.7, 107.4, 104.8, 103.2][i]}</span>`, `<span class="num">${[107.1, 108.9, 110.6, 109.9, 112.1, 113.0, 114.2, 115.6][i]}</span>`, `<span class="num">${[98.4, 97.1, 96.2, 99.0, 95.4, 96.8, 97.2, 94.1][i]}</span>`, `<span class="num">${[37, 36, 35, 34, 33, 32, 31, 29][i]}%</span>`, `<span class="num">${[46, 44, 45, 43, 42, 41, 40, 39][i]}</span>`]), { cls: 'tight', me: 1 }), { span: 's8', cls: 'flush', ic: 'trophy' })
  const eff = card('Eficiencia ataque vs defensa', `<div class="stack tight">${STANDINGS_MID.map(([id], i) => `<div class="row" style="gap:10px">${T(id, 22)}<b style="width:64px;font-size:12.5px">${TEAMS[id].short}</b><div class="grow" style="position:relative;height:10px;border-radius:9px;background:var(--track)"><i style="position:absolute;left:${(i % 2) * 8 + 8}%;right:${(7 - i) * 6 + 8}%;top:0;bottom:0;border-radius:9px;background:${id === 'DO' ? 'var(--cy)' : 'var(--am)'}"></i></div></div>`).join('')}</div>`, { span: 's4', ic: 'target' })
  return { html: `<div class="grid">${lead}${team}${eff}</div>` }
}
