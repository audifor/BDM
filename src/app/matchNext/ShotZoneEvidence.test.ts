import { describe, expect, it } from 'vitest'
import type { PlayerId } from '@/domain/ids'
import { validateShotZoneBreakdown } from '@/domain/stats/MatchStatLog'
import type { MatchNextEvent } from '@/engine/match-next'
import { observedShotZones, observedShotZonesForBox } from './ShotZoneEvidence'

const shooter = 'player-1' as PlayerId
const defender = 'defender-2' as PlayerId
const event = (sequence: number, type: MatchNextEvent['type'], payload: Partial<MatchNextEvent> = {}): MatchNextEvent =>
  ({ sequence, t: sequence, period: 1, gameClockTenths: 900, type, shooterPlayerId: shooter, ...payload }) as MatchNextEvent

describe('per-player Match Next nine-zone persistence evidence', () => {
  const box = { twoPointMade: 1, twoPointAttempted: 2, threePointMade: 1, threePointAttempted: 1 }

  it('counts exact shot release zones with blocked attempts, misses and makes', () => {
    const actual = observedShotZones([
      event(1,'shotReleased',{ shotZone:'RESTRICTED',points:2 }),
      event(2,'shotMade',{ points:2 }),
      event(3,'shotReleased',{ shotZone:'CORNER_THREE',points:3 }),
      event(4,'shotMade',{ points:3 }),
      event(5,'shotReleased',{ shotZone:'FLOATER_RANGE',points:2 }),
      event(6,'shotBlocked',{ playerId:defender, points:2 }),
    ])
    const zones = actual.get(shooter)!
    expect(zones.provenance).toBe('OBSERVED')
    expect(zones.counts.RESTRICTED).toEqual({ made:1, attempted:1 })
    expect(zones.counts.CORNER_THREE).toEqual({ made:1, attempted:1 })
    expect(zones.counts.FLOATER_RANGE).toEqual({ made:0, attempted:1 })
    expect(() => validateShotZoneBreakdown(zones,box)).not.toThrow()
    expect(observedShotZonesForBox(zones,box)).toEqual(zones)
  })

  it('rejects missing labels and mismatched official box-score counts rather than guessing', () => {
    const zones = observedShotZones([
      event(1,'shotReleased',{ points:2 }),
      event(2,'shotMissed'),
    ])
    expect(zones.has(shooter)).toBe(false)
    const known = observedShotZones([
      event(1,'shotReleased',{ shotZone:'MIDRANGE',points:2 }),
      event(2,'shotMade',{ points:2 }),
    ]).get(shooter)!
    expect(observedShotZonesForBox(known,box)).toBeUndefined()
  })

  it('rejects impossible or invented shot-zone totals', () => {
    expect(() => validateShotZoneBreakdown({
      provenance:'OBSERVED', counts:{ DEEP:{made:2,attempted:1} },
    },box)).toThrow()
    expect(() => validateShotZoneBreakdown({
      provenance:'MODELLED', counts:{ RESTRICTED:{made:1,attempted:2} },
    },box)).toThrow(/model version/i)
  })
})
