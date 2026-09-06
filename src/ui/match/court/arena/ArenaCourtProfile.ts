import type { BasketSystemType } from '../basket/BasketSystemProfile'

export type ArenaCourtArchetype =
  | 'NBA_PREMIUM'
  | 'EURO_PREMIUM'
  | 'EURO_STANDARD'
  | 'NCAA_MAJOR'
  | 'NCAA_SMALL_GYM'
  | 'SMALL_PRO'
  | 'YOUTH_GYM'

export type ArenaLightingProfile = {
  readonly glossBoost: number
  readonly vignetteStrength: number
  readonly ambientTint: string
  readonly ambientTintStrength: number
  readonly overheadStrength: number
  readonly ledContamination: number
}

export type ArenaCourtProfile = {
  readonly archetype: ArenaCourtArchetype
  /** Extra runoff scale beyond ruleset hint (1 = nominal). */
  readonly runoffScale: number
  readonly apronColor: string
  readonly seatColor: string
  readonly ledColor: string
  readonly ledOpacity: number
  readonly ledStripCount: number
  readonly benchScale: number
  readonly scorerTableScale: number
  readonly courtsideSeats: boolean
  readonly bleachersClose: boolean
  readonly mediaZones: boolean
  readonly photographerPads: boolean
  readonly tunnelHints: boolean
  readonly defaultBasketType: BasketSystemType
  /** Camera occupancy of playable court vs environment. */
  readonly courtWidthFill: number
  readonly courtHeightFill: number
  readonly lighting: ArenaLightingProfile
}

