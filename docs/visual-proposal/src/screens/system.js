import { I, card, chip, btn, kpi, callout } from '../ui.js'
import { render as homeRender } from './home.js'

export const tabs = [
  { id: 'inicio', label: 'Menú de inicio' },
  { id: 'anclar', label: 'Anclar' },
  { id: 'arrastrar', label: 'Arrastrar' },
  { id: 'barra', label: 'Barras' },
]

const PINNED = ['home', 'roster', 'tactics', 'match']
const OPEN = ['home', 'roster']

/* Categorías reales de startMenuCatalog.ts. id = app con icono en la barra de tareas (si existe en la maqueta) */
const CATS = [
  { label: 'Equipo', desc: 'Plantilla, jugador, staff, scouting, tácticas, entrenamiento, mentoring y medical', c: 'or', apps: [['Plantilla', 'roster', 'roster'], ['Jugador', 'player', 'player'], ['Staff', 'staff', 'staff'], ['Scouting', 'scouting', null], ['Tácticas', 'tactics', 'tactics'], ['Entrenamiento', 'training', 'training'], ['Mentoring', 'users', null], ['Medical', 'medical', null]] },
  { label: 'Partidos y competición', desc: 'Calendario, clasificación y centro de partido', c: 'li', apps: [['Calendario', 'schedule', 'schedule'], ['Competición', 'trophy', 'competition'], ['Partido', 'match', 'match']] },
  { label: 'Mercado', desc: 'Agentes libres, draft y trades', c: 'ice', apps: [['Mercado', 'swap', null], ['Draft', 'graduation', null], ['Trades', 'swap', null]] },
  { label: 'Gestión del club', desc: 'Club, directiva, finanzas, compliance e instalaciones', c: 'vio', apps: [['Club', 'building', null], ['Contratos', 'doc', null], ['Directiva', 'shield', null], ['Finanzas', 'finances', 'finances'], ['Compliance', 'lock', null], ['Instalaciones', 'building', null]] },
  { label: 'Mi carrera', desc: 'Perfil del entrenador y patrimonio', c: 'pink', apps: [['Perfil', 'player', null], ['Patrimonio', 'finances', null]] },
  { label: 'Mundo y narrativa', desc: 'Prensa, recuerdos e historias', c: 'ice', apps: [['Prensa', 'news', null], ['Recuerdos', 'heart', null], ['Historias', 'doc', null]] },
  { label: 'College Performance Center', desc: 'Recruiting, NIL y boosters', c: 'li', apps: [['Recruiting', 'target', null], ['NIL', 'star', null], ['Boosters', 'users', null]] },
]
const PINS = [['Inicio', 'home', 'home'], ['Plantilla', 'roster', 'roster'], ['Tácticas', 'tactics', 'tactics'], ['Partido', 'match', 'match'], ['Calendario', 'schedule', 'schedule'], ['Finanzas', 'finances', 'finances']]
const RECENT = [['Plantilla', 'hace 2 min'], ['Tácticas', 'hace 9 min'], ['Jugador · B. Istra', 'ayer']]

const badges = (id) => `${id && PINNED.includes(id) ? `<span class="pinb" title="Anclada a la barra de tareas">${I('pin', 13, 2)}</span>` : ''}${id && OPEN.includes(id) ? '<span class="opd" title="Abierta"></span>' : ''}`

