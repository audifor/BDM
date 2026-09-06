import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { parseCssColor, type CourtRgb } from './CourtColorUtils'
import type { CourtKitColors } from './CourtEntityTypes'

/** Typical parquet mid-tone used for presentation contrast checks only. */
export const COURT_PARQUET_REFERENCE = '#d2b07a'

function luminance({ r, g, b }: CourtRgb): number {
  const toLin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
}

function contrastRatio(a: CourtRgb, b: CourtRgb): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

function hslCss(h: number, s: number, l: number): string {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`
}

function hueOf(rgb: CourtRgb): number {
  const { r, g, b } = rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 210
  const d = max - min
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return h * 60
}

function shadeCss(color: string, lightDelta: number): string {
  const rgb = parseCssColor(color)
  if (rgb === null) return color
  const h = hueOf(rgb)
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255
  const min = Math.min(rgb.r, rgb.g, rgb.b) / 255
  const l = ((max + min) / 2) * 100
  const s = max === min ? 0 : ((max - min) / (1 - Math.abs(2 * (l / 100) - 1))) * 100
  return hslCss(h, Math.min(70, Math.max(8, s)), Math.min(92, Math.max(8, l + lightDelta)))
}

function bodyOutlineFor(primary: string, courtRef = COURT_PARQUET_REFERENCE): string {
  const kit = parseCssColor(primary)
  const court = parseCssColor(courtRef)
  if (kit === null || court === null) return 'rgba(8,12,18,0.55)'
  if (contrastRatio(kit, court) >= 2.1) return 'rgba(8,12,18,0.42)'
  // Presentation-only edge — keep figure readable on maple without mutating brand
  return luminance(kit) > 0.55 ? 'rgba(12,18,28,0.72)' : 'rgba(255,248,235,0.55)'
}

function kitFromBrand(primary: string, secondary: string, lightNumbers: boolean): CourtKitColors {
  return {
    primary,
    secondary,
    shorts: shadeCss(primary, -14),
    trim: secondary,
    number: lightNumbers ? '#f4f7fb' : '#101820',
    numberOutline: lightNumbers ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.45)',
    bodyOutline: bodyOutlineFor(primary),
    skinTone: '#c4a07a',
  }
}

/**
 * Presentation-only match kits with guaranteed home/away contrast.
 * Does not mutate club brand tokens.
 */
export function resolveMatchKitColors(
  homeTeamId: string,
  awayTeamId: string,
): { readonly home: CourtKitColors; readonly away: CourtKitColors } {
  const homeBrand = deriveTeamColors(homeTeamId)
  const awayBrand = deriveTeamColors(awayTeamId)
  const homeRgb = parseCssColor(homeBrand.primary)
  const awayRgb = parseCssColor(awayBrand.primary)

  let awayPrimary = awayBrand.primary
  let awaySecondary = awayBrand.secondary

  if (homeRgb !== null && awayRgb !== null && contrastRatio(homeRgb, awayRgb) < 2.4) {
    const homeHue = hueOf(homeRgb)
    awayPrimary = hslCss(homeHue + 180, 12, 92)
    awaySecondary = hslCss(homeHue + 200, 55, 42)
  }

  const homePrimaryRgb = parseCssColor(homeBrand.primary)
  const awayPrimaryRgb = parseCssColor(awayPrimary)
  const homeLightNumbers = homePrimaryRgb === null ? true : luminance(homePrimaryRgb) < 0.45
  const awayLightNumbers = awayPrimaryRgb === null ? false : luminance(awayPrimaryRgb) < 0.55

  return {
    home: kitFromBrand(homeBrand.primary, homeBrand.secondary, homeLightNumbers),
    away: kitFromBrand(awayPrimary, awaySecondary, awayLightNumbers),
  }
}

/** Relative contrast between two CSS colors (for tests). */
export function kitContrastRatio(a: string, b: string): number {
  const ra = parseCssColor(a)
  const rb = parseCssColor(b)
  if (ra === null || rb === null) return 1
  return contrastRatio(ra, rb)
}

/** True when kit needs a stronger presentation outline against parquet. */
export function kitNeedsCourtOutline(primary: string, courtRef = COURT_PARQUET_REFERENCE): boolean {
  return kitContrastRatio(primary, courtRef) < 2.1
}
