import { compareGameDates, type GameDate } from '@/domain/date'
import { getPlayerContractStatus, type PlayerContract } from '@/domain/contract'
import type { Game } from '@/domain/game'
import { isInjuryActive } from '@/domain/injury'
import type { RolePromise } from '@/domain/market'
import { contractsByPlayer, eligibilityRestrictionsByPlayer, injuriesByPlayer, resolveGameClockRulesForGame, type GameWorld } from '@/domain/world'

export type RolePromiseGameEvidence =
  | { readonly gameId: string; readonly competitionId: Game['competitionId']; readonly seasonId: Game['seasonId']; readonly gameDate: GameDate; readonly status: 'EXCLUDED_INJURY' | 'EXCLUDED_RESTRICTION' | 'MISSING_MATCH_LOG' | 'INCOMPLETE_MATCH_LOG' }
  | { readonly gameId: string; readonly competitionId: Game['competitionId']; readonly seasonId: Game['seasonId']; readonly gameDate: GameDate; readonly status: 'MEASURED'; readonly started: boolean; readonly appeared: boolean; readonly playerSeconds: number; readonly actualGameSeconds: number; readonly regulationSeconds: number; readonly teamMinuteRank: number }

export interface RolePromiseUsageWindow {
  readonly competitionId: Game['competitionId']
  readonly seasonId: Game['seasonId']
  readonly evidence: readonly RolePromiseGameEvidence[]
  readonly measuredGames: number
  readonly availableGames: number
  readonly starts: number
  readonly appearances: number
  readonly topThreeMinuteGames: number
  readonly playerSeconds: number
  readonly regulationSeconds: number
  /** Share of regulation time; overtime seconds remain in the numerator. Never divided by five players. */
  readonly playingTimeShare: number | null
  readonly topThreeMinuteRate: number | null
}

/**
 * Derives auditable professional role-promise usage evidence from contracts,
 * competition clocks, availability and canonical match logs. It deliberately
 * does not decide fulfilment or mutate RolePromise, morale, relationships or HRPG.
 */
