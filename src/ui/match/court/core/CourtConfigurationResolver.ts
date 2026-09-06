import type { Team } from '@/domain/team'
import type { Competition } from '@/domain/competition'
import type { SportsEcosystemKind } from '@/domain/ecosystem'
import type { SportsCategory } from '@/domain/primitives'
import {
  type CourtConfiguration,
} from './CourtConfiguration'
import { getCourtRuleset, type CourtRulesetId } from '../rules'
import { createFloorProfile, type CourtFloorProfile, type FloorMaterialId, type FloorPatternId } from '../floor/CourtFloorProfile'
import { createBasketSystem } from '../basket/BasketSystemProfile'
import { createArenaProfile, type ArenaCourtArchetype } from '../arena/ArenaCourtProfile'
import { resolveClubCourtIdentity } from '../branding/ClubCourtIdentityResolver'
import { createEventOverlay, type CourtEventKind, type CourtEventOverlay } from '../event/CourtEventOverlay'

export type CourtConfigurationResolveInput = {
  readonly homeTeam: Team
  readonly awayTeam?: Team
  readonly competition?: Competition
  readonly ecosystemKind?: SportsEcosystemKind
  readonly category?: SportsCategory
  readonly arenaArchetype?: ArenaCourtArchetype
  readonly rulesetId?: CourtRulesetId
  readonly eventKind?: CourtEventKind
  readonly eventOverlay?: CourtEventOverlay
  readonly arenaName?: string
  readonly seasonId?: string
  readonly arenaInstallationId?: string
  readonly nickname?: string
  readonly city?: string
  readonly centerMark?: CanvasImageSource | null
  readonly centerWordmark?: string | null
  /** Full override for previews / tests. */
  readonly customConfiguration?: CourtConfiguration | null
}

type FloorPreset = {
  readonly material: FloorMaterialId
  readonly pattern: FloorPatternId
  readonly stains: CourtFloorProfile['stainZones']
  readonly paintBleed: number
}

function floorForArchetype(archetype: ArenaCourtArchetype): FloorPreset {
  switch (archetype) {
    case 'NBA_PREMIUM':
      return {
        material: 'MAPLE_NATURAL',
        pattern: 'TWO_TONE',
        stains: [
          { kind: 'HALF_COURT', toneDelta: -0.04, opacity: 0.22 },
          { kind: 'CENTER_CIRCLE', toneDelta: -0.08, opacity: 0.28 },
        ],
        paintBleed: 0.28,
      }
    case 'NCAA_MAJOR':
      return {
        material: 'MAPLE_LIGHT',
        pattern: 'STAGGERED',
        stains: [
          { kind: 'CENTER_CIRCLE', toneDelta: -0.12, opacity: 0.4 },
          { kind: 'INSIDE_THREE', toneDelta: 0.05, opacity: 0.15 },
        ],
        paintBleed: 0.3,
      }
    case 'NCAA_SMALL_GYM':
    case 'YOUTH_GYM':
      return {
        material: 'OAK_LIGHT',
        pattern: 'LONGITUDINAL',
        stains: [],
        paintBleed: 0.38,
      }
    case 'EURO_PREMIUM':
      return {
        material: 'MAPLE_GOLD',
        pattern: 'HERRINGBONE',
        stains: [{ kind: 'CENTER_CIRCLE', toneDelta: -0.06, opacity: 0.25 }],
        paintBleed: 0.3,
      }
    case 'EURO_STANDARD':
      return {
        material: 'MAPLE_NATURAL',
        pattern: 'STAGGERED',
        stains: [],
        paintBleed: 0.32,
      }
    case 'SMALL_PRO':
    default:
      return {
        material: 'MAPLE_DARK',
        pattern: 'LONGITUDINAL',
        stains: [],
        paintBleed: 0.34,
      }
  }
}

