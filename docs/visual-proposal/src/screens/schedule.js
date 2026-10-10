import { I, T, card, kpi, table, rt, chip, btn, bar, seg, portr, spark, lineChart, barChart, ring, P, callout, wl, arena, courtLines } from '../ui.js'
import { TEAMS, FIXTURES, RESULTS, PLAYERS } from '../data.js'

export const tabs = [{ id: 'temporada', label: 'Temporada' }, { id: 'proximos', label: 'Próximos' }, { id: 'resultados', label: 'Resultados' }]

export function render(tab, dir) {
  const B = dir === 'b'
  const fn = { temporada, proximos, resultados }[tab]
  return { eyebrow: 'Partidos · Calendario', title: 'Calendario', sub: 'Dunmere Orbits · 36 partidos de liga · 18 jugados', cont: 'Partido', right: `${btn('Sincronizar', { ghost: true, icon: 'cal' })}${btn('Simular hasta…', { primary: true, icon: 'play' })}`, ...fn(B) }
}

// 29 nov (lun) … 2 ene (dom)
const MATCH = { '29N': ['JS', false, 'W', '84-79'], '2D': ['AK', true, 'W', '110-96'], '5D': ['IV', true, 'L', '88-94'], '8D': ['BS', false, 'W', '97-90'], '11D': ['GS', true, 'W', '102-91'], '14D': ['LF', true, 'today'], '17D': ['JS', true], '20D': ['AK', false], '23D': ['IV', true], '27D': ['BS', false], '30D': ['GS', true], '2E': ['HL', false] }
function cells() {
  const out = []
  for (let i = 0; i < 35; i++) {
    const d = 29 + i
    let key, day, off = false
    if (d <= 30) { key = `${d}N`; day = d; off = true } else if (d <= 61) { day = d - 30; key = `${day}D` } else { day = d - 61; key = `${day}E`; off = true }
    out.push({ key, day, off, m: MATCH[key] })
  }
  return out
}

