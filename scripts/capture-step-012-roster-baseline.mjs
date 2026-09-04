import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const outDir = 'docs/screenshots/step-012/roster-current'
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

await page.goto('http://localhost:1420/', { waitUntil: 'networkidle' })
await page.evaluate(async () => {
  const { createNewGame } = await import('/src/app/game/index.ts')
  const { useGameStore } = await import('/src/stores/gameStore.ts')
  const { useDesktopStore } = await import('/src/stores/desktopStore.ts')
  if (useGameStore.getState().world === null) {
    useGameStore.getState().replaceWorld(createNewGame())
  }
  useDesktopStore.getState().openWindow('squad')
})
await page.waitForSelector('.canonical-roster', { timeout: 60000 })
await page.waitForTimeout(600)

await page.screenshot({
  path: `${outDir}/01-roster-populated-1920x1080.png`,
  fullPage: true,
})

await page.locator('.canonical-roster__player-link').first().click()
await page.waitForTimeout(800)
await page.screenshot({
  path: `${outDir}/02-roster-with-player-open-1920x1080.png`,
  fullPage: true,
})

await page.locator('.canonical-roster__actions input[aria-label="Buscar jugador"]').fill('a')
await page.waitForTimeout(400)
await page.screenshot({
  path: `${outDir}/03-roster-search-filter-1920x1080.png`,
  fullPage: true,
})

await page.locator('.canonical-roster tbody tr').first().click({ button: 'right' })
await page.waitForTimeout(400)
await page.screenshot({
  path: `${outDir}/04-roster-context-menu-1920x1080.png`,
  fullPage: true,
})

console.log(JSON.stringify({ outDir, captures: 4 }, null, 2))
await browser.close()
