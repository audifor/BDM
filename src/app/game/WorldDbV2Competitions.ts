import catalog from '@/data/worlddb-v2/competitions.json'
import globalCatalog from '@/data/worlddb-v2/global-competitions.json'
import { addDays, addYears, type GameDate } from '@/domain/date'
import { spainAcbCalendarForStartYear } from '@/data/worldCompetitionCalendars'
import type { WorldCompetitionFormatDocument } from '@/domain/competition'
import { deriveCompetitionSeasonWindows } from '@/engine/competition/WorldCompetitionCalendar'
import { matrixRoundCount } from '@/engine/competition/schedule/MatrixScheduleGenerator'
export const WORLDDB_V2_COMPETITIONS = catalog
export const WORLDDB_V2_GLOBAL_COMPETITIONS: readonly (typeof catalog[number] & { formatProvenance?: string; simulationPolicy?: boolean })[] = [...catalog, ...globalCatalog]
export const DEFAULT_WORLDDB_V2_COMPETITION = 'pbm:DYN_championnat:5'
export function worldDbV2Competition(id = DEFAULT_WORLDDB_V2_COMPETITION) {
  const config = WORLDDB_V2_GLOBAL_COMPETITIONS.find(c => c.sourceCompetitionId === id)
  if (!config) throw Error('Unmapped PBM competition: ' + id)
  return config
}
export function worldDbV2Calendar(config: ReturnType<typeof worldDbV2Competition> & { formatProvenance?: string; simulationPolicy?: boolean }, day: GameDate, format?: WorldCompetitionFormatDocument) {
  if (config.formatProvenance === 'GENERATED_SIMULATION' || config.simulationPolicy) {
    // Fictional fallback only: fit large synthetic round robins without claiming
    // to reproduce the source competition's groups or real calendar.
    const endDate = addDays(addYears(day, 1), -1)
    const windows = deriveCompetitionSeasonWindows(day, endDate, format)
    const variant = format?.variants.find(v => v.isRealVariant) ?? format?.variants[0]
    const regularNode = variant?.nodes.find(n => n.role === 'REGULAR_SEASON')
    const matrixTarget = regularNode?.pairing?.payload.bdm_generated_matrix_v1 === true ? regularNode.pairing.payload.games_per_team : undefined
    if (matrixTarget !== undefined) {
      if (typeof matrixTarget !== 'number') throw new RangeError('Invalid simulated matrix target')
      const roundCount = matrixRoundCount(config.teamCount, matrixTarget)
      return {
        seasonWindow: { startDate: day, endDate }, regularSeasonWindow: { startDate: day, endDate: windows.regularSeasonEnd },
        specialCompetitionWindows: [], postseasonWindow: windows.postseasonStart === null ? null : { startDate: windows.postseasonStart, endDate }, postseasonStageStartDates: windows.postseasonStartByNodeKey, offseasonWindow: null,
        regularSeasonCadence: { preferredWeekdays: [0, 1, 2, 3, 4, 5, 6], midweekWeekdays: [0, 1, 2, 3, 4, 5, 6], midweekRoundNumbers: Array.from({ length: roundCount }, (_, i) => i + 1), weeklyCadenceDays: 7, minimumRestDays: 3, breakDaysAfterRound: {} },
        postseasonCadence: { daysBetweenGames: 1, daysBetweenRounds: 1 },
      }
    }
    const meetings = variant?.nodes.find(n => n.role === 'REGULAR_SEASON')?.pairing?.meetingsPerPair ?? 2
    const groupCount = variant?.nodes.find(n => n.role === 'REGULAR_SEASON')?.opponentScope?.payload.generated_group_count
    const count = typeof groupCount === 'number' ? Math.ceil(config.teamCount / groupCount) : config.teamCount
    const roundCount = meetings * (count % 2 === 0 ? count - 1 : count)
    return {
      seasonWindow: { startDate: day, endDate }, regularSeasonWindow: { startDate: day, endDate: windows.regularSeasonEnd },
      specialCompetitionWindows: [], postseasonWindow: windows.postseasonStart === null ? null : { startDate: windows.postseasonStart, endDate }, postseasonStageStartDates: windows.postseasonStartByNodeKey, offseasonWindow: null,
      regularSeasonCadence: { preferredWeekdays: [0, 1, 2, 3, 4, 5, 6], midweekWeekdays: [0, 1, 2, 3, 4, 5, 6], midweekRoundNumbers: Array.from({ length: roundCount }, (_, i) => i + 1), weeklyCadenceDays: 7, minimumRestDays: 3, breakDaysAfterRound: {} },
      postseasonCadence: { daysBetweenGames: 1, daysBetweenRounds: 1 },
    }
  }
  // Without a dated league policy, the existing engine derives windows from that
  // league's own format and uses its existing default cadence. No ACB calendar substitution.
  if (config.calendar !== 'SPAIN_ACB_EXISTING') return undefined
  const year = Number(day.slice(0, 4)) + (day.slice(5) > '10-04' ? 1 : 0)
  const base = spainAcbCalendarForStartYear(year)
  const weekday = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay()
  const shift = weekday(base.regularSeasonWindow.startDate) - weekday(spainAcbCalendarForStartYear(2025).regularSeasonWindow.startDate)
  const rotate = (value: number) => (value + shift + 7) % 7
  return { ...base, seasonWindow: { startDate: day, endDate: base.seasonWindow.endDate }, specialCompetitionWindows: [], regularSeasonCadence: { ...base.regularSeasonCadence, preferredWeekdays: base.regularSeasonCadence.preferredWeekdays.map(rotate), midweekWeekdays: base.regularSeasonCadence.midweekWeekdays.map(rotate) } }
}
export function worldDbV2SeasonEnd(config: ReturnType<typeof worldDbV2Competition>, day: GameDate) {
  return worldDbV2Calendar(config, day)?.seasonWindow.endDate ?? addDays(addYears(day, 1), -1)
}
