import type { GameWorld } from '@/domain/world'
import type { MatchEvent, MatchLineups } from '@/engine/match'

import { createCourtPresentation } from './CourtPresentation'

export function MatchCourt({ world, homeTeamId, awayTeamId, lineups, attackingTeamId, period, events, progress, detail = 'full' }: { readonly world: GameWorld; readonly homeTeamId: keyof GameWorld['teams']; readonly awayTeamId: keyof GameWorld['teams']; readonly lineups: MatchLineups; readonly attackingTeamId: keyof GameWorld['teams']; readonly period: number; readonly events: readonly MatchEvent[]; readonly progress: number; readonly detail?: 'full' | 'compressed' | 'compact' }) {
  const visualProgress = detail === 'compact' ? (progress < .75 ? 0 : 1) : detail === 'compressed' ? Math.round(progress * 2) / 2 : progress
  const tokens = createCourtPresentation({ homeTeamId, awayTeamId, lineups, attackingTeamId, period, players: world.players, events, progress: visualProgress })
  const focused = tokens.find((token) => token.focused)
  return <section className="court match-court" aria-label="Basketball court presentation"><div className="half-court-line" /><div className="paint paint-left" /><div className="paint paint-right" /><div className="three-arc arc-left" /><div className="three-arc arc-right" />{tokens.map((token) => <div className={`token ${token.teamId === homeTeamId ? 'home-token' : 'away-token'}${token.focused ? ' focused-token' : ''}`} key={token.player.id} style={{ left: `${token.x}%`, top: `${token.y}%` }}><strong>{token.player.lastName}</strong><span>{token.player.basketball.primaryPosition}</span></div>)}{focused !== undefined && <span aria-label="Ball" className="ball-indicator" style={{ left: `${focused.x}%`, top: `${focused.y}%` }}>●</span>}</section>
}
