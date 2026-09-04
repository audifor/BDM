/**
 * STEP 014 — Browser certification for Roster NG scout-aware rating presentation.
 */
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'

const BASE = process.env.BDM_DEV_URL ?? 'http://127.0.0.1:5173'
const report = {
  step: '014',
  verdict: 'NOT READY',
  failures: [],
  environment: { baseUrl: BASE, viewport: { width: 1920, height: 1080 } },
  scoutAware: {},
}

function fail(message) {
  report.failures.push(message)
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
    return team?.rosterPlayerIds.length ?? 0
  })
}

async function gotoRoster(page) {
  await page.goto(`${BASE}/?ui=ng`, { waitUntil: 'networkidle' })
  await bootstrapLargeRoster(page)
  await page.waitForSelector('[data-ng-shell="bdm-os-ng"]', { timeout: 30000 })
  await page.locator('.ng-taskbar__app', { hasText: 'Roster' }).click()
  await page.waitForSelector('[data-ng-region="roster-workspace"]', { timeout: 60000 })
  await page.waitForSelector('.bdm-data-grid--ng', { timeout: 10000 })
}

async function readRatingColumnTexts(page, headerLabel) {
  return page.evaluate((label) => {
    const headers = [...document.querySelectorAll('.roster-workspace thead th button')]
    const index = headers.findIndex((button) => button.textContent?.includes(label))
    if (index < 0) return { found: false, values: [] }
    return {
      found: true,
      values: [...document.querySelectorAll('.roster-workspace tbody tr')].map((row) => {
        const cell = row.querySelectorAll('td')[index]
        return cell?.textContent?.trim() ?? ''
      }),
    }
  }, headerLabel)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await gotoRoster(page)

  const rowCount = await page.locator('.roster-workspace tbody tr:not(:has(.bdm-data-table__empty))').count()
  report.scoutAware.rowCount = rowCount
  if (rowCount < 30) fail(`Expected large roster fixture (>=30 rows), got ${rowCount}`)

  await page.selectOption('[aria-label="Preset de columnas"]', 'general')
  await page.waitForTimeout(300)

  const fin = await readRatingColumnTexts(page, 'FIN')
  report.scoutAware.generalFin = fin
  if (!fin.found) fail('Resumen General missing FIN column')
  if (!fin.values.every((value) => value === '?')) fail('FIN column should display scout-aware ? without organization knowledge')

  await page.selectOption('[aria-label="Preset de columnas"]', 'offense')
  await page.waitForTimeout(300)

  const midRange = await readRatingColumnTexts(page, 'TIRO MEDIO')
  report.scoutAware.offenseMidRange = midRange
  if (!midRange.found) fail('Ofensiva preset missing TIRO MEDIO column')
  if (!midRange.values.every((value) => value === '?')) {
    fail('TIRO MEDIO column leaked exact ratings instead of scout-aware presentation')
  }

  const domLeak = await page.evaluate(() => {
    const table = document.querySelector('.roster-workspace .bdm-data-table')
    if (table === null) return { pass: false, reason: 'missing grid' }
    const ratingCells = [...table.querySelectorAll('.canonical-roster__rating')]
    const titles = ratingCells.map((cell) => cell.getAttribute('title') ?? '')
    const texts = ratingCells.map((cell) => cell.textContent?.trim() ?? '')
    return {
      pass: titles.every((title) => !/^\d{1,3}$/.test(title)) && texts.every((text) => text === '?' || /^\d{1,3}$/.test(text) || /^\d{1,3}-\d{1,3}$/.test(text) || text.includes('±') || /^[A-Za-z]/.test(text)),
      sampleTitles: titles.slice(0, 5),
      sampleTexts: texts.slice(0, 5),
      ratingCellCount: ratingCells.length,
    }
  })
  report.scoutAware.domLeakAudit = domLeak
  if (!domLeak.pass) fail('DOM leak audit failed for scout-aware rating cells')

  const csvContent = await page.evaluate(async () => {
    const { exportGridCsv } = await import('/src/ui/dataGrid/export.ts')
    const { useGameStore } = await import('/src/stores/gameStore.ts')
    const { buildRosterRatingEvaluationLookup } = await import(
      '/src/ui-ng/applications/roster/rosterRatingPresentation.ts'
    )
    const { scoutAwareRatingColumn } = await import(
      '/src/ui-ng/applications/roster/rosterScoutAwareColumns.tsx'
    )
    const world = useGameStore.getState().world
    const team = Object.values(world.teams).find((t) => t.coachId === world.userCoachId)
    if (team === undefined) return { pass: false, reason: 'missing team' }
    const players = team.rosterPlayerIds.map((id) => world.players[id]).filter(Boolean).slice(0, 3)
    const lookup = buildRosterRatingEvaluationLookup(world, team.id)
    const column = scoutAwareRatingColumn(lookup, 'midRangeShooting', 'TIRO MEDIO')
    const csv = exportGridCsv([column], players)
    const rawValues = players.map((player) => String(player.basketball.ratings.midRangeShooting))
    return {
      pass: rawValues.every((raw) => !csv.includes(raw)) && csv.includes('"?"'),
      csv,
      rawValues,
    }
  })
  report.scoutAware.csvAudit = { pass: csvContent.pass, rawValues: csvContent.rawValues }
  if (!csvContent.pass) fail('CSV export leaked hidden exact midRangeShooting values')

  report.verdict = report.failures.length === 0 ? 'PASS' : 'NOT READY'
  await browser.close()
  await writeFile('docs/verify-step-014-report.json', `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.failures.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
