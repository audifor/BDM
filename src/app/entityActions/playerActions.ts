import { actionDisabled, actionEnabled, type ActionAvailability, type EntityActionEnvironment } from './ActionAvailability'
import type { PlayerId } from '@/domain/ids'
import { actionIdFromString, defineAction, type ActionCapabilityStatus, type ActionDefinition } from './ActionDefinition'
import { defineComposer, type ComposerDefinition, type ComposerStepKind } from './ComposerDefinition'
import { createEntityActionHandoff, createEntityCommand } from './EntityCommand'
import { EntityActionRegistry } from './EntityActionRegistry'

export type PlayerActionRoot =
  | 'talk' | 'assign' | 'instruct' | 'substitute' | 'limit' | 'rest' | 'assess' | 'send' | 'recall'
  | 'negotiate' | 'offer' | 'release' | 'trade' | 'scout' | 'follow' | 'compare' | 'delegate'
  | 'tag' | 'note' | 'recruit'

type StepSpec = readonly [id: string, kind: Exclude<ComposerStepKind, 'confirm'>, options: readonly string[]]

const playerExists = (entity: Parameters<ActionDefinition<'player'>['availability']>[0], environment: EntityActionEnvironment): ActionAvailability =>
  environment.world.players[entity.id] === undefined ? actionDisabled('Player does not exist') : actionEnabled()

const controlledPlayer = (entity: Parameters<ActionDefinition<'player'>['availability']>[0], environment: EntityActionEnvironment): ActionAvailability => {
  if (environment.world.players[entity.id] === undefined) return actionDisabled('Player does not exist')
  if (environment.controlledTeamId === undefined) return actionDisabled('No controlled team')
  return environment.world.teams[environment.controlledTeamId]?.rosterPlayerIds.includes(entity.id)
    ? actionEnabled()
    : actionDisabled('Player is not on the controlled team')
}

const liveControlledPlayer = (entity: Parameters<ActionDefinition<'player'>['availability']>[0], environment: EntityActionEnvironment): ActionAvailability => {
  const controlled = controlledPlayer(entity, environment)
  if (controlled.kind === 'disabled') return controlled
  if (environment.activeMatchSession === undefined || environment.controlledTeamId === undefined) return actionDisabled('No active match session')
  return environment.activeMatchSession.replacementCandidates(environment.controlledTeamId, entity.id).length > 0 ? actionEnabled() : actionDisabled('Player cannot be substituted now')
}

function composer(steps: readonly StepSpec[], confirm = false): ComposerDefinition {
  return defineComposer({
    steps: [
      ...steps.map(([id, kind, options]) => ({ id, kind, labelKey: `entityActions.player.${id}`, options: () => options.map((option) => ({ id: option, labelKey: `entityActions.player.option.${option}`, value: option })) })),
      ...(confirm ? [{ id: 'confirm', kind: 'confirm' as const, labelKey: 'entityActions.confirm' }] : []),
    ],
    buildResult: ({ entity, draft }) => createEntityCommand({ type: `player.intent.${draft.selections.length === 0 ? 'direct' : draft.selections[0]!.stepId}`, entity, payload: Object.fromEntries(draft.selections.map((selection) => [selection.stepId, selection.value])) }),
  })
}

function handoffComposer(root: PlayerActionRoot, steps: readonly StepSpec[]): ComposerDefinition {
  return defineComposer({
    steps: steps.map(([id, kind, options]) => ({ id, kind, labelKey: `entityActions.player.${id}`, options: () => options.map((option) => ({ id: option, labelKey: `entityActions.player.option.${option}`, value: option })) })),
    buildResult: ({ entity, draft }) => createEntityActionHandoff({ target: `player.${root}`, entity, data: Object.fromEntries(draft.selections.map((selection) => [selection.stepId, selection.value])) }),
  })
}

function action(root: PlayerActionRoot, order: number, semanticGroup: string, iconKey: string, capabilityStatus: ActionCapabilityStatus, availability = playerExists, definition?: ComposerDefinition, resultKind: 'command' | 'handoff' = 'command'): ActionDefinition<'player'> {
  const buildResult = ({ entity, draft }: Parameters<NonNullable<ComposerDefinition['buildResult']>>[0]) => {
    const payload = Object.fromEntries(draft.selections.map((selection) => [selection.stepId, selection.value]))
    return resultKind === 'command'
      ? createEntityCommand({ type: `player.${root}`, entity, payload })
      : createEntityActionHandoff({ target: `player.${root}`, entity, data: payload })
  }
  return defineAction({
    id: actionIdFromString(`player.${root}`),
    entityType: 'player',
    labelKey: `entityActions.player.${root}`,
    descriptionKey: `entityActions.player.${root}.description`,
    semanticGroup,
    iconKey,
    capabilityStatus,
    order,
    availability: (entity, environment) => capabilityStatus === 'EXECUTABLE_NOW' ? availability(entity, environment) : actionDisabled(`${root[0]!.toUpperCase()}${root.slice(1)} is not available yet`),
    ...(definition === undefined ? { buildResult } : { composer: { ...definition, buildResult } }),
    resultKind,
  })
}

