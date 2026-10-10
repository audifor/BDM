import { topChip, I, T, card, kpi, table, rt, chip, btn, bar, duel, portr, spark, ring, arena, courtLines, teamCell, wl, formDots, P, callout, donut } from '../ui.js'
import { TEAMS, PLAYERS, STANDINGS_MID, FIXTURES, RESULTS, LEAGUE } from '../data.js'

export const tabs = [{ id: 'resumen', label: 'Resumen' }]

const leaders = () => {
  const top = (k) => [...PLAYERS].sort((a, b) => b[k] - a[k])[0]
  return [['Puntos', 'pts', top('pts')], ['Rebotes', 'reb', top('reb')], ['Asistencias', 'ast', top('ast')], ['Minutos', 'min', top('min')]]
}

export function render(tab, dir) {
  return dir === 'b' ? renderB() : renderA()
}

function renderA() {
  const hero = `<section class="card hero s8" style="min-height:330px">
    <div class="hero-art">${arena(TEAMS.DO.c1, TEAMS.DO.c2, { seed: 5 })}</div><div class="hero-fade"></div>
    <div class="hero-c" style="height:100%;display:flex;flex-direction:column;justify-content:space-between;gap:18px">
      <div class="row between wrap"><div class="row gap-s">${chip('Día de partido', 'am', 'flame')}${chip('Local', '')}${chip('Orbit Dome · 20:00', '')}</div><span class="lbl">${LEAGUE.name} · Jornada 19</span></div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px">
        <div class="center stack tight" style="align-items:center">${T('DO', 104, 'round')}<div class="h2">Dunmere Orbits</div><div class="muted">13-5 · 2º · racha V2</div></div>
        <div class="center"><div class="lbl">Hoy</div><div class="big-n" style="font-size:54px;letter-spacing:.02em">VS</div><div class="muted num">20:00</div></div>
        <div class="center stack tight" style="align-items:center">${T('LF', 104, 'round')}<div class="h2">Larkspur Forge</div><div class="muted">4-14 · 8º · racha D3</div></div>
      </div>
      <div class="row between wrap" style="gap:14px"><div style="flex:1;min-width:220px"><div class="row between" style="margin-bottom:6px"><span class="lbl">Probabilidad de victoria</span><b class="num" style="font-size:18px">78%</b></div><div class="bar" style="height:8px;background:rgba(255,255,255,.18)"><i style="width:78%"></i></div></div><div class="row gap-s wrap">${btn('Abrir partido', { primary: true, icon: 'play' })}${btn('Plan táctico', { icon: 'tactics' })}${btn('Informe del rival', { icon: 'scouting' })}</div></div>
    </div></section>`

  const dyn = card('Dinámicas del choque', `<div class="stack" style="gap:14px;padding-top:6px">
    <div class="row between note"><b style="color:var(--tx)">Orbits</b><b style="color:var(--tx)">Forge</b></div>
    ${duel(71, 'Fuerza', 64)}${duel(68, 'Cohesión', 52)}${duel(74, 'Moral', 41)}${duel(82, 'Forma', 47)}${duel(72, 'Ataque', 61)}${duel(66, 'Defensa', 58)}
    </div>`, { span: 's4', ic: 'bolt', sub: 'Ventaja clara en moral y forma' })

  const rows = STANDINGS_MID.slice(0, 8).map((r, i) => [`<span class="num muted">${i + 1}</span>`, teamCell(r[0], { s: 22 }), `<span class="num">${r[2]}</span>`, `<span class="num">${r[3]}</span>`, `<b class="num">${r[2] * 2}</b>`])
  const stand = card('Clasificación', table([{ t: '#', w: '30px' }, { t: 'Equipo' }, { t: 'V', a: 'r' }, { t: 'D', a: 'r' }, { t: 'Pts', a: 'r' }], rows, { cls: 'tight', me: 1, zones: { 0: 'p', 1: 'p', 2: 'p', 3: 'p', 7: 'r' } }), { span: 's4', ic: 'trophy', cls: 'flush', sub: 'Top 4 → Playoffs' })

  const lead = card('Líderes del equipo', `<div class="stack" style="gap:0">${leaders().map(([lab, k, p]) => `<div class="li">${portr(p, 52, { team: 'DO', number: false })}<div class="grow"><div class="lbl">${lab}</div><div style="font-weight:700;font-size:15px">${p.n}</div><div class="note">${p.pos} · ${p.age} años</div></div><div class="big-n num" style="font-size:30px;color:var(--am-t)">${p[k].toFixed(1)}</div></div>`).join('')}</div>`, { span: 's4', ic: 'star' })

  const goals = card('Objetivos de la directiva', `<div class="stack" style="gap:14px"><div class="row" style="gap:16px">${ring(82, { size: 78, thick: 8, color: P.cy, label: '82%' })}<div><div class="lbl">Confianza de la directiva</div><div class="h3">Estable · al alza</div><div class="note">+4 esta semana</div></div></div><div class="hr"></div>
    ${[['Clasificar a playoffs', 88, 'Top 4'], ['Presupuesto equilibrado', 64, '−0.6 M€ margen'], ['Desarrollar a Bren Istra', 71, 'Tiro de tres +3'], ['Mantener la moral > 70', 92, 'Cumplido']].map(([t, v, s]) => `<div><div class="row between"><b>${t}</b><span class="note">${s}</span></div>${bar(v, { h: 6, cls: 'cy' })}</div>`).join('')}</div>`, { span: 's4', ic: 'shield' })

  const nxt = card('Próximos partidos', `<div class="cols3" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">${FIXTURES.slice(1, 5).map((f) => `<div class="card inset" style="padding:12px;gap:8px;align-items:flex-start;border-radius:10px"><div class="row between" style="width:100%"><span class="lbl">${f.dow} ${f.d}</span>${chip(f.home ? 'CASA' : 'FUERA', f.home ? 'cy' : '')}</div>${T(f.opp, 44, 'round')}<div><b>${TEAMS[f.opp].short}</b><div class="note num">${f.t}</div></div></div>`).join('')}</div>`, { span: 's5', ic: 'schedule', sub: 'Próximos 4 partidos' })

  const med = PLAYERS.filter((p) => p.st === 'LES')[0]
  const squad = card('Estado de la plantilla', `<div class="stack" style="gap:12px"><div class="row" style="gap:16px"><div style="width:112px;flex:none">${donut([{ v: 11, color: P.pos }, { v: 1, color: P.neg }], { size: 112, thick: 14, center: '11/12', sub: 'DISP.', text: 'var(--tx)' })}</div><div class="stack tight grow"><div class="row between"><span class="dim">Fatiga media</span><b class="num">18%</b></div>${bar(18, { cls: 'pos', h: 5 })}<div class="row between"><span class="dim">Moral</span><b class="num">Alta</b></div>${bar(78, { cls: 'cy', h: 5 })}<div class="row between"><span class="dim">Cohesión</span><b class="num">68</b></div>${bar(68, { h: 5 })}</div></div>
    <div class="callout neg">${I('medical', 16)}<div><b>${med.n}</b> · lesión muscular, baja 9 días. Recomendado: descanso hoy.</div></div></div>`, { span: 's4', ic: 'medical' })

  const fin = card('Finanzas', `<div class="stack" style="gap:12px"><div class="cols2">${kpi('Caja', '18.4', { unit: 'M€', delta: '+0.8 M€ mes', tone: 'pos' })}${kpi('Masa salarial', '9.2', { unit: 'M€', sub: 'Límite 11.0' })}</div>${spark([12, 13.1, 13.6, 14.9, 15.4, 16.8, 17.6, 18.4], { w: 300, h: 52, stroke: 'var(--cy)', fill: 'var(--cy)' })}${bar(84, { h: 6 })}<div class="note">84% del límite salarial utilizado</div></div>`, { span: 's3', ic: 'finances' })

  return { eyebrow: 'Inicio · Día de partido', title: 'Dunmere Orbits', sub: `${LEAGUE.dateLong} · ${LEAGUE.name}`, right: btn('Avanzar un día', { ghost: true }), html: `<div class="grid eq">${hero}${dyn}${stand}${lead}${goals}${nxt}${squad}${fin}</div>` }
}

