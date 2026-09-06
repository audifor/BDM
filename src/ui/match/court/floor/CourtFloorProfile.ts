export type FloorMaterialId =
  | 'MAPLE_LIGHT'
  | 'MAPLE_NATURAL'
  | 'MAPLE_GOLD'
  | 'MAPLE_DARK'
  | 'OAK_LIGHT'
  | 'OAK_DARK'
  | 'DARK_STAIN'
  | 'SYNTHETIC'

export type FloorPatternId = 'LONGITUDINAL' | 'TRANSVERSE' | 'STAGGERED' | 'HERRINGBONE' | 'TWO_TONE' | 'CUSTOM'

export type FloorStainZoneKind =
  | 'CENTER_CIRCLE'
  | 'INSIDE_THREE'
  | 'HALF_COURT'
  | 'OUT_OF_BOUNDS'
  | 'KEY_STAIN'

export type FloorStainZone = {
  readonly kind: FloorStainZoneKind
  /** Relative lightness delta applied as wood stain (−0.25..0.25). */
  readonly toneDelta: number
  readonly opacity: number
}

export type CourtFloorProfile = {
  readonly material: FloorMaterialId
  readonly pattern: FloorPatternId
  readonly baseTone: string
  readonly plankWidthM: number
  readonly plankLengthM: number
  readonly toneVariation: number
  readonly grainStrength: number
  readonly seamStrength: number
  readonly gloss: number
  readonly microContrast: number
  readonly stainZones: readonly FloorStainZone[]
  readonly paintMaterial: {
    readonly woodBleed: number
    readonly gloss: number
    readonly grainRetain: number
  }
}

export const FLOOR_MATERIAL_TONES: Readonly<Record<FloorMaterialId, string>> = {
  MAPLE_LIGHT: '#d4b888',
  MAPLE_NATURAL: '#c2a06a',
  MAPLE_GOLD: '#c9a45c',
  MAPLE_DARK: '#a8844e',
  OAK_LIGHT: '#c8a978',
  OAK_DARK: '#8f6a3e',
  DARK_STAIN: '#6e4e2e',
  SYNTHETIC: '#b89664',
}

export function createFloorProfile(
  material: FloorMaterialId,
  pattern: FloorPatternId,
  overrides: Partial<CourtFloorProfile> = {},
): CourtFloorProfile {
  const base: CourtFloorProfile = {
    material,
    pattern,
    baseTone: FLOOR_MATERIAL_TONES[material],
    plankWidthM: pattern === 'HERRINGBONE' ? 0.09 : 0.12,
    plankLengthM: pattern === 'HERRINGBONE' ? 0.55 : 0.85,
    toneVariation: material.startsWith('MAPLE') ? 0.26 : 0.3,
    grainStrength: material === 'SYNTHETIC' ? 0.12 : 0.34,
    seamStrength: pattern === 'HERRINGBONE' ? 0.22 : 0.16,
    gloss: material === 'DARK_STAIN' ? 0.48 : material === 'MAPLE_GOLD' ? 0.7 : 0.6,
    microContrast: 0.22,
    stainZones: [],
    paintMaterial: {
      woodBleed: 0.32,
      gloss: 0.55,
      grainRetain: 0.7,
    },
  }
  return { ...base, ...overrides, paintMaterial: { ...base.paintMaterial, ...overrides.paintMaterial } }
}
