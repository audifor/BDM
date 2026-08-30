import { trainingDefinitionById, type TrainingScope } from './TrainingCatalog'
import type { TrainingIntensity } from './Training'

/** A user-created module composes a built-in catalog definition with a bounded intensity/scope override.
 * It does not author arbitrary numeric effects — the effect profile is always inherited from the base definition. */
export interface UserTrainingModule {
  readonly id: string
  readonly name: string
  readonly baseDefinitionId: string
  readonly scope: TrainingScope
  readonly intensity: TrainingIntensity
}

export function createUserTrainingModule(input: UserTrainingModule): UserTrainingModule {
  if (!input.id.trim()) throw new RangeError('User training module id is required')
  if (!input.name.trim()) throw new RangeError('User training module name is required')
  const base = trainingDefinitionById(input.baseDefinitionId)
  if (!['light', 'normal', 'high'].includes(input.intensity)) throw new RangeError('Invalid user training module intensity')
  if (input.scope === 'individual' && base.scope === 'team') throw new RangeError('Cannot scope a team-only definition to individual training')
  if (input.scope === 'team' && base.scope === 'individual') throw new RangeError('Cannot scope an individual-only definition to team training')
  return { ...input }
}
