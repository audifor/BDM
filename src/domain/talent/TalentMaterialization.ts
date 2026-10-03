import { parseGameDate, type GameDate } from '@/domain/date'
import { playerIdFromString, placeIdFromString, type PlayerId, type PlaceId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'
import { talentCohortIdFromString, type TalentCohortId } from './TalentCohort'

export const TALENT_MATERIALIZATION_CAUSES = ['SCOUTING_DISCOVERY', 'RECRUITING_POOL'] as const
export type TalentMaterializationCause = (typeof TALENT_MATERIALIZATION_CAUSES)[number]

/** Durable origin and idempotency record; it is not current roster/pathway membership. */
export interface TalentMaterialization {
  readonly candidateKey: string
  readonly cohortId: TalentCohortId
  readonly candidateIndex: number
  readonly playerId: PlayerId
  readonly placeId: PlaceId
  readonly generationYear: number
  readonly generatorVersion: string
  readonly materializationCause: TalentMaterializationCause
  readonly materializedOn: GameDate
}

export type CreateTalentMaterializationInput = TalentMaterialization

export function talentCandidateKey(cohortId: TalentCohortId | string, candidateIndex: number): string {
  if (!Number.isSafeInteger(candidateIndex) || candidateIndex < 1) throw new RangeError('Talent candidate index must be a positive integer')
  return `${talentCohortIdFromString(cohortId)}:candidate:${candidateIndex.toString().padStart(6, '0')}`
}

export function createTalentMaterialization(input: CreateTalentMaterializationInput): TalentMaterialization {
  if (!Number.isSafeInteger(input.candidateIndex) || input.candidateIndex < 1) throw new RangeError('Talent candidate index must be a positive integer')
  if (!TALENT_MATERIALIZATION_CAUSES.includes(input.materializationCause)) throw new TypeError('Talent materialization cause is invalid')
  const candidateKey = requireNonEmptyString(input.candidateKey, 'Talent candidate key')
  if (candidateKey !== talentCandidateKey(input.cohortId, input.candidateIndex)) throw new RangeError('Talent candidate key does not match its cohort and index')
  if (!Number.isSafeInteger(input.generationYear) || input.generationYear < 1800 || input.generationYear > 9999) throw new RangeError('Talent generation year is invalid')
  return Object.freeze({
    ...input,
    cohortId: talentCohortIdFromString(input.cohortId),
    playerId: playerIdFromString(input.playerId),
    placeId: placeIdFromString(input.placeId),
    generatorVersion: requireNonEmptyString(input.generatorVersion, 'Talent generator version'),
    materializedOn: parseGameDate(input.materializedOn),
  })
}
