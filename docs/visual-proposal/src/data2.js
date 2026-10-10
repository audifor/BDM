import { PLAYERS, ATTRS } from './data.js'

/* BDM no tiene overall persistido. Todo lo que se muestra sale de los ratings individuales o de derivados explícitos.
   `seed` solo sirve para generar valores coherentes de la maqueta y nunca se pinta. */
const EMPH = {
  PG: { Tiro: 0, Ataque: 3, Creación: 12, Defensa: -4, Físico: -4, Mental: 2 },
  SG: { Tiro: 10, Ataque: 4, Creación: 0, Defensa: -3, Físico: -3, Mental: -2 },
  SF: { Tiro: 2, Ataque: 2, Creación: -4, Defensa: 4, Físico: 1, Mental: 0 },
  PF: { Tiro: -4, Ataque: 6, Creación: -8, Defensa: 3, Físico: 8, Mental: 0 },
  C: { Tiro: -16, Ataque: 3, Creación: -12, Defensa: 10, Físico: 10, Mental: 0 },
}
export const GRP_KEYS = ['Tiro', 'Ataque', 'Creación', 'Defensa', 'Físico', 'Mental']
const clamp = (v) => Math.max(20, Math.min(98, Math.round(v)))

const _cache = new Map()
export function skills(p) {
  if (_cache.has(p.id)) return _cache.get(p.id)
  const out = []
  let i = 0
  for (const [g, arr] of Object.entries(ATTRS)) {
    for (const [n, base] of arr) {
      out.push([g, n, clamp(base + (p.seed - 72) + (EMPH[p.pos]?.[g] ?? 0) + (((p.id * 7 + i * 11) % 9) - 4))])
      i++
    }
  }
  _cache.set(p.id, out)
  return out
}
export const sk = (p, name) => skills(p).find((s) => s[1] === name)?.[2] ?? 50
export function grp(p) {
  const o = {}
  GRP_KEYS.forEach((g) => { const a = skills(p).filter((s) => s[0] === g); o[g] = Math.round(a.reduce((s, x) => s + x[2], 0) / a.length) })
  return o
}
/* Las siete columnas de la vista «Resumen general» de la plantilla actual */
export function core(p) {
  return {
    FIN: sk(p, 'Finalización en el aro'),
    SHO: Math.round(sk(p, 'Tiro de tres') * 0.6 + sk(p, 'Tiro de media distancia') * 0.4),
    PMK: Math.round((sk(p, 'Pase') + sk(p, 'Visión de juego')) / 2),
    PDE: sk(p, 'Defensa perimetral'),
    IDE: sk(p, 'Defensa interior'),
    REB: Math.round((sk(p, 'Fuerza') + sk(p, 'Salto')) / 2),
    ATL: Math.round((sk(p, 'Velocidad') + sk(p, 'Resistencia') + sk(p, 'Salto')) / 3),
  }
}
export const CORE_KEYS = ['FIN', 'SHO', 'PMK', 'PDE', 'IDE', 'REB', 'ATL']
export function top(p) {
  const s = [...skills(p)].filter((x) => x[0] !== 'Mental').sort((a, b) => b[2] - a[2])[0]
  return { n: s[1], v: s[2] }
}
export const byId = (id) => PLAYERS.find((p) => p.id === id)