function menu(o = {}) {
  const catHtml = CATS.map((c) => `<section class="sm-cat c-${c.c}"><div class="sm-cat-t"><h3>${c.label}</h3><p>${c.desc}</p></div><div class="sm-apps">${c.apps.map(([l, ic, id]) => `<button class="sm-app ${id === 'roster' ? 'cur' : ''} ${c.label.startsWith('College') ? 'off' : ''} ${o.ctx && id === 'finances' ? 'sel' : ''}" data-id="${id ?? ''}"><span class="sm-ic">${I(ic, 24, 1.7)}</span><span>${l}</span>${badges(id)}</button>`).join('')}</div></section>`).join('')
  return `<div class="sm-backdrop"></div><section class="sm" role="dialog" aria-label="BDM Inicio">
    <header class="sm-head"><label class="sm-search">${I('search', 17)}<input placeholder="Buscar apps…" aria-label="Buscar en BDM" readonly><kbd>Ctrl K</kbd></label></header>
    <div class="sm-body">
      <div class="sm-row"><div class="sm-lbl">Fijadas <span class="sm-sub">arrastra para reordenar · clic derecho para anclar</span></div><div class="sm-pins">${PINS.map(([l, ic, id]) => `<button class="sm-pin ${o.drag && id === 'schedule' ? 'dragging-src' : ''}" data-id="${id}"><i class="grip"></i><span class="sm-ic">${I(ic, 28, 1.6)}</span><span>${l}</span>${badges(id)}</button>`).join('')}</div></div>
      <div class="sm-row recents"><div class="sm-lbl">Recientes</div><div class="sm-rec">${RECENT.map(([l, t]) => `<div class="sm-r">${I('doc', 16)}<b>${l}</b><span>${t}</span></div>`).join('')}</div></div>
      <div class="sm-lbl">Todas las categorías</div>
      <div class="sm-cats">${catHtml}</div>
    </div>
    <footer class="sm-foot"><div class="row" style="gap:10px"><span class="sm-av">JV</span><div><b>Entrenador principal</b><div class="note">Dunmere Orbits</div></div></div><div class="row gap-s">${btn('Ajustes', { icon: 'cog', ghost: true, sm: true })}${btn('Guardar y salir', { sm: true })}</div></footer>
  </section>`
}

const ctxMenu = `<div class="ctxm" id="ctxm" role="menu" aria-label="Opciones de Finanzas">
  <div class="ctx-h">Finanzas</div>
  <div class="on">${I('play', 16)}<span>Abrir</span><kbd>Intro</kbd></div>
  <div>${I('star', 16)}<span>Anclar a Fijadas</span></div>
  <div class="hl">${I('pin', 16)}<span>Anclar a la barra de tareas</span></div>
  <hr><div>${I('close', 16)}<span>Quitar de recientes</span></div></div>`

const ghost = `<div class="ghost" id="ghost"><div class="tile">${I('schedule', 24, 1.7)}<span>Calendario</span>${I('pin', 16, 2)}</div><div class="hint2">Soltar para anclar</div></div>`

export function render(tab) {
  if (tab === 'barra') return bars()
  const base = homeRender('', 'b')
  const common = { ...base, startOpen: true, fixedVp: true }
  if (tab === 'inicio') return { ...common, after: menu() }
  if (tab === 'anclar') {
    return { ...common, after: menu({ ctx: true }) + ctxMenu, onReady() {
      document.body.classList.add('over-dock')
      const t = document.querySelector('.sm-app.sel'); const m = document.getElementById('ctxm'); if (!t || !m) return
      const body = document.querySelector('.sm-body'); body.scrollTop = t.offsetTop - body.clientHeight / 2 + 40
      const r = t.getBoundingClientRect(); m.style.left = Math.round(r.left + 54) + 'px'; m.style.top = Math.round(r.bottom - 10) + 'px'
    } }
  }
  return { ...common, after: menu({ drag: true }) + ghost, dockExtra: `<div class="drop-slot">${I('pin', 20, 2)}</div>`, onReady() {
    document.body.classList.add('over-dock')
    const s = document.querySelector('.drop-slot'); const g = document.getElementById('ghost'); if (!s || !g) return
    const r = s.getBoundingClientRect(); g.style.left = Math.round(r.left - 40) + 'px'; g.style.top = Math.round(r.top - 118) + 'px'
  } }
}

