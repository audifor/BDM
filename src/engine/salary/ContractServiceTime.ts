import { compareGameDates, type GameDate } from '@/domain/date'
import type { EcosystemId, PlayerId, SeasonId } from '@/domain/ids'
import type { SalaryRules } from '@/domain/salary'
import type { ContractServiceTimeCredit } from '@/domain/contract/ContractServiceTime'
import type { GameWorld } from '@/domain/world'
import { createContractServiceTimeCredit } from '@/domain/contract/ContractServiceTime'
import { updateGameWorld } from '@/domain/world'

export type ContractServiceTimeResult =
  | { readonly status: 'KNOWN'; readonly seasons: number; readonly jurisdictionId: EcosystemId }
  | { readonly status: 'UNKNOWN'; readonly jurisdictionId?: EcosystemId; readonly reason: 'BASELINE_UNAVAILABLE' | 'SERVICE_POLICY_UNAVAILABLE' }
  | { readonly status: 'NOT_REQUIRED' }

export function getContractServiceTime(world: GameWorld, playerId: PlayerId, rules: SalaryRules, effectiveDate: GameDate): ContractServiceTimeResult {
  if (rules.serviceTimePolicy === undefined) {
    const season = world.seasons[rules.seasonId]
    const ecosystem = season === undefined ? undefined : world.ecosystems[world.competitions[season.competitionId]?.ecosystemId as EcosystemId]
    return ecosystem?.kind === 'nbaLike' && hasServiceTimeBands(rules)
      ? { status: 'UNKNOWN', reason: 'SERVICE_POLICY_UNAVAILABLE' }
      : { status: 'NOT_REQUIRED' }
  }
  const jurisdictionId = rules.serviceTimePolicy.jurisdictionId
  const baseline = Object.values(world.contractServiceTimeBaselinesById).find((item) => item.playerId === playerId && item.jurisdictionId === jurisdictionId)
  if (baseline === undefined || compareGameDates(baseline.effectiveOn, effectiveDate) > 0) return { status: 'UNKNOWN', jurisdictionId, reason: 'BASELINE_UNAVAILABLE' }
  const accrued = Object.values(world.contractServiceTimeCreditsById).filter((credit) => credit.playerId === playerId && credit.jurisdictionId === jurisdictionId && compareGameDates(credit.creditedOn, baseline.effectiveOn) >= 0 && compareGameDates(credit.creditedOn, effectiveDate) <= 0).length
  return { status: 'KNOWN', seasons: baseline.seasons + accrued, jurisdictionId }
}

export function creditContractServiceTimeForCompletedSeason(world: GameWorld, seasonId: SeasonId): GameWorld {
  const additions = buildContractServiceTimeCreditsForCompletedSeason(world, seasonId)
  if (additions.length === 0) return world
  return updateGameWorld(world, { contractServiceTimeCredits: [...Object.values(world.contractServiceTimeCreditsById), ...additions] })
}

/** Derives immutable accrual evidence without applying it; useful for deterministic previews and tests. */
export function buildContractServiceTimeCreditsForCompletedSeason(world: GameWorld, seasonId: SeasonId): readonly ContractServiceTimeCredit[] {
  const season = world.seasons[seasonId]
  const rules = season === undefined ? undefined : world.salaryRulesBySeasonId[seasonId]
  const policy = rules?.serviceTimePolicy
  const history = world.seasonHistoryBySeasonId[seasonId]
  if (season === undefined || policy === undefined || history === undefined) return []
  const competition = world.competitions[season.competitionId]
  const ecosystem = competition === undefined ? undefined : world.ecosystems[competition.ecosystemId]
  if (competition === undefined || ecosystem?.kind !== 'nbaLike' || String(policy.jurisdictionId) !== String(ecosystem.id)) return []
  const completedGames = Object.values(world.games).filter((game) => game.seasonId === seasonId && game.status === 'completed')
  const logs = completedGames.map((game) => world.matchStatLogsByGameId[game.id]).filter((log): log is NonNullable<typeof log> => log !== undefined)
  if (logs.length === 0) return []
  const byPlayer = new Map<PlayerId, string[]>()
  for (const log of logs) for (const line of log.playerLines) {
    if (line.stats.secondsPlayed <= 0) continue
    const games = byPlayer.get(line.playerId) ?? []
    games.push(String(log.gameId))
    byPlayer.set(line.playerId, games)
  }
  const serviceYear = Number(season.startDate.slice(0, 4))
  const additions: ContractServiceTimeCredit[] = []
  for (const [playerId, gameIds] of byPlayer) {
    const alreadyCredited = Object.values(world.contractServiceTimeCreditsById).some((item) => item.playerId === playerId && item.jurisdictionId === policy.jurisdictionId && item.serviceYear === serviceYear)
    if (alreadyCredited) continue
    additions.push(createContractServiceTimeCredit({ id: contractServiceTimeCreditId(playerId, policy.jurisdictionId, serviceYear), playerId, jurisdictionId: policy.jurisdictionId, serviceYear, seasonId, competitionId: String(competition.id), creditedOn: history.completedOn, qualifyingGameIds: gameIds }))
  }
  return Object.freeze(additions)
}

export function contractServiceTimeCreditId(playerId: PlayerId | string, jurisdictionId: EcosystemId | string, serviceYear: number): string {
  return `contract-service-time:${encodeURIComponent(String(jurisdictionId))}:${encodeURIComponent(String(playerId))}:${serviceYear}`
}

function hasServiceTimeBands(rules: SalaryRules): boolean { return rules.minimumSalaryBands.length > 0 || rules.maximumSalaryBands.length > 0 }
