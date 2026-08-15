import { releasePlayer } from '@/app/market'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { MatchSimulation } from '@/engine/match'

import type { CommandResult } from './EntityCommand'

export type EntityActionExecution =
  | { readonly kind: 'executed'; readonly world: GameWorld }
  | { readonly kind: 'sessionUpdated'; readonly simulation: MatchSimulation }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'noExecutor' }
  | { readonly kind: 'handoffProduced' }

/** Application boundary: only explicitly wired commands may mutate a GameWorld. */
export interface EntityActionExecutionContext {
  readonly controlledTeamId?: TeamId
  readonly activeMatchSession?: { applySubstitution(teamId: TeamId, playerOutId: PlayerId, playerInId: PlayerId): MatchSimulation }
}
type EntityCommandExecutor = (world: GameWorld, result: Extract<CommandResult, { readonly kind: 'command' }>, context: EntityActionExecutionContext) => EntityActionExecution

export class EntityActionExecutorRegistry {
  private readonly executors = new Map<string, EntityCommandExecutor>()
  public register(type: string, executor: EntityCommandExecutor): this { if (this.executors.has(type)) throw new Error(`Executor already registered: ${type}`); this.executors.set(type, executor); return this }
  public execute(world: GameWorld, result: CommandResult, context: EntityActionExecutionContext): EntityActionExecution { if (result.kind === 'handoff') return { kind: 'handoffProduced' }; return this.executors.get(result.type)?.(world, result, context) ?? { kind: 'noExecutor' } }
}

const releaseExecutor: EntityCommandExecutor = (world, result, context) => {
  if (result.entity.type !== 'player' || context.controlledTeamId === undefined) return { kind: 'noExecutor' }
  try { return { kind: 'executed', world: releasePlayer(world, context.controlledTeamId, result.entity.id as PlayerId) } } catch (error) { return { kind: 'rejected', reason: error instanceof Error ? error.message : 'Action was rejected' } }
}
const substituteExecutor: EntityCommandExecutor = (_world, result, context) => {
  if (result.entity.type !== 'player' || context.controlledTeamId === undefined || context.activeMatchSession === undefined) return { kind: 'noExecutor' }
  const payload = result.payload !== null && typeof result.payload === 'object' && !Array.isArray(result.payload) ? result.payload as Readonly<Record<string, unknown>> : undefined
  const playerInId = payload?.replacement
  if (typeof playerInId !== 'string') return { kind: 'rejected', reason: 'A replacement player is required' }
  try { return { kind: 'sessionUpdated', simulation: context.activeMatchSession.applySubstitution(context.controlledTeamId, result.entity.id as PlayerId, playerInId as PlayerId) } } catch (error) { return { kind: 'rejected', reason: error instanceof Error ? error.message : 'Substitution was rejected' } }
}

export const productionEntityActionExecutorRegistry = new EntityActionExecutorRegistry().register('player.release', releaseExecutor).register('player.substitute', substituteExecutor)
export function executeEntityActionResult(world: GameWorld, result: CommandResult, context: EntityActionExecutionContext): EntityActionExecution {
  return productionEntityActionExecutorRegistry.execute(world, result, context)
}