/* ───── Barras ───── */
const mouse = (hot) => `<svg width="30" height="42" viewBox="0 0 30 42" aria-hidden="true"><rect x="2" y="2" width="26" height="38" rx="13" fill="none" stroke="currentColor" stroke-width="2" opacity=".6"/><path d="M15 2v16M2 18h26" stroke="currentColor" stroke-width="2" opacity=".6"/>${hot === 'l' ? '<path d="M15 2C8 2 2 8 2 15v3h13Z" fill="var(--or)"/>' : hot === 'r' ? '<path d="M15 2c7 0 13 6 13 13v3H15Z" fill="var(--or)"/>' : hot === 'm' ? '<rect x="12" y="6" width="6" height="11" rx="3" fill="var(--or)"/>' : '<path d="M15 2C8 2 2 8 2 15v3h13Z" fill="var(--li)"/>'}</svg>`
const app = (ic, cls = '') => `<button class="tb-app ${cls}">${I(ic, 22, 1.7)}<i class="ind"></i></button>`
const demo = (inner, extra = '') => `<div class="dock-demo"><button class="start-btn">${I('diamond', 22, 1.7)}</button><i class="dock-sep"></i>${inner}${extra}</div>`

function barRow(label, btnTxt, tone, note, extra = '') {
  return `<div class="stack tight"><div class="row between wrap"><div><b>${label}</b><div class="note">${note}</div></div>${chip(tone === 'neg' ? 'Bloqueado' : tone === 'am' ? 'Atención' : 'Normal', tone === 'neg' ? 'neg' : tone === 'am' ? 'am' : 'pos')}</div>
    <div class="mini-bar"><span class="mb-club">DO · Dunmere Orbits</span><span class="mb-chips">Virelia Horizon League · 2032-33 · 14 DIC 2032</span><span class="mb-sp"></span>${extra}<span class="mb-sim">${I('cal', 14)} Simular hasta…</span><span class="mb-cta ${tone}">${btnTxt}</span></div></div>`
}

