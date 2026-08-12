import { addYears, formatGameDate } from '@/domain/date'
import { seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'

import { getCurrentSeason } from './selectors'

/** Direct deterministic offseason transition. It never changes existing entities or history. */
export function startNextSeason(world: GameWorld): GameWorld {
  const previous = getCurrentSeason(world)
  if (!isSeasonComplete(world, previous.id)) throw new Error('Current season is not complete')
  if (getSeasonHistoryRecord(world, previous.id) === undefined) throw new Error('Current season requires a history record')

  const next = createSeason({
    id: nextSeasonId(world),
    competitionId: previous.competitionId,
    label: `${formatGameDate(addYears(previous.startDate, 1))} to ${formatGameDate(addYears(previous.endDate, 1))}`,
    startDate: addYears(previous.startDate, 1),
    endDate: addYears(previous.endDate, 1),
  })
  const staged = rebuild(world, [...Object.values(world.seasons), next], world.currentSeasonId, Object.values(world.games))
  const schedule = generateRoundRobinSchedule({ world: staged, seasonId: next.id })
  return rebuild(world, [...Object.values(world.seasons), next], next.id, [...Object.values(world.games), ...schedule])
}

function nextSeasonId(world: GameWorld) {
  let ordinal = Object.keys(world.seasons).length + 1
  while (world.seasons[seasonIdFromString(`generated-season-${ordinal.toString().padStart(4, '0')}`)] !== undefined) ordinal += 1
  return seasonIdFromString(`generated-season-${ordinal.toString().padStart(4, '0')}`)
}

function rebuild(world: GameWorld, seasons: readonly (typeof world.seasons)[keyof typeof world.seasons][], currentSeasonId: GameWorld['currentSeasonId'], games: readonly (typeof world.games)[keyof typeof world.games][]): GameWorld {
  return createGameWorld({ currentDate: currentSeasonId === world.currentSeasonId ? world.currentDate : seasons.find((season) => season.id === currentSeasonId)!.startDate, currentSeasonId, userCoachId: world.userCoachId, countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), competitions: Object.values(world.competitions), seasons, games, matchStatLogs: Object.values(world.matchStatLogsByGameId), seasonHistory: Object.values(world.seasonHistoryBySeasonId) })
}
