/*
 * BS ALL FINAL INTEGRATION — equivalence of the indexed physical and Facilities-economy reads.
 *
 * The integration replaced repeated full scans (per component, per operation) with per-world lookup tables. These tests compare
 * every indexed answer with the original full-scan formulation on a live world that has AI maintenance, capital projects,
 * conservation services and Save/reload history.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import { componentConditionAt, resolveFacilityStatusAt, usableComponentsForTeamAt } from '@/domain/facilities'
import { facilityEconomyRecordsOfKind, facilityOperationEvents, facilityOperationIds } from '@/domain/facilityEconomy'
import type { FacilityComponentId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { componentPhysicalAvailabilityAt, componentWorkProjectsAt } from './FacilityPhysicalOperations'

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })

/** The pre-index formulation, kept verbatim as the reference. */
function referenceAvailability(world: GameWorld, componentId: FacilityComponentId, onDate: GameDate, teamId?: TeamId) {
  const component = world.facilityComponentsById[componentId]!
  const facility = world.facilitiesById[component.facilityId]!
  const condition = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), componentId, onDate)
  const work = componentWorkProjectsAt(world, componentId, onDate)
  const maintenance = Object.values(world.facilityMaintenanceActionsById).filter((action) => action.componentId === componentId && compareGameDates(action.startedAt, onDate) <= 0 && (action.completedAt === null || compareGameDates(action.completedAt, onDate) > 0))
  const facilityStatus = resolveFacilityStatusAt(Object.values(world.facilityStatusRecordsById), facility.id, onDate, facility.status)
  const access = teamId === undefined ? null : usableComponentsForTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), teamId, onDate).includes(componentId)
  const closed = component.status === 'PLANNED' || component.openedAt !== null && component.openedAt > onDate || component.closedAt !== null && component.closedAt <= onDate || ['TEMPORARILY_CLOSED', 'DECOMMISSIONED', 'DEMOLISHED', 'UNDER_CONSTRUCTION', 'PLANNED'].includes(facilityStatus)
  const status = closed || work.length > 0 || maintenance.length > 0 || condition?.serviceability === 'OUT_OF_SERVICE' ? 'OUT_OF_SERVICE' : condition !== undefined && condition.serviceability !== 'FULL' ? 'LIMITED' : condition === undefined || condition.physicalCondition === null || facilityStatus === 'UNKNOWN' ? 'UNKNOWN' : 'AVAILABLE'
  const specification = component.specification
  return {
    status, access, affectedProjectIds: work.map((p) => p.id), affectedMaintenanceActionIds: maintenance.map((action) => String(action.id)),
    nominalCapacity: specification?.kind === 'CAPACITY' ? specification.amount : component.capacity, capacityUnit: specification?.kind === 'CAPACITY' ? specification.unit : null, operationalCapacity: null,
  }
}

describe('indexed physical availability and operation reads are equivalent to full scans', () => {
  let worlds: GameWorld[]
  beforeAll(() => {
    let world = createConfiguredGame({ universeId: 'prototype' })
    worlds = [world]
    for (let day = 1; day <= 45; day += 1) {
      world = advanceDayWithTrace(world).world
      if (day % 15 === 0) worlds.push(world)
    }
    worlds.push(deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2033-03-01T00:00:00.000Z')))))
  })

  it('answers componentPhysicalAvailabilityAt exactly like the full-scan reference for every component, team and nearby date', () => {
    let compared = 0
    let occupied = 0
    for (const world of worlds) {
      const teams = [undefined, ...Object.keys(world.teams).sort().slice(0, 6)] as (TeamId | undefined)[]
      for (const offset of [-10, 0, 7, 40]) {
        const date = addDays(world.currentDate, offset) as GameDate
        for (const componentId of Object.keys(world.facilityComponentsById).sort() as FacilityComponentId[]) {
          for (const teamId of teams) {
            const indexed = componentPhysicalAvailabilityAt(world, componentId, date, teamId)
            expect(indexed, `${componentId} ${teamId} ${date}`).toEqual(referenceAvailability(world, componentId, date, teamId))
            if (indexed.status === 'OUT_OF_SERVICE') occupied += 1
            compared += 1
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(10_000)
    expect(occupied).toBeGreaterThan(0)
  })

  it('answers the Facilities economy reads exactly like full scans', () => {
    for (const world of worlds) {
      const all = Object.values(world.facilityEconomyRecordsById)
      for (const kind of ['COST_CATALOG_ENTRY', 'PROVIDER', 'OFFER', 'CAPITAL_OFFER', 'SERVICE_OFFER', 'OPERATION_EVENT'] as const) expect(facilityEconomyRecordsOfKind(world, kind)).toEqual(all.filter((record) => record.recordKind === kind))
      const events = all.filter((record) => record.recordKind === 'OPERATION_EVENT')
      const ids = [...new Set(events.map((event) => event.operationId))].sort()
      expect(facilityOperationIds(world)).toEqual(ids)
      for (const id of ids) expect(facilityOperationEvents(world, id)).toEqual(events.filter((event) => event.operationId === id).sort((a, b) => a.sequence - b.sequence))
      expect(facilityOperationEvents(world, 'no-such-operation')).toEqual([])
    }
    expect(facilityOperationIds(worlds.at(-1)!).length).toBeGreaterThan(10)
  })
})