function bars() {
  const legend = [['1', 'Botón de inicio', 'Abre el menú. Fijo a la izquierda.'], ['2', 'App fijada y cerrada', 'Icono apagado, sin indicador.'], ['3', 'App abierta', 'Icono normal con punto bajo el icono.'], ['4', 'App activa', 'Ficha naranja y barra larga.'], ['5', 'Abierta sin fijar', 'Aparece al abrirla y desaparece al cerrarla.'], ['6', 'Desbordamiento', 'Si no caben, «…» con el número restante.']]
  const anat = card('Barra de tareas fija', `<div class="stack" style="gap:18px">
    ${demo(`${app('home', 'pin open')}${app('roster', 'pin')}${app('tactics', 'pin open active')}${app('match', 'pin')}${app('finances', 'open')}${app('player', 'open')}`, `<div class="mb-sp"></div><span class="mt-status"><i></i> Simulación en reposo</span>`)}
    <div class="legend">${legend.map(([n, a, b]) => `<div class="lg"><b>${n}</b><div><div style="font-weight:700">${a}</div><div class="note">${b}</div></div></div>`).join('')}</div>
    <div class="cols4">${kpi('Alto', '68', { unit: 'px', sub: 'Constante' })}${kpi('Icono', '48', { unit: 'px', sub: 'Siempre igual' })}${kpi('Separación', '6', { unit: 'px' })}${kpi('Crece', 'Nunca', { sub: 'Desborda a «…»' })}</div></div>`, { span: 's12', ic: 'diamond', sub: 'Solo iconos, estilo Windows. Los nombres salen al pasar el ratón.' })
  const gest = card('Gestos', `<div class="stack tight">${[['m', 'Clic central', 'Cierra la app abierta'], ['l', 'Clic', 'Activa la app, o la abre si está fijada y cerrada'], ['r', 'Clic derecho', 'Menú: Cerrar, Desanclar, Mover'], ['l', 'Arrastrar un icono', 'Reordena las apps de la barra'], ['l', 'Arrastrar desde el menú de inicio', 'Ancla la app donde la sueltes'], ['', 'Pasar el ratón', 'Muestra el nombre de la app']].map(([h, a, b]) => `<div class="li" style="gap:16px"><span style="color:var(--tx2);flex:none">${mouse(h)}</span><div class="grow"><b>${a}</b><div class="note">${b}</div></div></div>`).join('')}</div>`, { span: 's7', ic: 'bolt' })
  const over = card('Cuando hay muchas apps', `<div class="stack" style="gap:14px">${demo(`${['home', 'roster', 'tactics', 'match', 'finances', 'player'].map((id, i) => app(id === 'home' ? 'home' : id === 'roster' ? 'roster' : id === 'tactics' ? 'tactics' : id === 'match' ? 'match' : id === 'finances' ? 'finances' : 'player', i < 4 ? 'pin open' : 'open')).join('')}<button class="tb-app tb-more">${I('more', 22)}<em>+3</em></button>`)}
    <div class="ctxm static"><div class="ctx-h">Más apps abiertas</div><div>${I('staff', 16)}<span>Staff</span><kbd>Clic central cierra</kbd></div><div>${I('training', 16)}<span>Entreno</span></div><div>${I('schedule', 16)}<span>Calendario</span></div></div>
    <div class="note">La barra mantiene su tamaño. El exceso se agrupa en un botón «…» que abre la lista; el clic central también cierra desde ahí.</div></div>`, { span: 's5', ic: 'more' })
  const ctx = card('Menú contextual de una app', `<div class="cols2"><div class="ctxm static"><div class="ctx-h">Tácticas</div><div class="on">${I('tactics', 16)}<span>Activar</span></div><div>${I('close', 16)}<span>Cerrar</span><kbd>Clic central</kbd></div><hr><div class="hl">${I('pin', 16)}<span>Desanclar de la barra de tareas</span></div><div>${I('swap', 16)}<span>Mover a la izquierda</span></div><div>${I('swap', 16)}<span>Mover a la derecha</span></div></div>
    <div class="stack" style="gap:10px">${callout('Una app abierta que no está fijada desaparece de la barra al cerrarla.', { icon: 'bolt' })}${callout('Una app fijada se queda como icono apagado y se abre con un clic.', { tone: 'cy', icon: 'pin' })}</div></div>`, { span: 's12', ic: 'cog' })
  const states = card('Botón «Continuar» contextual', `<div class="stack" style="gap:20px">
    ${barRow('Día de partido', 'Partido', 'pos', 'Abre el centro de partido cuando hay encuentro programado.')}
    ${barRow('Oportunidad de prensa', 'Prensa', 'pos', 'Una rueda de prensa pendiente detiene la simulación.')}
    ${barRow('Contratos que requieren atención', 'Continuar', 'am', 'Aparece el atajo «Contratos» junto al botón.', '<span class="mb-ghost">Contratos</span>')}
    ${barRow('Fin de temporada', 'Empezar nueva temporada', 'pos', 'La acción pasa a iniciar el siguiente curso.')}
    ${barRow('Parada sin destino accionable', 'Continuar', 'neg', 'Se muestra el diagnóstico y el botón queda desactivado.', '<span class="mb-diag">Falta resolver un hito de directiva</span>')}
  </div>`, { span: 's8', ic: 'play', sub: 'Mismo control, cinco estados' })
  const sim = card('Simular hasta…', `<div class="stack tight">${['Próximo partido', 'Final de semana', 'Próximo evento', 'Fecha concreta…', 'Final de temporada regular'].map((t, i) => `<div class="li"><span class="chip ${i === 0 ? 'cy' : ''}" style="width:30px;height:30px;padding:0;justify-content:center;border-radius:50%">${I(i === 3 ? 'cal' : 'play', 14)}</span><div class="grow"><b>${t}</b><div class="note">${['17 DIC · vs Sails', '18 DIC', 'Prensa · 16 DIC', 'Elegir en calendario', '30 ABR'][i]}</div></div></div>`).join('')}<div class="callout cy">${I('bolt', 16)}<div>Se detiene antes de cualquier hito bloqueante.</div></div></div>`, { span: 's4', ic: 'cal' })
  return { eyebrow: 'Sistema', title: 'Barras del sistema', sub: 'Barra de tareas fija, gestos y barra superior contextual', html: `<div class="grid">${anat}${gest}${over}${ctx}${states}${sim}</div>` }
}
