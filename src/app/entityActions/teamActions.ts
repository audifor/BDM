import { actionDisabled, type ActionAvailability, type EntityActionEnvironment } from './ActionAvailability'
import { actionIdFromString, defineAction, type ActionCapabilityStatus, type ActionDefinition } from './ActionDefinition'
import { createEntityActionHandoff } from './EntityCommand'

export type TeamActionRoot = 'assess' | 'manage' | 'arrange' | 'delegate' | 'compare' | 'contact' | 'follow' | 'scout'

function availability(root: TeamActionRoot, capabilityStatus: ActionCapabilityStatus) {
  return (entity: Parameters<ActionDefinition<'team'>['availability']>[0], environment: EntityActionEnvironment): ActionAvailability => {
    if (environment.world.teams[entity.id] === undefined) return actionDisabled('Team does not exist')
    return actionDisabled(`${root[0]!.toUpperCase()}${root.slice(1)} is not available yet (${capabilityStatus})`)
  }
}

function action(root: TeamActionRoot, order: number, semanticGroup: string, iconKey: string, capabilityStatus: ActionCapabilityStatus): ActionDefinition<'team'> {
  return defineAction({
    id: actionIdFromString(`team.${root}`), entityType: 'team', labelKey: `entityActions.team.${root}`,
    descriptionKey: `entityActions.team.${root}.description`, semanticGroup, iconKey, capabilityStatus, order,
    availability: availability(root, capabilityStatus), resultKind: 'handoff',
    buildResult: ({ entity }) => createEntityActionHandoff({ target: `team.${root}`, entity }),
  })
}

/** Team exposes real roster, schedule and training data, but no generic team-intent executor exists. */
export const TEAM_ACTIONS: readonly ActionDefinition<'team'>[] = [
  action('assess', 10, 'evaluation', 'assessment', 'DOMAIN_MISSING'),
  action('manage', 20, 'management', 'management', 'FUTURE_SYSTEM'),
  action('arrange', 30, 'operations', 'arrangement', 'FUTURE_SYSTEM'),
  action('delegate', 40, 'management', 'delegation', 'FUTURE_SYSTEM'),
  action('compare', 50, 'evaluation', 'compare', 'FUTURE_SYSTEM'),
  action('contact', 60, 'interaction', 'contact', 'DOMAIN_MISSING'),
  action('follow', 70, 'organization', 'follow', 'FUTURE_SYSTEM'),
  action('scout', 80, 'scouting', 'scout', 'DOMAIN_MISSING'),
]

export const TEAM_ACTION_CATALOG = { entityType: 'team' as const, actions: TEAM_ACTIONS, quickActionIds: ['team.assess', 'team.manage', 'team.arrange', 'team.delegate'].map(actionIdFromString) }
