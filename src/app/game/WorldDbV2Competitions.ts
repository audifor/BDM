import catalog from '@/data/worlddb-v2/competitions.json'
import { addDays, addYears, type GameDate } from '@/domain/date'
import { spainAcbCalendarForStartYear } from '@/data/worldCompetitionCalendars'
export const WORLDDB_V2_COMPETITIONS = catalog
export const DEFAULT_WORLDDB_V2_COMPETITION = 'pbm:DYN_championnat:5'
export function worldDbV2Competition(id = DEFAULT_WORLDDB_V2_COMPETITION) {
  const config = catalog.find(c => c.sourceCompetitionId === id)
  if (!config) throw Error('Unmapped PBM competition: ' + id)
  return config
}
export function worldDbV2Calendar(config: ReturnType<typeof worldDbV2Competition>, day: GameDate) {
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
