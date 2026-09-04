import { chromium } from 'playwright'

const outDir = 'docs/screenshots/step-011'
const views = [
  ['overview', '01-overview'],
  ['attributes', '02-attributes'],
  ['performance', '03-performance'],
  ['development', '04-development'],
  ['contract', '05-contract'],
  ['medical', '06-medical'],
  ['history', '07-history'],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

for (const [view, filename] of views) {
  const url =
    view === 'overview'
      ? 'http://localhost:1420/?ui=ng'
      : `http://localhost:1420/?ui=ng&playerView=${view}`
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    const { createNewGame } = await import('/src/app/game/index.ts')
    const { useGameStore } = await import('/src/stores/gameStore.ts')
    if (useGameStore.getState().world === null) {
      useGameStore.getState().replaceWorld(createNewGame())
    }
  })
  await page.waitForSelector('[data-ng-region="player-workspace-content"]', { timeout: 60000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${outDir}/${filename}-1920x1080.png`, fullPage: true })
}

const scroll = await page.evaluate(() => ({
  hasScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight,
}))

console.log(JSON.stringify({ outDir, views: views.length, scroll }, null, 2))
await browser.close()