function temporada(B) {
  const names = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']
  const cal = cells().map((c) => {
    const m = c.m; const cls = !m ? '' : m[2] === 'W' ? 'w' : m[2] === 'L' ? 'l' : m[2] === 'today' ? 't' : 'n'
    return `<div class="cal-c ${cls} ${c.off ? 'off' : ''}"><div class="cal-d">${c.day}</div>${m ? `<div class="cal-m">${T(m[0], 26, 'round')}<div class="cal-t"><b>${m[1] ? 'vs' : '@'} ${m[0]}</b>${m[3] ? `<span class="num">${m[3]}</span>` : m[2] === 'today' ? '<span>HOY 20:00</span>' : ''}</div></div>` : ''}</div>`
  }).join('')
  const grid = card(B ? null : 'Diciembre 2032', `${B ? `<div class="row between" style="margin-bottom:10px"><div class="giant" style="font-size:64px">Diciembre <span class="outline">2032</span></div><div class="row gap-s">${btn('', { icon: 'chevron', sm: true, ghost: true })}${seg(['Mes', 'Semana', 'Lista'], 'Mes')}</div></div>` : ''}<div class="cal-h">${names.map((n) => `<span>${n}</span>`).join('')}</div><div class="cal-g">${cal}</div>
    <div class="row gap-s wrap" style="margin-top:12px">${chip('● Victoria', 'pos')}${chip('● Derrota', 'neg')}${chip('● Hoy', 'am')}${chip('Pendiente', '')}${chip('vs = casa · @ = fuera', '')}</div>
    <style>
    .cal-h{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px;font-size:11px;letter-spacing:.14em;color:var(--tx3);font-weight:700}
    .cal-g{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
    .cal-c{min-height:92px;border-radius:12px;background:var(--s2);padding:8px;display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);min-width:0}
    .cal-c.off{opacity:.45}.cal-d{font-weight:800;font-size:13px;color:var(--tx2)}
    .cal-m{display:flex;align-items:center;gap:6px;min-width:0}.cal-t{display:flex;flex-direction:column;font-size:11.5px;min-width:0;line-height:1.2}.cal-t span{color:var(--tx3);font-size:11px}
    .cal-c.w{border-color:color-mix(in srgb,var(--pos) 55%,transparent);background:color-mix(in srgb,var(--pos) 9%,var(--s2))}
    .cal-c.l{border-color:color-mix(in srgb,var(--neg) 55%,transparent);background:color-mix(in srgb,var(--neg) 9%,var(--s2))}
    .cal-c.t{border:2px solid var(--am);background:color-mix(in srgb,var(--am) 14%,var(--s2))}
    .cal-c.n{border-style:dashed}
    @media (max-width:699px){.cal-c{min-height:58px;padding:5px}.cal-t{display:none}.cal-m svg{width:20px;height:20px}.cal-d{font-size:11px}}
    </style>`, { span: 's9', ic: 'cal', cls: B ? 'plain' : '' })
  const side = `<div class="s3 stack">${card('Próximo partido', `<div class="stack tight" style="align-items:center;text-align:center"><div class="lbl">Hoy · 20:00</div>${T('LF', 78, 'round')}<div class="h2">Larkspur Forge</div><div class="note">Orbit Dome · Local</div>${wl('LLWLL')}${btn('Abrir partido', { primary: true, icon: 'play' })}</div>`, { ic: 'play' })}${card('Balance de temporada', `<div class="stack" style="gap:12px"><div class="row" style="align-items:flex-end;gap:10px"><div class="big-n" style="font-size:54px">13-5</div><div class="note" style="padding-bottom:8px">72%</div></div>${bar(72, { cls: 'pos', h: 8 })}<div class="cols2">${kpi('Casa', '8-2')}${kpi('Fuera', '5-3')}</div>${spark([1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 8, 9, 9, 10, 11, 11, 12, 13], { w: 240, h: 44, stroke: 'var(--pos)', fill: 'var(--pos)' })}</div>`, { ic: 'trophy' })}</div>`
  const prog = card('Progreso de la temporada', `<div class="stack"><div class="row between"><b>18 de 36 jornadas</b><span class="note">Playoffs · abril</span></div><div style="display:flex;gap:3px">${Array.from({ length: 36 }, (_, i) => `<i style="flex:1;height:14px;border-radius:3px;background:${i < 18 ? (i % 4 === 2 ? 'var(--neg)' : 'var(--pos)') : i === 18 ? 'var(--am)' : 'var(--track)'}"></i>`).join('')}</div><div class="row between note"><span>OCT</span><span>DIC</span><span>FEB</span><span>ABR</span></div></div>`, { span: 's12', ic: 'flame' })
  return { html: `<div class="grid">${grid}${side}${prog}</div>` }
}

