import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { GameDate } from '@/domain/date'
import type { FinalStandingLine } from './SeasonHistory'
import { isRegularSeasonGame } from './RegularSeasonScope'
import { rankClassificationMiniLeague } from './classificationMiniLeague'
import { resolveWorldCompetitionGroups } from '@/domain/competition/WorldCompetitionGroups'

/** Pure domain projection of completed game results for one season. */
export function calculateSeasonStandings(world: GameWorld, seasonId: keyof GameWorld['seasons'], throughDate?: GameDate): FinalStandingLine[] {
  const season = world.seasons[seasonId]
  if (season === undefined) throw new Error(`Season does not exist: ${seasonId}`)
  const competition = world.competitions[season.competitionId]!
  const participants = season.participantTeamIds ?? competition.participantTeamIds
  const variant = season.worldCompetitionFormat?.variants.find(v => v.isRealVariant) ?? season.worldCompetitionFormat?.variants[0]
  const node = variant?.nodes.find(n => n.role === 'REGULAR_SEASON')
  if (node?.opponentScope?.payload.policy === 'BDM_GENERATED_GROUPS') {
    const groups = calculateSeasonGroupStandings(world, seasonId, throughDate)
    return Array.from({ length: Math.max(...groups.map(group => group.length)) }, (_, rank) => groups.flatMap(group => group[rank] ? [group[rank]!] : []))
      .flat().map((row, index) => ({ ...row, position: index + 1 }))
  }
  return calculateStandingTable(world, seasonId, participants, throughDate)
}

export function calculateSeasonGroupStandings(world: GameWorld, seasonId: keyof GameWorld['seasons'], throughDate?: GameDate): FinalStandingLine[][] {
  const season = world.seasons[seasonId]
  if (season === undefined) throw new Error(`Season does not exist: ${seasonId}`)
  const participants = season.participantTeamIds ?? world.competitions[season.competitionId]!.participantTeamIds
  const variant = season.worldCompetitionFormat?.variants.find(v => v.isRealVariant) ?? season.worldCompetitionFormat?.variants[0]
  const node = variant?.nodes.find(n => n.role === 'REGULAR_SEASON')
  const groups = node?.opponentScope?.payload.policy === 'BDM_GENERATED_GROUPS' ? resolveWorldCompetitionGroups(node, participants) : [participants]
  return groups.map(group => calculateStandingTable(world, seasonId, group, throughDate))
}

function calculateStandingTable(world: GameWorld, seasonId: keyof GameWorld['seasons'], participants: readonly TeamId[], throughDate?: GameDate): FinalStandingLine[] {
  const season = world.seasons[seasonId]!
  const competition = world.competitions[season.competitionId]!
  const entries = participants.map((teamId) => ({ teamId, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }))
  const byTeam = Object.fromEntries(entries.map((entry) => [entry.teamId, entry])) as Record<TeamId, typeof entries[number]>
  for (const game of Object.values(world.games)) {
    if (game.seasonId !== seasonId || game.status !== 'completed' || (throughDate !== undefined && game.date > throughDate)) continue
    if (!isRegularSeasonGame(season, game) || !byTeam[game.homeTeamId] || !byTeam[game.awayTeamId]) continue
    const home = byTeam[game.homeTeamId]!; const away = byTeam[game.awayTeamId]!; const result = game.result
    home.played += 1; away.played += 1; home.pointsFor += result.homeScore; home.pointsAgainst += result.awayScore; away.pointsFor += result.awayScore; away.pointsAgainst += result.homeScore
    if (result.homeScore > result.awayScore) { home.wins += 1; away.losses += 1 } else { away.wins += 1; home.losses += 1 }
  }
  const rows = entries.map((entry) => ({ ...entry, position: 0, pointDifference: entry.pointsFor - entry.pointsAgainst }))
  const variant = season.worldCompetitionFormat?.variants.find(v => v.isRealVariant) ?? season.worldCompetitionFormat?.variants[0]
  if (variant?.seeding?.basis.some(b => typeof b === 'object' && b !== null && !Array.isArray(b) && b.type === 'CLASSIFICATION_POINTS_MINILEAGUE_2_1_V1')) {
    const regular = Object.values(world.games).filter(g => g.seasonId === seasonId && isRegularSeasonGame(season, g) && byTeam[g.homeTeamId] && byTeam[g.awayTeamId])
    const completed = regular.filter(g => g.status === 'completed' && (throughDate === undefined || g.date <= throughDate))
    const deterministicDraw = variant.seeding.basis.some(b => typeof b === 'object' && b !== null && !Array.isArray(b) && b.terminal_tie === 'BDM_TEAM_ID_DRAW')
    return rankClassificationMiniLeague(rows, completed.map(g => ({ homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, homeScore: g.result!.homeScore, awayScore: g.result!.awayScore })), regular.length > 0 && completed.length === regular.length, deterministicDraw)
  }
  return rows
    .sort((a, b) => compareStandingEntries(a, b, competition.rules.standings.tiebreakers))
    .map((entry, index) => ({ ...entry, position: index + 1 }))
}

function compareStandingEntries(a: { readonly teamId: TeamId; readonly wins: number; readonly pointDifference: number; readonly pointsFor: number }, b: { readonly teamId: TeamId; readonly wins: number; readonly pointDifference: number; readonly pointsFor: number }, tiebreakers: readonly import('@/domain/competition').StandingsTiebreaker[]): number {
  for (const tiebreaker of tiebreakers) {
    const comparison = tiebreaker === 'teamId' ? a.teamId.localeCompare(b.teamId) : b[tiebreaker] - a[tiebreaker]
    if (comparison !== 0) return comparison
  }
  return 0
}
