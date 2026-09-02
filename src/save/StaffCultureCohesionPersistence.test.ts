import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { progressStaffCultureAndCohesion } from '@/engine/staff/StaffCultureCohesionPipeline'

import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

function progressedWorld() {
  return progressStaffCultureAndCohesion(createNewGame())
}

describe('Staff Culture / Unit Cohesion save persistence', () => {
  it('round-trips both new collections exactly through Save V1', () => {
    const world = progressedWorld()
    expect(Object.keys(world.staffCultureStatesByScopeKey).length).toBeGreaterThan(0)
    expect(Object.keys(world.staffUnitCohesionStatesByUnitKey).length).toBeGreaterThan(0)

    const saved = serializeGameWorldV1(world, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)))
    expect(loaded.staffCultureStatesByScopeKey).toEqual(world.staffCultureStatesByScopeKey)
    expect(loaded.staffUnitCohesionStatesByUnitKey).toEqual(world.staffUnitCohesionStatesByUnitKey)
  })

  it('flows unchanged through Save V3 without a V4 or a schemaVersion bump', async () => {
    const { serializeGameWorldV3, deserializeGameWorldV3 } = await import('./GameWorldSaveV3')
    const world = progressedWorld()
    const saved = serializeGameWorldV3(world, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV3(JSON.parse(JSON.stringify(saved)))
    expect(loaded.staffCultureStatesByScopeKey).toEqual(world.staffCultureStatesByScopeKey)
    expect(loaded.staffUnitCohesionStatesByUnitKey).toEqual(world.staffUnitCohesionStatesByUnitKey)
  })

  it('a legacy pre-5C payload (fields absent) loads without crashing, yielding empty collections', () => {
    const saved = serializeGameWorldV1(progressedWorld(), '2032-10-01T00:00:00.000Z')
    const legacyPayload = { ...saved.payload } as Record<string, unknown>
    delete legacyPayload.staffCultureStates
    delete legacyPayload.staffUnitCohesionStates

    const loaded = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    expect(loaded.staffCultureStatesByScopeKey).toEqual({})
    expect(loaded.staffUnitCohesionStatesByUnitKey).toEqual({})
  })

  it('persists ONLY the two value maps — every derived concept is absent from the serialized JSON', () => {
    const saved = serializeGameWorldV1(progressedWorld(), '2032-10-01T00:00:00.000Z')
    const cultureJson = JSON.stringify(saved.payload.staffCultureStates)
    const cohesionJson = JSON.stringify(saved.payload.staffUnitCohesionStates)

    // Culture Fit, unit membership, leader derivation, overall classifications, trends and UI labels
    // are all derived-on-demand and must NEVER be persisted.
    for (const forbidden of ['cultureFit', 'fitScore', 'fitBand', 'leaderStaffId', 'memberStaffIds', 'department', 'trend', 'band', 'label', 'strengths', 'concerns', 'established', 'preferences']) {
      expect(cultureJson).not.toContain(forbidden)
      expect(cohesionJson).not.toContain(forbidden)
    }

    // What IS persisted is exactly the declared shape and nothing else.
    for (const record of saved.payload.staffCultureStates ?? []) {
      expect(Object.keys(record).sort()).toEqual(['current', 'lastEvaluatedOn', 'scopeKey', 'target'])
    }
    for (const record of saved.payload.staffUnitCohesionStates ?? []) {
      expect(Object.keys(record).sort()).toEqual(['current', 'lastEvaluatedOn', 'target', 'unitKey'])
    }
  })

  it('a malformed persisted record is rejected rather than blindly cast', () => {
    const saved = serializeGameWorldV1(progressedWorld(), '2032-10-01T00:00:00.000Z')
    const brokenPayload = {
      ...saved.payload,
      staffCultureStates: [{ scopeKey: 'team-1', target: {}, current: {}, lastEvaluatedOn: '2030-01-07' }],
    }
    expect(() => deserializeGameWorldV1({ ...saved, payload: brokenPayload })).toThrow()
  })
})