export function resolveRulesetId(input: CourtConfigurationResolveInput): CourtRulesetId {
  if (input.rulesetId !== undefined) return input.rulesetId
  const women = input.category === 'women'
  const kind = input.ecosystemKind
  if (kind === 'nbaLike') return women ? 'WNBA' : 'NBA'
  if (kind === 'ncaaLike') return women ? 'NCAA_W' : 'NCAA_M'
  const name = (input.competition?.name ?? '').toLowerCase()
  if (name.includes('nba')) return women ? 'WNBA' : 'NBA'
  if (name.includes('ncaa') || name.includes('college')) return women ? 'NCAA_W' : 'NCAA_M'
  if (name.includes('high school') || name.includes('prep')) return 'HIGH_SCHOOL'
  return 'FIBA'
}

export function resolveArenaArchetype(input: CourtConfigurationResolveInput): ArenaCourtArchetype {
  if (input.arenaArchetype !== undefined) return input.arenaArchetype
  const ruleset = resolveRulesetId(input)
  const name = (input.competition?.name ?? '').toLowerCase()
  if (ruleset === 'NBA' || ruleset === 'WNBA') return 'NBA_PREMIUM'
  if (ruleset === 'NCAA_M' || ruleset === 'NCAA_W') {
    if (name.includes('d2') || name.includes('d3') || name.includes('small')) return 'NCAA_SMALL_GYM'
    return 'NCAA_MAJOR'
  }
  if (ruleset === 'HIGH_SCHOOL') return 'YOUTH_GYM'
  if (name.includes('euroleague') || name.includes('fiba') && name.includes('champions')) return 'EURO_PREMIUM'
  if (name.includes('youth') || name.includes('amateur')) return 'YOUTH_GYM'
  if (name.includes('euro') || name.includes('acb') || name.includes('endesa') || name.includes('liga')) {
    return 'EURO_PREMIUM'
  }
  return 'EURO_STANDARD'
}

/**
 * Match → ruleset → arena → installation/season hooks → club → event → fallback.
 */
export function resolveCourtConfiguration(input: CourtConfigurationResolveInput): CourtConfiguration {
  if (input.customConfiguration != null) return input.customConfiguration

  const rulesetId = resolveRulesetId(input)
  const ruleset = getCourtRuleset(rulesetId)
  const archetype = resolveArenaArchetype(input)
  const branding = resolveClubCourtIdentity(input.homeTeam, input.awayTeam, {
    centerMark: input.centerMark,
    centerWordmark: input.centerWordmark,
    nickname: input.nickname,
    city: input.city,
  })

  const arena = createArenaProfile(archetype, {
    apron: branding.palette.apron,
    seat: branding.palette.seat,
    led: branding.ledAccent,
  })

  const floorPreset = floorForArchetype(archetype)
  const floor = createFloorProfile(floorPreset.material, floorPreset.pattern, {
    stainZones: floorPreset.stains,
    paintMaterial: {
      woodBleed: floorPreset.paintBleed,
      gloss: floorPreset.material === 'MAPLE_GOLD' ? 0.68 : 0.55,
      grainRetain: 0.72,
    },
  })

  const basketSystem = createBasketSystem(
    arena.defaultBasketType,
    branding.palette.padding,
    branding.basketPaddingMark,
  )

  const eventOverlay =
    input.eventOverlay ??
    (input.eventKind !== undefined ? createEventOverlay(input.eventKind) : undefined)

  // Branding layout tweaks by archetype (identity colors remain club-owned)
  const brandingAdjusted =
    archetype === 'NCAA_MAJOR'
      ? {
          ...branding,
          centerLogoScale: 1.08,
          centerLogoOpacity: 0.8,
          baselineOpacity: 0.52,
          baselineScale: 1.05,
        }
      : archetype === 'NBA_PREMIUM'
        ? {
            ...branding,
            centerLogoScale: 1.02,
            baselineOpacity: 0.4,
            baselineTrackingEm: 0.16,
          }
        : archetype === 'NCAA_SMALL_GYM' || archetype === 'YOUTH_GYM'
          ? {
              ...branding,
              centerLogoScale: 0.78,
              baselineOpacity: 0.36,
              baselineScale: 0.85,
            }
          : branding

  return {
    id: `court:${input.homeTeam.id}:${rulesetId}:${archetype}`,
    ruleset,
    floor,
    branding: brandingAdjusted,
    basketSystem,
    arena,
    eventOverlay,
    seasonId: input.seasonId,
    arenaInstallationId: input.arenaInstallationId,
  }
}
