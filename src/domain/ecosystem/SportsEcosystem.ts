import type { EcosystemId } from '@/domain/ids'
import { ecosystemIdFromString } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

export interface SportsEcosystem { readonly id: EcosystemId; readonly name: string; readonly kind: 'fibaLike' }
export function createSportsEcosystem(input: SportsEcosystem): SportsEcosystem { if (input.kind !== 'fibaLike') throw new RangeError('Sports ecosystem kind is unsupported'); return Object.freeze({ id: ecosystemIdFromString(requireNonEmptyString(input.id, 'Sports ecosystem id')), name: requireNonEmptyString(input.name, 'Sports ecosystem name'), kind: input.kind }) }
export const DEFAULT_FIBA_LIKE_ECOSYSTEM_ID = ecosystemIdFromString('generated-ecosystem-0001')
