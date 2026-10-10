import { chromium } from 'playwright'
export const BASE = process.env.BASE || 'http://localhost:8765/index.html'
export const SCREENS = ['system','home','roster','player','tactics','match','schedule','competition','training','staff','finances']
// [screen, tab, darkRef, lightRef]
export const REF = {
 system:{inicio:[1,4],anclar:[7,9],arrastrar:[10,12],barra:[13,15]},
 home:{resumen:[16,19]},
 roster:{plantilla:[22,25],profundidad:[28,30],briefing:[31,33]},
 player:{overview:[34,37],attributes:[40,42],performance:[43,45],development:[46,48],contract:[49,51],medical:[52,54],scouting:[55,57],compare:[58,60],history:[61,63]},
 tactics:{pizarra:[64,67],disenador:[70,72],emparejamientos:[73,75],rotaciones:[76,78],partido:[79,81]},
 match:{previa:[82,85],directo:[88,90],cronica:[91,93]},
 schedule:{temporada:[94,97],proximos:[100,102],resultados:[103,105]},
 competition:{clasificacion:[106,109],calendario:[112,114],proximos:[115,117],resultados:[118,120],estadisticas:[121,123]},
 training:{equipo:[124,127],individual:[130,132],carga:[133,135],staff:[136,138],modulos:[139,141]},
 staff:{staff:[142,145],asignaciones:[148,150],asesoria:[151,153],dinamicas:[154,156]},
 finances:{resumen:[157,160],caja:[163,165],presupuesto:[166,168],ingresos:[169,171],costes:[172,174],nomina:[175,177],deuda:[178,180],competicion:[181,183],regulacion:[184,186],prevision:[187,189],salud:[190,192],valoracion:[193,195],ia:[196,198],cap:[199,201]},
}
export async function shot(page, screen, tab, theme, width, path, height=1080, fit=true) {
  await page.setViewportSize({ width, height })
  await page.goto(`${BASE}?dir=b&theme=${theme}&screen=${screen}&tab=${tab}`)
  await page.waitForFunction('window.__ready===true', null, { timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  const fixed = await page.evaluate('window.__fixedVp')
  if (!fixed && fit) {
    const extra = await page.evaluate(() => { const p=document.querySelector('[data-screen-body]'); return p.scrollHeight - p.clientHeight })
    if (extra > 0) { await page.setViewportSize({ width, height: height + extra }); await page.waitForTimeout(450) }
  }
  if (path) await page.screenshot({ path })
  return fixed
}
export { chromium }
