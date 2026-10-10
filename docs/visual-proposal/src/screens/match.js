import { rt10, I, T, card, kpi, table, rt, chip, btn, bar, seg, posPill, portr, spark, lineChart, barChart, ring, court, fullCourt, arena, courtLines, P, callout, duel, wl } from '../ui.js'
import { PLAYERS, TEAMS, FIXTURES } from '../data.js'

export const tabs = [{ id: 'previa', label: 'Previa' }, { id: 'directo', label: 'En directo' }, { id: 'cronica', label: 'Crónica' }]

export function render(tab, dir) {
  const B = dir === 'b'
  const fn = { previa, directo, cronica }[tab]
  const meta = {
    previa: { title: 'Dunmere Orbits vs Larkspur Forge', sub: 'Día de partido · 14 DIC · Orbit Dome · Local', cont: 'Jugar' },
    directo: { title: 'Orbits 78 · 71 Forge', sub: 'Cuarto 3 · 04:12 · En directo', cont: 'Reanudar' },
    cronica: { title: 'Victoria 108 - 92', sub: 'Dunmere Orbits vs Larkspur Forge · 14 DIC', cont: 'Continuar' },
  }[tab]
  return { eyebrow: 'Partidos · Centro de partido', ...meta, ...fn(B) }
}

const startersDO = [PLAYERS[0], PLAYERS[3], PLAYERS[5], PLAYERS[7], PLAYERS[8]]

function previa(B) {
  const hero = `<section class="card hero s12" style="min-height:300px"><div class="hero-art">${arena(TEAMS.DO.c1, TEAMS.DO.c2, { seed: 8 })}</div><div class="hero-fade"></div>${B ? `<div style="position:absolute;inset:0;color:#fff">${courtLines('#fff', 0.12)}</div>` : ''}
    <div class="hero-c vs3" style="display:grid;grid-template-columns:1fr auto 1fr;gap:18px;align-items:center;min-height:300px">
      <div class="stack" style="align-items:center;text-align:center;gap:8px">${T('DO', B ? 130 : 110, 'round')}<div class="${B ? 'giant' : 'h2'}" style="${B ? 'font-size:54px' : ''}">Dunmere Orbits</div><div class="muted">13-5 · 2º · racha V2</div>${wl('WWLWW')}</div>
      <div class="stack" style="align-items:center;gap:10px;text-align:center"><div class="lbl">Hoy · 20:00</div><div class="${B ? 'giant' : 'big-n'}" style="font-size:${B ? 110 : 56}px">VS</div><div class="row gap-s wrap" style="justify-content:center">${chip('Local', 'am')}${chip('TV · Liga Pass', '')}${chip('Aforo 8.420', '')}</div></div>
      <div class="stack" style="align-items:center;text-align:center;gap:8px">${T('LF', B ? 130 : 110, 'round')}<div class="${B ? 'giant' : 'h2'}" style="${B ? 'font-size:54px' : ''}">Larkspur Forge</div><div class="muted">4-14 · 8º · racha D3</div>${wl('LLWLL')}</div>
    </div></section>`
  const actions = card('Qué quieres hacer', `<div class="stack" style="gap:10px">${btn('Jugar partido', { primary: true, icon: 'play' }).replace('class="btn', 'style="width:100%;height:48px" class="btn')}${[['Resultado instantáneo', 'bolt', 'Simula el partido sin verlo'], ['Simular otros partidos', 'cal', 'Resuelve el resto de la jornada'], ['Avanzar un día', 'schedule', 'Salta sin jugar (posible derrota)']].map(([a, ic, b]) => `<div class="li" style="padding:10px 12px;border:1px solid var(--line);border-radius:12px"><span class="chip" style="width:34px;height:34px;padding:0;justify-content:center;border-radius:10px">${I(ic, 16)}</span><div class="grow"><b>${a}</b><div class="note">${b}</div></div>${I('chevron', 16)}</div>`).join('')}<div class="row gap-s">${btn('Plantilla', { sm: true, icon: 'roster' })}${btn('Tácticas', { sm: true, icon: 'tactics' })}</div></div>`, { span: 's4', ic: 'play' })
  const rows = PLAYERS.map((p, i) => [`<div class="pcell">${portr(p, 30, { team: 'DO', round: true, number: false })}<b>${p.n}</b></div>`, posPill(p.pos), `<div style="width:90px">${bar(p.st === 'OK' ? [8, 14, 6, 22, 10, 12, 18, 4, 16, 28, 0, 9][i] : 0, { h: 5, cls: [8, 14, 6, 22, 10, 12, 18, 4, 16, 28, 0, 9][i] > 25 ? 'neg' : 'pos' })}</div>`, p.st === 'OK' ? chip('Disponible', 'pos') : chip('Lesionado', 'neg')])
  const ready = card('Disponibilidad del equipo', table([{ t: 'Jugador' }, { t: 'Pos', a: 'c' }, { t: 'Fatiga', h: 's' }, { t: 'Estado' }], rows, { cls: 'tight' }), { span: 's5', cls: 'flush', ic: 'heart' })
  const h2h = card('Historial y claves', `<div class="stack" style="gap:14px"><div class="row between"><b>Últimos 5 duelos</b>${wl('WWWLW')}</div><div class="cols3">${kpi('Ritmo', '98.4')}${kpi('Pintura', '+9', { tone: 'pos' })}${kpi('Triples', '35%')}</div><div class="hr"></div>${callout('Forge cede 49.8 puntos en la pintura. Bren Istra tiene ventaja física ante Ruben Hale.', { tone: 'cy', icon: 'target' })}${callout('Atención a Jace Rooney: 63% tras bloqueo directo.', { icon: 'bolt' })}</div>`, { span: 's3', ic: 'scouting' })
  return { html: `<div class="grid eq">${hero}</div><div class="grid">${actions}${ready}${h2h}</div>` }
}

