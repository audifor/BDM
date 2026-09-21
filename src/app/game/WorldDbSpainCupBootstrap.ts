import { createCompetition, defaultLeagueCompetitionRules, type WorldCompetitionFormatDocument } from '@/domain/competition'
import { competitionIdFromString, seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { attachWorldDbCompetitionRuntime, updateGameWorld, type GameWorld } from '@/domain/world'
import { spainCopaCalendarForStartYear } from '@/data/worldCompetitionCalendars'

/** Adds the configured parallel Cup edition to the RealWorldSpain career world. */
export function attachWorldDbSpainCup(world: GameWorld, format: WorldCompetitionFormatDocument): GameWorld {
  const leagueSeason = world.seasons[world.currentSeasonId]!
  const league = world.competitions[leagueSeason.competitionId]!
  const calendar = spainCopaCalendarForStartYear(Number(leagueSeason.startDate.slice(0, 4)))
  const window = calendar.seasonWindow
  const cupCompetition = createCompetition({
    id: competitionIdFromString(format.competitionId),
    name: 'Copa del Rey',
    gender: league.gender,
    ecosystemId: league.ecosystemId,
    participantTeamIds: [],
    rules: defaultLeagueCompetitionRules,
  })
  const cupSeason = createSeason({
    id: seasonIdFromString(`season:${format.competitionSeasonId}`),
    competitionId: cupCompetition.id,
    label: format.seasonLabel,
    startDate: window.startDate,
    endDate: window.endDate,
    participantTeamIds: [],
    worldCompetitionFormat: format,
    calendarPolicy: calendar,
  })
  const withCup = updateGameWorld(world, {
    competitions: [...Object.values(world.competitions), cupCompetition],
    seasons: [...Object.values(world.seasons), cupSeason],
  })
  const runtime = withCup.worldDbCompetitionRuntime
  if (runtime === undefined) throw new Error('RealWorldSpain World DB runtime is missing during Cup bootstrap')
  return attachWorldDbCompetitionRuntime(withCup, {
    ...runtime,
    competitionSeasonIds: [...runtime.competitionSeasonIds, format.competitionSeasonId],
  })
}
