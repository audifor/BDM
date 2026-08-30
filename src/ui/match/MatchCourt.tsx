import type { GameWorld } from '@/domain/world'
import type { SportsEcosystemKind } from '@/domain/ecosystem'
import type { MatchEvent, MatchLineups } from '@/engine/match'

import { createCourtPresentation } from './CourtPresentation'

export function MatchCourt({ world, gameId, homeTeamId, awayTeamId, lineups, attackingTeamId, period, events, progress, detail = 'full' }: { readonly world: GameWorld; readonly gameId: keyof GameWorld['games']; readonly homeTeamId: keyof GameWorld['teams']; readonly awayTeamId: keyof GameWorld['teams']; readonly lineups: MatchLineups; readonly attackingTeamId: keyof GameWorld['teams']; readonly period: number; readonly events: readonly MatchEvent[]; readonly progress: number; readonly detail?: 'full' | 'compressed' | 'compact' }) {
  const visualProgress = detail === 'compact' ? (progress < .75 ? 0 : 1) : detail === 'compressed' ? Math.round(progress * 2) / 2 : progress
  const tokens = createCourtPresentation({ homeTeamId, awayTeamId, lineups, attackingTeamId, period, players: world.players, events, progress: visualProgress })
  const focused = tokens.find((token) => token.focused)
  const courtKind: SportsEcosystemKind = world.ecosystems[world.competitions[world.games[gameId]?.competitionId ?? '']?.ecosystemId ?? '']?.kind ?? 'fibaLike'

  return <section className={`court match-court match-court--${courtKind}`} aria-label={`${courtKind === 'nbaLike' ? 'NBA' : courtKind === 'ncaaLike' ? 'NCAA' : 'FIBA'} regulation basketball court presentation`}>
    <CourtMarkings kind={courtKind} />
    {tokens.map((token) => <div className={`token ${token.teamId === homeTeamId ? 'home-token' : 'away-token'}${token.focused ? ' focused-token' : ''}`} key={token.player.id} style={{ left: `${token.x}%`, top: `${token.y}%` }}><strong>{token.player.lastName}</strong><span>{token.player.basketball.primaryPosition}</span></div>)}
    {focused !== undefined && <span aria-label="Ball" className="ball-indicator" style={{ left: `${focused.x}%`, top: `${focused.y}%` }}>●</span>}
  </section>
}

function CourtMarkings({ kind }: { readonly kind: SportsEcosystemKind }) {
  const rules = kind === 'fibaLike'
    ? { width: 2800, height: 1500, hoop: 132, keyDepth: 580, keyWidth: 490, circle: 180, arc: 720, corner: 90 }
    : kind === 'nbaLike'
      ? { width: 9400, height: 5000, hoop: 400, keyDepth: 1900, keyWidth: 1600, circle: 600, arc: 2375, corner: 300 }
      : { width: 9400, height: 5000, hoop: 400, keyDepth: 1900, keyWidth: 1200, circle: 600, arc: 2215, corner: 300 }
  const centreY = rules.height / 2
  const keyTop = centreY - rules.keyWidth / 2
  const keyBottom = centreY + rules.keyWidth / 2
  const rightHoop = rules.width - rules.hoop
  const threeLineTop = centreY - rules.arc
  const threeLineBottom = centreY + rules.arc

  return <svg aria-hidden="true" className="court-markings" preserveAspectRatio="none" viewBox={`0 0 ${rules.width} ${rules.height}`}>
    <g className="court-markings__lines">
      <rect className="court-markings__perimeter" height={rules.height - 32} width={rules.width - 32} x="16" y="16" />
      <path d={`M ${rules.width / 2} 0 V ${rules.height}`} />
      <circle cx={rules.width / 2} cy={centreY} r={rules.circle} />
      <path d={`M 0 ${keyTop} H ${rules.keyDepth} V ${keyBottom} H 0`} />
      <path d={`M ${rules.width} ${keyTop} H ${rules.width - rules.keyDepth} V ${keyBottom} H ${rules.width}`} />
      <circle cx={rules.keyDepth} cy={centreY} r={rules.circle} className="court-markings__free-throw" />
      <circle cx={rules.width - rules.keyDepth} cy={centreY} r={rules.circle} className="court-markings__free-throw" />
      <path d={`M 0 ${threeLineTop} H ${rules.hoop} A ${rules.arc} ${rules.arc} 0 0 1 ${rules.hoop} ${threeLineBottom} H 0`} />
      <path d={`M ${rules.width} ${threeLineTop} H ${rightHoop} A ${rules.arc} ${rules.arc} 0 0 0 ${rightHoop} ${threeLineBottom} H ${rules.width}`} />
      <path d={`M ${rules.hoop} ${centreY - 75} V ${centreY + 75} M ${rightHoop} ${centreY - 75} V ${centreY + 75}`} className="court-markings__backboards" />
    </g>
    <g className="court-markings__hoops"><circle cx={rules.hoop} cy={centreY} r="22" /><circle cx={rightHoop} cy={centreY} r="22" /></g>
  </svg>
}