const HOME = [{ x: 560, y: 120, t: 4 }, { x: 500, y: 330, t: 3 }, { x: 640, y: 250, t: 8 }, { x: 700, y: 170, t: 32 }, { x: 780, y: 300, t: 23 }]
const AWAY = [{ x: 590, y: 150, t: 5 }, { x: 540, y: 300, t: 9 }, { x: 650, y: 280, t: 12 }, { x: 740, y: 190, t: 21 }, { x: 800, y: 250, t: 30 }]

function directo(B) {
  const dots = [...HOME.map((d, i) => ({ ...d, fill: 'var(--cy)', tc: '#04141a', bar: [0.8, 0.55, 0.9, 0.4, 0.62][i] })), ...AWAY.map((d) => ({ ...d, fill: '#2e9d62', tc: '#fff' })), { kind: 'ball', x: 560, y: 138 }]
  const arrows = [{ from: [560, 120], to: [690, 170], curve: [620, 100], color: 'var(--am)', w: 4 }, { from: [500, 330], to: [630, 262], dash: true, color: 'rgba(255,255,255,.6)' }]
  const sb = `<section class="card hero s12"><div class="card-b" style="padding:0"><div class="vs3" style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;padding:16px 22px">
    <div class="row" style="gap:14px">${T('DO', 54, 'round')}<div><div class="h2">Orbits</div><div class="note">Faltas 9 · TM 5</div></div><div class="grow"></div><div class="big-n" style="font-size:${B ? 90 : 52}px">78</div></div>
    <div class="stack tight" style="align-items:center"><div class="chip am" style="height:30px">CUARTO 3</div><div class="${B ? 'giant' : 'big-n'}" style="font-size:${B ? 56 : 34}px">04:12</div><div class="row gap-s">${['21-18', '24-22', '33-31', '—'].map((q, i) => `<span class="chip ${i === 2 ? 'cy' : ''}">${q}</span>`).join('')}</div></div>
    <div class="row" style="gap:14px"><div class="big-n" style="font-size:${B ? 90 : 52}px">71</div><div class="grow"></div><div style="text-align:right"><div class="h2">Forge</div><div class="note">Faltas 11 · TM 4</div></div>${T('LF', 54, 'round')}</div></div></div></section>`
  const view = card(null, `<div class="stack"><div class="pitch-bg">${fullCourt({ dots, arrows, line: 'rgba(255,255,255,.65)' })}</div>
    <div class="row between wrap" style="gap:10px"><div class="row gap-s">${btn('', { icon: 'play', sm: true })}${seg(['1x', '2x', '4x', 'Salto'], '2x')}</div><div class="row gap-s wrap">${btn('Tiempo muerto', { sm: true })}${btn('Sustitución', { sm: true, icon: 'swap' })}${btn('Subir ritmo', { sm: true, cyan: true })}</div></div></div>`, { span: 's8' })
  const feed = card('Jugada a jugada', `<div class="stack" style="max-height:480px;overflow:hidden">${[['04:12', 'DO', 'Triple de Arel Dain tras pase de Bexley', '+3'], ['04:31', 'LF', 'Canasta de Okafor en la pintura', '+2'], ['04:52', 'DO', 'Rebote ofensivo de Bren Istra', ''], ['05:08', 'DO', 'Tapón de Hira Corven a Rooney', ''], ['05:20', 'LF', 'Pérdida de Forge · robo de Bexley', ''], ['05:44', 'DO', 'Mate de Bren Istra', '+2'], ['06:03', 'LF', 'Tiros libres de Kess (2/2)', '+2']].map(([t, tm, tx, pts]) => `<div class="li" style="padding:9px 0"><span class="num dim" style="width:42px">${t}</span>${T(tm, 24)}<div class="grow">${tx}</div>${pts ? `<b class="${tm === 'DO' ? 'cy' : 'dim'}">${pts}</b>` : ''}</div>`).join('')}</div>`, { span: 's4', ic: 'news', sub: 'Eventos clave resaltados' })
  const worm = card('Ventaja del partido', lineChart([{ v: [0, 3, 2, 5, 4, 8, 6, 3, 5, 9, 7, 6, 8, 11, 9, 7] }], ['0', '3', '6', '9', '12', '15', '18', '21', '24', '27', '30', '33', '36', '39', '42', '45'], { grid: P.grid, text: P.text, h: 190, w: 700, ticks: 4, min: -4, max: 12, fmt: (v) => (v > 0 ? '+' + v : v) }), { span: 's5', ic: 'flame', sub: 'Orbits +7 · racha parcial 9-2' })
  const lineup = card('Quinteto en pista', `<div class="stack tight">${startersDO.map((p, i) => `<div class="row" style="gap:10px">${portr(p, 34, { team: 'DO', round: true, number: false })}<div class="grow"><div class="row between"><b class="trunc">${p.n}</b><span class="num dim">${[12, 14, 9, 10, 15][i]} pts</span></div>${bar([80, 55, 90, 40, 62][i], { h: 5, cls: [80, 55, 90, 40, 62][i] < 50 ? 'neg' : 'pos' })}</div>${posPill(p.pos)}</div>`).join('')}</div>`, { span: 's4', ic: 'users', sub: 'Barra = energía' })
  const live = card('Ajustes en vivo', `<div class="stack tight">${[['Subir ritmo', 'bolt'], ['Defensa en zona 2-3', 'shield'], ['Presión a toda pista', 'flame'], ['Cambiar a pick & roll', 'tactics']].map(([a, ic]) => `<div class="li" style="padding:9px 0">${I(ic, 16)}<b class="grow">${a}</b>${btn('Aplicar', { sm: true, ghost: true })}</div>`).join('')}</div>`, { span: 's3', ic: 'cog' })
  return { html: `<div class="grid eq">${sb}</div><div class="grid">${view}${feed}${worm}${lineup}${live}</div>` }
}

