import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createPlaybook, createSavedPlay, type Playbook, type SavedPlay } from '@/domain/tactics'

/** Saves or updates a Designer play, canonically scoped to this GameWorld/save/career. */
export function saveDesignerPlay(world: GameWorld, play: SavedPlay): GameWorld {
  const validated = createSavedPlay(play)
  return updateGameWorld(world, { savedPlaysById: { ...world.savedPlaysById, [validated.id]: validated } })
}

/** Deletes a play and removes it from every playbook that referenced it. */
export function deleteDesignerPlay(world: GameWorld, playId: string): GameWorld {
  const plays = { ...world.savedPlaysById }
  delete plays[playId]
  const playbooks = Object.fromEntries(Object.entries(world.playbooksById).map(([id, playbook]) => [id, { ...playbook, playIds: playbook.playIds.filter((entry) => entry !== playId) }]))
  return updateGameWorld(world, { savedPlaysById: plays, playbooksById: playbooks })
}

export function saveDesignerPlaybook(world: GameWorld, playbook: Playbook): GameWorld {
  const validated = createPlaybook(playbook)
  return updateGameWorld(world, { playbooksById: { ...world.playbooksById, [validated.id]: validated } })
}

export function deleteDesignerPlaybook(world: GameWorld, playbookId: string): GameWorld {
  const playbooks = { ...world.playbooksById }
  delete playbooks[playbookId]
  return updateGameWorld(world, { playbooksById: playbooks })
}