function renderB() {
  const poster = `<section class="poster s12">
    <div class="hero-art">${arena(TEAMS.DO.c1, TEAMS.DO.c2, { seed: 11, h: 480 })}</div><div class="hero-fade"></div>
    <div style="position:absolute;inset:0;color:#fff;opacity:.9">${courtLines('#fff', 0.13)}</div>
    <div class="hero-c" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;min-height:400px">
      <div class="stack" style="gap:18px;justify-content:space-between;height:100%">
        <div class="row gap-s wrap">${chip('Hoy · 20:00', 'am')}${chip('Jornada 19', '')}${chip('Orbit Dome', '')}</div>
        <div><div class="row" style="gap:14px;margin-bottom:6px">${T('DO', 74, 'round')}<span class="giant" style="font-size:30px;opacity:.7">vs</span>${T('LF', 74, 'round')}</div>
          <div class="giant" style="font-size:clamp(64px,9vw,150px)">Orbits<br><span style="color:var(--li)">Forge</span></div></div>
        <div class="row gap-s wrap">${btn('Abrir partido', { primary: true, icon: 'play' })}${btn('Plan táctico')}${btn('Informe del rival')}</div>
      </div>
      <div class="stack only-wide" style="gap:10px;align-items:flex-end;text-align:right"><span class="lbl">Probabilidad de victoria</span><div class="giant" style="font-size:150px;color:var(--li)">78<span style="font-size:60px">%</span></div><div class="note" style="color:rgba(255,255,255,.7)">Orbits 13-5 · 2º &nbsp;|&nbsp; Forge 4-14 · 8º</div></div>
    </div></section>`

  const five = PLAYERS.filter((p) => [1, 4, 6, 8, 9].includes(p.id) || false)
  const starters = [PLAYERS[0], PLAYERS[3], PLAYERS[5], PLAYERS[7], PLAYERS[8]]
  const lineup = card('Quinteto probable', `<div class="cols5">${starters.map((p) => `<div class="stack tight" style="align-items:center;text-align:center;background:var(--s2);border-radius:18px;padding:14px 8px 12px">${portr(p, 92, { team: 'DO' })}<div style="font-weight:700;line-height:1.15;margin-top:4px">${p.n}</div><div class="row gap-s">${chip(p.pos, 'sq')}</div><div>${topChip(p)}</div><div class="note num">${p.pts} pts · ${p.reb} reb</div></div>`).join('')}</div>`, { span: 's8', sub: 'Sinergia 91% · 4-Out 1-In' })

  const key = `<section class="card lime s4"><div class="card-b" style="padding:22px;display:flex;flex-direction:column;gap:12px;height:100%"><div class="lbl">Clave del partido</div><div class="h2" style="font-size:38px">Castiga su defensa interior</div><div class="note" style="color:inherit;opacity:.75">Forge concede 49.8 pts en la pintura (peor de la liga). Bren Istra tiene 82 en finalización.</div><div class="sp"></div><div class="row between"><div class="kpi"><div class="kpi-l">Ritmo previsto</div><div class="kpi-v">98.4</div></div><div class="kpi"><div class="kpi-l">Pintura</div><div class="kpi-v">+9</div></div></div></div></section>`

  const rows = STANDINGS_MID.slice(0, 8).map((r, i) => [`<span class="num muted">${i + 1}</span>`, teamCell(r[0], { s: 26 }), `<b class="num">${r[2]}-${r[3]}</b>`, wl(r[7])])
  const stand = card('Clasificación', table([{ t: '#', w: '34px' }, { t: 'Equipo' }, { t: 'V-D', a: 'r' }, { t: 'Racha', h: 'm' }], rows, { cls: 'tight', me: 1, zones: { 0: 'p', 1: 'p', 2: 'p', 3: 'p', 7: 'r' } }), { span: 's5', cls: 'flush' })

  const form = card('Forma del equipo', `<div class="stack" style="gap:16px"><div class="row" style="align-items:flex-end;gap:14px"><div class="kpi big"><div class="kpi-l">Balance</div><div class="kpi-v">13<span style="color:var(--tx3)">-5</span></div></div><div class="grow"></div>${wl('WWLWW')}</div>${spark([96, 101, 94, 88, 110, 102, 97, 88, 102], { w: 400, h: 70, stroke: 'var(--or)', fill: 'var(--or)', fo: 0.18, sw: 3 })}<div class="cols3"><div class="slab"><div class="lbl">Puntos</div><div class="h2">98.6</div></div><div class="slab"><div class="lbl">Recibidos</div><div class="h2">91.2</div></div><div class="slab li"><div class="lbl">Dif.</div><div class="h2">+7.4</div></div></div></div>`, { span: 's4' })

  const nx = card('Próximos', `<div class="stack tight">${FIXTURES.slice(1, 5).map((f) => `<div class="row" style="background:var(--s2);border-radius:16px;padding:10px 14px;gap:12px">${T(f.opp, 38, 'round')}<div class="grow"><b>${f.home ? 'vs' : '@'} ${TEAMS[f.opp].short}</b><div class="note num">${f.t}</div></div><div class="h3 num" style="text-align:right;line-height:1">${f.d.split(' ')[0]}<div class="note" style="font-family:var(--font);text-transform:uppercase;letter-spacing:.1em">${f.d.split(' ')[1]}</div></div></div>`).join('')}</div>`, { span: 's3' })

  const fin = `<section class="card amber s4"><div class="card-b" style="padding:22px;display:flex;flex-direction:column;gap:6px;height:100%"><div class="lbl">Caja del club</div><div class="giant" style="font-size:96px">18.4<span style="font-size:36px">M€</span></div><div class="note" style="color:inherit;opacity:.8">+0.8 M€ este mes · masa salarial 84% del límite</div><div class="sp"></div>${spark([12, 13.1, 13.6, 14.9, 15.4, 16.8, 17.6, 18.4], { w: 300, h: 60, stroke: '#14100a', fill: '#14100a', fo: 0.12, sw: 3 })}</div></section>`

  const med = PLAYERS.find((p) => p.st === 'LES')
  const squad = card('Plantilla', `<div class="stack" style="gap:14px"><div class="row" style="gap:16px"><div style="width:120px;flex:none">${donut([{ v: 11, color: P.pos }, { v: 1, color: P.neg }], { size: 120, thick: 16, center: '11', sub: 'DE 12', text: 'var(--tx)' })}</div><div class="stack tight grow"><div class="row between"><span class="dim">Fatiga</span><b>18%</b></div>${bar(18, { cls: 'pos' })}<div class="row between"><span class="dim">Moral</span><b>Alta</b></div>${bar(78, { cls: 'cy' })}</div></div><div class="callout neg">${I('medical', 16)}<div><b>${med.n}</b> · baja 9 días</div></div></div>`, { span: 's4' })

  const goals = card('Directiva', `<div class="stack" style="gap:14px"><div class="row" style="gap:16px">${ring(82, { size: 84, thick: 10, color: 'var(--li)', label: '82' })}<div><div class="h3">Confianza alta</div><div class="note">+4 esta semana</div></div></div>${[['Playoffs', 88], ['Presupuesto', 64], ['Moral', 92]].map(([t, v]) => `<div class="row" style="gap:12px"><span style="width:90px">${t}</span><div class="grow">${bar(v, { cls: 'cy' })}</div><b class="num">${v}%</b></div>`).join('')}</div>`, { span: 's4' })

  return { eyebrow: 'Miércoles 14 de diciembre', title: 'Día de partido', sub: `${LEAGUE.name} · Temporada ${LEAGUE.season}`, right: btn('Avanzar un día', { ghost: true }), html: `<div class="grid eq">${poster}${lineup}${key}${stand}${form}${nx}${fin}${squad}${goals}</div>` }
}
