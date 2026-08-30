/**
 * A user-authored play saved from the Tactics Designer, and a playbook grouping such plays.
 *
 * `frames` is an opaque, UI-authored payload (player token positions, drawn action paths) —
 * the domain does not interpret or simulate play content, it only owns identity/persistence so
 * a saved play is scoped to the actual GameWorld/save/career it was created in, rather than a
 * global cross-career store (Issue #9 review).
 */
export interface SavedPlay {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly frames: unknown
}

export interface Playbook {
  readonly id: string
  readonly name: string
  readonly playIds: readonly string[]
}

export function createSavedPlay(input: SavedPlay): SavedPlay {
  if (!input.id.trim()) throw new RangeError('Saved play id is required')
  if (!input.name.trim()) throw new RangeError('Saved play name is required')
  return { id: input.id, name: input.name, createdAt: input.createdAt, frames: input.frames }
}

export function createPlaybook(input: Playbook): Playbook {
  if (!input.id.trim()) throw new RangeError('Playbook id is required')
  if (!input.name.trim()) throw new RangeError('Playbook name is required')
  if (new Set(input.playIds).size !== input.playIds.length) throw new RangeError('Playbook cannot reference the same play twice')
  return { id: input.id, name: input.name, playIds: [...input.playIds] }
}
