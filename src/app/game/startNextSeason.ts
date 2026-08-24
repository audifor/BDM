import { addDays, addYears, formatGameDate } from '@/domain/date'
import { seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { generateNcaaLikeSchedule, generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
import { applyOffseasonDevelopment } from '@/engine/development'
import { reconcileExpiredPlayerContracts } from '@/engine/market'
import { maintainAiTeamMinimumRosters } from '@/app/market'
import { getCurrentSeason } from './selectors'
import { buildNextCompetitionParticipants } from '@/engine/competition'
import { ensureNcaaEligibility } from '@/engine/eligibility'
import { ensureNcaaAcademics } from '@/engine/academic'
import { rolloverBoardState } from '@/engine/board'

/** Starts the next edition of the current competition without synchronizing others. */
export function startNextSeason(world: GameWorld): GameWorld {
  const primary = getCurrentSeason(world)
  if (!isSeasonComplete(world, primary.id)) throw new Error('Current season is not complete')
  if (getSeasonHistoryRecord(world, primary.id) === undefined) throw new Error('Current season requires a history record')
  const nextPrimary = createSeason({ id: nextSeasonIds(world, 1)[0]!, competitionId: primary.competitionId, label: `${formatGameDate(addYears(primary.startDate, 1))} to ${formatGameDate(addYears(primary.endDate, 1))}`, startDate: addYears(primary.startDate, 1), endDate: addYears(primary.endDate, 1), participantTeamIds: buildNextCompetitionParticipants(world, primary.id) })
  const developed = applyOffseasonDevelopment(world, { fromSeasonId: primary.id, toSeasonId: nextPrimary.id, targetDate: nextPrimary.startDate }).world
  const staged = updateGameWorld(developed, { currentDate: nextPrimary.startDate, currentSeasonId: nextPrimary.id, seasons: [...Object.values(developed.seasons), nextPrimary] })
  const schedule = staged.ecosystems[staged.competitions[nextPrimary.competitionId]!.ecosystemId]!.kind === 'ncaaLike' ? generateNcaaLikeSchedule(staged, nextPrimary.id) : generateRoundRobinSchedule({ world: staged, seasonId: nextPrimary.id })
  const next = ensureNcaaAcademics(ensureNcaaEligibility(maintainAiTeamMinimumRosters(reconcileExpiredPlayerContracts(updateGameWorld(staged, { games: [...Object.values(staged.games), ...schedule] }), nextPrimary.startDate)).world))
  return Object.keys(next.boardStatesByTeamId).reduce((current, teamId) => rolloverBoardState(current, teamId as import('@/domain/ids').TeamId, nextPrimary.id), next)
}

function nextSeasonIds(world: GameWorld, count: number) { let ordinal = 1; const ids = []; while (ids.length < count) { const id = seasonIdFromString(`generated-season-${ordinal.toString().padStart(4, '0')}`); if (world.seasons[id] === undefined) ids.push(id); ordinal += 1 } return ids }
