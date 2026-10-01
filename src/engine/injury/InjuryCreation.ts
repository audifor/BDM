import { createInjury, injuryReturnDate, recoveryDaysForSeverity, type InjuryKind, type InjuryRecord, type InjurySeverity, type InjurySource } from '@/domain/injury'
import { injuryIdFromString, type GameId, type PlayerId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

const KINDS: readonly InjuryKind[] = ['ankleSprain', 'hamstringStrain', 'kneeSprain', 'backStrain', 'handInjury', 'shoulderStrain']

export function deterministicInjuryKind(source: InjurySource, sourceId: string, playerId: PlayerId): InjuryKind {
  const key = `${source.toLowerCase()}-injury-v1:${sourceId}:${playerId}`
  return KINDS[new SeededRandomSource(hashStringToSeed(`${key}:kind`)).nextInt(0, KINDS.length - 1)]!
}

/** Shared canonical record construction; context-specific occurrence odds remain with each caller. */
export function createDeterministicInjury(input: {
  readonly playerId: PlayerId
  readonly injuredOn: GameDate
  readonly source: InjurySource
  readonly sourceId: string
  readonly sourceGameId?: GameId
}): InjuryRecord {
  const key = `${input.source.toLowerCase()}-injury-v1:${input.sourceId}:${input.playerId}`
  const kind = deterministicInjuryKind(input.source, input.sourceId, input.playerId)
  const severityRoll = new SeededRandomSource(hashStringToSeed(`${key}:severity`)).nextFloat(0, 1)
  const severity: InjurySeverity = severityRoll < .7 ? 'minor' : severityRoll < .95 ? 'moderate' : 'serious'
  const [min, max] = recoveryDaysForSeverity(severity)
  const days = new SeededRandomSource(hashStringToSeed(`${key}:duration`)).nextInt(min, max)
  return createInjury({
    id: injuryIdFromString(`injury:${input.sourceId}:${input.playerId}`), playerId: input.playerId, kind, severity,
    injuredOn: input.injuredOn, expectedReturnDate: injuryReturnDate(input.injuredOn, days), source: input.source,
    ...(input.source === 'MATCH' ? { sourceGameId: input.sourceGameId! } : { sourceTrainingSessionId: input.sourceId }),
  })
}
