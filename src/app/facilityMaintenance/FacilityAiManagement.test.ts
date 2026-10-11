import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { deriveFacilityOperationLifecycle, facilityEconomyRecordsOfKind, facilityOperationEvents, facilityOperationIds } from '@/domain/facilityEconomy'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getUserTeam } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { aiPlanningDay } from './FacilityAiManagement'

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })
const SAVED_AT = '2033-03-01T00:00:00.000Z'

function advance(world: GameWorld, days: number): GameWorld {
  let current = world
  for (let i = 0; i < days; i += 1) current = advanceDayWithTrace(current).world
  return current
}

describe('BS17F: AI clubs manage their facilities with the same commands and rights as the user', () => {
  let start: GameWorld
  let straight: GameWorld
  let viaSave: GameWorld
  beforeAll(() => {
    start = createConfiguredGame({ universeId: 'prototype' })
    straight = advance(start, 50)
    const half = advance(start, 30)
    viaSave = advance(deserializeGameWorldV4(serializeGameWorldV4(half, SAVED_AT)), 20)
  })

  it('acts only for AI clubs, through the simulated manager, once per club per month', () => {
    const userOrganization = String(getUserTeam(start)!.organizationId)
    const perOrganizationMonth = new Map<string, number>()
    for (const operationId of facilityOperationIds(straight)) {
      const events = facilityOperationEvents(straight, operationId)
      const first = events[0]!
      expect(first.kind).toBe('PROPOSAL_CREATED')
      expect(first.organizationId).not.toBe(userOrganization)
      expect(first.actor).toMatchObject({ kind: 'EXTERNAL' })
      const key = `${first.organizationId}:${String(first.effectiveOn).slice(0, 7)}`
      perOrganizationMonth.set(key, (perOrganizationMonth.get(key) ?? 0) + 1)
      // The proposal day is the club's deterministic planning day.
      expect(Number(String(first.effectiveOn).slice(8, 10))).toBe(aiPlanningDay(first.organizationId!))
      // Each fact happens at most once per operation.
      for (const kind of ['PROPOSAL_CREATED', 'APPROVAL_REQUESTED', 'CONTRACT_ACCEPTED', 'WORK_COMPLETED'] as const) expect(events.filter((event) => event.kind === kind).length).toBeLessThanOrEqual(1)
      const periods = events.filter((event) => event.kind === 'SERVICE_PERIOD_PROCESSED' || event.kind === 'SERVICE_PERIOD_SKIPPED').map((event) => event.reasonCode)
      expect(new Set(periods).size).toBe(periods.length)
      expect(deriveFacilityOperationLifecycle(events)).not.toBeNull()
    }
    expect(perOrganizationMonth.size).toBeGreaterThan(10)
    expect(Math.max(...perOrganizationMonth.values())).toBe(1)
  })

  it('spends only through approved decisions, contracts and Finance facts', () => {
    for (const operationId of facilityOperationIds(straight)) {
      const lifecycle = deriveFacilityOperationLifecycle(facilityOperationEvents(straight, operationId))!
      if (lifecycle.stage === 'CONTRACTED' || lifecycle.stage === 'WORK_IN_PROGRESS' || lifecycle.stage === 'WORK_COMPLETED') {
        expect(lifecycle.decisionId, operationId).not.toBeNull()
        const events = Object.values(straight.governanceDecisionEventsById).filter((event) => event.decisionId === lifecycle.decisionId)
        expect(events.some((event) => event.kind === 'APPROVED'), operationId).toBe(true)
        expect(events.every((event) => event.authorityGrantIds.length > 0), operationId).toBe(true)
      }
    }
    const costFacts = Object.values(straight.operatingCostFactsById).filter((fact) => fact.authority === 'FACILITY')
    expect(costFacts.length).toBeGreaterThan(0)
    expect(new Set(costFacts.map((fact) => fact.id)).size).toBe(costFacts.length)
  })

  it('serves the most severe need first when it opens a need-based proposal', () => {
    const rank: Record<string, number> = { CRITICAL: 4, MAJOR: 3, MODERATE: 2, MINOR: 1 }
    let checked = 0
    for (const operationId of facilityOperationIds(straight)) {
      const first = facilityOperationEvents(straight, operationId)[0]!
      if (first.needId === null) continue
      const chosen = start.facilityMaintenanceNeedsById[first.needId as never]
      if (chosen === undefined) continue
      const rivals = Object.values(start.facilityMaintenanceNeedsById).filter((need) => need.facilityId === chosen.facilityId)
      // No need of the same facility that was strictly more severe was left waiting while a lesser one was served first.
      const firstMonth = facilityOperationIds(straight).filter((id) => facilityOperationEvents(straight, id)[0]!.organizationId === first.organizationId)
      if (firstMonth[0] === operationId) { expect(rank[chosen.severity]).toBeGreaterThanOrEqual(Math.max(...rivals.map((need) => rank[need.severity] ?? 0))); checked += 1 }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('is deterministic and unchanged by Save/reload', () => {
    expect(JSON.stringify(facilityEconomyRecordsOfKind(viaSave, 'OPERATION_EVENT'))).toBe(JSON.stringify(facilityEconomyRecordsOfKind(straight, 'OPERATION_EVENT')))
    expect(Object.keys(viaSave.operatingCostFactsById).sort()).toEqual(Object.keys(straight.operatingCostFactsById).sort())
  })
})
