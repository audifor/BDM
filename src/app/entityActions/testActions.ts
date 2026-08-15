import { actionDisabled, actionEnabled, type EntityActionEnvironment } from './ActionAvailability'
import { actionIdFromString, defineAction, type ActionDefinition } from './ActionDefinition'
import { defineComposer } from './ComposerDefinition'

/** Temporary contracts proving registry extensibility; they are not the Player catalog. */
export const PLAYER_TEST_ACTIONS: readonly ActionDefinition<'player'>[] = [
  defineAction({
    id: actionIdFromString('player.test.inspect'),
    entityType: 'player',
    labelKey: 'entityActions.player.test.inspect',
    descriptionKey: 'entityActions.player.test.inspect.description',
    order: 10,
    availability: (entity, environment) => environment.world.players[entity.id] === undefined ? actionDisabled('Player does not exist') : actionEnabled(),
    resultKind: 'handoff',
  }),
  defineAction({
    id: actionIdFromString('player.test.release'),
    entityType: 'player',
    labelKey: 'entityActions.player.test.release',
    order: 20,
    availability: (entity, environment) => {
      if (environment.world.players[entity.id] === undefined) return actionDisabled('Player does not exist')
      if (environment.controlledTeamId === undefined) return actionDisabled('No controlled team')
      return environment.world.teams[environment.controlledTeamId]?.rosterPlayerIds.includes(entity.id)
        ? actionEnabled()
        : actionDisabled('Player is not on the controlled team')
    },
    composer: defineComposer({ steps: [{ id: 'confirm', kind: 'confirm', labelKey: 'entityActions.confirm' }] }),
    resultKind: 'command',
  }),
]

export const TEAM_TEST_ACTIONS: readonly ActionDefinition<'team'>[] = [
  defineAction({
    id: actionIdFromString('team.test.inspect'),
    entityType: 'team',
    labelKey: 'entityActions.team.test.inspect',
    order: 10,
    availability: (entity, environment: EntityActionEnvironment) => environment.world.teams[entity.id] === undefined ? actionDisabled('Team does not exist') : actionEnabled(),
    resultKind: 'handoff',
  }),
]
