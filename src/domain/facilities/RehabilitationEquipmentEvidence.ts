import { parseGameDate, type GameDate } from '@/domain/date'
/** Recorded compatibility/service evidence; never generated from a room type or capacity. */
export interface RehabilitationEquipmentEvidence {
  readonly sourceRef: string
  readonly equipmentTags: readonly string[]
  readonly validFrom: GameDate
  readonly validTo: GameDate
  readonly functionality: 'FUNCTIONAL' | 'LIMITED_COMPATIBLE' | 'INCOMPATIBLE' | 'OUT_OF_SERVICE' | 'UNKNOWN'
}
export function createRehabilitationEquipmentEvidence(input: RehabilitationEquipmentEvidence): RehabilitationEquipmentEvidence {
  if (!input || typeof input.sourceRef !== 'string' || !input.sourceRef.trim() || !Array.isArray(input.equipmentTags) || input.equipmentTags.length === 0 || input.equipmentTags.some(value => typeof value !== 'string' || !value.trim()) || new Set(input.equipmentTags).size !== input.equipmentTags.length || !['FUNCTIONAL', 'LIMITED_COMPATIBLE', 'INCOMPATIBLE', 'OUT_OF_SERVICE', 'UNKNOWN'].includes(input.functionality)) throw new RangeError('Invalid rehabilitation equipment evidence')
  parseGameDate(input.validFrom); parseGameDate(input.validTo)
  if (input.validTo < input.validFrom) throw new RangeError('Invalid equipment evidence interval')
  return Object.freeze({ ...input, equipmentTags: Object.freeze([...input.equipmentTags]) })
}
