import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * CT-ARENA FIX — capture real Match Engine LiveCourtStage at 1920×1080.
 * Requires Vite: npm run dev (default http://127.0.0.1:5173)
 */
const BASE = process.env.BDM_DEV_URL ?? 'http://127.0.0.1:5173'
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../court-preview-captures')

async function bootstrap(page) {
  await page.goto(`${BASE}/?ui=ng&app=match&arenaDebug=1`, { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    const { createNewGame } = await import('/src/app/game.ts')
    const { useGameStore } = await import('/src/stores/gameStore.ts')
    useGameStore.getState().replaceWorld(createNewGame())
  })
  await page.waitForSelector('[data-ng-shell="bdm-os-ng"], .match-workspace, main', { timeout: 30000 })
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await mkdir(outDir, { recursive: true })

await bootstrap(page)

// Ensure match app is active
await page.evaluate(() => {
  const url = new URL(window.location.href)
  url.searchParams.set('ui', 'ng')
  url.searchParams.set('app', 'match')
  url.searchParams.set('arenaDebug', '1')
  history.pushState({}, '', `${url.pathname}${url.search}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.dispatchEvent(new Event('bdm-ng-nav'))
})
await page.waitForTimeout(800)

const play = page.getByRole('button', { name: /Play match/i })
await play.waitFor({ timeout: 20000 })
await play.click()
await page.waitForSelector('[data-ng-region="match-live"] .match-court', { timeout: 20000 })
await page.waitForTimeout(1200)

await page.screenshot({
  path: resolve(outDir, 'ct-arena-fix-match-engine-1920-debug.png'),
  fullPage: false,
})

// Clean shot without debug overlay
await page.evaluate(() => {
  const url = new URL(window.location.href)
  url.searchParams.delete('arenaDebug')
  history.replaceState({}, '', `${url.pathname}${url.search}`)
  location.reload()
})
await page.waitForTimeout(500)
await bootstrap(page)
await page.evaluate(() => {
  const url = new URL(window.location.href)
  url.searchParams.set('ui', 'ng')
  url.searchParams.set('app', 'match')
  history.pushState({}, '', `${url.pathname}${url.search}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.dispatchEvent(new Event('bdm-ng-nav'))
})
await page.waitForTimeout(800)
const play2 = page.getByRole('button', { name: /Play match/i })
await play2.waitFor({ timeout: 20000 })
await play2.click()
await page.waitForSelector('[data-ng-region="match-live"] .match-court', { timeout: 20000 })
await page.waitForTimeout(1200)

await page.screenshot({
  path: resolve(outDir, 'ct-arena-fix-match-engine-1920.png'),
  fullPage: false,
})

// Also capture NBA preview edge composition for comparison
await page.goto(`${BASE}/court-preview.html?capture=boston-celtics&arenaDebug=1`, {
  waitUntil: 'networkidle',
})
await page.waitForTimeout(900)
await page.screenshot({
  path: resolve(outDir, 'ct-arena-fix-nba-debug-1920.png'),
  fullPage: false,
})
await page.goto(`${BASE}/court-preview.html?capture=boston-celtics`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.screenshot({
  path: resolve(outDir, 'ct-arena-fix-nba-1920.png'),
  fullPage: false,
})

await browser.close()
console.log(`saved CT-ARENA FIX captures to ${outDir}`)
