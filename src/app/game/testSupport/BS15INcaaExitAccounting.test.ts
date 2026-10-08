import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { readLargeSaveV4File } from './LargeSaveV4File'
import { documentedNcaaExits } from './NcaaExitAccounting'

it('reconciles retained NCAA exit events without replaying certified years', () => {
  if (process.env.BS15I_NCAA_EXIT_ACCOUNTING !== '1') return
  const final = process.env.BS15I_NCAA_EXIT_RECONCILE === '1'
  const sourcePath = final ? 'C:/Temp/BS15I-final-y30-save-v4.json' : 'C:/Temp/BS15I-long-y20-save-v4.json'
  const world = deserializeGameWorldV4(readLargeSaveV4File(sourcePath))
  const baselinePath = 'C:/Temp/BS15I-final-y7-save-v4.json'
  const baseline = deserializeGameWorldV4(readLargeSaveV4File(baselinePath))
  const exits = documentedNcaaExits(world, baseline)
  const journalPath = 'C:/Temp/BS15I-final-long-horizon-progress.json'
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  const rows = journal.annual.filter((row: { date: string }) => row.date <= world.currentDate)
  const corrected = rows.map((row: { year: number; date: string; ncaaExits: number; ncaaAssessmentConfirmedExits?: number }) => {
    const from = `${2031 + row.year}-10-01`
    const events = exits.filter(item => item.endedOn > from && item.endedOn <= row.date)
    const assessed = events.filter(item => item.evidence === 'admissionAssessment').length
    expect(assessed, `preserved assessment count Y${row.year}`).toBe(row.ncaaAssessmentConfirmedExits ?? row.ncaaExits)
    return { ...row, ncaaAssessmentConfirmedExits: assessed, ncaaSourceConfirmedLegacyExits: events.length - assessed, ncaaExits: events.length }
  })
  for (const year of final ? [10, 20, 30] : [10, 20]) expect(corrected.find((row: { year: number }) => row.year === year)!.ncaaExits, `authoritative deep exit count Y${year}`).toBe(journal.deepReports[`Y${year}`].flowsSincePreviousCheckpoint.ncaaExits)
  const evidence = { sourcePath, baselinePath, rejectedAdmissionsExcluded: true, simulationYearsReplayed: 0, sourceConfirmedLegacyExits: exits.filter(item => item.evidence === 'sourceMembershipAndExit').length, events: exits, annualCounts: corrected.map((row: { year: number; ncaaAssessmentConfirmedExits: number; ncaaSourceConfirmedLegacyExits: number; ncaaExits: number }) => ({ year: row.year, assessmentConfirmed: row.ncaaAssessmentConfirmedExits, sourceConfirmedLegacy: row.ncaaSourceConfirmedLegacyExits, total: row.ncaaExits })) }
  if (!final) {
    expect(evidence.sourceConfirmedLegacyExits).toBe(107)
    writeFileSync('C:/Temp/BS15I-ncaa-exit-accounting-reconciliation-y20.json', JSON.stringify(evidence, null, 2))
  } else {
    expect(world.currentDate).toBe('2062-10-01')
    expect(journal.status).toBe('Y30_DEEP_PASS')
    expect(corrected).toHaveLength(23)
    const archive = 'C:/Temp/BS15I-final-long-horizon-progress-before-exit-reconciliation.json'
    if (!existsSync(archive)) writeFileSync(archive, readFileSync(journalPath))
    for (const [name, report] of Object.entries(journal.deepReports) as [string, { rollingFiveYear: { years: number[]; ncaaExits: number; previouslyReportedNcaaExits?: number } }][]) {
      const rolling = report.rollingFiveYear
      const previous = rolling.previouslyReportedNcaaExits ?? rolling.ncaaExits
      rolling.previouslyReportedNcaaExits = previous
      rolling.ncaaExits = previous + corrected.filter((row: { year: number }) => rolling.years.includes(row.year)).reduce((sum: number, row: { ncaaSourceConfirmedLegacyExits: number }) => sum + row.ncaaSourceConfirmedLegacyExits, 0)
      writeFileSync(`C:/Temp/BS15I-long-y${name.slice(1)}-deep.json`, JSON.stringify(report, null, 2))
    }
    journal.annual = corrected
    journal.ncaaExitAccounting = evidence
    writeFileSync(`${journalPath}.pending`, JSON.stringify(journal, null, 2))
    renameSync(`${journalPath}.pending`, journalPath)
    writeFileSync('docs/strengthening/BS15I_NCAA_EXIT_ACCOUNTING_RECONCILIATION.json', JSON.stringify(evidence, null, 2))
  }
  process.stdout.write(`[BS15I NCAA exit reconciliation] ${JSON.stringify({ final, sourceConfirmedLegacyExits: evidence.sourceConfirmedLegacyExits, yearsReplayed: 0, deepCountsMatched: true })}\n`)
}, 180_000)
