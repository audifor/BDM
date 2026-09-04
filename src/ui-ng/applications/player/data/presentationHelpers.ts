import type { PlayerId } from '@/domain/ids'
import type { Team } from '@/domain/team'
import type { GameWorld } from '@/domain/world'

export function findTeamForPlayer(world: GameWorld, playerId: PlayerId): Team | undefined {
  return Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(playerId))
}

export function teamShortCode(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('')
  }
  return name.slice(0, 3).toUpperCase()
}

export function opponentShortCode(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((word) => word.slice(0, 3).toUpperCase())
      .join(' ')
  }
  return name.slice(0, 3).toUpperCase()
}

/** Deterministic team palette for NG chrome when no crest asset exists. */
export function deriveTeamColors(teamId: string): {
  readonly primary: string
  readonly secondary: string
  readonly muted: string
} {
  let hash = 2166136261
  for (const char of teamId) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  }
  const hue = hash % 360
  const primary = `hsl(${hue} 48% 34%)`
  const secondary = `hsl(${(hue + 36) % 360} 62% 52%)`
  return {
    primary,
    secondary,
    muted: `hsla(${hue}, 48%, 34%, 0.22)`,
  }
}

export function formatGameDateLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
}

export function unavailableField<T>(label = 'Not available'): { readonly status: 'unavailable'; readonly label: string; readonly value?: T } {
  return { status: 'unavailable', label }
}

export function availableField<T>(value: T): { readonly status: 'available'; readonly value: T } {
  return { status: 'available', value }
}
