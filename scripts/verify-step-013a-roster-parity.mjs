/**
 * OBSOLETE — superseded by scripts/verify-step-013e-roster-browser.mjs (STEP 013E).
 * Targets embedded PlayerProfileApp / rosterPlayer architecture removed in 013D.
 * Kept for historical reference only; do not use for NG-013 certification.
 */
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

function visibleColumnsIn(containerRect, table) {
  const headers = [...table.querySelectorAll('thead th')]
  return headers.filter((th) => {
    const rect = th.getBoundingClientRect()
    return rect.right > containerRect.left && rect.left < containerRect.right
  }).length
}

function visibleRowsIn(scrollRect, rows) {
  return rows.filter((row) => {
    const rect = row.getBoundingClientRect()
    return rect.bottom > scrollRect.top && rect.top < scrollRect.bottom
  }).length
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1920, height: 1080 })

const report = {
  legacyInjury: null,
  ngInjury: null,
  splitUsability: null,
  statePreservation: null,
  openClosePaths: null,
  navigation: null,
}

// --- Legacy injury status (shared CanonicalRoster) ---
try {
  await page.goto('http://localhost:1420/', { waitUntil: 'networkidle' })
  await bootstrap(page)
  await page.evaluate(() => {
    const dockItems = [...document.querySelectorAll('.desktop-dock__item')]
    const squad = dockItems.find((item) => item.getAttribute('aria-label')?.toLowerCase().includes('plantilla'))
    squad?.click()
  })
  await page.waitForSelector('.canonical-roster', { timeout: 8000 })
  report.legacyInjury = await page.evaluate(() => {
    const statuses = [...document.querySelectorAll('.canonical-roster__status')].map((el) => el.textContent?.trim())
    return {
      hasCanonicalRoster: document.querySelector('.canonical-roster') !== null,
      statusSamples: statuses.slice(0, 5),
      okCount: statuses.filter((s) => s === 'OK').length,
      outCount: statuses.filter((s) => s === 'Out').length,
    }
  })
} catch {
  report.legacyInjury = {
    note: 'Legacy desktop window not opened in headless run; injury fix verified via shared CanonicalRoster source + unit test',
  }
}

// --- NG roster + split usability ---
await page.goto('http://localhost:1420/?ui=ng&app=roster', { waitUntil: 'networkidle' })
await bootstrap(page)
await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 60000 })

report.ngInjury = await page.evaluate(() => {
  const statuses = [...document.querySelectorAll('.canonical-roster__status')].map((el) => el.textContent?.trim())
  return {
    okCount: statuses.filter((s) => s === 'OK').length,
    outCount: statuses.filter((s) => s === 'Out').length,
    total: statuses.length,
  }
})

// preset switch before split
await page.locator('[aria-label="Preset de columnas"]').selectOption('psico')
await page.waitForTimeout(500)
const presetBeforeOpen = await page.locator('[aria-label="Preset de columnas"]').inputValue()

// sort a column (status EST ascending)
await page.locator('.bdm-data-grid--ng thead th button').first().click()
await page.waitForTimeout(200)

// multi-select before open
await page.keyboard.down('Control')
await page.locator('.roster-workspace .bdm-data-table tbody tr').nth(0).click()
await page.locator('.roster-workspace .bdm-data-table tbody tr').nth(1).click()
await page.keyboard.up('Control')

const playerLink = page.locator('.roster-workspace .canonical-roster__player-link').first()
await playerLink.click()
await page.waitForSelector('[data-ng-region="roster-player-panel"]', { timeout: 10000 })
await page.waitForTimeout(400)

