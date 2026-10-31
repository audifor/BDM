import { addDays } from '@/domain/date'
import { createGame, type Game } from '@/domain/game'
import { gameIdFromString, teamIdFromString, type SeasonId, type TeamId } from '@/domain/ids'
import type { FinalStandingLine } from '@/domain/season'
import { rankClassificationMiniLeague } from '@/domain/season/classificationMiniLeague'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { WorldCompetitionFormatNode } from '@/domain/competition'
import { resolveWorldCompetitionGroups } from '@/domain/competition/WorldCompetitionGroups'
import { calculateGroupStandings } from './standings/Standings'
import { deriveCompetitionSeasonWindows, requireCompetitionFormatVariant } from './WorldCompetitionCalendar'
import { instantiateWorldCompetitionRoundRobinV1 } from './WorldCompetitionRoundRobin'

export function splitStageNodes(world: GameWorld, seasonId: SeasonId): readonly WorldCompetitionFormatNode[] {
  const format = world.seasons[seasonId]?.worldCompetitionFormat
  if (!format) return []
  return requireCompetitionFormatVariant(format).nodes.filter(node => node.role === 'SPLIT_STAGE' && ['CROSS_GROUP_CARRYOVER', 'GROUP_ROUND_ROBIN'].includes(String(node.pairing?.payload.bdm_split_policy)))
}

function splitParticipants(world: GameWorld, seasonId: SeasonId, node: WorldCompetitionFormatNode): readonly TeamId[] {
  const first = node.pairing?.payload.bdm_rank_from, last = node.pairing?.payload.bdm_rank_to
  if (typeof first !== 'number' || typeof last !== 'number' || !Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first) throw new Error(`Invalid split qualification: ${node.key}`)
  const tables = calculateGroupStandings(world, seasonId)
  const source = node.pairing?.payload.bdm_source_groups
  const indices = Array.isArray(source) ? source : [0, 1]
  if (indices.length !== 2 || indices.some(index => typeof index !== 'number' || !Number.isInteger(index) || !tables[index] || tables[index]!.length < last)) throw new Error(`Split stage ${node.key} needs two complete source groups`)
  const ids = indices.flatMap(index => tables[index as number]!.filter(row => row.position >= first && row.position <= last).map(row => row.teamId))
  if (node.teamCount !== ids.length) throw new Error(`Split stage ${node.key} participant count mismatch`)
  return ids
}

function splitPlan(world: GameWorld, seasonId: SeasonId, node: WorldCompetitionFormatNode): Game[] {
  const season = world.seasons[seasonId]!, format = season.worldCompetitionFormat!, variant = requireCompetitionFormatVariant(format)
  const regular = variant.nodes.find(candidate => candidate.role === 'REGULAR_SEASON')!
  const allTeams = season.participantTeamIds ?? world.competitions[season.competitionId]!.participantTeamIds
  const sourceGroups = resolveWorldCompetitionGroups(regular, allTeams)
  const groupByTeam = new Map(sourceGroups.flatMap((group, index) => group.map(id => [String(id), index] as const)))
  const participants = splitParticipants(world, seasonId, node)
  const scoped = { ...format, variants: [{ ...variant, nodes: [{ ...node, teamCount: participants.length, opponentScope: { type: 'ALL_STAGE' as const, payload: {} } }] }] }
  const plan = instantiateWorldCompetitionRoundRobinV1(scoped, variant.key, node.key, participants.map(id => ({ competitionSeasonEntryId: id })))
  const windows = deriveCompetitionSeasonWindows(season.startDate, season.endDate, format, season.calendarPolicy)
  const start = windows.postseasonStartByNodeKey[node.key]
  if (!start) throw new Error(`Missing split stage calendar window: ${node.key}`)
  return plan.fixtures.filter(fixture => node.pairing?.payload.bdm_split_policy !== 'CROSS_GROUP_CARRYOVER' || groupByTeam.get(fixture.homeEntryId) !== groupByTeam.get(fixture.awayEntryId)).map(fixture => createGame({
    id: gameIdFromString(`split:${seasonId}:${fixture.fixtureId}`), seasonId, competitionId: season.competitionId,
    date: addDays(start, (fixture.roundNo - 1) * 3), homeTeamId: teamIdFromString(fixture.homeEntryId), awayTeamId: teamIdFromString(fixture.awayEntryId),
    competitionStageKey: node.key, status: 'scheduled', result: null,
  }))
}

/** Materializes each cross-pool game once; the original in-pool games are carried forward. */
export function materializeSplitStages(world: GameWorld, seasonId: SeasonId): GameWorld {
  const planned = splitStageNodes(world, seasonId).flatMap(node => splitPlan(world, seasonId, node))
  const additions = planned.filter(game => world.games[game.id] === undefined)
  return additions.length ? updateGameWorld(world, { games: [...Object.values(world.games), ...additions] }) : world
}

export function splitStagesComplete(world: GameWorld, seasonId: SeasonId): boolean {
  const nodes = splitStageNodes(world, seasonId)
  if (!nodes.length) return true
  return nodes.every(node => splitPlan(world, seasonId, node).every(game => world.games[game.id]?.status === 'completed'))
}

/** Computes the split table from carried source results and newly completed games. */
export function calculateSplitStandings(world: GameWorld, seasonId: SeasonId, node: WorldCompetitionFormatNode): FinalStandingLine[] {
  const season = world.seasons[seasonId]!, format = season.worldCompetitionFormat!, variant = requireCompetitionFormatVariant(format)
  const regular = variant.nodes.find(candidate => candidate.role === 'REGULAR_SEASON')!
  const participants = splitParticipants(world, seasonId, node)
  const ids = new Set(participants)
  const originalGroups = resolveWorldCompetitionGroups(regular, season.participantTeamIds ?? world.competitions[season.competitionId]!.participantTeamIds)
  const groupByTeam = new Map(originalGroups.flatMap((group, index) => group.map(id => [id, index] as const)))
  const entries = new Map(participants.map(teamId => [teamId, { teamId, position: 0, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 }]))
  const results = Object.values(world.games).filter(game => game.seasonId === seasonId && game.status === 'completed' && ids.has(game.homeTeamId) && ids.has(game.awayTeamId) &&
    (game.competitionStageKey === node.key || (node.pairing?.payload.bdm_split_policy === 'CROSS_GROUP_CARRYOVER' && game.competitionStageKey === regular.key && groupByTeam.get(game.homeTeamId) === groupByTeam.get(game.awayTeamId))))
  for (const game of results) {
    if (game.status !== 'completed') continue
    const home = entries.get(game.homeTeamId)!, away = entries.get(game.awayTeamId)!
    home.played++; away.played++; home.pointsFor += game.result.homeScore; home.pointsAgainst += game.result.awayScore; away.pointsFor += game.result.awayScore; away.pointsAgainst += game.result.homeScore
    if (game.result.homeScore > game.result.awayScore) { home.wins++; away.losses++ } else { away.wins++; home.losses++ }
  }
  for (const row of entries.values()) row.pointDifference = row.pointsFor - row.pointsAgainst
  return rankClassificationMiniLeague([...entries.values()], results.filter(game => game.status === 'completed').map(game => ({ homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: game.result!.homeScore, awayScore: game.result!.awayScore })), splitStagesComplete(world, seasonId), true)
}
