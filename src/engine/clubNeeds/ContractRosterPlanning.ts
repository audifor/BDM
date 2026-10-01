import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import { getContractYearCompensation, getPlayerContractStatus, type PlayerContract } from '@/domain/contract'
import { getContractFinancialSchedule, type ContractPayrollTotal } from '@/domain/finance'
import { calculateAge } from '@/domain/player/PlayerAge'
import { BASKETBALL_POSITIONS, type BasketballPosition } from '@/domain/primitives'
import type { ContractId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

export type ContractRosterHorizonKind = 'AS_OF_DATE' | 'SEASON_END' | 'NEXT_SEASON_END'

export interface ContractRosterExpiry {
  readonly contractId: ContractId
  readonly playerId: PlayerId
  readonly expiresOn: GameDate
  readonly annualSalaryAtExpiry: number
  readonly position: BasketballPosition
  readonly age?: number
  readonly developmentStage: GameWorld['players'][PlayerId]['development']['developmentStage']
  readonly currentRole: 'STARTER' | 'ROTATION' | 'ROSTERED'
  readonly rolePromiseStatus?: 'ACTIVE' | 'FULFILLED' | 'BROKEN'
}

export interface ContractRosterContinuityRisk {
  readonly position: BasketballPosition
  readonly currentRosteredCount: number
  readonly contractuallyRetainedCount: number
  readonly retainedPlayerIds: readonly PlayerId[]
}

export interface ContractRosterHorizon {
  readonly id: string
  readonly kind: ContractRosterHorizonKind
  readonly date: GameDate
  readonly seasonId?: SeasonId
  readonly currentRosterCount: number
  readonly contractuallyRetainedPlayerIds: readonly PlayerId[]
  readonly scheduledArrivalPlayerIds: readonly PlayerId[]
  readonly unresolvedExpiries: readonly ContractRosterExpiry[]
  readonly positionalContinuityRisks: readonly ContractRosterContinuityRisk[]
  readonly guaranteedPlayerPayroll: readonly ContractPayrollTotal[] | null
  readonly conditionalPlayerPayroll: readonly ContractPayrollTotal[] | null
}

export interface ContractRosterPlanning {
  readonly teamId: TeamId
  readonly asOfDate: GameDate
  readonly currentRosterCount: number
  readonly rosterMaximum: 'NOT_CONFIGURED'
  readonly horizons: readonly ContractRosterHorizon[]
}

export function hasContinuousContractSuccessor(world: GameWorld, contractId: ContractId): boolean {
  const contract = world.contractsById[contractId]
  if (contract === undefined) return false
  return Object.values(world.contractsById).some((candidate) => candidate.id !== contract.id
    && candidate.playerId === contract.playerId && candidate.teamId === contract.teamId
    && compareGameDates(candidate.term.startsOn, contract.term.expiresOn) <= 0
    && compareGameDates(candidate.term.expiresOn, contract.term.expiresOn) > 0
    && ['active', 'scheduled'].includes(getPlayerContractStatus(candidate, contract.term.expiresOn)))
}

/** Read-only contract and roster continuity facts, without a simulated departure or signing. */
export function assessContractRosterPlanning(world: GameWorld, teamId: TeamId, onDate: GameDate = world.currentDate): ContractRosterPlanning {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Unknown Team ${teamId}`)

  const currentRoster = new Set(team.rosterPlayerIds)
  const teamContracts = Object.values(world.contractsById).filter((contract) => contract.teamId === teamId)
  const horizonDates = resolveHorizons(world, teamId, onDate)
  const horizons = horizonDates.map((horizon) => {
    const retainedContracts = teamContracts.filter((contract) => getPlayerContractStatus(contract, horizon.date) === 'active')
    const retainedPlayerIds = [...new Set(retainedContracts.map((contract) => contract.playerId))].sort()
    const scheduledArrivalPlayerIds = [...new Set(retainedContracts
      .filter((contract) => !currentRoster.has(contract.playerId) && compareGameDates(contract.term.startsOn, onDate) > 0)
      .map((contract) => contract.playerId))].sort()
    const unresolvedExpiries = teamContracts
      .filter((contract) => getPlayerContractStatus(contract, onDate) === 'active'
        && compareGameDates(contract.term.expiresOn, onDate) > 0
        && compareGameDates(contract.term.expiresOn, horizon.date) <= 0
        && !hasContinuousContractSuccessor(world, contract.id))
      .sort((left, right) => left.term.expiresOn.localeCompare(right.term.expiresOn) || left.playerId.localeCompare(right.playerId) || left.id.localeCompare(right.id))
      .map((contract) => expiryContext(world, teamId, contract, onDate))
    const positionalContinuityRisks = BASKETBALL_POSITIONS.flatMap((position) => {
      const currentCount = team.rosterPlayerIds.filter((playerId) => world.players[playerId]?.basketball.primaryPosition === position).length
      const retainedPlayerIdsAtPosition = retainedPlayerIds.filter((playerId) => world.players[playerId]?.basketball.primaryPosition === position)
      return currentCount >= 2 && retainedPlayerIdsAtPosition.length <= 1
        ? [Object.freeze({ position, currentRosteredCount: currentCount, contractuallyRetainedCount: retainedPlayerIdsAtPosition.length, retainedPlayerIds: Object.freeze(retainedPlayerIdsAtPosition) })]
        : []
    })
    const payroll = horizon.seasonId === undefined ? undefined : playerPayrollForSeason(world, team.organizationId, teamId, horizon.seasonId)
    return Object.freeze({
      ...horizon,
      currentRosterCount: team.rosterPlayerIds.length,
      contractuallyRetainedPlayerIds: Object.freeze(retainedPlayerIds),
      scheduledArrivalPlayerIds: Object.freeze(scheduledArrivalPlayerIds),
      unresolvedExpiries: Object.freeze(unresolvedExpiries),
      positionalContinuityRisks: Object.freeze(positionalContinuityRisks),
      guaranteedPlayerPayroll: payroll?.guaranteed ?? null,
      conditionalPlayerPayroll: payroll?.conditional ?? null,
    })
  })

  return Object.freeze({ teamId, asOfDate: onDate, currentRosterCount: team.rosterPlayerIds.length, rosterMaximum: 'NOT_CONFIGURED', horizons: Object.freeze(horizons) })
}

function resolveHorizons(world: GameWorld, teamId: TeamId, onDate: GameDate): readonly Omit<ContractRosterHorizon, 'currentRosterCount' | 'contractuallyRetainedPlayerIds' | 'scheduledArrivalPlayerIds' | 'unresolvedExpiries' | 'positionalContinuityRisks' | 'guaranteedPlayerPayroll' | 'conditionalPlayerPayroll'>[] {
  const active = Object.values(world.seasons).filter((season) => season.startDate <= onDate && season.endDate >= onDate
    && (season.participantTeamIds ?? world.competitions[season.competitionId]?.participantTeamIds ?? []).includes(teamId))
    .sort((left, right) => left.endDate.localeCompare(right.endDate) || left.id.localeCompare(right.id))
  const currentSeason = active[0]
  const horizons: { id: string; kind: ContractRosterHorizonKind; date: GameDate; seasonId?: SeasonId }[] = [{ id: `AS_OF_DATE:${onDate}`, kind: 'AS_OF_DATE', date: onDate, ...(currentSeason === undefined ? {} : { seasonId: currentSeason.id }) }]
  for (const season of active) {
    horizons.push({ id: `SEASON_END:${season.id}`, kind: 'SEASON_END', date: season.endDate, seasonId: season.id })
    const next = Object.values(world.seasons).filter((candidate) => candidate.competitionId === season.competitionId
      && compareGameDates(candidate.startDate, season.startDate) > 0
      && (candidate.participantTeamIds ?? world.competitions[candidate.competitionId]?.participantTeamIds ?? []).includes(teamId))
      .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id))[0]
    if (next !== undefined) horizons.push({ id: `NEXT_SEASON_END:${next.id}`, kind: 'NEXT_SEASON_END', date: next.endDate, seasonId: next.id })
  }
  return Object.freeze(horizons.sort((left, right) => left.date.localeCompare(right.date) || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)))
}

function expiryContext(world: GameWorld, teamId: TeamId, contract: PlayerContract, onDate: GameDate): ContractRosterExpiry {
  const player = world.players[contract.playerId]!
  const rolePromise = Object.values(world.rolePromisesById).find((promise) => promise.playerId === player.id
    && promise.teamOrganizationId === world.teams[teamId]!.organizationId
    && (promise.status === 'ACTIVE' || promise.status === 'BROKEN'))
  const lineup = world.lineupsByTeamId[teamId]
  const started = lineup !== undefined && Object.values(lineup.starters).includes(player.id)
  const rotation = started || lineup?.bench.B1 === player.id || lineup?.bench.B2 === player.id || lineup?.bench.B3 === player.id
    || Object.values(world.rotationPlansByTeamId[teamId]?.minutesByPeriod?.[player.id] ?? []).some((minutes) => minutes > 0)
  return Object.freeze({
    contractId: contract.id,
    playerId: player.id,
    expiresOn: contract.term.expiresOn,
    annualSalaryAtExpiry: getContractYearCompensation(contract, addDays(contract.term.expiresOn, -1)).cashSalary,
    position: player.basketball.primaryPosition,
    ...(player.bio.dateOfBirth === undefined ? {} : { age: calculateAge(player.bio.dateOfBirth, onDate) }),
    developmentStage: player.development.developmentStage,
    currentRole: started ? 'STARTER' : rotation ? 'ROTATION' : 'ROSTERED',
    ...(rolePromise === undefined ? {} : { rolePromiseStatus: rolePromise.status }),
  })
}

function playerPayrollForSeason(world: GameWorld, organizationId: string, teamId: TeamId, seasonId: SeasonId): { readonly guaranteed: readonly ContractPayrollTotal[]; readonly conditional: readonly ContractPayrollTotal[] } | undefined {
  try {
    const entries = getContractFinancialSchedule(world, { organizationId, teamId, includeConditional: true }).filter((entry) => entry.seasonId === seasonId && entry.category === 'PLAYER_SALARY')
    return Object.freeze({ guaranteed: totalPayroll(entries.filter((entry) => entry.compensationStatus === 'GUARANTEED')), conditional: totalPayroll(entries.filter((entry) => entry.compensationStatus === 'CONDITIONAL')) })
  } catch {
    return undefined
  }
}

function totalPayroll(entries: ReturnType<typeof getContractFinancialSchedule>): readonly ContractPayrollTotal[] {
  const totals = new Map<string, number>()
  for (const entry of entries) totals.set(entry.amount.currencyCode, (totals.get(entry.amount.currencyCode) ?? 0) + entry.amount.minorUnits)
  return Object.freeze([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, minorUnits]) => Object.freeze({ currencyCode: currencyCode as ContractPayrollTotal['currencyCode'], minorUnits })))
}
