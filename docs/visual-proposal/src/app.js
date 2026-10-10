import { icon, crest, FLUIDS } from './art.js'
import { LEAGUE } from './data.js'
import { tabsHtml } from './ui.js'

/* Modelo de navegación de BDM NG: SystemBar (arriba) + Workspace + Taskbar fija (abajo) + Start Menu. Sin sidebar. */
export const NAV = [
  { id: 'home', label: 'Inicio', ic: 'home' },
  { id: 'roster', label: 'Plantilla', ic: 'roster' },
  { id: 'player', label: 'Jugador', ic: 'player' },
  { id: 'tactics', label: 'Tácticas', ic: 'tactics' },
  { id: 'match', label: 'Partido', ic: 'match' },
  { id: 'schedule', label: 'Calendario', ic: 'schedule' },
  { id: 'competition', label: 'Competición', ic: 'trophy' },
  { id: 'training', label: 'Entreno', ic: 'training' },
  { id: 'staff', label: 'Staff', ic: 'staff' },
  { id: 'finances', label: 'Finanzas', ic: 'finances' },
  { id: 'system', label: 'Inicio BDM', ic: 'diamond' },
]
export const PINNED = ['home', 'roster', 'tactics', 'match']

const q = new URLSearchParams(location.search)
const dir = q.get('dir') || 'b'
const theme = q.get('theme') || 'dark'
const screenId = q.get('screen') || 'home'
const tabId = q.get('tab') || null
const root = document.documentElement
root.dataset.dir = dir; root.dataset.theme = theme

const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = `${dir}.css`
document.head.appendChild(link)

const mod = await import(`./screens/${screenId}.js`)
const tab = tabId || mod.tabs[0].id
const out = mod.render(tab, dir)
const nav = NAV.find((n) => n.id === screenId)
const activeApp = screenId === 'system' ? 'home' : screenId

/* Barra de tareas: fijadas (permanecen) + abiertas (aparecen al abrir). Iconos de tamaño fijo, la barra no crece. */
const OPEN = out.open ?? [...new Set(['home', 'roster', activeApp])]
const slots = [...PINNED, ...OPEN.filter((id) => !PINNED.includes(id))]
export const tbApp = (id, o = {}) => { const n = NAV.find((x) => x.id === id); const pin = PINNED.includes(id); const open = OPEN.includes(id); const act = id === (o.active ?? activeApp); return `<button class="tb-app ${pin ? 'pin' : ''} ${open ? 'open' : ''} ${act ? 'active' : ''}" data-app="${id}" title="${n.label}" aria-label="${n.label}${open ? ' (abierta)' : ''}">${icon(n.ic, 22, 1.7)}<i class="ind"></i>${out.tip === id ? `<span class="tb-tip">${n.label}</span>` : ''}</button>` }
const taskbar = `<footer class="dock" data-ng-region="taskbar" aria-label="Barra de tareas">
  <button class="start-btn ${out.startOpen ? 'is-open' : ''}" aria-label="Abrir menú de inicio BDM">${icon('diamond', 22, 1.7)}</button>
  <i class="dock-sep"></i>
  <div class="dock-apps" id="dock-apps" role="toolbar">${slots.map((id) => tbApp(id)).join('')}${out.dockExtra ?? ''}</div>
  <div class="dock-end"><span class="sim"><i></i><span>Simulación en reposo</span></span></div></footer>`

const head = `<div class="page-head"><div><div class="eyebrow">${out.eyebrow ?? nav.label}</div><h1>${out.title}</h1>${out.sub ? `<div class="sub">${out.sub}</div>` : ''}</div><div class="head-r">${out.right ?? ''}</div></div>`
const tabsEl = mod.tabs.length > 1 ? tabsHtml(mod.tabs, tab) : ''

const systemBar = `<header class="topbar" data-ng-region="system-bar">
  <div class="brand">BDM</div>
  <div class="club">${crest('DO', 34, 'round')}<div><b>Dunmere Orbits</b><small>Entrenador principal</small></div></div>
  <div class="ctx"><span class="ctx-chip">${LEAGUE.name}</span><span class="ctx-chip">${LEAGUE.season}</span><span class="ctx-date">${LEAGUE.date}</span></div>
  <div class="top-actions"><button class="btn sim-btn">${icon('cal', 15)}<span>Simular hasta…</span></button><button class="cta">${icon('play', 14)}<span>${out.cont ?? 'Partido'}</span></button></div>
</header>`