export function deriveRolePromiseUsage(world: GameWorld, promise: RolePromise): readonly RolePromiseUsageWindow[] {
  const teamIds = new Set(Object.values(world.teams).filter((team) => team.organizationId === promise.teamOrganizationId).map((team) => team.id))
  const contractsByTeam = new Map<string, PlayerContract[]>()
  for (const contract of contractsByPlayer(world.contractsById).get(promise.playerId) ?? []) {
    if (teamIds.has(contract.teamId)) contractsByTeam.set(contract.teamId, [...(contractsByTeam.get(contract.teamId) ?? []), contract])
  }
  const games = Object.values(world.games)
    .filter((game) => game.status === 'completed' && compareGameDates(game.date, promise.acceptedOn) >= 0 && compareGameDates(game.date, world.currentDate) <= 0
      && [game.homeTeamId, game.awayTeamId].some((teamId) => teamIds.has(teamId)
        && (contractsByTeam.get(teamId) ?? []).some((contract) => getPlayerContractStatus(contract, game.date) === 'active')))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id))
  const restrictions = eligibilityRestrictionsByPlayer(world.eligibilityRestrictionsById).get(promise.playerId) ?? []
  const injuries = injuriesByPlayer(world.injuriesById).get(promise.playerId) ?? []
  const byWindow = new Map<string, RolePromiseGameEvidence[]>()

  for (const game of games) {
    const key = `${game.competitionId}\u0000${game.seasonId}`
    const evidence = byWindow.get(key) ?? []
    byWindow.set(key, evidence)
    const base = { gameId: game.id, competitionId: game.competitionId, seasonId: game.seasonId, gameDate: game.date }
    const ecosystemId = world.competitions[game.competitionId]!.ecosystemId
    const restricted = restrictions.some((restriction) => restriction.ecosystemId === ecosystemId
      && compareGameDates(restriction.startsAt, game.date) <= 0
      && (restriction.endsAt === undefined || compareGameDates(game.date, restriction.endsAt) <= 0))
    if (restricted) { evidence.push({ ...base, status: 'EXCLUDED_RESTRICTION' }); continue }
    if (injuries.some((injury) => isInjuryActive(injury, game.date))) { evidence.push({ ...base, status: 'EXCLUDED_INJURY' }); continue }

    const log = world.matchStatLogsByGameId[game.id]
    if (log === undefined) { evidence.push({ ...base, status: 'MISSING_MATCH_LOG' }); continue }
    const teamId = [game.homeTeamId, game.awayTeamId].find((id) => world.teams[id]?.organizationId === promise.teamOrganizationId)!
    const homeLines = log.playerLines.filter((line) => line.teamId === game.homeTeamId)
    const awayLines = log.playerLines.filter((line) => line.teamId === game.awayTeamId)
    const allLines = [...homeLines, ...awayLines]
    const identities = new Set<string>()
    const validLines = allLines.length === log.playerLines.length && allLines.every((line) => {
      const identity = `${line.teamId}:${line.playerId}`
      if (identities.has(identity)) return false
      identities.add(identity)
      const opponentTeamId = line.teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
      return Number.isSafeInteger(line.stats.secondsPlayed) && line.stats.secondsPlayed >= 0
        && line.stats.playerId === line.playerId && world.players[line.playerId] !== undefined
        && line.opponentTeamId === opponentTeamId && line.isHome === (line.teamId === game.homeTeamId)
        && (!line.started || line.stats.secondsPlayed > 0)
    })
    const homeSeconds = homeLines.reduce((sum, line) => sum + line.stats.secondsPlayed, 0)
    const awaySeconds = awayLines.reduce((sum, line) => sum + line.stats.secondsPlayed, 0)
    const rules = resolveGameClockRulesForGame(world, game)
    const regulationSeconds = rules.periodCount * rules.periodSeconds
    const gameSeconds = homeSeconds / 5
    const overtimePlayedSeconds = gameSeconds - regulationSeconds
    const validOvertimeDuration = overtimePlayedSeconds === 0
      || (rules.overtimeSeconds > 0 && overtimePlayedSeconds > 0 && overtimePlayedSeconds % rules.overtimeSeconds === 0)
    if (log.gameId !== game.id || log.competitionId !== game.competitionId || log.seasonId !== game.seasonId
      || log.gameDate !== game.date || log.homeTeamId !== game.homeTeamId || log.awayTeamId !== game.awayTeamId
      || !validLines || homeLines.length === 0 || awayLines.length === 0
      || homeLines.filter((line) => line.started).length !== 5 || awayLines.filter((line) => line.started).length !== 5
      || homeSeconds !== awaySeconds
      || homeSeconds % 5 !== 0 || gameSeconds < regulationSeconds || !validOvertimeDuration
      || allLines.some((line) => line.stats.secondsPlayed > gameSeconds)) {
      evidence.push({ ...base, status: 'INCOMPLETE_MATCH_LOG' }); continue
    }
    const playerLine = log.playerLines.find((line) => line.playerId === promise.playerId && line.teamId === teamId)
    const playerSeconds = playerLine?.stats.secondsPlayed ?? 0
    const teamMinutes = [...allLines].filter((line) => line.teamId === teamId)
      .sort((left, right) => right.stats.secondsPlayed - left.stats.secondsPlayed || left.playerId.localeCompare(right.playerId))
    const teamMinuteRank = teamMinutes.findIndex((line) => line.playerId === promise.playerId) + 1
      || teamMinutes.filter((line) => line.stats.secondsPlayed > 0).length + 1
    evidence.push({ ...base, status: 'MEASURED', started: playerLine?.started ?? false,
      appeared: playerSeconds > 0, playerSeconds, actualGameSeconds: gameSeconds, regulationSeconds, teamMinuteRank })
  }
  return [...byWindow.entries()].map(([key, items]) => {
    const [competitionId, seasonId] = key.split('\u0000') as [Game['competitionId'], Game['seasonId']]
    const measured = items.filter((item): item is Extract<RolePromiseGameEvidence, { status: 'MEASURED' }> => item.status === 'MEASURED')
    const playerSeconds = measured.reduce((sum, item) => sum + item.playerSeconds, 0)
    const regulationSeconds = measured.reduce((sum, item) => sum + item.regulationSeconds, 0)
    const topThreeMinuteGames = measured.filter((item) => item.teamMinuteRank <= 3).length
    return { competitionId, seasonId, evidence: items, measuredGames: measured.length,
      availableGames: items.filter((item) => item.status !== 'EXCLUDED_INJURY' && item.status !== 'EXCLUDED_RESTRICTION').length,
      starts: measured.filter((item) => item.started).length,
      appearances: measured.filter((item) => item.appeared).length, topThreeMinuteGames,
      playerSeconds, regulationSeconds, playingTimeShare: regulationSeconds === 0 ? null : playerSeconds / regulationSeconds,
      topThreeMinuteRate: measured.length === 0 ? null : topThreeMinuteGames / measured.length }
  }).sort((left, right) => left.competitionId.localeCompare(right.competitionId) || left.seasonId.localeCompare(right.seasonId))
}
