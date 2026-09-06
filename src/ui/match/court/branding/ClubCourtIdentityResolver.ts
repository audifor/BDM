import type { Team } from '@/domain/team'
import { deriveTeamColors, teamShortCode } from '@/ui-ng/applications/player/data/presentationHelpers'
import { adjustHsl, normalizeArenaColor, normalizeCourtColor } from '../CourtColorUtils'
import type { CourtBrandingProfile, CourtPresentationPalette } from './CourtBrandingProfile'

export function deriveCourtPalette(primary: string, secondary: string): CourtPresentationPalette {
  const brand = primary
  const paint = normalizeCourtColor(primary)
  const apron = normalizeArenaColor(primary)
  return {
    brand,
    dark: adjustHsl(paint, { l: -0.1, s: -0.04 }),
    surface: adjustHsl(paint, { l: 0.12, s: -0.08 }),
    paint,
    muted: adjustHsl(paint, { l: 0.06, s: -0.12 }),
    accent: secondary,
    apron,
    padding: adjustHsl(apron, { l: 0.05, s: 0.04 }),
    seat: adjustHsl(apron, { l: -0.08, s: -0.1 }),
    restricted: adjustHsl(paint, { l: -0.06, s: 0.02 }),
    center: adjustHsl(paint, { l: 0.04, s: -0.02 }),
  }
}

function splitBaselineName(name: string): { readonly line1: string; readonly line2: string } {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return { line1: name.toUpperCase(), line2: '' }
  if (words.length === 2) return { line1: words[0]!.toUpperCase(), line2: words[1]!.toUpperCase() }
  return {
    line1: words.slice(0, -1).join(' ').toUpperCase(),
    line2: words[words.length - 1]!.toUpperCase(),
  }
}

function firstToken(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words[0] ?? 'HOME').toUpperCase().slice(0, 14)
}

/**
 * Club controls identity — never geometry.
 * Priority: crest asset → wordmark → monogram → initials.
 * Never BDM / HOME CLUB.
 */
export function resolveClubCourtIdentity(
  homeTeam: Team,
  awayTeam?: Team,
  options: {
    readonly centerMark?: CanvasImageSource | null
    readonly centerWordmark?: string | null
    readonly nickname?: string | null
    readonly city?: string | null
  } = {},
): CourtBrandingProfile {
  const colors = deriveTeamColors(homeTeam.id)
  const palette = deriveCourtPalette(colors.primary, colors.secondary)
  const monogram = teamShortCode(homeTeam.name)
  if (monogram.toUpperCase() === 'BDM') {
    // Extremely unlikely; force initials from name words
  }
  const safeMonogram = monogram.toUpperCase() === 'BDM' ? homeTeam.name.slice(0, 2).toUpperCase() : monogram

  const homeLines = splitBaselineName(homeTeam.name)
  const awayLines =
    awayTeam === undefined ? { line1: '', line2: '' } : splitBaselineName(awayTeam.name)

  const baselineHome =
    homeLines.line2 === '' ? homeLines.line1 : `${homeLines.line1}\n${homeLines.line2}`
  const baselineAway =
    awayTeam === undefined
      ? ''
      : awayLines.line2 === ''
        ? awayLines.line1
        : `${awayLines.line1}\n${awayLines.line2}`

  const sidelineMarks = [
    {
      text: options.city?.toUpperCase() ?? firstToken(homeTeam.name),
      side: 'near' as const,
      opacity: 0.28,
    },
    {
      text: (options.nickname ?? safeMonogram).toUpperCase().slice(0, 14),
      side: 'far' as const,
      opacity: 0.22,
    },
  ]

  return {
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    centerMark: options.centerMark ?? null,
    centerMonogram: options.centerMark ? null : safeMonogram,
    centerWordmark: options.centerWordmark ?? null,
    centerLogoScale: 0.95,
    centerLogoOpacity: 0.72,
    baselineHome,
    baselineAway,
    baselineOpacity: 0.44,
    baselineTrackingEm: 0.22,
    baselineScale: 0.95,
    sidelineMarks,
    basketPaddingMark: safeMonogram.slice(0, 2),
    ledAccent: colors.secondary,
    scorerLabel: safeMonogram.slice(0, 6),
    palette,
  }
}
