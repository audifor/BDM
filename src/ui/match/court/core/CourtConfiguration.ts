import type { CourtRuleset } from '../rules/CourtRuleset'
import type { CourtFloorProfile } from '../floor/CourtFloorProfile'
import type { CourtBrandingProfile } from '../branding/CourtBrandingProfile'
import type { BasketSystemProfile } from '../basket/BasketSystemProfile'
import type { ArenaCourtProfile } from '../arena/ArenaCourtProfile'
import type { CourtEventOverlay } from '../event/CourtEventOverlay'

/**
 * Fully resolved visual court — renderer input only.
 * Resolution of competition/club/arena happens in CourtConfigurationResolver.
 */
export type CourtConfiguration = {
  readonly id: string
  readonly ruleset: CourtRuleset
  readonly floor: CourtFloorProfile
  readonly branding: CourtBrandingProfile
  readonly basketSystem: BasketSystemProfile
  readonly arena: ArenaCourtProfile
  readonly eventOverlay?: CourtEventOverlay
  /**
   * Future hooks — accepted now so callers need not rewrite later.
   * Currently unused for persistence.
   */
  readonly arenaInstallationId?: string
  readonly seasonId?: string
}

export function courtConfigurationCacheKey(config: CourtConfiguration): string {
  return [
    config.id,
    config.ruleset.id,
    config.arena.archetype,
    config.floor.material,
    config.floor.pattern,
    config.floor.baseTone,
    config.branding.centerMonogram ?? '',
    config.branding.baselineHome,
    config.branding.palette.paint,
    config.branding.palette.apron,
    config.basketSystem.type,
    config.basketSystem.paddingColor,
    config.arena.ledColor,
    String(config.arena.courtWidthFill),
    config.eventOverlay?.kind ?? 'NONE',
    config.arenaInstallationId ?? '',
    config.seasonId ?? '',
  ].join('|')
}