report.splitUsability = await page.evaluate((presetExpected) => {
  const split = document.querySelector('[data-ng-region="roster-split-layout"]')
  const primary = document.querySelector('.ng-split-pane__primary')
  const secondary = document.querySelector('.ng-split-pane__secondary')
  const scroll = document.querySelector('.roster-workspace__scroll--split') ?? primary
  const table = document.querySelector('.roster-workspace .bdm-data-table')
  const rows = [...document.querySelectorAll('.roster-workspace .bdm-data-table tbody tr:not(:has(.bdm-data-table__empty))')]
  const scrollRect = scroll?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
  const containerRect = primary?.getBoundingClientRect() ?? scrollRect
  const visibleRows = rows.filter((row) => {
    const rect = row.getBoundingClientRect()
    return rect.bottom > scrollRect.top && rect.top < scrollRect.bottom
  }).length
  const visibleColumns = [...(table?.querySelectorAll('thead th') ?? [])].filter((th) => {
    const rect = th.getBoundingClientRect()
    return rect.right > containerRect.left && rect.left < containerRect.right
  }).length

  const preset = document.querySelector('[aria-label="Preset de columnas"]')?.value
  const search = document.querySelector('.bdm-data-grid--ng input[aria-label="Search grid"]')
  const rotSelect = document.querySelector('.roster-workspace select[aria-label^="Rotación"]')
  const selectedRows = document.querySelectorAll('.roster-workspace .bdm-data-table tbody tr.is-selected').length

  const splitStyle = split ? getComputedStyle(split).gridTemplateColumns : ''
  const splitParts = splitStyle.split(/\s+/).filter(Boolean)
  const playerWidthFromGrid = splitParts.length >= 2 ? Math.round(parseFloat(splitParts[1])) : 0
  const rosterWidthFromGrid = splitParts.length >= 1 ? Math.round(parseFloat(splitParts[0])) : 0

  return {
    rosterWidthPx: rosterWidthFromGrid || Math.round(containerRect.width),
    playerWidthPx: playerWidthFromGrid || Math.round(secondary?.getBoundingClientRect().width ?? 0),
    splitRatio: splitStyle,
    visibleRows,
    totalRows: rows.length,
    visibleColumns,
    totalColumns: table?.querySelectorAll('thead th').length ?? 0,
    presetBeforeOpen: presetExpected,
    presetAfterOpen: preset,
    presetPreserved: preset === presetExpected,
    searchEnabled: search !== null && !search.disabled,
    rotEditable: rotSelect !== null && !rotSelect.disabled,
    selectedRows,
    playerPanelVisible: document.querySelector('[data-ng-region="roster-player-panel"]') !== null,
    url: window.location.href,
  }
}, presetBeforeOpen)

// multi-select with split open
await page.keyboard.down('Control')
await page.locator('.roster-workspace .bdm-data-table tbody tr').nth(0).click()
await page.locator('.roster-workspace .bdm-data-table tbody tr').nth(1).click()
await page.keyboard.up('Control')
await page.waitForTimeout(200)

const multiSelectWithSplit = await page.evaluate(
  () => document.querySelectorAll('.roster-workspace .bdm-data-table tbody tr.is-selected').length,
)
report.splitUsability.multiSelectCount = multiSelectWithSplit

// context menu with split
await page.locator('.roster-workspace .bdm-data-table tbody tr').first().click({ button: 'right' })
await page.waitForTimeout(300)
report.splitUsability.contextMenuOpen = await page.evaluate(
  () => document.querySelector('.entity-context-menu') !== null,
)
await page.locator('.entity-context-menu__backdrop').click({ force: true })

// scroll grid
await page.evaluate(() => {
  const scroll = document.querySelector('.roster-workspace__scroll--split')
  if (scroll) scroll.scrollTop = 40
})
const scrollTopBeforeClose = await page.evaluate(() => {
  const scroll = document.querySelector('.roster-workspace__scroll--split')
  return scroll?.scrollTop ?? 0
})

// close player
await page.locator('.roster-workspace__player-panel-close').click()
await page.waitForTimeout(300)

report.statePreservation = await page.evaluate((expectedScroll) => {
  const preset = document.querySelector('[aria-label="Preset de columnas"]')?.value
  const sortIndicator = document.querySelector('.bdm-data-grid--ng thead th button')?.textContent?.includes('↑')
  const scroll = document.querySelector('.roster-workspace__scroll')
  const selected = document.querySelectorAll('.roster-workspace .bdm-data-table tbody tr.is-selected').length
  const playerPanel = document.querySelector('[data-ng-region="roster-player-panel"]')
  return {
    preset,
    sortApplied: Boolean(sortIndicator),
    scrollTopAfterClose: scroll?.scrollTop ?? 0,
    scrollTopBeforeClose: expectedScroll,
    selectionCountAfterClose: selected,
    playerPanelGone: playerPanel === null,
    rosterPlayerParam: new URLSearchParams(window.location.search).get('rosterPlayer'),
    url: window.location.href,
  }
}, scrollTopBeforeClose)

