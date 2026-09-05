import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BDM_DEV_URL ?? 'http://127.0.0.1:1420'
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/screenshots/graphite-holo-luxe')

async function bootstrap(page) {
  await page.goto(`${BASE}/?ui=ng&designer=1`, { waitUntil: 'networkidle' })
  return page.evaluate(async () => {
    const { buildLargeRosterTestWorld } = await import(
      '/src/ui-ng/applications/roster/buildLargeRosterTestWorld.ts'
    )
    const { useGameStore } = await import('/src/stores/gameStore.ts')
    const world = buildLargeRosterTestWorld(40)
    useGameStore.getState().replaceWorld(world)
    const team = Object.values(world.teams).find((entry) => entry.coachId === world.userCoachId)
    return team?.rosterPlayerIds[0] ?? null
  })
}

async function goApp(page, app, playerId) {
  await page.evaluate(({ nextApp, nextPlayerId }) => {
    const url = new URL(window.location.href)
    url.searchParams.set('ui', 'ng')
    url.searchParams.set('designer', '1')
    url.searchParams.set('app', nextApp)
    if (nextPlayerId) url.searchParams.set('playerId', nextPlayerId)
    history.pushState({}, '', `${url.pathname}${url.search}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
    window.dispatchEvent(new Event('bdm-ng-nav'))
  }, { nextApp: app, nextPlayerId: playerId })
  await page.waitForSelector('[data-ng-shell="bdm-os-ng"]', { timeout: 30000 })
  await page.waitForTimeout(400)
}

async function shot(page, name, size) {
  await page.setViewportSize(size)
  await page.waitForTimeout(250)
  await page.screenshot({ path: resolve(outDir, name), fullPage: false })
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await mkdir(outDir, { recursive: true })
const playerId = await bootstrap(page)
await goApp(page, 'player', playerId)
await shot(page, '06-final-1920.png', { width: 1920, height: 1080 })
await shot(page, '07-final-2560.png', { width: 2560, height: 1440 })
await goApp(page, 'roster', playerId)
await shot(page, '08-roster-1920.png', { width: 1920, height: 1080 })
await browser.close()
console.log(`saved screenshots to ${outDir}`)
