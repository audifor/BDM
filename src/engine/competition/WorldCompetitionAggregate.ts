import { addDays } from '@/domain/date'
import { createGame, type Game } from '@/domain/game'
import { gameIdFromString, teamIdFromString } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { WorldCompetitionFormatNode } from '@/domain/competition'
import { deriveCompetitionSeasonWindows } from './WorldCompetitionCalendar'
import { selectWorldCompetitionHigherSeedV1, type WorldCompetitionResolvedVirtualFixtureV1, type WorldCompetitionVirtualFixtureOutcomeV1 } from './WorldCompetitionVirtualFixtureResolver'

/** Two scored legs; an explicitly simulated deciding game resolves aggregate ties. */
export function resolveWorldCompetitionAggregate(world: GameWorld, seasonId: keyof GameWorld['seasons'], fixture: WorldCompetitionResolvedVirtualFixtureV1, node: WorldCompetitionFormatNode): { outcome: WorldCompetitionVirtualFixtureOutcomeV1 | null; next: Game | null } {
  if (node.contest?.legCount !== 2 || node.contest.tieResolution?.method !== 'BDM_EXTRA_DECIDER') throw new Error(`Aggregate ${node.key} requires an explicit executable tie policy`)
  const season = world.seasons[seasonId]!
  const priority = selectWorldCompetitionHigherSeedV1(fixture.participants).competitionSeasonEntryId
  const other = fixture.participants.find(p => p.competitionSeasonEntryId !== priority)!.competitionSeasonEntryId
  const games = Object.values(world.games).filter(g => g.seasonId === seasonId && g.postseasonFixtureId === fixture.fixtureId).sort((a, b) => a.postseasonGameNo! - b.postseasonGameNo!)
  let difference = 0
  for (const [index, game] of games.entries()) {
    const home = index === 0 ? other : priority
    if (game.postseasonGameNo !== index + 1 || game.homeTeamId !== home || game.awayTeamId !== (home === priority ? other : priority) || index > 2) throw new Error(`Invalid aggregate leg: ${game.id}`)
    if (game.status !== 'completed') return { outcome: null, next: null }
    const margin = (game.result.homeScore - game.result.awayScore) * (home === priority ? 1 : -1)
    difference = index === 2 ? margin : difference + margin
  }
  if (games.length >= 2 && difference !== 0) return { outcome: { fixtureId: fixture.fixtureId, winnerEntryId: difference > 0 ? priority : other, loserEntryId: difference > 0 ? other : priority }, next: null }
  if (games.length >= 3) throw new Error('Aggregate deciding game must resolve a winner')
  const windows = deriveCompetitionSeasonWindows(season.startDate, season.endDate, season.worldCompetitionFormat, season.calendarPolicy)
  const start = windows.postseasonStartByNodeKey[node.key]
  if (!start) throw new Error(`Missing aggregate calendar window: ${node.key}`)
  const home = games.length === 0 ? other : priority
  return { outcome: null, next: createGame({
    id: gameIdFromString(`competition-postseason:${season.id}:${fixture.fixtureId}:g${games.length + 1}`),
    competitionId: season.competitionId, seasonId: season.id, date: addDays(start, games.length * windows.postseasonDaysBetweenGames),
    homeTeamId: teamIdFromString(home), awayTeamId: teamIdFromString(home === priority ? other : priority),
    status: 'scheduled', result: null, stakes: node.role === 'FINAL' ? 'final' : 'elimination',
    competitionStageKey: node.key, postseasonFixtureId: fixture.fixtureId, postseasonGameNo: games.length + 1,
  }) }
}
