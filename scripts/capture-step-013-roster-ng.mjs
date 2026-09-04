import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const outDir = 'docs/screenshots/step-013'
await mkdir(outDir, { recursive: true })

async function bootstrap(page) {
  await page.evaluate(async () => {
    const { createNewGame } = await import('/src/app/game/index.ts')
    const { useGameStore } = await import('/src/stores/gameStore.ts')
    if (useGameStore.getState().world === null) {
      useGameStore.getState().replaceWorld(createNewGame())
    }
  })
}

async function countVisibleRows(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll('.roster-workspace .bdm-data-table tbody tr:not(:has(.bdm-data-table__empty))')
    return rows.length
  })
}

async function capture(page, filename, viewport) {
  await page.setViewportSize(viewport)
  await page.goto('http://localhost:1420/?ui=ng&app=roster', { waitUntil: 'networkidle' })
  await bootstrap(page)
  await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 60000 })
  await page.waitForTimeout(500)
  const rows = await countVisibleRows(page)
  await page.screenshot({ path: `${outDir}/${filename}`, fullPage: true })
  return rows
}

const browser = await chromium.launch()
const page = await browser.newPage()

const populatedRows = await capture(page, '01-roster-ng-populated-1920x1080.png', { width: 1920, height: 1080 })

await page.locator('.roster-workspace .bdm-data-table tbody tr').first().click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${outDir}/02-roster-ng-selected-1920x1080.png`, fullPage: true })

await page.locator('.bdm-data-grid--ng input[aria-label="Search grid"]').fill('a')
await page.waitForTimeout(400)
await page.screenshot({ path: `${outDir}/03-roster-ng-search-1920x1080.png`, fullPage: true })

await page.locator('.roster-workspace .bdm-data-table tbody tr').first().click({ button: 'right' })
await page.waitForTimeout(400)
await page.screenshot({ path: `${outDir}/04-roster-ng-context-menu-1920x1080.png`, fullPage: true })

await page.locator('.entity-context-menu__backdrop').click({ force: true })
await page.waitForTimeout(200)

await page.locator('.roster-workspace .canonical-roster__player-link').first().click()
await page.waitForSelector('[data-ng-region="player-workspace-content"]', { timeout: 10000 })
await page.waitForTimeout(400)
await page.screenshot({ path: `${outDir}/05-roster-ng-player-workspace-1920x1080.png`, fullPage: true })

await page.setViewportSize({ width: 2560, height: 1440 })
await page.waitForTimeout(400)
const rows2560 = await countVisibleRows(page)
await page.screenshot({ path: `${outDir}/06-roster-ng-populated-2560x1440.png`, fullPage: true })

console.log(
  JSON.stringify(
    {
      outDir,
      visibleRows1920: populatedRows,
      visibleRows2560: rows2560,
    },
    null,
    2,
  ),
)

await browser.close()
