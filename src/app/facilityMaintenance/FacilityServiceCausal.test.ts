import { describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getUserTeam } from '@/engine/calendar'
import { executeFacilityMaintenanceUiCommand, type FacilityMaintenanceUiCommand } from './FacilityMaintenanceUiCommands'
import { cancelFacilityMaintenanceOperation, openFacilityMaintenanceProposal } from './FacilityMaintenanceCommands'
import { processFacilityServices } from './FacilityServiceCommands'
import { buildFacilityServiceOperationView, buildFacilityServiceRows } from './FacilityServiceReadModel'

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })

function advance(world: GameWorld, days: number): GameWorld {
  let current = world
  for (let i = 0; i < days; i += 1) current = advanceDayWithTrace(current).world
  return current
}

describe('BS17E-C causal rules of recurring services', () => {
  const start = () => {
    let world = createConfiguredGame({ universeId: 'prototype' })
    const team = getUserTeam(world)!
    const act = (command: FacilityMaintenanceUiCommand, expected: 'APPLIED' | 'BLOCKED' = 'APPLIED') => {
      const result = executeFacilityMaintenanceUiCommand(world, team.id, command)
      expect(result.status, JSON.stringify([command.kind, result.reasons, result.canonicalReasons])).toBe(expected)
      if (expected === 'APPLIED') world = result.world
      return result
    }
    return { team, act, get world() { return world }, set world(next: GameWorld) { world = next } }
  }

  it('has no recurring effect before signature, cancels cleanly, and is isolated from the maintenance commands', () => {
    const ctx = start()
    const facilityId = buildFacilityServiceRows(ctx.world, ctx.team.id)[0]!.option.facilityId
    const operationId = ctx.act({ kind: 'SERVICE_OPEN', facilityId }).operationId!
    // The same facility cannot hold two open proposals.
    expect(ctx.act({ kind: 'SERVICE_OPEN', facilityId }, 'BLOCKED').reasons).toEqual(['OPERATION_ALREADY_ACTIVE'])
    // Maintenance commands treat a service operation as not theirs.
    expect(cancelFacilityMaintenanceOperation(ctx.world, { teamId: ctx.team.id, operationId }).reasons).toEqual(['OPERATION_NOT_FOUND'])
    expect(executeFacilityMaintenanceUiCommand(ctx.world, ctx.team.id, { kind: 'REQUEST_OFFERS', operationId }).reasons).toEqual(['OPERATION_NOT_FOUND'])
    expect(openFacilityMaintenanceProposal).toBeTypeOf('function')
    // Unsigned: signing without a decision is refused and nothing is billed on any day.
    expect(ctx.act({ kind: 'SERVICE_SIGN', operationId }, 'BLOCKED').reasons).toEqual(['COST_UNKNOWN'])
    ctx.world = advance(ctx.world, 40)
    expect(Object.keys(ctx.world.operatingCostFactsById).filter((id) => id.includes('facility-service'))).toHaveLength(0)
    ctx.act({ kind: 'SERVICE_TERMINATE', operationId })
    const view = buildFacilityServiceOperationView(ctx.world, ctx.team.id, operationId)
    expect(view).toMatchObject({ stage: 'CANCELLED', periods: { processed: 0, skipped: 0 } })
    expect(buildFacilityServiceRows(ctx.world, ctx.team.id)[0]!.option.eligible).toBe(true)
  })

  it('processes a period exactly once however often the processor runs on the same day', () => {
    const ctx = start()
    const facilityId = buildFacilityServiceRows(ctx.world, ctx.team.id)[0]!.option.facilityId
    const operationId = ctx.act({ kind: 'SERVICE_OPEN', facilityId }).operationId!
    ctx.act({ kind: 'SERVICE_REQUEST_OFFERS', operationId })
    const offer = buildFacilityServiceOperationView(ctx.world, ctx.team.id, operationId)!.offers[0]!
    ctx.act({ kind: 'SERVICE_SELECT_OFFER', operationId, offerId: offer.offerId })
    ctx.act({ kind: 'SERVICE_REQUEST_APPROVAL', operationId })
    ctx.world = advance(ctx.world, 1)
    ctx.act({ kind: 'SERVICE_SIGN', operationId })
    const once = processFacilityServices(ctx.world)
    const twice = processFacilityServices(once)
    expect(buildFacilityServiceOperationView(twice, ctx.team.id, operationId)!.periods.processed).toBe(1)
    expect(Object.keys(twice.operatingCostFactsById).filter((id) => id.includes('facility-service'))).toHaveLength(1)
    expect(twice).toBe(once)
    // Signing again changes nothing.
    expect(executeFacilityMaintenanceUiCommand(twice, ctx.team.id, { kind: 'SERVICE_SIGN', operationId }).status).toBe('NO_CHANGE')
  })
})
