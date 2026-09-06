import type { PlayerId, TeamId } from '@/domain/ids'

/**
 * FM-style circular token metrics at scale=1 (≈37px diameter on 1080p MEDIUM).
 */
export const COURT_PLAYER_VISUAL = {
  /** Token radius in local units before scale. */
  RADIUS: 18.6,
  BORDER: 2.0,
  SHADOW_RX: 16.2,
  SHADOW_RY: 5.5,
  JERSEY_FONT: 14.4,
  NAME_FONT: 9.5,
  SELECTION_RX: 21.6,
  SELECTION_RY: 7.4,
  POSSESSION_RX: 19.8,
  POSSESSION_RY: 6.7,
} as const

export const COURT_BALL_VISUAL = {
  RADIUS: 5.2,
  SHADOW_RX: 5.8,
  SHADOW_RY: 2.2,
  HELD_DIST: 2.4,
  Z_TO_PIXELS: 9,
} as const

export type CourtBallState = 'HELD' | 'DRIBBLE' | 'PASS' | 'SHOT' | 'LOOSE'

export type CourtKitColors = {
  readonly primary: string
  readonly secondary: string
  /** Kept for kit API stability; tokens use primary fill. */
  readonly shorts: string
  readonly trim: string
  readonly number: string
  readonly numberOutline: string
  /** Token rim against parquet. */
  readonly bodyOutline: string
  readonly skinTone: string
}

export type CourtDynamicPlayer = {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly side: 'home' | 'away'
  readonly xPercent: number
  readonly yPercent: number
  readonly jersey: number
  /** Short display name under the token (typically last name). */
  readonly name?: string
  readonly hasBall: boolean
  readonly selected: boolean
  readonly kit: CourtKitColors
  /** Radians — retained for ball offset / future overlays; tokens ignore body yaw. */
  readonly facingHint?: number
}

export type CourtDynamicBall = {
  readonly xPercent: number
  readonly yPercent: number
  readonly z: number
  readonly ownerPlayerId: PlayerId | null
  readonly state: CourtBallState
}

export type CourtDynamicFrame = {
  readonly players: readonly CourtDynamicPlayer[]
  readonly ball: CourtDynamicBall | null
  readonly playbackSpeed: number
  readonly isPlaying: boolean
  readonly debug?: boolean
}

export type CourtPoint2 = {
  readonly x: number
  readonly y: number
}

export type CourtPlayerFloorState = 'none' | 'possession' | 'selected' | 'both'

export function resolvePlayerFloorState(hasBall: boolean, selected: boolean): CourtPlayerFloorState {
  if (hasBall && selected) return 'both'
  if (selected) return 'selected'
  if (hasBall) return 'possession'
  return 'none'
}
