import { chromium } from 'playwright'

async function bootstrap(page) {
  await page.evaluate(async () => {
    const { createNewGame } = await import('/src/app/game/index.ts')
    const { useGameStore } = await import('/src/stores/gameStore.ts')
    if (useGameStore.getState().world === null) {
      useGameStore.getState().replaceWorld(createNewGame())
    }
  })
}

function rowMetrics() {
  const rows = [...document.querySelectorAll('.bdm-data-table tbody tr:not(:has(.bdm-data-table__empty))')]
  const scroll =
    document.querySelector('.roster-workspace__scroll') ??
    document.querySelector('.canonical-roster__grid') ??
    document.querySelector('.bdm-data-grid')
  const scrollRect = scroll?.getBoundingClientRect()
  const visible = rows.filter((row) => {
    const rect = row.getBoundingClientRect()
    const top = scrollRect?.top ?? 0
    const bottom = scrollRect?.bottom ?? window.innerHeight
    return rect.bottom > top && rect.top < bottom
  })
  const first = rows[0]?.getBoundingClientRect()
  return {
    totalRows: rows.length,
    viewportVisibleRows: visible.length,
    rowHeightPx: first ? Math.round(first.height) : null,
    canonicalToolbarPx: Math.round(document.querySelector('.canonical-roster__toolbar')?.getBoundingClientRect().height ?? 0),
    ngHeaderPx: Math.round(document.querySelector('.roster-workspace-header')?.getBoundingClientRect().height ?? 0),
    gridToolsPx: Math.round(document.querySelector('.bdm-data-grid__tools')?.getBoundingClientRect().height ?? 0),
    theadPx: Math.round(document.querySelector('.bdm-data-table thead')?.getBoundingClientRect().height ?? 0),
  }
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1920, height: 1080 })

await page.goto('http://localhost:1420/?ui=ng&app=roster', { waitUntil: 'networkidle' })
await bootstrap(page)
await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 60000 })
await page.waitForTimeout(500)
const ng = await page.evaluate(rowMetrics)

await page.goto('http://localhost:1420/?ui=legacy', { waitUntil: 'networkidle' })
await bootstrap(page)
await page.waitForTimeout(500)
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('bdm-open-dock-app', { detail: { appId: 'squad' } }))
})
await page.waitForTimeout(1000)
const legacy = await page.evaluate(() => {
  if (!document.querySelector('.canonical-roster')) {
    const buttons = [...document.querySelectorAll('button')]
    const squad = buttons.find((button) => /squad|plantilla|roster/i.test(button.textContent ?? ''))
    squad?.click()
  }
  return (() => {
    const rows = [...document.querySelectorAll('.bdm-data-table tbody tr:not(:has(.bdm-data-table__empty))')]
    const scroll = document.querySelector('.canonical-roster__grid') ?? document.querySelector('.bdm-data-grid')
    const scrollRect = scroll?.getBoundingClientRect()
    const visible = rows.filter((row) => {
      const rect = row.getBoundingClientRect()
      const top = scrollRect?.top ?? 0
      const bottom = scrollRect?.bottom ?? window.innerHeight
      return rect.bottom > top && rect.top < bottom
    })
    const first = rows[0]?.getBoundingClientRect()
    return {
      totalRows: rows.length,
      viewportVisibleRows: visible.length,
      rowHeightPx: first ? Math.round(first.height) : null,
      canonicalToolbarPx: Math.round(document.querySelector('.canonical-roster__toolbar')?.getBoundingClientRect().height ?? 0),
      ngHeaderPx: 0,
      gridToolsPx: Math.round(document.querySelector('.bdm-data-grid__tools')?.getBoundingClientRect().height ?? 0),
      theadPx: Math.round(document.querySelector('.bdm-data-table thead')?.getBoundingClientRect().height ?? 0),
    }
  })()
})

console.log(JSON.stringify({ viewport: '1920x1080', ng, legacy }, null, 2))
await browser.close()