export function createArenaProfile(
  archetype: ArenaCourtArchetype,
  colors: { readonly apron: string; readonly seat: string; readonly led: string },
): ArenaCourtProfile {
  switch (archetype) {
    case 'NBA_PREMIUM':
      return {
        archetype,
        runoffScale: 1.05,
        apronColor: colors.apron,
        seatColor: colors.seat,
        ledColor: colors.led,
        ledOpacity: 0.55,
        ledStripCount: 2,
        benchScale: 1.25,
        scorerTableScale: 1.35,
        courtsideSeats: true,
        bleachersClose: false,
        mediaZones: true,
        photographerPads: true,
        tunnelHints: true,
        defaultBasketType: 'PRO_STANCHION',
        // Camera fill: court dominates stage; environment crops at viewport
        courtWidthFill: 0.9,
        courtHeightFill: 0.9,
        lighting: {
          glossBoost: 0.18,
          vignetteStrength: 0.28,
          ambientTint: '#060a12',
          ambientTintStrength: 0.12,
          overheadStrength: 1.15,
          ledContamination: 0.22,
        },
      }
    case 'EURO_PREMIUM':
      return {
        archetype,
        runoffScale: 1.0,
        apronColor: colors.apron,
        seatColor: colors.seat,
        ledColor: colors.led,
        ledOpacity: 0.62,
        ledStripCount: 3,
        benchScale: 1.1,
        scorerTableScale: 1.15,
        courtsideSeats: false,
        bleachersClose: false,
        mediaZones: true,
        photographerPads: true,
        tunnelHints: false,
        defaultBasketType: 'PORTABLE_ARENA',
        courtWidthFill: 0.91,
        courtHeightFill: 0.92,
        lighting: {
          glossBoost: 0.12,
          vignetteStrength: 0.2,
          ambientTint: '#0a1420',
          ambientTintStrength: 0.08,
          overheadStrength: 1.05,
          ledContamination: 0.35,
        },
      }
    case 'EURO_STANDARD':
      return {
        archetype,
        runoffScale: 1.05,
        apronColor: colors.apron,
        seatColor: colors.seat,
        ledColor: colors.led,
        ledOpacity: 0.4,
        ledStripCount: 1,
        benchScale: 0.95,
        scorerTableScale: 0.95,
        courtsideSeats: false,
        bleachersClose: false,
        mediaZones: false,
        photographerPads: false,
        tunnelHints: false,
        defaultBasketType: 'PORTABLE_ARENA',
        courtWidthFill: 0.92,
        courtHeightFill: 0.94,
        lighting: {
          glossBoost: 0.06,
          vignetteStrength: 0.18,
          ambientTint: '#0c1620',
          ambientTintStrength: 0.06,
          overheadStrength: 0.95,
          ledContamination: 0.15,
        },
      }
    case 'NCAA_MAJOR':
      return {
        archetype,
        runoffScale: 1.2,
        apronColor: colors.apron,
        seatColor: colors.seat,
        ledColor: colors.led,
        ledOpacity: 0.38,
        ledStripCount: 1,
        benchScale: 1.15,
        scorerTableScale: 1.1,
        courtsideSeats: false,
        bleachersClose: true,
        mediaZones: true,
        photographerPads: false,
        tunnelHints: false,
        defaultBasketType: 'COLLEGE_STANCHION',
        courtWidthFill: 0.9,
        courtHeightFill: 0.91,
        lighting: {
          glossBoost: 0.08,
          vignetteStrength: 0.22,
          ambientTint: '#101018',
          ambientTintStrength: 0.07,
          overheadStrength: 1,
          ledContamination: 0.1,
        },
      }
    case 'NCAA_SMALL_GYM':
      return {
        archetype,
        runoffScale: 0.72,
        apronColor: colors.apron,
        seatColor: colors.seat,
        ledColor: colors.led,
        ledOpacity: 0.18,
        ledStripCount: 0,
        benchScale: 0.75,
        scorerTableScale: 0.7,
        courtsideSeats: false,
        bleachersClose: true,
        mediaZones: false,
        photographerPads: false,
        tunnelHints: false,
        defaultBasketType: 'SMALL_GYM',
        courtWidthFill: 0.93,
        courtHeightFill: 0.94,
        lighting: {
          glossBoost: 0,
          vignetteStrength: 0.12,
          ambientTint: '#1a1a18',
          ambientTintStrength: 0.04,
          overheadStrength: 0.72,
          ledContamination: 0,
        },
      }
    case 'SMALL_PRO':
      return {
        archetype,
        runoffScale: 0.9,
        apronColor: colors.apron,
        seatColor: colors.seat,
        ledColor: colors.led,
        ledOpacity: 0.32,
        ledStripCount: 1,
        benchScale: 0.85,
        scorerTableScale: 0.85,
        courtsideSeats: false,
        bleachersClose: false,
        mediaZones: false,
        photographerPads: false,
        tunnelHints: false,
        defaultBasketType: 'SMALL_GYM',
        courtWidthFill: 0.92,
        courtHeightFill: 0.95,
        lighting: {
          glossBoost: 0.04,
          vignetteStrength: 0.16,
          ambientTint: '#0e141c',
          ambientTintStrength: 0.05,
          overheadStrength: 0.88,
          ledContamination: 0.08,
        },
      }
    case 'YOUTH_GYM':
    default:
      return {
        archetype: 'YOUTH_GYM',
        runoffScale: 0.65,
        apronColor: colors.apron,
        seatColor: colors.seat,
        ledColor: colors.led,
        ledOpacity: 0.1,
        ledStripCount: 0,
        benchScale: 0.65,
        scorerTableScale: 0.55,
        courtsideSeats: false,
        bleachersClose: true,
        mediaZones: false,
        photographerPads: false,
        tunnelHints: false,
        defaultBasketType: 'WALL_MOUNTED',
        courtWidthFill: 0.94,
        courtHeightFill: 0.99,
        lighting: {
          glossBoost: 0,
          vignetteStrength: 0.08,
          ambientTint: '#222018',
          ambientTintStrength: 0.03,
          overheadStrength: 0.65,
          ledContamination: 0,
        },
      }
  }
}
