export type BasketSystemType =
  | 'PRO_STANCHION'
  | 'COLLEGE_STANCHION'
  | 'PORTABLE_ARENA'
  | 'WALL_MOUNTED'
  | 'CEILING_MOUNTED'
  | 'SMALL_GYM'

export type BackboardStyle = 'pro_glass' | 'college' | 'basic'

/**
 * Structural basket system — physical mass outside the playable court.
 * Hoop invades court; backboard near baseline; stanchion/base mostly in runoff.
 */
export type BasketSystemProfile = {
  readonly type: BasketSystemType
  /** Distance from baseline outward to stanchion centre (metres, ≥ 0). */
  readonly supportDepthM: number
  readonly paddingWidthM: number
  readonly paddingHeightM: number
  readonly backboardStyle: BackboardStyle
  /** Visual mass 0..1 — NBA premium vs small gym. */
  readonly visualMass: number
  readonly brandingZone: boolean
  readonly shadowStrength: number
  readonly paddingColor: string
  readonly paddingMark: string | null
}

export function createBasketSystem(
  type: BasketSystemType,
  paddingColor: string,
  paddingMark: string | null = null,
): BasketSystemProfile {
  switch (type) {
    case 'PRO_STANCHION':
      return {
        type,
        // Compact envelope: sits in immediate runoff, must not force stage width
        supportDepthM: 1.05,
        paddingWidthM: 0.48,
        paddingHeightM: 1.65,
        backboardStyle: 'pro_glass',
        visualMass: 1,
        brandingZone: true,
        shadowStrength: 0.85,
        paddingColor,
        paddingMark,
      }
    case 'COLLEGE_STANCHION':
      return {
        type,
        supportDepthM: 0.95,
        paddingWidthM: 0.42,
        paddingHeightM: 1.5,
        backboardStyle: 'college',
        visualMass: 0.82,
        brandingZone: true,
        shadowStrength: 0.7,
        paddingColor,
        paddingMark,
      }
    case 'PORTABLE_ARENA':
      return {
        type,
        supportDepthM: 1.0,
        paddingWidthM: 0.44,
        paddingHeightM: 1.55,
        backboardStyle: 'pro_glass',
        visualMass: 0.9,
        brandingZone: true,
        shadowStrength: 0.75,
        paddingColor,
        paddingMark,
      }
    case 'WALL_MOUNTED':
      return {
        type,
        supportDepthM: 0.35,
        paddingWidthM: 0.28,
        paddingHeightM: 1.2,
        backboardStyle: 'basic',
        visualMass: 0.35,
        brandingZone: false,
        shadowStrength: 0.35,
        paddingColor,
        paddingMark,
      }
    case 'CEILING_MOUNTED':
      return {
        type,
        supportDepthM: 0.55,
        paddingWidthM: 0.32,
        paddingHeightM: 1.3,
        backboardStyle: 'basic',
        visualMass: 0.4,
        brandingZone: false,
        shadowStrength: 0.4,
        paddingColor,
        paddingMark,
      }
    case 'SMALL_GYM':
    default:
      return {
        type: 'SMALL_GYM',
        supportDepthM: 0.85,
        paddingWidthM: 0.36,
        paddingHeightM: 1.35,
        backboardStyle: 'basic',
        visualMass: 0.48,
        brandingZone: true,
        shadowStrength: 0.45,
        paddingColor,
        paddingMark,
      }
  }
}
