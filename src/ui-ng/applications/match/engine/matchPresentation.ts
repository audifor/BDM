import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { calculateSeasonStandings } from '@/domain/season'
import type { MatchEvent, PlayerMatchStats } from '@/engine/match'
import { parseCssColor, rgbToHsl } from '@/ui/match/court/CourtColorUtils'
import { teamShortCode } from '@/ui-ng/applications/player/data/presentationHelpers'

/** Stable presentation jersey from player id — domain does not track jersey numbers. */
export function displayJerseyNumber(playerId: string): number {
  let hash = 0
  for (let i = 0; i < playerId.length; i += 1) hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0
  return (hash % 99) + 1
}

export function formatPlayerShortName(firstName: string, lastName: string): string {
  const initial = firstName.trim().charAt(0)
  return initial === '' ? lastName : `${initial}. ${lastName}`
}

export function formatMinutesCompact(secondsPlayed: number): string {
  return `${Math.floor(secondsPlayed / 60)}`
}

export function formatMinutesClock(secondsPlayed: number): string {
  const minutes = Math.floor(secondsPlayed / 60)
  const seconds = secondsPlayed % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatShooting(made: number, attempted: number): string {
  return `${made}/${attempted}`
}

export function formatPlusMinus(value: number): string {
  if (value > 0) return `+${value}`
  return String(value)
}

export function teamRecordLabel(world: GameWorld, teamId: TeamId): string {
  const seasonId = world.currentSeasonId
  if (seasonId === undefined || world.seasons[seasonId] === undefined) return '0-0'
  try {
    const line = calculateSeasonStandings(world, seasonId).find((entry) => entry.teamId === teamId)
    if (line === undefined) return '0-0'
    return `${line.wins}-${line.losses}`
  } catch {
    return '0-0'
  }
}

export function teamFoulsTotal(stats: readonly PlayerMatchStats[]): number {
  return stats.reduce((sum, row) => sum + row.foulsCommitted, 0)
}

export function venueLabel(world: GameWorld, homeTeamId: TeamId): { readonly arena: string; readonly location: string } {
  const team = world.teams[homeTeamId]
  const country = team === undefined ? undefined : world.countries[team.countryId]
  return {
    arena: team === undefined ? 'Arena' : `${team.name} Arena`,
    location: country === undefined ? '' : `${country.name}, ${country.code}`,
  }
}

export function seasonLabel(world: GameWorld): string {
  const season = world.currentSeasonId === undefined ? undefined : world.seasons[world.currentSeasonId]
  if (season === undefined) return 'Temporada'
  const year = Number(String(world.currentDate).slice(0, 4))
  if (Number.isFinite(year) && year > 1900) return `Temporada ${year}/${String(year + 1).slice(-2)}`
  return `Temporada ${season.id}`
}

export function matchdayLabel(world: GameWorld, competitionId: string): string {
  const played = Object.values(world.games).filter(
    (game) => game.competitionId === competitionId && game.status === 'completed',
  ).length
  return `Jornada ${played + 1}`
}

export function teamMark(name: string): string {
  return teamShortCode(name)
}

export function energyFromFatigue(fatigue: number | undefined): number {
  return Math.round(100 - Math.min(100, Math.max(0, fatigue ?? 0)))
}

export type PlayByPlayKind = 'shot' | 'assist' | 'rebound' | 'turnover' | 'foul' | 'timeout' | 'substitution' | 'period' | 'other'

export function playByPlayKind(event: MatchEvent): PlayByPlayKind {
  switch (event.type) {
    case 'shotMade':
    case 'shotMissed':
    case 'freeThrowMade':
    case 'freeThrowMissed':
      return 'shot'
    case 'rebound':
      return 'rebound'
    case 'turnover':
      return 'turnover'
    case 'foul':
      return 'foul'
    case 'substitution':
      return 'substitution'
    case 'periodStart':
    case 'periodEnd':
    case 'gameEnd':
      return 'period'
    default:
      return 'other'
  }
}

export function isHighlightPlay(event: MatchEvent): boolean {
  return event.type === 'shotMade' || event.type === 'periodEnd' || event.type === 'gameEnd'
}

export type TacticalPanelTab = 'general' | 'ataque' | 'defensa' | 'jugadores'
export type LiveStageMode = 'tracking' | 'playByPlay'

export function paceToSlider(pace: number): number {
  return Math.round(((pace + 2) / 4) * 100)
}

export function sliderToPace(value: number): -2 | -1 | 0 | 1 | 2 {
  const normalized = Math.round((value / 100) * 4 - 2) as -2 | -1 | 0 | 1 | 2
  return normalized
}

/**
 * Match Engine chrome: keeps the true club accent and derives a contrast ink.
 * When the brand is white / very light, active-button text and borders flip to
 * black so they stay readable; dark brands keep near-white ink.
 */
export function chromeSafeClubAccent(
  primary: string,
  secondary: string,
): { readonly primary: string; readonly secondary: string; readonly ink: string } {
  return {
    primary,
    secondary,
    ink: contrastInk(primary),
  }
}

function contrastInk(color: string): string {
  const rgb = parseCssColor(color)
  if (rgb === null) return '#f4f7fb'
  const hsl = rgbToHsl(rgb)
  return hsl.l > 0.55 ? '#0b0d12' : '#f4f7fb'
}

export function rankOnCourt(activePlayerIds: readonly PlayerId[], playerId: PlayerId): number {
  const index = activePlayerIds.indexOf(playerId)
  return index === -1 ? 99 : index
}