function cronica(B) {
  const hero = `<section class="card hero s12"><div class="hero-art">${arena(TEAMS.DO.c1, TEAMS.DO.c2, { seed: 2 })}</div><div class="hero-fade"></div><div class="hero-c vs3" style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px"><div class="stack" style="align-items:center;gap:6px">${T('DO', 96, 'round')}<div class="h2">Orbits</div></div><div class="stack" style="align-items:center;gap:8px"><div class="chip am">FINAL</div><div class="${B ? 'giant' : 'big-n'}" style="font-size:${B ? 120 : 64}px">108 – 92</div><div class="muted">+16 · Mejor racha de la temporada: 6 victorias</div></div><div class="stack" style="align-items:center;gap:6px">${T('LF', 96, 'round')}<div class="h2">Forge</div></div></div></section>`
  const q = card('Marcador por cuartos', table([{ t: 'Equipo' }, { t: 'Q1', a: 'c' }, { t: 'Q2', a: 'c' }, { t: 'Q3', a: 'c' }, { t: 'Q4', a: 'c' }, { t: 'Total', a: 'r' }], [[teamLike('DO'), '28', '24', '31', '25', '<b>108</b>'], [teamLike('LF'), '22', '25', '20', '25', '<b>92</b>']], { cls: 'tight' }), { span: 's5', cls: 'flush', ic: 'trophy' })
  const mvp = card('Jugador del partido', `<div class="row" style="gap:16px">${portr(PLAYERS[8], 110, { team: 'DO' })}<div class="grow stack tight"><div class="h2">Bren Istra</div><div class="note">PF · 34 min</div><div class="cols3" style="margin-top:6px">${kpi('Pts', '31')}${kpi('Reb', '14')}${kpi('Ast', '5')}</div></div>${rt10(9.4, 'big')}</div>`, { span: 's4', ic: 'star', cls: B ? 'lime' : '' })
  const gr = card('Nota del entrenador', `<div class="stack" style="align-items:center;gap:8px"><div style="width:110px">${ring(88, { size: 110, thick: 11, color: P.am, label: '8.8' })}</div><div class="h3">Gran planteamiento</div><div class="note center">Ajuste de ritmo en Q3 decisivo</div></div>`, { span: 's3', ic: 'doc' })
  const rows = PLAYERS.slice(0, 7).map((p, i) => [`<div class="pcell">${portr(p, 28, { team: 'DO', round: true, number: false })}<b>${p.n}</b></div>`, `<span class="num">${[33, 29, 31, 22, 34, 14, 16][i]}</span>`, `<b class="num">${[14, 15, 12, 9, 31, 4, 6][i]}</b>`, `<span class="num">${[3, 4, 5, 6, 14, 2, 5][i]}</span>`, `<span class="num">${[7, 2, 3, 1, 5, 0, 1][i]}</span>`, `<span class="num ${[8, 6, -2, 5, 14, -3, 4][i] >= 0 ? 'pos' : 'neg'}">${[8, 6, -2, 5, 14, -3, 4][i] > 0 ? '+' : ''}${[8, 6, -2, 5, 14, -3, 4][i]}</span>`, rt10([7.8, 7.2, 6.9, 6.6, 9.4, 5.8, 6.4][i])])
  const box = card('Estadísticas · Dunmere Orbits', table([{ t: 'Jugador' }, { t: 'Min', a: 'r', h: 's' }, { t: 'Pts', a: 'r' }, { t: 'Reb', a: 'r' }, { t: 'Ast', a: 'r', h: 's' }, { t: '+/-', a: 'r', h: 'm' }, { t: 'Val', a: 'c' }].slice(0, 6).concat([{ t: 'Val', a: 'c' }]).filter((c, i, a) => i < 7), rows.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5], r[6]]), { cls: 'tight' }), { span: 's8', cls: 'flush', ic: 'doc' })
  const cmp = card('Equipos', `<div class="stack" style="gap:12px">${duel('48%', 'Tiros de campo', '41%', 48, 41)}${duel('39%', 'Triples', '31%', 39, 31)}${duel('46', 'Rebotes', '38', 46, 38)}${duel('12', 'Pérdidas', '17', 30, 42)}${duel('52', 'Puntos en la pintura', '38', 52, 38)}</div>`, { span: 's4', ic: 'swap' })
  return { html: `<div class="grid eq">${hero}</div><div class="grid">${q}${mvp}${gr}${box}${cmp}</div>` }
}

function teamLike(id) { return `<div class="pcell">${T(id, 26)}<b>${TEAMS[id].name}</b></div>` }