/**
 * Stable Player product vocabulary. Commands are intent contracts only; EAC-06
 * must connect only roots whose capabilityStatus has a real executor.
 */
export const PLAYER_ACTIONS: readonly ActionDefinition<'player'>[] = [
  action('talk', 10, 'interaction', 'conversation', 'DOMAIN_MISSING', playerExists, composer([['message', 'property', ['praise', 'criticise', 'warn', 'promise', 'expectations', 'discipline']]])),
  action('assign', 20, 'management', 'assignment', 'FUTURE_SYSTEM', controlledPlayer, composer([['assignment', 'property', ['squadRole', 'position', 'developmentCoach', 'mentorGroup']], ['value', 'value', ['starter', 'rotation', 'reserve']]], true)),
  action('instruct', 30, 'match', 'tactics', 'FUTURE_SYSTEM', liveControlledPlayer, composer([['instruction', 'property', ['role', 'matchup', 'marking', 'individualCoaching']], ['value', 'value', ['balanced', 'focus', 'restrict']]])),
  action('substitute', 40, 'match', 'substitution', 'EXECUTABLE_NOW', liveControlledPlayer, defineComposer({ steps: [{ id: 'replacement', kind: 'target', labelKey: 'entityActions.player.replacement', options: ({ entity, environment }) => environment.controlledTeamId === undefined || environment.activeMatchSession === undefined ? [] : environment.activeMatchSession.replacementCandidates(environment.controlledTeamId, entity.id as PlayerId).map((id) => ({ id, labelKey: `entityActions.player.replacement.${id}`, value: id })) }, { id: 'confirm', kind: 'confirm', labelKey: 'entityActions.confirm' }] })),
  action('limit', 50, 'management', 'limit', 'FUTURE_SYSTEM', controlledPlayer, composer([['limit', 'property', ['minutes', 'availability']], ['value', 'value', ['15', '20', '25', '30']], ['scope', 'scope', ['nextGame', 'next5Games']]], true)),
  action('rest', 60, 'medical', 'rest', 'FUTURE_SYSTEM', controlledPlayer, composer([['duration', 'scope', ['nextDay', 'nextGame', 'untilCleared']]], true)),
  action('assess', 70, 'medical', 'assessment', 'DOMAIN_MISSING', controlledPlayer, composer([['assessment', 'property', ['medicalEvaluation', 'physicalEvaluation', 'riskClearance']]])),
  action('send', 80, 'management', 'send', 'DOMAIN_MISSING', controlledPlayer, composer([['destination', 'target', []], ['duration', 'scope', ['nextGame', 'nextMonth', 'season']]], true)),
  action('recall', 90, 'management', 'recall', 'DOMAIN_MISSING', controlledPlayer, undefined),
  action('negotiate', 100, 'contract', 'negotiation', 'DOMAIN_MISSING', controlledPlayer, handoffComposer('negotiate', [['subject', 'property', ['renewal', 'newContract', 'option', 'buyout', 'exitAgreement']]]), 'handoff'),
  action('offer', 110, 'market', 'offer', 'DOMAIN_MISSING', playerExists, composer([['subject', 'property', ['contract', 'loan', 'transferTerms']], ['terms', 'value', ['openTerms']]], true)),
  action('release', 120, 'contract', 'release', 'EXECUTABLE_NOW', controlledPlayer, composer([], true)),
  action('trade', 130, 'market', 'trade', 'FUTURE_SYSTEM', playerExists, composer([['partner', 'target', []], ['terms', 'value', ['openTrade']]], true)),
  action('scout', 140, 'scouting', 'scout', 'DOMAIN_MISSING', playerExists, composer([['request', 'property', ['observe', 'report', 'assignScout', 'workout', 'interview']]])),
  action('follow', 150, 'organization', 'follow', 'FUTURE_SYSTEM', playerExists),
  action('compare', 160, 'organization', 'compare', 'FUTURE_SYSTEM', playerExists, handoffComposer('compare', [['otherPlayer', 'target', []]]), 'handoff'),
  action('delegate', 170, 'organization', 'delegate', 'FUTURE_SYSTEM', controlledPlayer, composer([['responsibility', 'property', ['development', 'medical', 'scouting']]])),
  action('tag', 180, 'organization', 'tag', 'FUTURE_SYSTEM', playerExists, composer([['tag', 'value', ['watchlist', 'priority', 'tradeBlock']]])),
  action('note', 190, 'organization', 'note', 'FUTURE_SYSTEM', playerExists, composer([['note', 'value', ['newNote']]])),
  action('recruit', 200, 'recruitment', 'recruit', 'FUTURE_SYSTEM', playerExists, composer([['action', 'property', ['contact', 'interest', 'priority', 'scholarship', 'rights']]])),
]

export const PLAYER_ACTION_CATALOG = { entityType: 'player' as const, actions: PLAYER_ACTIONS, quickActionIds: ['player.talk', 'player.limit', 'player.rest', 'player.negotiate'].map(actionIdFromString) }

/** Production assembly point; callers receive a read-only registry. */
export function createPlayerActionRegistry(): EntityActionRegistry {
  return new EntityActionRegistry([PLAYER_ACTION_CATALOG]).freeze()
}
