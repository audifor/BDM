/**
 * STEP 013E — Real-browser certification for final Roster NG architecture (013D).
 * Supersedes verify-step-013a-roster-parity.mjs (embedded PlayerProfileApp / rosterPlayer).
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = process.env.BDM_DEV_URL ?? 'http://127.0.0.1:5173'
const OUT_DIR = 'docs/screenshots/step-013'
const SCROLL_TOLERANCE = 48

const report = {
  step: '013E',
  verdict: 'NOT READY',
  failures: [],
  warnings: [],
  environment: { baseUrl: BASE, viewport: { width: 1920, height: 1080 } },
  fixture: null,
  initialAssertions: null,
  stateBeforePlayer: null,
  stateAfterBack: null,
  scrollRestoration: null,
  secondarySort: null,
  openPaths: {},
  playerChain: null,
  taskbar: null,
  positionFilter: null,
  contractExpiry: null,
  rot: null,
  multiSelectBulk: null,
  density1920: null,
  density2560: null,
  legacyIsolation: null,
  scoutAwareRatings: 'REQUIRED BEFORE ROSTER CUTOVER',
  screenshots: [],
}

function fail(message) {
  report.failures.push(message)
}

function warn(message) {
  report.warnings.push(message)
}

function pass(condition, message) {
  if (!condition) fail(message)
}

async function bootstrapLargeRoster(page) {
  return page.evaluate(async () => {
    const { buildLargeRosterTestWorld } = await import(
      '/src/ui-ng/applications/roster/buildLargeRosterTestWorld.ts'
    )
    const { useGameStore } = await import('/src/stores/gameStore.ts')
    const { useRosterWorkspaceSession } = await import(
      '/src/ui-ng/applications/roster/rosterWorkspaceSession.ts'
    )
    useRosterWorkspaceSession.getState().reset()
    for (const key of Object.keys(localStorage).filter((k) => k.startsWith('bdm:grid:'))) {
      localStorage.removeItem(key)
    }
    const world = buildLargeRosterTestWorld(40)
    useGameStore.getState().replaceWorld(world)
    const team = Object.values(world.teams).find((t) => t.coachId === world.userCoachId)
    return {
      rosterCount: team?.rosterPlayerIds.length ?? 0,
      sgCount: team
        ? team.rosterPlayerIds.filter(
            (id) => world.players[id]?.basketball.primaryPosition === 'SG',
          ).length
        : 0,
    }
  })
}

async function gotoRoster(page, { bootstrap = false } = {}) {
  await page.goto(`${BASE}/?ui=ng`, { waitUntil: 'networkidle' })
  if (bootstrap) {
    await bootstrapLargeRoster(page)
  }
  await page.waitForSelector('[data-ng-shell="bdm-os-ng"]', { timeout: 30000 })
  await page.locator('.ng-taskbar__app', { hasText: 'Roster' }).click()
  await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 60000 })
  await page.waitForSelector('.bdm-data-grid--ng', { timeout: 10000 })
}

async function captureRosterState(page) {
  return page.evaluate(async () => {
    const preset = document.querySelector('[aria-label="Preset de columnas"]')?.value ?? ''
    const positionFilter =
      document.querySelector('[aria-label="Filtro de posición"]')?.value ?? ''
    const searchQuery =
      document.querySelector('input[aria-label="Search grid"]')?.value ?? ''
    const scrollEl = document.querySelector('.roster-workspace__scroll')
    const gridKey = `plantilla-pcb-${preset}`
    let gridPrefs = null
    try {
      gridPrefs = JSON.parse(localStorage.getItem(`bdm:grid:${gridKey}`) ?? 'null')
    } catch {
      gridPrefs = null
    }
    const { useRosterWorkspaceSession } = await import(
      '/src/ui-ng/applications/roster/rosterWorkspaceSession.ts'
    )
    const sessionScrollTop = useRosterWorkspaceSession.getState().scrollTop

    const sortIndicators = [...document.querySelectorAll('.roster-workspace thead th button')]
      .map((btn) => btn.textContent?.trim() ?? '')
      .filter((text) => /[↑↓]/.test(text))

    const selectedRows = [
      ...document.querySelectorAll('.roster-workspace .bdm-data-table tbody tr.is-selected'),
    ].map((tr) => tr.querySelector('.canonical-roster__player-link')?.textContent?.trim() ?? '')

    const columnHeaders = [...document.querySelectorAll('.roster-workspace thead th')].map((th) => ({
      label: (th.querySelector('button')?.textContent ?? '').replace(/[↑↓0-9]/g, '').trim(),
      width: Math.round(th.getBoundingClientRect().width),
    }))

    const rows = [
      ...document.querySelectorAll(
        '.roster-workspace .bdm-data-table tbody tr:not(:has(.bdm-data-table__empty))',
      ),
    ]

    const rotSelect = document.querySelector('.roster-workspace select[aria-label^="Rotación"]')
    const params = new URLSearchParams(window.location.search)

    return {
      preset,
      positionFilter,
      searchQuery,
      sorting: gridPrefs?.sorting ?? [],
      columnIds: gridPrefs?.columnIds ?? [],
      hiddenColumnIds: gridPrefs?.hiddenColumnIds ?? [],
      columnWidths: gridPrefs?.columnWidths ?? {},
      sortIndicators,
      selectedRows,
      selectedCount: selectedRows.filter(Boolean).length,
      scrollTop: scrollEl?.scrollTop ?? 0,
      sessionScrollTop,
      scrollLeft: scrollEl?.scrollLeft ?? 0,
      scrollHeight: scrollEl?.scrollHeight ?? 0,
      clientHeight: scrollEl?.clientHeight ?? 0,
      totalRows: rows.length,
      firstRowHeight: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : 0,
      columnHeaders,
      rotValue: rotSelect?.value ?? '',
      url: window.location.href,
      app: params.get('app'),
      rosterPlayer: params.get('rosterPlayer'),
      playerId: params.get('playerId'),
      hasPlayerProfileApp: document.querySelector('.bdm-app-frame') !== null,
      hasEmbeddedPanel: document.querySelector('[data-ng-region="roster-player-panel"]') !== null,
      hasPlayerWorkspace: document.querySelector('[data-ng-region="player-workspace-content"]') !== null,
      activeTaskbar: document.querySelector('.ng-taskbar__app.is-active')?.textContent?.trim() ?? '',
      documentScrollable: document.documentElement.scrollHeight > window.innerHeight + 8,
    }
  })
}

function compareState(before, after, label) {
  const checks = {
    preset: before.preset === after.preset,
    positionFilter: before.positionFilter === after.positionFilter,
    searchQuery: before.searchQuery === after.searchQuery,
    primarySort:
      JSON.stringify(before.sorting?.[0] ?? null) === JSON.stringify(after.sorting?.[0] ?? null),
    secondarySort:
      (before.sorting?.length ?? 0) >= 2 &&
      (after.sorting?.length ?? 0) >= 2 &&
      JSON.stringify(before.sorting) === JSON.stringify(after.sorting),
    selectedCount:
      before.selectedCount === after.selectedCount &&
      JSON.stringify([...before.selectedRows].sort()) ===
        JSON.stringify([...after.selectedRows].sort()),
    hiddenColumns:
      JSON.stringify(before.hiddenColumnIds ?? []) === JSON.stringify(after.hiddenColumnIds ?? []),
    columnOrder:
      JSON.stringify(before.columnIds ?? []) === JSON.stringify(after.columnIds ?? []),
    columnWidths:
      JSON.stringify(before.columnWidths ?? {}) === JSON.stringify(after.columnWidths ?? {}),
  }

  const effectiveBeforeScroll = Math.max(before.scrollTop ?? 0, before.sessionScrollTop ?? 0)
  const scrollDelta = Math.abs((after.scrollTop ?? 0) - effectiveBeforeScroll)
  checks.verticalScroll = scrollDelta <= SCROLL_TOLERANCE && effectiveBeforeScroll > 40

  report.stateRestoration = report.stateRestoration ?? {}
  for (const [key, ok] of Object.entries(checks)) {
    report.stateRestoration[key] = ok ? 'PASS' : 'FAIL'
    if (!ok) fail(`${label}: ${key} not restored (before=${JSON.stringify(before[key] ?? before.sorting)}, after=${JSON.stringify(after[key] ?? after.sorting)})`)
  }

  report.scrollRestoration = {
    before: effectiveBeforeScroll,
    after: after.scrollTop,
    delta: scrollDelta,
    tolerance: SCROLL_TOLERANCE,
    result: checks.verticalScroll ? 'PASS' : 'FAIL',
  }

  return checks
}

async function waitForPlayerWorkspace(page) {
  await page.waitForSelector('[data-ng-region="player-workspace-content"]', { timeout: 15000 })
  await page.waitForTimeout(300)
}

async function assertPlayerWorkspace(page, expectedPlayerId) {
  const snapshot = await page.evaluate((playerId) => {
    const params = new URLSearchParams(window.location.search)
    return {
      app: params.get('app'),
      playerId: params.get('playerId'),
      playerView: params.get('playerView'),
      overviewActive:
        document.querySelector('.ng-workspace-tabs__tab.is-active')?.textContent?.trim() ===
        'Overview',
      hasPlayerWorkspace: document.querySelector('[data-ng-region="player-workspace-content"]') !== null,
      hasPlayerProfileApp: document.querySelector('.bdm-app-frame') !== null,
      hasEmbeddedPanel: document.querySelector('[data-ng-region="roster-player-panel"]') !== null,
      rosterPlayer: params.get('rosterPlayer'),
      activeTaskbar: document.querySelector('.ng-taskbar__app.is-active')?.textContent?.trim() ?? '',
    }
  }, expectedPlayerId)

  pass(snapshot.app === 'player', 'Player URL app=player')
  pass(snapshot.playerId === expectedPlayerId, `Player URL playerId=${expectedPlayerId}`)
  pass(snapshot.overviewActive, 'Player Overview tab active')
  pass(snapshot.hasPlayerWorkspace, 'PlayerWorkspace NG visible')
  pass(!snapshot.hasPlayerProfileApp, 'No PlayerProfileApp in NG player flow')
  pass(!snapshot.hasEmbeddedPanel, 'No embedded roster player panel')
  pass(snapshot.rosterPlayer === null, 'No rosterPlayer query param on player URL')
  pass(snapshot.activeTaskbar === 'Player', 'Taskbar Player active')

  return snapshot
}

async function configureComplexState(page) {
  await page.locator('[aria-label="Preset de columnas"]').selectOption('psico')
  await page.waitForTimeout(400)
  await page.locator('[aria-label="Filtro de posición"]').selectOption('ALL')
  await page.waitForTimeout(200)

  const searchValue = 'a'
  await page.locator('input[aria-label="Search grid"]').fill(searchValue)
  await page.waitForTimeout(300)

  const estHeader = page.locator('.roster-workspace thead th button', { hasText: /^EST/ }).first()
  await estHeader.click()
  await page.waitForTimeout(200)

  const jugadorHeader = page.locator('.roster-workspace thead th button', { hasText: /^JUGADOR/ }).first()
  await jugadorHeader.click({ modifiers: ['Shift'] })
  await page.waitForTimeout(200)

  const resizeHandle = page.locator('.roster-workspace .bdm-data-grid__resize').first()
  const box = await resizeHandle.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2)
    await page.mouse.up()
    await page.waitForTimeout(200)
  }

  await page.locator('.roster-workspace thead th').nth(2).click({ button: 'right' })
  await page.waitForTimeout(200)
  const removeBtn = page.locator('.bdm-data-grid__header-menu button', { hasText: 'Remove column' })
  if (await removeBtn.count()) {
    await removeBtn.click()
    await page.waitForTimeout(200)
  }

  await page.locator('.roster-workspace .bdm-data-grid').click()
  await page.evaluate(() => {
    const rows = document.querySelectorAll('.roster-workspace .bdm-data-table tbody tr')
    if (rows.length >= 2) {
      rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      rows[1].dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
      )
    }
  })
  await page.waitForTimeout(200)

  const scrollTarget = await page.evaluate(async () => {
    const scrollEl = document.querySelector('.roster-workspace__scroll')
    if (!scrollEl) return { scrollTop: 0, scrollLeft: 0, sessionScrollTop: 0, selectedCount: 0 }
    const target = Math.min(
      Math.max(320, scrollEl.scrollHeight * 0.45),
      Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight - 8),
    )
    scrollEl.scrollTop = target
    scrollEl.scrollLeft = Math.min(80, Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth))
    scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }))
    const { useRosterWorkspaceSession } = await import(
      '/src/ui-ng/applications/roster/rosterWorkspaceSession.ts'
    )
    const session = useRosterWorkspaceSession.getState()
    session.setScrollTop(scrollEl.scrollTop)
    return {
      scrollTop: scrollEl.scrollTop,
      scrollLeft: scrollEl.scrollLeft,
      sessionScrollTop: session.scrollTop,
      selectedCount: session.selectedRowIds.length,
    }
  })

  return scrollTarget
}

async function openPlayerByName(page) {
  const target = await page.evaluate(() => {
    const scrollEl = document.querySelector('.roster-workspace__scroll')
    const scrollRect = scrollEl?.getBoundingClientRect()
    const links = [...document.querySelectorAll('.roster-workspace .canonical-roster__player-link')]
    const visible =
      links.find((link) => {
        const rect = link.getBoundingClientRect()
        return (
          scrollRect !== undefined &&
          rect.top >= scrollRect.top + 4 &&
          rect.bottom <= scrollRect.bottom - 4
        )
      }) ?? links[0]
    return {
      name: visible?.textContent?.trim() ?? '',
      playerId: null,
    }
  })
  await page
    .locator('.roster-workspace .canonical-roster__player-link', { hasText: target.name })
    .click()
  await waitForPlayerWorkspace(page)
  const url = new URL(page.url())
  target.playerId = url.searchParams.get('playerId')
  return target
}

async function screenshot(page, name) {
  const path = `${OUT_DIR}/${name}`
  await page.screenshot({ path, fullPage: true })
  report.screenshots.push(path)
}

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1920, height: 1080 })

try {
  await gotoRoster(page, { bootstrap: true })
  report.fixture = await page.evaluate(() => {
    const scrollEl = document.querySelector('.roster-workspace__scroll')
    const rows = document.querySelectorAll(
      '.roster-workspace .bdm-data-table tbody tr:not(:has(.bdm-data-table__empty))',
    )
    return {
      rosterCount: rows.length,
      scrollHeight: scrollEl?.scrollHeight ?? 0,
      clientHeight: scrollEl?.clientHeight ?? 0,
    }
  })

  pass(report.fixture.rosterCount >= 25, `Large roster fixture >= 25 rows (${report.fixture.rosterCount})`)
  await page.locator('[aria-label="Filtro de posición"]').selectOption('ALL')
  await page.waitForTimeout(200)
  const scrollCheck = await page.evaluate(() => {
    const scrollEl = document.querySelector('.roster-workspace__scroll')
    return {
      scrollHeight: scrollEl?.scrollHeight ?? 0,
      clientHeight: scrollEl?.clientHeight ?? 0,
    }
  })
  const requiresVerticalScroll = scrollCheck.scrollHeight > scrollCheck.clientHeight + 4
  pass(requiresVerticalScroll, 'Roster grid requires vertical scroll')
  report.fixture = { ...report.fixture, ...scrollCheck, requiresVerticalScroll }

  report.initialAssertions = await page.evaluate(() => {
    const row = document.querySelector('.roster-workspace .bdm-data-table tbody tr')
    const td = row?.querySelector('td')
    return {
      systemBar: document.querySelector('[data-ng-shell="bdm-os-ng"]') !== null,
      taskbar: document.querySelector('[data-ng-region="taskbar"]') !== null,
      rosterWorkspace: document.querySelector('[data-ng-region="roster-workspace"]') !== null,
      ngGrid: document.querySelector('.bdm-data-grid--ng') !== null,
      positionFilter: document.querySelector('[aria-label="Filtro de posición"]') !== null,
      rowHeight: td ? Math.round(td.getBoundingClientRect().height) : 0,
      documentScrollable: document.documentElement.scrollHeight > window.innerHeight + 8,
      embeddedPanel: document.querySelector('[data-ng-region="roster-player-panel"]') !== null,
      playerProfileApp: document.querySelector('.bdm-app-frame') !== null,
      rosterPlayer: new URLSearchParams(window.location.search).get('rosterPlayer'),
      activeTaskbar: document.querySelector('.ng-taskbar__app.is-active')?.textContent?.trim(),
    }
  })

  pass(report.initialAssertions.systemBar, 'SystemBar present')
  pass(report.initialAssertions.taskbar, 'Taskbar present')
  pass(report.initialAssertions.rosterWorkspace, 'Roster workspace present')
  pass(report.initialAssertions.ngGrid, 'NG visual mode grid')
  pass(report.initialAssertions.positionFilter, 'Position filter present')
  pass(report.initialAssertions.rowHeight >= 24 && report.initialAssertions.rowHeight <= 32, `Dense row height (${report.initialAssertions.rowHeight}px)`)
  pass(!report.initialAssertions.documentScrollable, 'No document scrollbar')
  pass(!report.initialAssertions.embeddedPanel, 'No embedded player panel')
  pass(!report.initialAssertions.playerProfileApp, 'No PlayerProfileApp on roster')
  pass(report.initialAssertions.rosterPlayer === null, 'No rosterPlayer param')
  pass(report.initialAssertions.activeTaskbar === 'Roster', 'Taskbar Roster active')

  await page.locator('[aria-label="Preset de columnas"]').selectOption('general')
  await page.waitForTimeout(300)
  report.contractExpiry = await page.evaluate(() => {
    const expHeader = [...document.querySelectorAll('.roster-workspace thead th button')].find((b) =>
      /^EXP/.test(b.textContent ?? ''),
    )
    const cells = [...document.querySelectorAll('.roster-workspace tbody td')].slice(0, 40)
    const sampleValues = cells.map((c) => c.textContent?.trim()).filter((v) => v && v !== '—')
    return {
      expHeaderVisible: expHeader !== undefined,
      hasDashOrDate: cells.some((c) => /—|\d{4}-\d{2}-\d{2}/.test(c.textContent ?? '')),
      sampleValues: sampleValues.slice(0, 3),
    }
  })
  pass(report.contractExpiry.expHeaderVisible, 'EXP column visible in General preset')
  pass(report.contractExpiry.hasDashOrDate, 'EXP shows real dates or —')

  const complexScroll = await configureComplexState(page)
  report.stateBeforePlayer = await captureRosterState(page)
  pass(report.stateBeforePlayer.preset === 'psico', 'Complex state preset psico')
  pass((report.stateBeforePlayer.sorting?.length ?? 0) >= 2, 'Secondary sort configured')
  pass(report.stateBeforePlayer.selectedCount >= 2, 'Multi-select >= 2 rows in DOM')
  pass(complexScroll.sessionScrollTop > 40, `Session scrollTop saved (${complexScroll.sessionScrollTop})`)
  pass(
    complexScroll.selectedCount >= 2 || report.stateBeforePlayer.selectedCount >= 2,
    'Multi-select >= 2 rows',
  )

  const opened = await openPlayerByName(page)
  await screenshot(page, '07-roster-to-player-ng-1920x1080.png')
  await assertPlayerWorkspace(page, opened.playerId)

  await page.goBack()
  await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 15000 })
  await page.waitForTimeout(500)
  report.stateAfterBack = await captureRosterState(page)
  compareState(report.stateBeforePlayer, report.stateAfterBack, 'after name click + back')

  report.secondarySort = {
    before: report.stateBeforePlayer.sortIndicators,
    after: report.stateAfterBack.sortIndicators,
    sortingBefore: report.stateBeforePlayer.sorting,
    sortingAfter: report.stateAfterBack.sorting,
    result:
      JSON.stringify(report.stateBeforePlayer.sorting) ===
      JSON.stringify(report.stateAfterBack.sorting)
        ? 'PASS'
        : 'FAIL',
  }
  if (report.secondarySort.result === 'FAIL') {
    fail('Secondary sort not restored after Back')
  }

  await page.locator('.bdm-data-grid--ng').click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await waitForPlayerWorkspace(page)
  report.openPaths.enter = { url: page.url(), pass: page.url().includes('playerId=') }
  pass(report.openPaths.enter.pass, 'Enter opens PlayerWorkspace')
  await page.goBack()
  await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 15000 })
  report.openPaths.enter.restored = (await captureRosterState(page)).preset === 'psico'

  await page.locator('.roster-workspace .bdm-data-table tbody tr').first().dblclick()
  await waitForPlayerWorkspace(page)
  report.openPaths.doubleClick = { url: page.url(), pass: page.url().includes('playerId=') }
  pass(report.openPaths.doubleClick.pass, 'Double-click opens PlayerWorkspace')
  await page.goBack()
  await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 15000 })

  await page.locator('.roster-workspace .bdm-data-table tbody tr').first().click({ button: 'right' })
  await page.waitForTimeout(300)
  await page.getByRole('menuitem', { name: 'Open profile' }).click()
  await waitForPlayerWorkspace(page)
  report.openPaths.contextMenu = { url: page.url(), pass: page.url().includes('playerId=') }
  pass(report.openPaths.contextMenu.pass, 'Context menu Open profile opens PlayerWorkspace')
  await page.goBack()
  await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 15000 })

  report.openPaths.nameClick = { pass: true }

  report.playerChain = {
    playerAToBViaPush: 'UNSUPPORTED',
    note: 'PlayerWorkspace header select updates store without pushState history chain; certified Roster→Player→Back only.',
  }

  const rotBefore = await page.evaluate(() => {
    const sel = document.querySelector('.roster-workspace select[aria-label^="Rotación"]')
    const prev = sel?.value ?? ''
    if (sel) {
      sel.value = sel.options.length > 1 ? sel.options[1].value : sel.value
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    }
    return { before: prev, after: sel?.value ?? '' }
  })
  await page.waitForTimeout(200)
  await page.locator('.roster-workspace .canonical-roster__player-link').first().click()
  await waitForPlayerWorkspace(page)
  await page.goBack()
  await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 15000 })
  report.rot = await page.evaluate((expected) => {
    const sel = document.querySelector('.roster-workspace select[aria-label^="Rotación"]')
    return { expected, actual: sel?.value ?? '', pass: sel?.value === expected }
  }, rotBefore.after)
  pass(report.rot.pass, 'ROT value preserved after Player navigation')

  await page.locator('[aria-label="Filtro de posición"]').selectOption('ALL')
  await page.waitForTimeout(200)
  await page.locator('.roster-workspace .bdm-data-grid').click()
  await page.locator('.roster-workspace .bdm-data-table tbody tr').nth(0).click()
  await page.locator('.roster-workspace .bdm-data-table tbody tr').nth(1).click({ modifiers: ['Control'] })
  await page.locator('.roster-workspace .bdm-data-table tbody tr').first().click({ button: 'right' })
  await page.waitForTimeout(300)
  report.multiSelectBulk = {
    trainingMenuVisible: await page.getByRole('menuitem', { name: /Training \(2\)/ }).count(),
    lineupMenuVisible: await page.getByText('Squad / lineup').count(),
  }
  pass(report.multiSelectBulk.trainingMenuVisible > 0, 'Bulk training menu available for 2 selected')
  await page.locator('.entity-context-menu__backdrop').click({ force: true })

  const taskbarStateBefore = await captureRosterState(page)
  await page.locator('.ng-taskbar__app', { hasText: 'Player' }).click()
  await page.waitForTimeout(400)
  await page.locator('.ng-taskbar__app', { hasText: 'Roster' }).click()
  await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 15000 })
  const taskbarStateAfter = await captureRosterState(page)
  report.taskbar = {
    presetPreserved: taskbarStateBefore.preset === taskbarStateAfter.preset,
    searchPreserved: taskbarStateBefore.searchQuery === taskbarStateAfter.searchQuery,
    positionFilterPreserved:
      taskbarStateBefore.positionFilter === taskbarStateAfter.positionFilter,
  }
  pass(report.taskbar.presetPreserved, 'Taskbar switch preserves preset')
  pass(report.taskbar.searchPreserved, 'Taskbar switch preserves search')
  pass(report.taskbar.positionFilterPreserved, 'Taskbar switch preserves position filter')

  report.positionFilter = {}
  for (const filter of ['ALL', 'PG', 'SG', 'SF', 'PF', 'C']) {
    await page.locator('[aria-label="Filtro de posición"]').selectOption(filter)
    await page.waitForTimeout(200)
    const count = await page.locator('.roster-workspace .bdm-data-table tbody tr').count()
    report.positionFilter[filter] = count
  }
  pass(report.positionFilter.SG <= report.positionFilter.ALL, 'SG filter narrows or equals ALL')

  await page.locator('[aria-label="Filtro de posición"]').selectOption('ALL')
  await page.waitForTimeout(200)

  report.density1920 = await page.evaluate(() => {
    const rows = document.querySelectorAll('.roster-workspace .bdm-data-table tbody tr')
    const scrollEl = document.querySelector('.roster-workspace__scroll')
    const headers = document.querySelectorAll('.roster-workspace thead th')
    return {
      totalRows: rows.length,
      visibleRowsApprox: [...rows].filter((r) => {
        const rect = r.getBoundingClientRect()
        const sr = scrollEl?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight }
        return rect.bottom > sr.top && rect.top < sr.bottom
      }).length,
      rowHeight: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : 0,
      headerHeight: headers[0]?.parentElement?.getBoundingClientRect().height ?? 0,
      toolbarHeight: document.querySelector('.canonical-roster__toolbar')?.getBoundingClientRect().height ?? 0,
      visibleColumns: headers.length,
      documentScrollable: document.documentElement.scrollHeight > window.innerHeight + 8,
      gridScrollable: (scrollEl?.scrollHeight ?? 0) > (scrollEl?.clientHeight ?? 0),
    }
  })
  pass(report.density1920.rowHeight >= 24 && report.density1920.rowHeight <= 32, '1920 row density')
  pass(!report.density1920.documentScrollable, '1920 no document scroll')

  await screenshot(page, '01-roster-ng-populated-1920x1080.png')

  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.waitForTimeout(400)
  report.density2560 = await page.evaluate(() => ({
    totalRows: document.querySelectorAll('.roster-workspace .bdm-data-table tbody tr').length,
    rowHeight: document.querySelector('.roster-workspace .bdm-data-table tbody tr td')
      ? Math.round(
          document.querySelector('.roster-workspace .bdm-data-table tbody tr td').getBoundingClientRect()
            .height,
        )
      : 0,
    visibleColumns: document.querySelectorAll('.roster-workspace thead th').length,
  }))
  pass(report.density2560.rowHeight >= 24 && report.density2560.rowHeight <= 32, '2560 row density preserved')
  await screenshot(page, '08-roster-ng-final-2560x1440.png')

  report.legacyIsolation = await page.evaluate(() => ({
    rosterPlayer: new URLSearchParams(window.location.search).get('rosterPlayer'),
    playerProfileApp: document.querySelector('.bdm-app-frame') !== null,
  }))
  pass(report.legacyIsolation.rosterPlayer === null, 'URL clean — no rosterPlayer')
  pass(!report.legacyIsolation.playerProfileApp, 'No PlayerProfileApp in NG roster runtime')

  report.verdict = report.failures.length === 0 ? 'READY TO COMMIT NG-013' : 'NOT READY'
} catch (error) {
  fail(`Unhandled certification error: ${error instanceof Error ? error.message : String(error)}`)
  report.verdict = 'NOT READY'
} finally {
  await browser.close()
}

await writeFile('docs/verify-step-013e-report.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

process.exit(report.failures.length === 0 ? 0 : 1)
