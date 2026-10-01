import { parseGameDate, type GameDate } from '@/domain/date'
import type { EcosystemId, PlayerId, SeasonId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

export interface ContractServiceTimeBaseline {
  readonly id: string
  readonly playerId: PlayerId
  readonly jurisdictionId: EcosystemId
  readonly seasons: number
  readonly effectiveOn: GameDate
  readonly source: 'WORLD_GENERATION' | 'IMPORTED'
}

export interface ContractServiceTimeCredit {
  readonly id: string
  readonly playerId: PlayerId
  readonly jurisdictionId: EcosystemId
  readonly serviceYear: number
  readonly seasonId: SeasonId
  readonly competitionId: string
  readonly creditedOn: GameDate
  readonly qualifyingGameIds: readonly string[]
}

export function createContractServiceTimeBaseline(input: ContractServiceTimeBaseline): ContractServiceTimeBaseline {
  if (!Number.isSafeInteger(input.seasons) || input.seasons < 0 || input.seasons > 80) throw new RangeError('Contract service-time baseline must be between zero and 80 seasons')
  if (input.source !== 'WORLD_GENERATION' && input.source !== 'IMPORTED') throw new TypeError('Contract service-time baseline source is invalid')
  return Object.freeze({ ...input, id: requireNonEmptyString(input.id, 'Service-time baseline id'), effectiveOn: parseGameDate(input.effectiveOn), playerId: requireNonEmptyString(input.playerId, 'Service-time player id') as PlayerId, jurisdictionId: requireNonEmptyString(input.jurisdictionId, 'Service-time jurisdiction id') as EcosystemId })
}

export function createContractServiceTimeCredit(input: ContractServiceTimeCredit): ContractServiceTimeCredit {
  if (!Number.isSafeInteger(input.serviceYear) || input.serviceYear < 0 || input.serviceYear > 9999) throw new RangeError('Contract service year is invalid')
  if (input.qualifyingGameIds.length === 0 || new Set(input.qualifyingGameIds).size !== input.qualifyingGameIds.length || input.qualifyingGameIds.some((id) => !id)) throw new TypeError('Service-time credit requires unique qualifying game evidence')
  return Object.freeze({ ...input, id: requireNonEmptyString(input.id, 'Service-time credit id'), playerId: requireNonEmptyString(input.playerId, 'Service-time player id') as PlayerId, jurisdictionId: requireNonEmptyString(input.jurisdictionId, 'Service-time jurisdiction id') as EcosystemId, seasonId: requireNonEmptyString(input.seasonId, 'Service-time season id') as SeasonId, competitionId: requireNonEmptyString(input.competitionId, 'Service-time competition id'), creditedOn: parseGameDate(input.creditedOn), qualifyingGameIds: Object.freeze([...input.qualifyingGameIds].sort()) })
}
