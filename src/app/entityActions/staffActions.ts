import { actionDisabled, type ActionAvailability, type EntityActionEnvironment } from './ActionAvailability'
import { actionIdFromString, defineAction, type ActionCapabilityStatus, type ActionDefinition } from './ActionDefinition'
import { createEntityActionHandoff } from './EntityCommand'

export type StaffActionRoot = 'talk' | 'assign' | 'assess' | 'develop' | 'delegate' | 'negotiate' | 'release' | 'compare'

function availability(root: StaffActionRoot, capabilityStatus: ActionCapabilityStatus) {
  return (entity: Parameters<ActionDefinition<'staff'>['availability']>[0], environment: EntityActionEnvironment): ActionAvailability => {
    if (environment.world.staffPeopleById[entity.id] === undefined) return actionDisabled('Staff person does not exist')
    return actionDisabled(`${root[0]!.toUpperCase()}${root.slice(1)} is not available yet (${capabilityStatus})`)
  }
}

function action(root: StaffActionRoot, order: number, semanticGroup: string, iconKey: string, capabilityStatus: ActionCapabilityStatus): ActionDefinition<'staff'> {
  return defineAction({
    id: actionIdFromString(`staff.${root}`), entityType: 'staff', labelKey: `entityActions.staff.${root}`,
    descriptionKey: `entityActions.staff.${root}.description`, semanticGroup, iconKey, capabilityStatus, order,
    availability: availability(root, capabilityStatus), resultKind: 'handoff',
    buildResult: ({ entity }) => createEntityActionHandoff({ target: `staff.${root}`, entity }),
  })
}

/** Staff has assignments and role evaluations, but no mutation API matching these intents yet. */
export const STAFF_ACTIONS: readonly ActionDefinition<'staff'>[] = [
  action('talk', 10, 'interaction', 'conversation', 'FUTURE_SYSTEM'),
  action('assign', 20, 'management', 'assignment', 'DOMAIN_MISSING'),
  action('assess', 30, 'evaluation', 'assessment', 'DOMAIN_MISSING'),
  action('develop', 40, 'management', 'development', 'FUTURE_SYSTEM'),
  action('delegate', 50, 'management', 'delegation', 'FUTURE_SYSTEM'),
  action('negotiate', 60, 'contract', 'negotiation', 'DOMAIN_MISSING'),
  action('release', 70, 'contract', 'release', 'DOMAIN_MISSING'),
  action('compare', 80, 'evaluation', 'compare', 'FUTURE_SYSTEM'),
]

export const STAFF_ACTION_CATALOG = { entityType: 'staff' as const, actions: STAFF_ACTIONS, quickActionIds: ['staff.talk', 'staff.assign', 'staff.assess', 'staff.develop'].map(actionIdFromString) }