const html = `<div class="app" data-screen="${screenId}">${systemBar}<main class="page" data-screen-body>${head}${out.band ?? ''}${tabsEl}${out.html}</main>${taskbar}</div>`
document.getElementById('app').innerHTML = html
if (out.after) document.body.insertAdjacentHTML('beforeend', out.after)

/* Desbordamiento: el espacio es fijo; lo que no cabe pasa a un botón «…» (nunca se redimensiona la barra). */
function layoutDock() {
  const box = document.getElementById('dock-apps')
  if (!box) return
  box.querySelectorAll('.tb-more').forEach((e) => e.remove())
  const btns = [...box.querySelectorAll('.tb-app')]
  btns.forEach((b) => { b.style.display = '' })
  const cap = Math.floor((box.clientWidth + 6) / 54)
  if (btns.length > cap && cap > 1) {
    const hide = btns.slice(cap - 1)
    hide.forEach((b) => { b.style.display = 'none' })
    box.insertAdjacentHTML('beforeend', `<button class="tb-app tb-more" aria-label="${hide.length} más">${icon('more', 22)}<em>+${hide.length}</em></button>`)
  }
}

/* ── Módulos de talla fija (escritorio) ──
   Cada módulo adopta una talla del sistema (S 220 · M 320 · L 440 · XL 560 · XXL 720 · 3XL 920). Las filas comparten talla.
   El contenido nunca cambia la talla: hace scroll interno. Solo cambia en los puntos de ruptura responsivos. */
const SCALE = [220, 320, 440, 560, 720, 920]
const snap = (h) => SCALE.find((s) => s >= h) ?? SCALE[SCALE.length - 1]
function layoutModules() {
  const grids = [...document.querySelectorAll('.grid')].filter((g) => !g.parentElement.closest('.grid'))
  grids.forEach((g) => [...g.children].forEach((c) => { c.style.height = ''; c.style.display = ''; c.style.flexDirection = ''; [...c.children].forEach((k) => { k.style.flex = ''; k.style.minHeight = '' }) }))
  if (window.innerWidth < 1280) return
  grids.forEach((g) => {
    g.classList.add('measure')
    const items = [...g.children]
    const nat = items.map((c) => c.offsetHeight)
    const top = items.map((c) => Math.round(c.offsetTop))
    const kids = items.map((c) => (c.classList.contains('card') ? [] : [...c.children].map((k) => k.offsetHeight)))
    const rows = new Map()
    items.forEach((c, i) => { if (!rows.has(top[i])) rows.set(top[i], []); rows.get(top[i]).push(i) })
    rows.forEach((idx) => {
      const H = Math.max(...idx.map((i) => snap(nat[i])))
      idx.forEach((i) => {
        const c = items[i]; c.style.height = H + 'px'
        if (!c.classList.contains('card')) { c.style.display = 'flex'; c.style.flexDirection = 'column'; [...c.children].forEach((k, j) => { k.style.flex = `${kids[i][j]} 1 ${kids[i][j]}px`; k.style.minHeight = '0' }) }
      })
    })
    g.classList.remove('measure')
  })
}

const paintFluids = () => document.querySelectorAll('.fluid').forEach((el) => { el.innerHTML = FLUIDS[+el.dataset.fid](Math.max(220, Math.floor(el.clientWidth))) })
const relayout = () => { layoutDock(); paintFluids(); layoutModules(); out.onReady?.() }
relayout()
let _rt; window.addEventListener('resize', () => { clearTimeout(_rt); _rt = setTimeout(relayout, 120) })
await document.fonts.ready
await new Promise((r) => (link.sheet ? r() : (link.onload = r)))
relayout()
document.title = `${screenId}/${tab} · ${dir} · ${theme}`
window.__fixedVp = !!out.fixedVp
window.__ready = true
