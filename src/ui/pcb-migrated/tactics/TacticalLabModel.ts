import { MATCH_SHOT_ZONE_IDS, isThreePointZone, type MatchShotZoneId } from '@/domain/stats/MatchStatLog'
import type { PerformanceShotProfileModel } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

export const TACTICAL_ZONE_LABELS: Readonly<Record<MatchShotZoneId, string>> = {
  RESTRICTED: 'Bajo el aro', RIM: 'Cerca del aro',
  SHORT_PAINT: 'Zona interior', FLOATER_RANGE: 'Flotadora',
  MIDRANGE: 'Media distancia', LONG_MIDRANGE: 'Media distancia larga',
  CORNER_THREE: 'Triple de esquina', ABOVE_BREAK_THREE: 'Triple exterior', DEEP: 'Triple lejano',
}

export type LabPosition = { readonly x: number; readonly y: number }
export type TacticalZoneEvidence = {
  readonly id: MatchShotZoneId
  readonly label: string
  readonly made: number
  readonly attempts: number
  readonly percentage: number | null
  readonly source: 'OBSERVED' | 'MODELLED' | 'MIXED' | 'NONE'
  readonly sufficient: boolean
  readonly estimatedPointsPerShot: number | null
  readonly recommended: boolean
}

/** Canvas geometry only. Shooting logs contain zone totals, not exact shot coordinates. */
export function tacticalZoneTarget(zone: MatchShotZoneId, from: LabPosition): LabPosition {
  const right = from.x > 250
  const positions: Record<MatchShotZoneId, LabPosition> = {
    RESTRICTED: { x: 250, y: 77 },
    RIM: { x: 250, y: 115 },
    SHORT_PAINT: { x: right ? 290 : 210, y: 148 },
    FLOATER_RANGE: { x: right ? 340 : 160, y: 218 },
    MIDRANGE: { x: right ? 389 : 111, y: 208 },
    LONG_MIDRANGE: { x: right ? 395 : 105, y: 292 },
    CORNER_THREE: { x: right ? 453 : 47, y: 90 },
    ABOVE_BREAK_THREE: { x: right ? 402 : 98, y: 360 },
    DEEP: { x: 250, y: 413 },
  }
  return positions[zone]
}

/**
 * We recommend only from OBSERVED season shooting and at least 12 attempts.
 * MODELLED/MIXED data may be shown but can never be described as a hot zone.
 */
export function buildTacticalZoneEvidence(profile: PerformanceShotProfileModel | undefined): readonly TacticalZoneEvidence[] {
  const provenance = profile?.detailedProvenance ?? 'NONE'
  const rows = MATCH_SHOT_ZONE_IDS.map(id => {
    const tally = profile?.detailedZones?.find(zone => zone.id === id)
    const attempts = tally?.attempted ?? 0
    const made = tally?.made ?? 0
    const observed = provenance === 'OBSERVED'
    return {
      id, label: TACTICAL_ZONE_LABELS[id], made, attempts,
      percentage: attempts ? Math.round(made / attempts * 100) : null,
      source: provenance,
      sufficient: observed && attempts >= 12,
      estimatedPointsPerShot: observed && attempts >= 12 ? (made / attempts) * (isThreePointZone(id) ? 3 : 2) : null,
    }
  })
  const qualified = rows.filter(row => row.sufficient)
    .sort((a,b) => (b.estimatedPointsPerShot ?? 0) - (a.estimatedPointsPerShot ?? 0) ||
      b.attempts - a.attempts)
  const best = new Set(qualified.slice(0,2).map(row => row.id))
  return rows.map(row => ({ ...row, recommended: best.has(row.id) }))
}

export function tacticalSpacingWarning(target: LabPosition, playerId: number, players: readonly { readonly id: number; readonly x: number; readonly y: number }[]): string | null {
  if (players.some(p => p.id !== playerId && Math.hypot(p.x-target.x,p.y-target.y) < 58)) {
    return 'La zona está cerca de un compañero. Revisa el espaciado antes de guardar.'
  }
  return null
}