function proximos(B) {
  const list = FIXTURES.map((f, i) => `<div class="card inset" style="padding:0;border-radius:18px;${i === 0 ? 'outline:2px solid var(--am)' : ''}"><div style="display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:16px;align-items:center;padding:14px 18px"><div class="stack tight" style="align-items:center"><div class="${B ? 'giant' : 'big-n'}" style="font-size:${B ? 52 : 32}px">${f.d.split(' ')[0]}</div><div class="lbl">${f.d.split(' ')[1]} · ${f.dow}</div></div>
    <div class="row" style="gap:16px;min-width:0">${T(f.opp, 56, 'round')}<div class="grow" style="min-width:0"><div class="h3 trunc">${f.home ? 'vs' : '@'} ${TEAMS[f.opp].name}</div><div class="note">${f.home ? 'Orbit Dome' : TEAMS[f.opp].city + ' Arena'} · ${f.t}</div><div style="margin-top:6px">${wl(['WWLWW', 'LLLWL', 'LWLWL', 'LLWLL', 'WLWLW', 'LWWLW', 'WWWLW'][i])}</div></div></div>
    <div class="stack tight" style="align-items:flex-end;min-width:110px"><div class="lbl">Prob. victoria</div><div class="row gap-s"><b class="num" style="font-size:22px">${[78, 91, 70, 83, 62, 74, 38][i]}%</b></div><div style="width:110px">${bar([78, 91, 70, 83, 62, 74, 38][i], { cls: [78, 91, 70, 83, 62, 74, 38][i] < 50 ? 'neg' : 'pos', h: 6 })}</div></div></div></div>`).join('')
  const ls = card('Próximos 7 partidos', `<div class="stack">${list}</div>`, { span: 's8', ic: 'schedule', sub: 'Diciembre – enero' })
  const ins = `<div class="s4 stack">${card('Carga de calendario', `<div class="stack" style="gap:12px">${barChart([1, 1, 1, 1, 1, 1, 0.4], ['S51', 'S52', 'S1', 'S2', 'S3', 'S4', 'S5'], { color: 'var(--cy)', grid: P.grid, text: P.text, h: 170, w: 360, max: 2, ticks: 2 })}${callout('4 partidos en 8 días entre el 17 y el 25 DIC: planifica rotaciones.', { icon: 'flame' })}</div>`, { ic: 'flame' })}${card('Viajes', `<div class="stack tight">${[['AK · Ashvale', '186 km'], ['BS · Brimford', '420 km'], ['HL · Highridge', '95 km']].map(([a, b]) => `<div class="li" style="padding:8px 0">${I('pin', 16)}<b class="grow">${a}</b><span class="num dim">${b}</span></div>`).join('')}</div>`, { ic: 'pin' })}</div>`
  return { html: `<div class="grid">${ls}${ins}</div>` }
}

function resultados(B) {
  const list = RESULTS.map((r, i) => `<div class="li" style="padding:14px 4px"><span class="num dim" style="width:52px">${r.d}</span>${T('DO', 30)}<b style="width:110px">${r.home ? 'Orbits' : TEAMS[r.opp].short}</b><div class="row" style="gap:8px;width:110px;justify-content:center"><b class="num" style="font-size:20px">${r.s[0]}</b><span class="muted">–</span><b class="num" style="font-size:20px;color:var(--tx3)">${r.s[1]}</b></div>${T(r.opp, 30)}<b class="grow trunc">${r.home ? TEAMS[r.opp].short : 'Orbits'}</b><span class="chip ${r.w ? 'pos' : 'neg'}">${r.w ? 'V' : 'D'}</span><div class="row gap-s c-hs" style="width:170px">${portr(PLAYERS[8], 30, { team: 'DO', round: true, number: false })}<div><b style="font-size:12.5px">B. Istra</b><div class="note">${[31, 24, 17, 28, 22][i]} pts · ${[14, 11, 9, 12, 10][i]} reb</div></div></div></div>`).join('')
  const res = card('Últimos resultados', `<div class="stack tight">${list}</div>`, { span: 's8', ic: 'doc' })
  const sum = `<div class="s4 stack">${card('Resumen', `<div class="cols2">${kpi('Racha', 'V2', { tone: 'pos' })}${kpi('Últimos 10', '8-2')}${kpi('Puntos a favor', '98.6')}${kpi('Puntos en contra', '91.2')}</div>`, { ic: 'trophy' })}${card('Evolución de victorias', lineChart([{ v: [0, 1, 2, 2, 3, 4, 4, 5, 6, 7, 7, 8, 9, 10, 10, 11, 12, 13] }], Array.from({ length: 18 }, (_, i) => i + 1), { grid: P.grid, text: P.text, h: 200, w: 400, min: 0, max: 14, ticks: 2 }), { ic: 'flame' })}</div>`
  return { html: `<div class="grid">${res}${sum}</div>` }
}
