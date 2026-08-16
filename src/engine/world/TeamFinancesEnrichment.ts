import type { PlayerContract } from '@/domain/contract'
import type { GameDate } from '@/domain/date'
import type { TeamFinances } from '@/domain/finance'
import type { Team } from '@/domain/team'
import { getContractYearCompensation, getPlayerContractStatus } from '@/domain/contract'

import { generateInitialTeamFinances } from './TeamFinancesGenerator'

export interface TeamFinancesEnrichmentInput {
  readonly currentDate: GameDate
  readonly teams: readonly Team[]
  readonly contracts: readonly PlayerContract[]
  readonly teamFinances: readonly TeamFinances[]
}

/** Completes legacy or partial saved finance data without changing persisted profiles. */
export function ensureTeamFinances(input: TeamFinancesEnrichmentInput): readonly TeamFinances[] {
  const financeByTeamId = new Map(input.teamFinances.map((finance) => [finance.teamId, finance]))
  const missing = input.teams
    .filter((team) => !financeByTeamId.has(team.id))
    .map((team) => generateInitialTeamFinances(team.id, activePayroll(input.contracts, team.id, input.currentDate)))

  return missing.length === 0 ? input.teamFinances : [...input.teamFinances, ...missing]
}

function activePayroll(contracts: readonly PlayerContract[], teamId: Team['id'], onDate: GameDate): number {
  return contracts
    .filter((contract) => contract.teamId === teamId && getPlayerContractStatus(contract, onDate) === 'active')
    .reduce((total, contract) => total + getContractYearCompensation(contract, onDate).capHit, 0)
}