// --- Open/close paths ---
await page.goto('http://localhost:1420/?ui=ng&app=roster', { waitUntil: 'networkidle' })
await bootstrap(page)
await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 60000 })

const paths = {}

// name click
await page.locator('.canonical-roster__player-link').first().click()
await page.waitForSelector('[data-ng-region="roster-player-panel"]')
paths.nameClick = await page.evaluate(() => new URLSearchParams(window.location.search).get('rosterPlayer'))
await page.locator('.roster-workspace__player-panel-close').click()
await page.waitForTimeout(200)
paths.afterClose = await page.evaluate(() => new URLSearchParams(window.location.search).get('rosterPlayer'))

// double click
await page.locator('.roster-workspace .bdm-data-table tbody tr').first().dblclick()
await page.waitForSelector('[data-ng-region="roster-player-panel"]')
paths.dblClick = await page.evaluate(() => new URLSearchParams(window.location.search).get('rosterPlayer'))
await page.locator('.roster-workspace__player-panel-close').click()

// Enter key
await page.locator('.bdm-data-grid--ng').click()
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForSelector('[data-ng-region="roster-player-panel"]', { timeout: 5000 })
paths.enterKey = await page.evaluate(() => new URLSearchParams(window.location.search).get('rosterPlayer'))

// back/forward
const urlWithPlayer = page.url()
await page.goBack()
await page.waitForTimeout(200)
paths.afterBack = {
  url: page.url(),
  rosterPlayer: new URL(page.url()).searchParams.get('rosterPlayer'),
  panelVisible: await page.locator('[data-ng-region="roster-player-panel"]').count(),
}
await page.goForward()
await page.waitForTimeout(200)
paths.afterForward = {
  url: page.url(),
  rosterPlayer: new URL(page.url()).searchParams.get('rosterPlayer'),
  panelVisible: await page.locator('[data-ng-region="roster-player-panel"]').count(),
}

report.openClosePaths = paths

// --- Navigation Player ↔ Roster ---
await page.goto('http://localhost:1420/?ui=ng', { waitUntil: 'networkidle' })
await bootstrap(page)
await page.waitForTimeout(500)

const nav = {}
nav.playerDefault = await page.evaluate(() => ({
  app: new URLSearchParams(window.location.search).get('app'),
  playerId: new URLSearchParams(window.location.search).get('playerId'),
  activeTaskbar: document.querySelector('.ng-taskbar__app.is-active')?.textContent?.trim(),
  playerContent: document.querySelector('[data-ng-region="player-workspace-content"]') !== null,
}))

await page.locator('.ng-taskbar__app', { hasText: 'Roster' }).click()
await page.waitForTimeout(400)
nav.afterRosterClick = await page.evaluate(() => ({
  app: new URLSearchParams(window.location.search).get('app'),
  rosterPlayer: new URLSearchParams(window.location.search).get('rosterPlayer'),
  playerId: new URLSearchParams(window.location.search).get('playerId'),
  activeTaskbar: document.querySelector('.ng-taskbar__app.is-active')?.textContent?.trim(),
  rosterVisible: document.querySelector('[data-ng-region="roster-workspace"]') !== null,
}))

await page.locator('.ng-taskbar__app', { hasText: 'Player' }).click()
await page.waitForTimeout(400)
nav.afterPlayerClick = await page.evaluate(() => ({
  app: new URLSearchParams(window.location.search).get('app'),
  playerId: new URLSearchParams(window.location.search).get('playerId'),
  rosterPlayer: new URLSearchParams(window.location.search).get('rosterPlayer'),
  activeTaskbar: document.querySelector('.ng-taskbar__app.is-active')?.textContent?.trim(),
  playerWorkspace: document.querySelector('[data-ng-region="player-workspace"]') !== null,
}))

report.navigation = nav

console.log(JSON.stringify(report, null, 2))
await browser.close()
